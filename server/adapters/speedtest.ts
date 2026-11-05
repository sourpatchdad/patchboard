// Speedtest Tracker: the latest internet speed test and the last day of them.
// Speeds come from Ookla's raw result (`data.download.bandwidth`, bytes per
// second) when present, since that unit is fixed by Ookla's CLI; the
// top-level fields are the fallback. https://docs.speedtest-tracker.dev

import type { SpeedData, SpeedRun } from '../../shared/types.ts';
import { config } from '../config.ts';
import { getJson } from '../http.ts';
import { type Adapter, MINUTE } from './adapter.ts';

export interface StResult {
  id: number;
  ping?: number | null;
  download?: number | null;
  upload?: number | null;
  healthy?: boolean | null;
  status?: string;
  created_at: string;
  data?: {
    isp?: string;
    packetLoss?: number;
    ping?: { latency?: number; jitter?: number };
    download?: { bandwidth?: number };
    upload?: { bandwidth?: number };
    server?: { name?: string; location?: string };
  } | null;
}

/** Bytes per second to megabits per second, one decimal. */
const mbps = (bytesPerSec: number) => Math.round((bytesPerSec * 8) / 100_000) / 10;

export function toRun(r: StResult): SpeedRun | null {
  const down = r.data?.download?.bandwidth ?? r.download;
  const up = r.data?.upload?.bandwidth ?? r.upload;
  if (down == null || up == null) return null;
  const ping = r.data?.ping?.latency ?? r.ping;
  return {
    at: Date.parse(r.created_at),
    down: mbps(down),
    up: mbps(up),
    ping: ping != null ? Math.round(ping * 10) / 10 : undefined,
    jitter: r.data?.ping?.jitter != null ? Math.round(r.data.ping.jitter * 10) / 10 : undefined,
    loss: r.data?.packetLoss != null ? Math.round(r.data.packetLoss * 10) / 10 : undefined,
    healthy: r.healthy ?? undefined,
    server: [r.data?.server?.name, r.data?.server?.location].filter(Boolean).join(', ') || undefined,
    isp: r.data?.isp,
  };
}

export function speedtestAdapter(): Adapter<SpeedData> {
  const { url, key: token } = config.speedtest!;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  return {
    id: 'speedtest',
    label: 'Speedtest Tracker',
    intervalMs: 5 * MINUTE,
    async fetch() {
      const list = await getJson<{ data: StResult[] }>(`${url}/api/v1/results?per.page=48&sort=-created_at`, { headers });
      // Failed runs have no speeds; they count as a failure, not a zero.
      const all = list.data.filter((r) => r.status !== 'failed');
      const runs = all.map(toRun).filter((r): r is SpeedRun => r !== null).sort((a, b) => a.at - b.at);
      const lastAny = list.data[0];
      return {
        latest: runs[runs.length - 1] ?? null,
        lastFailed: lastAny?.status === 'failed' ? Date.parse(lastAny.created_at) : undefined,
        runs: runs.filter((r) => r.at > Date.now() - 86_400_000),
      };
    },
  };
}
