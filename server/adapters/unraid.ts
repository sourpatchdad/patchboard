// Unraid: the array, its parity and data disks, and the cache pools, from the
// Unraid API (built in from Unraid 7.2; on older versions, the Unraid Connect
// plugin). Create a key under Settings, Management Access, API Keys with
// read access. https://docs.unraid.net/API/

import type { NasDisk, NasSystem, NasVolume } from '../../shared/types.ts';
import { config } from '../config.ts';
import { request } from '../http.ts';
import { type Adapter, MINUTE } from './adapter.ts';

const QUERY = `query {
  info { os { hostname } }
  array {
    state
    capacity { kilobytes { free used total } }
    parities { name status temp }
    disks { name status temp fsSize fsUsed }
    caches { name status temp fsSize fsUsed }
  }
}`;

type RawDisk = { name?: string; status?: string; temp?: number | null; fsSize?: number | string | null; fsUsed?: number | string | null };
export interface UnraidResult {
  info?: { os?: { hostname?: string } };
  array?: {
    state?: string;
    capacity?: { kilobytes?: { free?: number | string; used?: number | string; total?: number | string } };
    parities?: RawDisk[];
    disks?: RawDisk[];
    caches?: RawDisk[];
  };
}

const kb = (v: unknown) => (v == null || v === '' ? 0 : Number(v) * 1024);

/** Unraid's disk states in plain words. */
const WORDS: Record<string, string> = {
  DISK_DSBL: 'disabled',
  DISK_DSBL_NEW: 'disabled',
  DISK_INVALID: 'invalid',
  DISK_WRONG: 'the wrong disk',
  DISK_NP_MISSING: 'missing',
  DISK_EMULATED: 'emulated',
};

/** DISK_OK is healthy; DISK_NP (no disk) and DISK_NP_DSBL mean an empty slot; anything else needs a look. */
function diskStatus(s?: string): NasDisk['status'] {
  if (!s || s === 'DISK_OK' || s === 'DISK_NEW') return 'ok';
  if (/DSBL|INVALID|WRONG|NP_MISSING|EMULATED/.test(s)) return 'failed';
  return 'warn';
}

export function toUnraid(r: UnraidResult, url: string): NasSystem {
  const a = r.array ?? {};
  const present = (d: RawDisk) => d.status !== 'DISK_NP' && d.status !== 'DISK_NP_DSBL';
  const disk = (role: NasDisk['role']) => (d: RawDisk): NasDisk => ({
    name: d.name ?? '?',
    role,
    status: diskStatus(d.status),
    detail: d.status && d.status !== 'DISK_OK' ? (WORDS[d.status] ?? d.status.replace(/^DISK_/, '').toLowerCase().replace(/_/g, ' ')) : undefined,
    tempC: d.temp ?? undefined,
  });
  const cap = a.capacity?.kilobytes;
  const volumes: NasVolume[] = [];
  if (cap && kb(cap.total)) volumes.push({ name: 'Array', used: kb(cap.used), total: kb(cap.total) });
  for (const c of a.caches ?? []) if (present(c) && kb(c.fsSize)) volumes.push({ name: c.name ?? 'cache', used: kb(c.fsUsed), total: kb(c.fsSize) });
  const started = !a.state || a.state === 'STARTED';
  return {
    platform: 'Unraid',
    name: r.info?.os?.hostname ?? new URL(url).hostname,
    webUrl: url,
    state: started ? undefined : `The array is ${String(a.state).toLowerCase().replace(/_/g, ' ')}`,
    volumes,
    disks: [...(a.parities ?? []).filter(present).map(disk('parity')), ...(a.disks ?? []).filter(present).map(disk('data')), ...(a.caches ?? []).filter(present).map(disk('cache'))],
  };
}

export function unraidAdapter(): Adapter<NasSystem> {
  const { url, key } = config.unraid!;
  return {
    id: 'unraid',
    label: 'Unraid',
    intervalMs: MINUTE,
    async fetch() {
      const res = await request(`${url}/graphql`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, Accept: 'application/json' },
        body: JSON.stringify({ query: QUERY }),
      });
      const body = (await res.json()) as { data?: UnraidResult; errors?: { message: string }[] };
      if (body.errors?.length) throw new Error(`Unraid API: ${body.errors[0].message}`);
      return toUnraid(body.data ?? {}, url);
    },
  };
}
