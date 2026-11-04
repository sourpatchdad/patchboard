// Docker Engine API over the unix socket: list, inspect, stats, logs and the
// event stream. The only writes are start, stop and restart, and only through
// containerAction(), which the API route guards and records.

import http from 'node:http';
import type { Container, ContainerDetail, ContainerStats, DockerData, StatsData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { type Adapter, SECOND } from './adapter.ts';

function dockerGet(path: string, signal?: AbortSignal): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = http.get({ socketPath: config.dockerSocket, path, signal }, (res) => {
      if ((res.statusCode ?? 500) >= 400) {
        res.resume();
        reject(new Error(`Docker API ${res.statusCode}`));
        return;
      }
      resolve(res);
    });
    req.on('error', (err: NodeJS.ErrnoException) => {
      reject(new Error(err.code === 'ENOENT' ? 'Docker socket not mounted' : `Docker: ${err.code ?? err.message}`));
    });
    req.setTimeout(8000, () => req.destroy(new Error('Docker API timed out')));
  });
}

async function dockerJson<T>(path: string): Promise<T> {
  const res = await dockerGet(path);
  const chunks: Buffer[] = [];
  for await (const chunk of res) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

interface RawContainer {
  Id: string;
  Names: string[];
  Image: string;
  ImageID: string;
  State: string;
  Status: string;
  Created: number;
  Labels?: Record<string, string>;
}

const PROJECT = 'com.docker.compose.project';
const SERVICE = 'com.docker.compose.service';
const DEPENDS = 'com.docker.compose.depends_on';

/** "db:service_healthy:false,redis:service_started:false" -> service names. */
function dependsOnServices(label?: string): string[] {
  return (label ?? '')
    .split(',')
    .map((x) => x.split(':')[0].trim())
    .filter(Boolean);
}

function parseHealth(status: string): Container['health'] {
  const m = /\((healthy|unhealthy|health: starting)\)/.exec(status);
  if (!m) return null;
  return m[1] === 'health: starting' ? 'starting' : (m[1] as 'healthy' | 'unhealthy');
}

export async function listContainers(): Promise<Container[]> {
  const raw = await dockerJson<RawContainer[]>('/containers/json?all=1');
  const nameOf = (c: RawContainer) => (c.Names[0] ?? c.Id).replace(/^\//, '');
  // depends_on names compose services; resolve them to container names in the same project.
  const byService = new Map(raw.map((c) => [`${c.Labels?.[PROJECT]}/${c.Labels?.[SERVICE]}`, nameOf(c)]));
  return raw
    .map((c): Container => {
      const project = c.Labels?.[PROJECT];
      const deps = dependsOnServices(c.Labels?.[DEPENDS])
        .map((svc) => byService.get(`${project}/${svc}`))
        .filter((n): n is string => !!n);
      return {
        id: c.Id.slice(0, 12),
        name: nameOf(c),
        image: c.Image,
        imageId: c.ImageID?.replace(/^sha256:/, '').slice(0, 12),
        state: c.State,
        status: c.Status,
        health: parseHealth(c.Status),
        created: c.Created * 1000,
        project,
        service: c.Labels?.[SERVICE],
        dependsOn: deps.length ? deps : undefined,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function dockerAdapter(): Adapter<DockerData> {
  return {
    id: 'docker',
    label: 'Docker',
    intervalMs: 10 * SECOND,
    fetch: async () => ({ containers: await listContainers() }),
  };
}

interface RawStats {
  cpu_stats?: { cpu_usage?: { total_usage?: number }; system_cpu_usage?: number };
  memory_stats?: { usage?: number; stats?: { inactive_file?: number; total_inactive_file?: number } };
}

/**
 * CPU and memory for every running container. CPU needs two readings, so the
 * first poll after start reports 0 and the rest are deltas against the last.
 * Memory leaves out reclaimable page cache, matching `docker stats`.
 */
export function statsAdapter(): Adapter<StatsData> {
  let prev = new Map<string, { cpu: number; sys: number }>();
  return {
    id: 'stats',
    label: 'Container stats',
    intervalMs: 15 * SECOND,
    async fetch() {
      const running = (await listContainers()).filter((c) => c.state === 'running');
      const next = new Map<string, { cpu: number; sys: number }>();
      const out: Record<string, ContainerStats> = {};
      await Promise.all(
        running.map(async (c) => {
          try {
            const s = await dockerJson<RawStats>(`/containers/${c.id}/stats?stream=false&one-shot=true`);
            const cpu = s.cpu_stats?.cpu_usage?.total_usage ?? 0;
            const sys = s.cpu_stats?.system_cpu_usage ?? 0;
            next.set(c.name, { cpu, sys });
            const p = prev.get(c.name);
            const dSys = p ? sys - p.sys : 0;
            const pct = p && dSys > 0 ? Math.max(0, ((cpu - p.cpu) / dSys) * 100) : 0;
            const m = s.memory_stats;
            const cache = m?.stats?.inactive_file ?? m?.stats?.total_inactive_file ?? 0;
            out[c.name] = { cpu: Math.min(100, pct), memBytes: Math.max(0, (m?.usage ?? 0) - cache) };
          } catch {
            // A container that stopped mid-poll just drops out of this round.
          }
        }),
      );
      prev = next;
      return { containers: out };
    },
  };
}

interface RawInspect {
  Id: string;
  Name: string;
  Created: string;
  Image: string;
  RestartCount: number;
  State: {
    Status: string;
    StartedAt?: string;
    FinishedAt?: string;
    ExitCode?: number;
    Health?: { Status: string; Log?: { Start: string; ExitCode: number; Output: string }[] };
  };
  HostConfig?: { RestartPolicy?: { Name?: string } };
  Config: { Image: string; Labels?: Record<string, string>; Tty: boolean };
  NetworkSettings?: {
    Ports?: Record<string, { HostIp: string; HostPort: string }[] | null>;
    Networks?: Record<string, unknown>;
  };
  Mounts?: { Type: string; Source: string; Destination: string; RW: boolean; Name?: string }[];
}

const time = (s?: string) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isNaN(t) || t <= 0 ? null : t;
};

function hostBinding(binds: { HostIp: string; HostPort: string }[] | null): string | null {
  if (!binds?.length) return null;
  const list = binds.map((b) => (b.HostIp && b.HostIp !== '0.0.0.0' && b.HostIp !== '::' ? `${b.HostIp}:${b.HostPort}` : b.HostPort));
  return [...new Set(list)].join(', ');
}

/**
 * One container's detail. Deliberately leaves out Config.Env: environment
 * variables are where secrets live, and the browser never needs them.
 */
export async function inspectContainer(name: string, all: Container[]): Promise<ContainerDetail> {
  const r = await dockerJson<RawInspect>(`/containers/${encodeURIComponent(name)}/json`);
  let imageCreated: number | null = null;
  try {
    imageCreated = time((await dockerJson<{ Created: string }>(`/images/${encodeURIComponent(r.Image)}/json`)).Created);
  } catch {
    // The image may have been removed since; not worth failing the page.
  }
  const labels = r.Config.Labels ?? {};
  const cname = r.Name.replace(/^\//, '');
  const me = all.find((c) => c.name === cname);
  const running = r.State.Status === 'running';
  return {
    name: cname,
    id: r.Id.slice(0, 12),
    image: r.Config.Image,
    imageId: r.Image.replace(/^sha256:/, '').slice(0, 12),
    imageCreated,
    created: Date.parse(r.Created),
    startedAt: running ? time(r.State.StartedAt) : null,
    finishedAt: running ? null : time(r.State.FinishedAt),
    exitCode: running ? null : (r.State.ExitCode ?? null),
    restartCount: r.RestartCount ?? 0,
    restartPolicy: r.HostConfig?.RestartPolicy?.Name || 'no',
    state: r.State.Status,
    health: r.State.Health?.Status ?? null,
    healthLog: (r.State.Health?.Log ?? []).slice(-3).map((l) => ({
      at: time(l.Start) ?? 0,
      exitCode: l.ExitCode,
      output: l.Output.trim().slice(0, 400),
    })),
    project: labels[PROJECT],
    service: labels[SERVICE],
    workingDir: labels['com.docker.compose.project.working_dir'],
    ports: Object.entries(r.NetworkSettings?.Ports ?? {}).map(([port, binds]) => ({ container: port, host: hostBinding(binds) })),
    mounts: (r.Mounts ?? [])
      .map((m) => ({ source: m.Type === 'volume' ? (m.Name ?? m.Source) : m.Source, target: m.Destination, rw: m.RW, type: m.Type }))
      .sort((a, b) => a.target.localeCompare(b.target)),
    networks: Object.keys(r.NetworkSettings?.Networks ?? {}),
    dependsOn: me?.dependsOn ?? [],
    usedBy: all.filter((c) => c.dependsOn?.includes(cname)).map((c) => c.name),
  };
}

export type ContainerAction = 'start' | 'stop' | 'restart';

/** Start, stop or restart a container. Stop and restart give it 10 s to exit cleanly. */
export function containerAction(name: string, action: ContainerAction): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath: config.dockerSocket, path: `/containers/${encodeURIComponent(name)}/${action}${action === 'start' ? '' : '?t=10'}`, method: 'POST' },
      (res) => {
        res.resume();
        // 304: already in that state, which is fine.
        if ((res.statusCode ?? 500) < 400) resolve();
        else reject(new Error(res.statusCode === 404 ? 'No such container' : `Docker API ${res.statusCode}`));
      },
    );
    req.on('error', (err: NodeJS.ErrnoException) => reject(new Error(`Docker: ${err.code ?? err.message}`)));
    req.setTimeout(30_000, () => req.destroy(new Error('Docker took too long to answer')));
    req.end();
  });
}

/**
 * Docker's event stream, filtered to container lifecycle events. Calls onEvent
 * for each and reconnects with backoff if the stream drops, so the hub can
 * refresh within a second of a crash instead of on its next poll.
 */
export function watchContainerEvents(onEvent: (e: { action: string; name: string }) => void): void {
  const filters = encodeURIComponent(JSON.stringify({ type: ['container'], event: ['start', 'stop', 'die', 'kill', 'restart', 'health_status', 'destroy', 'create', 'pause', 'unpause', 'oom'] }));
  let delay = 2000;
  const connect = () => {
    const req = http.get({ socketPath: config.dockerSocket, path: `/events?filters=${filters}` }, (res) => {
      delay = 2000;
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buf += chunk;
        let i: number;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          try {
            const e = JSON.parse(line) as { Action?: string; Actor?: { Attributes?: { name?: string } } };
            onEvent({ action: e.Action ?? '', name: e.Actor?.Attributes?.name ?? '' });
          } catch {
            // Partial or unexpected line; the next poll catches anything missed.
          }
        }
      });
      res.on('end', retry);
      res.on('error', retry);
    });
    req.on('error', retry);
  };
  const retry = () => {
    setTimeout(connect, delay).unref();
    delay = Math.min(delay * 2, 60_000);
  };
  connect();
}

