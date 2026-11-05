// Immich: how big the library is and what Immich is working on.
// Statistics and job queues need an admin's API key. Queues come from
// /api/jobs (Immich 1.x and 2.0); newer servers that only offer /api/queues
// work too. Without permission for queues the widget shows the library alone.
// https://immich.app/docs/api

import type { ImmichData, ImmichQueue } from '../../shared/types.ts';
import { config } from '../config.ts';
import { getJson } from '../http.ts';
import { type Adapter, MINUTE } from './adapter.ts';

interface Stats {
  photos: number;
  videos: number;
  usage: number;
}

type Counts = { active?: number; waiting?: number; delayed?: number; failed?: number; paused?: number };

/** /api/jobs: one entry per queue name. */
export type JobsMap = Record<string, { jobCounts?: Counts; queueStatus?: { isPaused?: boolean } }>;
/** /api/queues: a list. */
export type QueuesList = { name: string; isPaused?: boolean; statistics?: Counts }[];

export function toQueues(raw: JobsMap | QueuesList): ImmichQueue[] {
  const rows: [string, Counts, boolean][] = Array.isArray(raw)
    ? raw.map((q) => [q.name, q.statistics ?? {}, !!q.isPaused])
    : Object.entries(raw).map(([name, q]) => [name, q.jobCounts ?? {}, !!q.queueStatus?.isPaused]);
  return rows
    .map(([name, c, paused]) => ({ name, active: c.active ?? 0, waiting: (c.waiting ?? 0) + (c.delayed ?? 0), failed: c.failed ?? 0, paused }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function immichAdapter(): Adapter<ImmichData> {
  const { url, key } = config.immich!;
  const headers = { 'x-api-key': key, Accept: 'application/json' };
  return {
    id: 'immich',
    label: 'Immich',
    intervalMs: MINUTE,
    async fetch() {
      const [stats, version] = await Promise.all([
        getJson<Stats>(`${url}/api/server/statistics`, { headers }),
        getJson<{ major: number; minor: number; patch: number }>(`${url}/api/server/version`, { headers }).catch(() => null),
      ]);
      let queues: ImmichQueue[] = [];
      try {
        queues = toQueues(await getJson<JobsMap>(`${url}/api/jobs`, { headers }));
      } catch {
        queues = await getJson<QueuesList>(`${url}/api/queues`, { headers })
          .then(toQueues)
          .catch(() => []);
      }
      return {
        photos: stats.photos,
        videos: stats.videos,
        usage: stats.usage,
        version: version ? `${version.major}.${version.minor}.${version.patch}` : undefined,
        queues,
        webUrl: url,
      };
    },
  };
}
