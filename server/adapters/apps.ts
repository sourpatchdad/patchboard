// Apps that mostly need a number on their tile and a word when something is
// wrong: the rest of the *arr family, Bazarr, Paperless-ngx and Nextcloud.

import type { ArrData, ArrProblem, GiteaData, NextcloudData, PaperlessData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { getJson, request } from '../http.ts';
import { type Adapter, MINUTE } from './adapter.ts';

type Health = { type?: string; message?: string };
type Queue = { totalRecords?: number; records?: { title?: string; trackedDownloadStatus?: string; errorMessage?: string; statusMessages?: { messages?: string[] }[] }[] };

export function toArr(queue: Queue | null, health: Health[]): ArrData {
  const problems: ArrProblem[] = (queue?.records ?? [])
    .filter((r) => r.trackedDownloadStatus && r.trackedDownloadStatus !== 'ok')
    .map((r) => ({ title: r.title ?? '?', message: r.errorMessage || r.statusMessages?.flatMap((s) => s.messages ?? [])[0] || 'Needs attention' }));
  return {
    upcoming: [],
    queueTotal: queue?.totalRecords ?? 0,
    problems,
    health: health.filter((h) => h.type && h.type !== 'ok').map((h) => ({ level: h.type as 'notice' | 'warning' | 'error', message: h.message ?? '' })),
  };
}

/** Lidarr and Readarr serve the v1 API; Prowlarr has no queue. */
export function starrAdapter(id: 'lidarr' | 'readarr' | 'prowlarr', label: string): Adapter<ArrData> {
  const { url, key } = config[id]!;
  const headers = { 'X-Api-Key': key };
  return {
    id,
    label,
    intervalMs: 2 * MINUTE,
    async fetch() {
      const [queue, health] = await Promise.all([
        id === 'prowlarr' ? Promise.resolve(null) : getJson<Queue>(`${url}/api/v1/queue?pageSize=100`, { headers }),
        getJson<Health[]>(`${url}/api/v1/health`, { headers }),
      ]);
      return toArr(queue, health);
    },
  };
}

/** Bazarr: missing subtitles stand in for the queue; its health list for health. */
export function bazarrAdapter(): Adapter<ArrData> {
  const { url, key } = config.bazarr!;
  const headers = { 'X-API-KEY': key };
  return {
    id: 'bazarr',
    label: 'Bazarr',
    intervalMs: 5 * MINUTE,
    async fetch() {
      const [badges, health] = await Promise.all([
        getJson<{ episodes?: number; movies?: number }>(`${url}/api/badges`, { headers }),
        getJson<{ data?: { object?: string; issue?: string }[] }>(`${url}/api/system/health`, { headers }).catch(() => ({ data: [] })),
      ]);
      return { upcoming: [], queueTotal: (badges.episodes ?? 0) + (badges.movies ?? 0), problems: [], health: (health.data ?? []).map((h) => ({ level: 'error' as const, message: [h.object, h.issue].filter(Boolean).join(': ') })) };
    },
  };
}

export function paperlessAdapter(): Adapter<PaperlessData> {
  const { url, key } = config.paperless!;
  return {
    id: 'paperless',
    label: 'Paperless-ngx',
    intervalMs: 5 * MINUTE,
    async fetch() {
      const s = await getJson<{ documents_total?: number; documents_inbox?: number | null }>(`${url}/api/statistics/`, { headers: { Authorization: `Token ${key}`, Accept: 'application/json; version=5' } });
      return { total: s.documents_total ?? 0, inbox: s.documents_inbox ?? 0, webUrl: url };
    },
  };
}

type ServerInfo = {
  ocs?: {
    data?: {
      nextcloud?: { system?: { version?: string; freespace?: number; apps?: { num_updates_available?: number } }; storage?: { num_users?: number; num_files?: number } };
      activeUsers?: { last24hours?: number };
    };
  };
};

export function toNextcloud(r: ServerInfo, url: string): NextcloudData {
  const n = r.ocs?.data?.nextcloud;
  return {
    version: n?.system?.version,
    files: n?.storage?.num_files ?? 0,
    users: n?.storage?.num_users ?? 0,
    activeToday: r.ocs?.data?.activeUsers?.last24hours,
    freeBytes: n?.system?.freespace,
    appUpdates: n?.system?.apps?.num_updates_available ?? 0,
    webUrl: url,
  };
}

export function nextcloudAdapter(): Adapter<NextcloudData> {
  const { url, username, password } = config.nextcloud!;
  return {
    id: 'nextcloud',
    label: 'Nextcloud',
    intervalMs: 5 * MINUTE,
    async fetch() {
      const auth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      const r = await getJson<ServerInfo>(`${url}/ocs/v2.php/apps/serverinfo/api/v1/info?format=json&skipApps=false`, { headers: { Authorization: auth, 'OCS-APIRequest': 'true', Accept: 'application/json' } });
      return toNextcloud(r, url);
    },
  };
}

/** Gitea and Forgejo: unread notifications and how many repositories there are. */
export function giteaAdapter(): Adapter<GiteaData> {
  const { url, key } = config.gitea!;
  const headers = { Authorization: `token ${key}`, Accept: 'application/json' };
  return {
    id: 'gitea',
    label: 'Gitea',
    intervalMs: 2 * MINUTE,
    async fetch() {
      const [unread, repos] = await Promise.all([
        getJson<{ new?: number }>(`${url}/api/v1/notifications/new`, { headers }),
        request(`${url}/api/v1/repos/search?limit=1`, { headers }),
      ]);
      return { unread: unread.new ?? 0, repos: Number(repos.headers.get('x-total-count') ?? 0), webUrl: url };
    },
  };
}
