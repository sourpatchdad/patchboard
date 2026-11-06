// Update one container from the UI: pull its image, recreate just that
// service with Docker Compose, then wait until it's running, healthy and
// (when Patchboard checks it) answering. If it doesn't come back, the
// previous image is one click away.
//
// Safety rules, all enforced here rather than in the browser:
// - Only compose services whose compose files Patchboard can read at the
//   host's own path, which means you mounted that folder for it. COMPOSE_ROOT
//   narrows that to one folder. TrueNAS apps (/mnt/.ix-apps) are refused.
// - Locally built images (no registry to pull from) are refused.
// - One job at a time, server-wide.
// - Patchboard itself: the pull runs here, then a one-off helper container,
//   started from the image just pulled, recreates Patchboard's service. The
//   helper outlives the process it replaces and removes itself after.
// - Compose runs with a minimal environment (PATH and HOME only). Patchboard's
//   own variables hold API keys; if they leaked into a child process they
//   could override a stack's own .env values with the same names. Compose
//   reads each stack's .env itself; Patchboard never opens it.

import { spawn } from 'node:child_process';
import { hostname } from 'node:os';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { existsSync } from 'node:fs';
import { isAbsolute, normalize, resolve, sep } from 'node:path';
import type { Container, UpdateEligibility, UpdateJob, UpdateStep } from '../shared/types.ts';
import { dockerCli } from './cli.ts';
import { config, dockerTarget } from './config.ts';
import { recordEvent } from './db.ts';
import { clearUpdate, flagUpdate } from './updates.ts';
import { isNewer, localDigests, parseRef, remoteDigest } from './selfcheck.ts';

interface Inspect {
  Name?: string;
  Image: string;
  Config: { Image: string; Labels?: Record<string, string> };
  State: { Status: string; Health?: { Status: string } };
  Mounts?: { Source: string; Destination: string }[];
}

function dockerJson<T>(path: string): Promise<T> {
  return new Promise((ok, fail) => {
    http
      .get({ ...dockerTarget(), path }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => (body += c));
        res.on('end', () => ((res.statusCode ?? 500) < 400 ? ok(JSON.parse(body) as T) : fail(new Error(`Docker API ${res.statusCode}`))));
      })
      .on('error', fail);
  });
}

const inspect = (name: string) => dockerJson<Inspect>(`/containers/${encodeURIComponent(name)}/json`);

let selfName: string | null | undefined;

/**
 * Patchboard's own container. Docker names a container's host after its id,
 * so that finds it whatever it's called; outside Docker there is none.
 */
