// TrueNAS 25.x over its JSON-RPC 2.0 websocket (/api/current). Read-only: every
// method called here is a query. One connection is kept open and reused, and
// logged in with an API key; it reconnects on the next poll if it drops.
//
// Each query is independent, so a method that moved or was renamed between
// TrueNAS releases costs only its own panel, not the whole source.

import WebSocket from 'ws';
import type { CloudSyncTask, Dataset, Disk, NasAlert, Pool, TruenasData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { type Adapter, MINUTE } from './adapter.ts';

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

interface Pending {
  resolve: (v: Json) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

class Rpc {
  private ws: WebSocket | null = null;
  private ready: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  /** Latest reporting.realtime payload, if the subscription works. */
  realtime: Json = null;

  private url: string;
  private apiKey: string;
  private verifyTls: boolean;

  // No parameter properties: Node's type stripping only handles erasable syntax.
  constructor(url: string, apiKey: string, verifyTls: boolean) {
    this.url = url;
    this.apiKey = apiKey;
    this.verifyTls = verifyTls;
  }

  private connect(): Promise<void> {
    this.ready ??= new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.url, { rejectUnauthorized: this.verifyTls, handshakeTimeout: 8000 });
      this.ws = ws;
      const fail = (err: Error) => {
        this.reset(err);
        reject(err);
      };
      ws.once('error', (err) => fail(new Error(`TrueNAS: ${(err as NodeJS.ErrnoException).code ?? err.message}`)));
      ws.on('close', () => this.reset(new Error('TrueNAS connection closed')));
      ws.on('message', (raw) => this.onMessage(raw.toString()));
      ws.once('open', async () => {
        try {
          const ok = await this.send('auth.login_with_api_key', [this.apiKey]);
          if (ok !== true) throw new Error('TrueNAS rejected the API key');
          // Best effort: live CPU, memory and network rates.
          this.send('core.subscribe', ['reporting.realtime']).catch(() => {});
          resolve();
        } catch (err) {
          fail(err as Error);
          ws.close();
        }
      });
    });
    return this.ready;
  }

  private reset(err: Error): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
    this.ws = null;
    this.ready = null;
  }

  private onMessage(text: string): void {
    let msg: Json;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (msg.method === 'collection_update' && msg.params?.collection === 'reporting.realtime') {
      this.realtime = msg.params.fields ?? null;
      return;
    }
    const p = typeof msg.id === 'number' ? this.pending.get(msg.id) : undefined;
    if (!p) return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.error) p.reject(new Error(msg.error.data?.reason ?? msg.error.message ?? 'TrueNAS error'));
    else p.resolve(msg.result);
  }

  private send(method: string, params: Json[] = []): Promise<Json> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('TrueNAS not connected'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`TrueNAS ${method} timed out`));
      }, 20_000);
      this.pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  async call(method: string, params: Json[] = []): Promise<Json> {
    await this.connect();
    return this.send(method, params);
  }
}

const date = (v: Json): number | null => {
  if (v == null) return null;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  if (typeof v === 'object' && '$date' in v) return Number(v.$date);
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : t;
};

const num = (v: Json): number => {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object') return Number(v.parsed ?? v.rawvalue ?? v.value ?? 0);
  return Number(v ?? 0);
};

function toPool(p: Json): Pool {
  const vdevs: Json[] = p.topology?.data ?? [];
  const leaves = vdevs.flatMap((v) => (v.children?.length ? v.children : [v]));
  const sizeBytes = num(p.size);
  const usedBytes = num(p.allocated);
  return {
    name: p.name,
    status: p.status ?? 'UNKNOWN',
    healthy: p.healthy !== false && p.status === 'ONLINE',
    sizeBytes,
    usedBytes,
    freeBytes: num(p.free),
    usedPct: sizeBytes ? (usedBytes / sizeBytes) * 100 : 0,
    layout: vdevs.length === 1 ? String(vdevs[0].type ?? '') : vdevs.map((v) => v.type).join(' + '),
    disks: leaves.map((d) => ({
      name: d.disk ?? d.name ?? '?',
      status: d.status ?? '?',
      errors: num(d.stats?.read_errors) + num(d.stats?.write_errors) + num(d.stats?.checksum_errors),
    })),
    scan: p.scan
      ? {
          kind: String(p.scan.function ?? ''),
          state: String(p.scan.state ?? ''),
          startedAt: date(p.scan.start_time),
          endedAt: date(p.scan.end_time),
          errors: num(p.scan.errors),
        }
      : null,
  };
}

