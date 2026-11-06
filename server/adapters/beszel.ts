// Beszel: every system its agents report, read into the same hosts Glances
// gives, so one Hosts widget covers both. Beszel's hub is PocketBase: sign in
// with a Beszel user (a read-only one is enough), then read the systems.
// https://beszel.dev

import type { GlancesData, GlancesHost } from '../../shared/types.ts';
import { config } from '../config.ts';
import { getJson } from '../http.ts';
import { type Adapter, SECOND } from './adapter.ts';

export interface BeszelSystem {
  id?: string;
  name?: string;
  host?: string;
  status?: string;
  info?: Record<string, unknown>;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function since(sec: number | undefined): string | undefined {
  if (!sec) return undefined;
  const d = Math.floor(sec / 86_400);
  const h = Math.floor((sec % 86_400) / 3600);
  return d ? `${d}d ${h}h` : `${h}h ${Math.floor((sec % 3600) / 60)}m`;
}

/** Beszel keeps a system's latest numbers in short keys under info. Paused systems are left out. */
export function toBeszelHosts(rows: BeszelSystem[], base: string): GlancesHost[] {
  return rows
    .filter((s) => s.status !== 'paused')
    .map((s) => {
      const i = s.info ?? {};
      const name = s.name ?? s.host ?? 'system';
      const ok = s.status === 'up';
      const disk = num(i.dp);
      return {
        url: `${base}/system/${encodeURIComponent(name)}`,
        ok,
        error: ok ? undefined : s.status === 'pending' ? 'Waiting for its agent' : 'Its agent is down',
        name,
        os: [i.os, i.k].filter((x) => typeof x === 'string').join(' '),
        cpuPct: num(i.cpu) ?? 0,
        cores: num(i.c),
        load: Array.isArray(i.la) ? num(i.la[1]) : num(i.l5),
        memPct: num(i.mp) ?? 0,
        memUsed: 0,
        memTotal: 0,
        disks: disk != null ? [{ mount: '/', used: 0, size: 0, pct: disk }] : [],
        // Beszel reports one bandwidth figure, in MB/s.
        rx: (num(i.b) ?? 0) * 1e6,
        tx: 0,
        tempC: num(i.dt) || undefined,
        uptime: since(num(i.u)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function beszelAdapter(): Adapter<GlancesData> {
  const { url, username, password } = config.beszel!;
  return {
    id: 'beszel',
    label: 'Beszel',
    intervalMs: 30 * SECOND,
    async fetch() {
      const auth = await getJson<{ token?: string }>(`${url}/api/collections/users/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: username, password }),
      });
      if (!auth.token) throw new Error('Beszel refused the sign-in');
      const list = await getJson<{ items?: BeszelSystem[] }>(`${url}/api/collections/systems/records?perPage=200&sort=name`, { headers: { Authorization: auth.token } });
      return { hosts: toBeszelHosts(list.items ?? [], url) };
    },
  };
}