export async function whoAmI(): Promise<string | null> {
  if (selfName !== undefined) return selfName;
  try {
    selfName = (await inspect(hostname())).Name?.replace(/^\//, '') ?? null;
  } catch {
    selfName = null;
  }
  return selfName;
}

/**
 * Ask the registry whether Patchboard's own tag has moved past the image it
 * runs, and flag it if so. True when it flagged something new.
 */
export async function checkSelfImage(containers: Container[]): Promise<boolean> {
  const me = await whoAmI();
  const c = me ? containers.find((x) => x.name === me) : undefined;
  if (!c) return false;
  try {
    const r = await inspect(c.name);
    const ref = r.Config.Image;
    const img = await dockerJson<{ RepoDigests?: string[] }>(`/images/${encodeURIComponent(r.Image)}/json`);
    if (!isNewer(await remoteDigest(ref), localDigests(img.RepoDigests))) return false;
    const where = parseRef(ref);
    const link = where?.registry === 'ghcr.io' ? `https://github.com/${where.repo.split('/').slice(0, 2).join('/')}/releases` : undefined;
    return flagUpdate(c, link);
  } catch {
    return false;
  }
}

/** The host path of the Docker socket mounted into Patchboard, which the helper needs too. */
async function selfSocket(): Promise<string | null> {
  const me = await whoAmI();
  if (!me || config.dockerHost) return null;
  return (await inspect(me)).Mounts?.find((m) => m.Destination === '/var/run/docker.sock')?.Source ?? null;
}
const imageId = async (ref: string) => (await dockerJson<{ Id: string }>(`/images/${encodeURIComponent(ref)}/json`)).Id;

function under(root: string, p: string): boolean {
  const r = normalize(resolve(root)) + sep;
  return normalize(resolve(p)).startsWith(r);
}

/** Some compose folder is mounted where Docker says it is, so updates can run. */
export function composeMounted(containers: Container[]): boolean {
  if (config.composeRoot) return true;
  const dirs = new Set(containers.map((c) => c.workingDir).filter((d): d is string => !!d && isAbsolute(d) && !d.startsWith('/mnt/.ix-apps')));
  return [...dirs].some((d) => existsSync(d));
}

/**
 * The helper that recreates Patchboard: its own new image, run once with the
 * Docker socket and the compose folders at their host paths, removed after.
 */
export function helperArgs(o: { sock: string; dir: string; files: string[]; image: string; project: string; service: string; at: number }): string[] {
  const dirs = [...new Set([o.dir, ...o.files.map((f) => dirname(f))])];
  return [
    'run', '-d', '--rm', '--name', `patchboard-self-update-${o.at}`, '--user', '0:0',
    '-v', `${o.sock}:/var/run/docker.sock`,
    ...dirs.flatMap((d) => ['-v', `${d}:${d}:ro`]),
    '-w', o.dir, '--entrypoint', 'docker', o.image,
    'compose', '-p', o.project, ...o.files.flatMap((f) => ['-f', f]),
    'up', '-d', '--no-deps', '--pull', 'never', o.service,
  ];
}

/** Whether a container can be updated from Patchboard, and why not. */
export async function eligibility(c: Container): Promise<UpdateEligibility> {
  if (!dockerCli) return { ok: false, reason: 'This is the slim image, which has no Docker CLI. Use the full image to update from Patchboard.' };
  if (c.name === (await whoAmI()) && !(await selfSocket())) {
    return { ok: false, reason: 'Updating Patchboard from here needs the Docker socket mounted. Behind a socket proxy, run docker compose pull and up -d in its folder.' };
  }
  let r: Inspect;
  try {
    r = await inspect(c.name);
  } catch {
    return { ok: false, reason: "Couldn't inspect the container." };
  }
  const labels = r.Config.Labels ?? {};
  const dir = labels['com.docker.compose.project.working_dir'];
  const files = (labels['com.docker.compose.project.config_files'] ?? '').split(',').filter(Boolean);
  if (!labels['com.docker.compose.service'] || !dir) return { ok: false, reason: 'Not started by Docker Compose.' };
  if (dir.startsWith('/mnt/.ix-apps')) return { ok: false, reason: 'Managed by TrueNAS Apps. Update it there.' };
  if (files.some((f) => !isAbsolute(f))) return { ok: false, reason: 'Its compose files have relative paths.' };
  if (config.composeRoot && (!under(config.composeRoot, dir) || files.some((f) => !under(config.composeRoot!, f)))) {
    return { ok: false, reason: `Its compose folder isn't under ${config.composeRoot}.` };
  }
  if (!files.length || files.some((f) => !existsSync(f))) {
    return { ok: false, reason: `Mount ${dir} into Patchboard at the same path, read-only, to update it here.` };
  }
  const image = r.Config.Image;
  const project = labels['com.docker.compose.project'];
  const service = labels['com.docker.compose.service'];
  if (image.startsWith('sha256:') || image === `${project}-${service}` || image === `${project}_${service}`) {
    return { ok: false, reason: 'Built locally from source. Update it by rebuilding the stack.' };
  }
  return { ok: true };
}

const jobs = new Map<string, UpdateJob & { listeners: Set<(j: UpdateJob) => void>; oldImageId?: string; compose?: string[] }>();
let running: string | null = null;

function publicJob(j: UpdateJob): UpdateJob {
  const { id, container, kind, status, steps, log, startedAt, finishedAt, from, to, error } = j;
  return { id, container, kind, status, steps, log, startedAt, finishedAt, from, to, error };
}

export function getJob(id: string): UpdateJob | undefined {
  const j = jobs.get(id);
  return j && publicJob(j);
}

export function watchJob(id: string, fn: (j: UpdateJob) => void): () => void {
  const j = jobs.get(id);
  if (!j) return () => {};
  j.listeners.add(fn);
  fn(publicJob(j));
  return () => j.listeners.delete(fn);
}

/** The newest job for a container, so a reloaded page can pick up where it was. */
export function latestJobFor(container: string): UpdateJob | undefined {
  const list = [...jobs.values()].filter((j) => j.container === container).sort((a, b) => b.startedAt - a.startedAt);
  return list[0] && publicJob(list[0]);
}

function emit(j: UpdateJob & { listeners: Set<(j: UpdateJob) => void> }): void {
  for (const fn of j.listeners) fn(publicJob(j));
}

function step(j: UpdateJob & { listeners: Set<(j: UpdateJob) => void> }, key: string, status: UpdateStep['status'], note?: string): void {
  const s = j.steps.find((x) => x.key === key);
  if (s) {
    s.status = status;
    if (note !== undefined) s.note = note;
  }
  emit(j);
}

function run(j: UpdateJob & { listeners: Set<(j: UpdateJob) => void> }, args: string[], cwd: string): Promise<void> {
  return new Promise((ok, fail) => {
    // Minimal environment on purpose: see the note at the top of the file.
    const env: Record<string, string> = { PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp' };
    if (config.dockerHost) env.DOCKER_HOST = config.dockerHost;
    const child = spawn('docker', args, { cwd, env });
    const onData = (buf: Buffer) => {
      for (const line of buf.toString('utf8').split(/\r?\n|\r/)) {
        const t = line.trim();
        if (t) j.log.push(t.slice(0, 400));
      }
      if (j.log.length > 400) j.log.splice(0, j.log.length - 400);
      emit(j);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (err) => fail(new Error(err.message.includes('ENOENT') ? 'The docker CLI is missing from the image' : err.message)));
    child.on('close', (code) => (code === 0 ? ok() : fail(new Error(`docker ${args.includes('pull') ? 'pull' : 'compose'} exited with ${code}`))));
  });
}

async function waitHealthy(name: string, isAnswering: () => Promise<boolean | null>, timeoutMs = 120_000): Promise<string> {
  const end = Date.now() + timeoutMs;
  let lastHealth = '';
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const r = await inspect(name);
      if (r.State.Status !== 'running') continue;
      const h = r.State.Health?.Status;
      lastHealth = h ?? 'no health check';
      if (h && h !== 'healthy') continue;
      const answering = await isAnswering();
      if (answering === false) continue;
      return h ? 'healthy' : 'running';
    } catch {
      // Mid-recreate the container briefly doesn't exist.
    }
  }
  throw new Error(`Not healthy after ${timeoutMs / 1000} s (${lastHealth || 'not running'})`);
}

