// Glances: CPU, memory, disks, network and temperatures for any machine that
// runs it, from a mini PC or a Pi to a rack server. GLANCES_URL takes one
// address or several, comma-separated, so one widget covers every host.
// Glances 4 serves /api/4; Glances 3 serves /api/3 with slightly different
// fields, and both work. https://glances.readthedocs.io/en/latest/api.html

import type { GlancesData, GlancesDisk, GlancesHost } from '../../shared/types.ts';
import { config } from '../config.ts';
import { getJson } from '../http.ts';
import { type Adapter, SECOND } from './adapter.ts';

type Json = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Filesystems worth showing: real mounts, each device once, no snap or boot noise. */
export function toDisks(fs: Json[]): GlancesDisk[] {
  const seen = new Set<string>();
  return fs
    .filter((f) => num(f.size) > 0 && !/^\/(boot|snap|run|dev|sys|proc)(\/|$)/.test(String(f.mnt_point ?? '')) && !/squashfs|tmpfs|overlay/.test(String(f.fs_type ?? '')))
    .filter((f) => {
      const key = String(f.device_name ?? f.mnt_point);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((f) => ({ mount: String(f.mnt_point ?? ''), used: num(f.used), size: num(f.size), pct: num(f.percent) }))
    .sort((a, b) => b.pct - a.pct);
}

/** One host from the plugins Glances serves. v3 network counters are per refresh, v4 are per second. */
export function toHost(url: string, v: 3 | 4, p: { system: Json; quicklook: Json; mem: Json; load: Json; fs: Json[]; network: Json[]; sensors: Json[]; uptime: unknown }): GlancesHost {
  const nics = p.network.filter((n) => !/^(lo|docker|veth|br-|virbr|tailscale|vmbr|tap|fwbr|fwln|fwpr)/.test(String(n.interface_name ?? '')));
  const rate = (n: Json, k4: string, k3: string) => (v === 4 ? num(n[k4]) : num(n[k3]) / Math.max(1, num(n.time_since_update)));
  const temps = p.sensors.filter((s) => s.type === 'temperature_core' || (s.unit === 'C' && s.type !== 'fan_speed')).map((s) => num(s.value)).filter((t) => t > 0 && t < 150);
  return {
    url,
    ok: true,
    name: String(p.system.hostname ?? new URL(url).hostname),
    os: String(p.system.hr_name ?? p.system.os_name ?? ''),
    cpuPct: num(p.quicklook.cpu),
    cores: num(p.load.cpucore) || undefined,
    load: num(p.load.min5) || undefined,
    memPct: num(p.mem.percent),
    memUsed: num(p.mem.used),
    memTotal: num(p.mem.total),
    disks: toDisks(p.fs),
    rx: nics.reduce((t, n) => t + rate(n, 'bytes_recv_rate_per_sec', 'rx'), 0),
    tx: nics.reduce((t, n) => t + rate(n, 'bytes_sent_rate_per_sec', 'tx'), 0),
    tempC: temps.length ? Math.max(...temps) : undefined,
    uptime: typeof p.uptime === 'string' ? p.uptime : undefined,
  };
}

async function readHost(url: string): Promise<GlancesHost> {
  let v: 3 | 4 = 4;
  const get = <T>(plugin: string) => getJson<T>(`${url}/api/${v}/${plugin}`);
  try {
    await get('quicklook');
  } catch {
    v = 3;
  }
  const [system, quicklook, mem, load, fs, network, sensors, uptime] = await Promise.all([
    get<Json>('system'),
    get<Json>('quicklook'),
    get<Json>('mem'),
    get<Json>('load').catch(() => ({})),
    get<Json[]>('fs').catch(() => []),
    get<Json[]>('network').catch(() => []),
    get<Json[]>('sensors').catch(() => []),
    get<unknown>('uptime').catch(() => undefined),
  ]);
  return toHost(url, v, { system, quicklook, mem, load, fs, network, sensors, uptime });
}

export function glancesAdapter(): Adapter<GlancesData> {
  const { urls } = config.glances!;
  return {
    id: 'glances',
    label: 'Glances',
    intervalMs: 15 * SECOND,
    async fetch() {
      const results = await Promise.allSettled(urls.map(readHost));
      const hosts = results.map((r, i): GlancesHost =>
        r.status === 'fulfilled' ? r.value : { url: urls[i], ok: false, error: (r.reason as Error).message, name: new URL(urls[i]).hostname, os: '', cpuPct: 0, memPct: 0, memUsed: 0, memTotal: 0, disks: [], rx: 0, tx: 0 },
      );
      // One host and it's down: the integration is down. Several: the rest still show.
      if (hosts.every((h) => !h.ok)) throw new Error(hosts[0]?.error ?? 'Unreachable');
      return { hosts };
    },
  };
}