/**
 * Follow a container's logs, calling onLine for each line. Containers without
 * a TTY use Docker's multiplexed framing: an 8-byte header (stream, 0, 0, 0,
 * then a big-endian uint32 length) before each payload.
 */
export async function followLogs(
  name: string,
  tail: number,
  onLine: (line: { stream: 'out' | 'err'; text: string }) => void,
  signal: AbortSignal,
): Promise<void> {
  const inspect = await dockerJson<{ Config: { Tty: boolean } }>(`/containers/${encodeURIComponent(name)}/json`);
  const tty = inspect.Config.Tty;
  const res = await dockerGet(
    `/containers/${encodeURIComponent(name)}/logs?follow=1&stdout=1&stderr=1&timestamps=0&tail=${tail}`,
    signal,
  );

  let buf = Buffer.alloc(0);
  const partial: Record<'out' | 'err', string> = { out: '', err: '' };

  const emitText = (stream: 'out' | 'err', text: string) => {
    const lines = (partial[stream] + text).split('\n');
    partial[stream] = lines.pop() ?? '';
    for (const l of lines) onLine({ stream, text: l.replace(/\r$/, '') });
  };

  try {
    for await (const chunk of res) {
      if (tty) {
        emitText('out', (chunk as Buffer).toString('utf8'));
        continue;
      }
      buf = Buffer.concat([buf, chunk as Buffer]);
      while (buf.length >= 8) {
        const len = buf.readUInt32BE(4);
        if (buf.length < 8 + len) break;
        const stream = buf[0] === 2 ? 'err' : 'out';
        emitText(stream, buf.subarray(8, 8 + len).toString('utf8'));
        buf = buf.subarray(8 + len);
      }
    }
  } catch (err) {
    if (!signal.aborted) throw err;
  }
}