type Job = UpdateJob & { listeners: Set<(j: UpdateJob) => void>; oldImageId?: string; compose?: string[] };

export async function startUpdate(c: Container, isAnswering: () => Promise<boolean | null>, onDone: () => void): Promise<UpdateJob> {
  if (running) throw new Error(`Another update is running (${jobs.get(running)?.container}).`);
  const el = await eligibility(c);
  if (!el.ok) throw new Error(el.reason);
  const r = await inspect(c.name);
  const labels = r.Config.Labels ?? {};
  const dir = labels['com.docker.compose.project.working_dir'];
  const project = labels['com.docker.compose.project'];
  const service = labels['com.docker.compose.service'];
  const files = labels['com.docker.compose.project.config_files'].split(',').filter(Boolean);
  const compose = ['compose', '-p', project, ...files.flatMap((f) => ['-f', f])];

  const j: Job = {
    id: randomUUID(),
    container: c.name,
    kind: 'update',
    status: 'running',
    steps: [
      { key: 'pull', label: 'Pull the image', status: 'running' },
      { key: 'recreate', label: 'Recreate the container', status: 'waiting' },
      { key: 'healthy', label: 'Wait until it is healthy and answering', status: 'waiting' },
    ],
    log: [],
    startedAt: Date.now(),
    from: r.Image.replace(/^sha256:/, '').slice(0, 12),
    listeners: new Set(),
    oldImageId: r.Image,
    compose,
  };
  jobs.set(j.id, j);
  running = j.id;

  void (async () => {
    try {
      await run(j, [...compose, 'pull', service], dir);
      const fresh = await imageId(r.Config.Image);
      if (fresh === r.Image) {
        // Diun flags a new digest for the tag even when the image you run is
        // the same one (a re-published tag). Pulling proves it: clear the mark.
        clearUpdate(c.name);
        step(j, 'pull', 'done', 'Already the newest image');
        step(j, 'recreate', 'skipped');
        step(j, 'healthy', 'skipped');
        j.status = 'done';
        j.to = j.from;
        return;
      }
      j.to = fresh.replace(/^sha256:/, '').slice(0, 12);
      step(j, 'pull', 'done', `New image ${j.to}`);
      step(j, 'recreate', 'running');
      recordEvent('container.action', c.name, 'update');
      if (c.name === (await whoAmI())) {
        // Recreating our own container ends this process, so a helper does it.
        await run(j, helperArgs({ sock: (await selfSocket())!, dir, files, image: r.Config.Image, project, service, at: Date.now() }), dir);
        step(j, 'recreate', 'done', 'Handed to a helper. Patchboard restarts on the new image and this page reconnects.');
        step(j, 'healthy', 'skipped');
        j.status = 'done';
        return;
      }
      await run(j, [...compose, 'up', '-d', '--no-deps', '--pull', 'never', service], dir);
      step(j, 'recreate', 'done');
      step(j, 'healthy', 'running');
      step(j, 'healthy', 'done', await waitHealthy(c.name, isAnswering));
      j.status = 'done';
    } catch (err) {
      j.error = (err as Error).message;
      const current = j.steps.find((s) => s.status === 'running');
      if (current) current.status = 'failed';
      j.status = 'failed';
    } finally {
      j.finishedAt = Date.now();
      running = null;
      emit(j);
      onDone();
    }
  })();
  return publicJob(j);
}