/** Top-level datasets of each pool (media, immich, appdata...), largest first. */
function toDatasets(rows: Json[], poolNames: string[]): Dataset[] {
  const flat: Json[] = [];
  const walk = (d: Json) => {
    flat.push(d);
    for (const c of d.children ?? []) walk(c);
  };
  rows.forEach(walk);
  // The query returns each dataset both nested under its parent and on its
  // own row, so keep one entry per name.
  const seen = new Set<string>();
  return flat
    .filter((d) => {
      const name = String(d.name ?? d.id);
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .filter((d) => {
      const parts = String(d.name ?? d.id).split('/');
      return parts.length === 2 && poolNames.includes(parts[0]) && !parts[1].startsWith('.');
    })
    .map((d) => ({ name: String(d.name ?? d.id), usedBytes: num(d.used) }))
    .sort((a, b) => b.usedBytes - a.usedBytes);
}

function toNet(rt: Json): TruenasData['net'] {
  const ifaces = rt?.interfaces;
  if (!ifaces || typeof ifaces !== 'object') return null;
  const out: { iface: string; rx: number; tx: number }[] = [];
  for (const [iface, v] of Object.entries<Json>(ifaces)) {
    if (/^(lo|veth|br-|docker|vb-|kube|cni|flannel)/.test(iface)) continue;
    const rx = num(v.received_bytes_rate ?? v.rx_bytes_rate ?? v.received_bytes);
    const tx = num(v.sent_bytes_rate ?? v.tx_bytes_rate ?? v.sent_bytes);
    if (v.link_state && v.link_state !== 'LINK_STATE_UP') continue;
    out.push({ iface, rx, tx });
  }
  return out.length ? out : null;
}

export function truenasAdapter(): Adapter<TruenasData> {
  const { url, apiKey, verifyTls } = config.truenas!;
  const rpc = new Rpc(url, apiKey, verifyTls);
  const optional = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

  return {
    id: 'truenas',
    label: 'TrueNAS',
    intervalMs: MINUTE,
    async fetch() {
      // system.info doubles as the connectivity check: if it fails, so does the source.
      const info = await rpc.call('system.info');
      const [pools, disks, temps, datasets, snaps, alerts, cloud] = await Promise.all([
        optional(rpc.call('pool.query'), [] as Json[]),
        optional(rpc.call('disk.query', [[], { extra: { pools: true } }]), [] as Json[]),
        optional(rpc.call('disk.temperatures', [[]]), {} as Json),
        optional(rpc.call('pool.dataset.query', [[], { extra: { properties: ['used'], retrieve_children: true } }]), [] as Json[]),
        optional(
          rpc.call('pool.snapshot.query', [[], { count: true }]).catch(() => rpc.call('zfs.snapshot.query', [[], { count: true }])),
          null,
        ),
        optional(rpc.call('alert.list'), [] as Json[]),
        optional(rpc.call('cloudsync.query'), [] as Json[]),
      ]);

      const poolList = (pools as Json[]).map(toPool);
      return {
        hostname: String(info.hostname ?? 'TrueNAS'),
        version: String(info.version ?? ''),
        pools: poolList,
        disks: (disks as Json[])
          .map(
            (d): Disk => ({
              name: String(d.name),
              model: String(d.model ?? ''),
              sizeBytes: num(d.size),
              type: String(d.type ?? ''),
              pool: d.pool ?? null,
              tempC: typeof temps?.[d.name] === 'number' ? temps[d.name] : null,
            }),
          )
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
        datasets: toDatasets(datasets as Json[], poolList.map((p) => p.name)),
        snapshots: typeof snaps === 'number' ? snaps : Array.isArray(snaps) ? snaps.length : null,
        alerts: (alerts as Json[])
          .filter((a) => !a.dismissed)
          .map(
            (a): NasAlert => ({
              id: String(a.uuid ?? a.id),
              level: String(a.level ?? 'INFO'),
              text: String(a.formatted ?? a.text ?? '').replace(/<[^>]+>/g, '').trim(),
              at: date(a.datetime),
            }),
          ),
        cloudSync: (cloud as Json[]).map(
          (t): CloudSyncTask => ({
            name: String(t.description || `Cloud sync ${t.id}`),
            enabled: t.enabled !== false,
            state: t.job?.state ?? null,
            finishedAt: date(t.job?.time_finished),
            error: t.job?.error ? String(t.job.error).slice(0, 300) : null,
          }),
        ),
        net: toNet(rpc.realtime),
      };
    },
  };
}