/** Put the previous image back under the same tag and recreate on it. */
export async function startRollback(fromJobId: string, onDone: () => void): Promise<UpdateJob> {
  const prev = jobs.get(fromJobId);
  if (!prev?.oldImageId || !prev.compose) throw new Error('Nothing to roll back to.');
  if (running) throw new Error('Another update is running.');
  const r = await inspect(prev.container);
  const labels = r.Config.Labels ?? {};
  const dir = labels['com.docker.compose.project.working_dir'];
  const service = labels['com.docker.compose.service'];
  const ref = r.Config.Image;
  const [repo, tag] = ref.includes(':') && !ref.endsWith(']') ? [ref.slice(0, ref.lastIndexOf(':')), ref.slice(ref.lastIndexOf(':') + 1)] : [ref, 'latest'];

  const j: Job = {
    id: randomUUID(),
    container: prev.container,
    kind: 'rollback',
    status: 'running',
    steps: [
      { key: 'tag', label: 'Point the tag back at the previous image', status: 'running' },
      { key: 'recreate', label: 'Recreate the container', status: 'waiting' },
      { key: 'healthy', label: 'Wait until it is healthy', status: 'waiting' },
    ],
    log: [],
    startedAt: Date.now(),
    from: r.Image.replace(/^sha256:/, '').slice(0, 12),
    to: prev.oldImageId.replace(/^sha256:/, '').slice(0, 12),
    listeners: new Set(),
    compose: prev.compose,
  };
  jobs.set(j.id, j);
  running = j.id;

  void (async () => {
    try {
      await new Promise<void>((ok, fail) => {
        const req = http.request(
          { ...dockerTarget(), method: 'POST', path: `/images/${encodeURIComponent(prev.oldImageId!)}/tag?repo=${encodeURIComponent(repo)}&tag=${encodeURIComponent(tag)}` },
          (res) => {
            res.resume();
            (res.statusCode ?? 500) < 400 ? ok() : fail(new Error(res.statusCode === 404 ? 'The previous image was already removed' : `Docker API ${res.statusCode}`));
          },
        );
        req.on('error', fail);
        req.end();
      });
      step(j, 'tag', 'done');
      step(j, 'recreate', 'running');
      recordEvent('container.action', prev.container, 'rollback');
      await run(j, [...prev.compose!, 'up', '-d', '--no-deps', '--pull', 'never', service], dir);
      step(j, 'recreate', 'done');
      step(j, 'healthy', 'running');
      step(j, 'healthy', 'done', await waitHealthy(prev.container, async () => null));
      j.status = 'done';
    } catch (err) {
      j.error = (err as Error).message;
      const current = j.steps.find((s) => s.status === 'running');
      if (current) current.status = 'failed';
      j.status = 'failed';
    } finally {
      j.finishedAt = Date.now();
      running = null;
      emit(j);
      onDone();
    }
  })();
  return publicJob(j);
}

/** Demo mode: the same job shape, with timed steps and no Docker. */
export function startDemoUpdate(name: string, onDone: () => void): UpdateJob {
  const j: Job = {
    id: randomUUID(),
    container: name,
    kind: 'update',
    status: 'running',
    steps: [
      { key: 'pull', label: 'Pull the image', status: 'running' },
      { key: 'recreate', label: 'Recreate the container', status: 'waiting' },
      { key: 'healthy', label: 'Wait until it is healthy and answering', status: 'waiting' },
    ],
    log: [],
    startedAt: Date.now(),
    from: '3f2a9c81d0e4',
    listeners: new Set(),
  };
  jobs.set(j.id, j);
  const lines = ['latest: Pulling from linuxserver/' + name, 'Digest: sha256:9b1e…', 'Status: Downloaded newer image', ` Container ${name}  Recreate`, ` Container ${name}  Started`];
  let i = 0;
  const tick = setInterval(() => {
    if (i < lines.length) j.log.push(lines[i]);
    if (i === 2) {
      j.to = '8c41e07ab2d9';
      step(j, 'pull', 'done', 'New image 8c41e07ab2d9');
      step(j, 'recreate', 'running');
    } else if (i === 4) {
      step(j, 'recreate', 'done');
      step(j, 'healthy', 'running');
    } else if (i === 6) {
      step(j, 'healthy', 'done', 'healthy');
      j.status = 'done';
      j.finishedAt = Date.now();
      clearInterval(tick);
      recordEvent('container.action', name, 'update');
      onDone();
    }
    emit(j);
    i++;
  }, 900);
  return publicJob(j);
}
