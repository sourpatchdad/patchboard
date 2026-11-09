// Sonarr and Radarr (v3 API, which v4/v5 still serve). Each gives us three
// things: the release calendar, queue items that need a human, and health.

import { rememberArt } from '../art.ts';
import type { ArrData, ArrProblem, ArrQueueItem, ReleaseItem } from '../../shared/types.ts';
import { config } from '../config.ts';
import { getJson, request } from '../http.ts';
import { type Adapter, MINUTE } from './adapter.ts';

interface QueueRecord {
  id: number;
  title: string;
  status?: string;
  size?: number;
  sizeleft?: number;
  trackedDownloadStatus?: string;
  trackedDownloadState?: string;
  errorMessage?: string;
  statusMessages?: { title: string; messages: string[] }[];
}

const QUEUE_ORDER: Record<ArrQueueItem['state'], number> = { failed: 0, warning: 1, importing: 2, downloading: 3, queued: 4, paused: 5 };

/** Queue records as rows: stuck first, each with what it's doing and why it's stuck. */
export function toQueue(records: QueueRecord[]): ArrQueueItem[] {
  return records
    .map((r): ArrQueueItem => {
      const status = (r.status ?? '').toLowerCase();
      const tracked = (r.trackedDownloadState ?? '').toLowerCase();
      const state: ArrQueueItem['state'] =
        r.trackedDownloadStatus === 'error' || status === 'failed' || tracked.startsWith('failed')
          ? 'failed'
          : r.trackedDownloadStatus === 'warning' || status === 'warning'
            ? 'warning'
            : tracked === 'importpending' || tracked === 'importing'
              ? 'importing'
              : status === 'paused'
                ? 'paused'
                : status === 'queued' || status === 'delay'
                  ? 'queued'
                  : 'downloading';
      const message = state === 'failed' || state === 'warning' ? r.errorMessage || r.statusMessages?.flatMap((m) => m.messages)[0] || undefined : undefined;
      return { id: r.id, title: r.title, progress: r.size ? Math.max(0, Math.min(1, 1 - (r.sizeleft ?? 0) / r.size)) : 0, state, ...(message ? { message } : {}) };
    })
    .sort((a, b) => QUEUE_ORDER[a.state] - QUEUE_ORDER[b.state])
    .slice(0, 20);
}

/** Acting on Sonarr or Radarr: try another release for a stuck download, or search. */
export interface ArrControl {
  /** Remove a queue item, blocklist its release, and search for another. */
  retry(queueId: number): Promise<void>;
  /** Search for every monitored episode or film that has no file. */
  searchMissing(): Promise<void>;
  /** Search for one episode or film. */
  search(id: number): Promise<void>;
}

export function arrControl(kind: 'sonarr' | 'radarr'): ArrControl {
  const { url, key } = config[kind]!;
  const headers = { 'X-Api-Key': key, 'Content-Type': 'application/json' };
  const command = (body: Record<string, unknown>) => request(`${url}/api/v3/command`, { method: 'POST', headers, body: JSON.stringify(body) }).then(() => {});
  return {
    retry: (queueId) => request(`${url}/api/v3/queue/${queueId}?removeFromClient=true&blocklist=true&skipRedownload=false`, { method: 'DELETE', headers }).then(() => {}),
    searchMissing: () => command({ name: kind === 'sonarr' ? 'MissingEpisodeSearch' : 'MissingMoviesSearch' }),
    search: (id) => command(kind === 'sonarr' ? { name: 'EpisodeSearch', episodeIds: [id] } : { name: 'MoviesSearch', movieIds: [id] }),
  };
}

interface HealthRecord {
  type: 'ok' | 'notice' | 'warning' | 'error';
  message: string;
}

function windowDates(days: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + days * 86_400_000);
  return { start, end };
}

async function queueAndHealth(base: string, key: string) {
  const headers = { 'X-Api-Key': key };
  const [queue, health] = await Promise.all([
    getJson<{ totalRecords: number; records: QueueRecord[] }>(`${base}/api/v3/queue?pageSize=100`, { headers }),
    getJson<HealthRecord[]>(`${base}/api/v3/health`, { headers }),
  ]);
  const problems: ArrProblem[] = queue.records
    .filter((r) => r.trackedDownloadStatus && r.trackedDownloadStatus !== 'ok')
    .map((r) => ({
      title: r.title,
      message:
        r.errorMessage ||
        r.statusMessages?.flatMap((s) => s.messages)[0] ||
        r.trackedDownloadState ||
        'Needs attention',
    }));
  return {
    queueTotal: queue.totalRecords,
    queue: toQueue(queue.records),
    problems,
    health: health
      .filter((h) => h.type !== 'ok')
      .map((h) => ({ level: h.type as 'notice' | 'warning' | 'error', message: h.message })),
  };
}

interface SonarrEpisode {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  airDateUtc?: string;
  hasFile: boolean;
  seriesId: number;
  series: { title: string; titleSlug: string; tvdbId?: number; images?: { coverType: string; remoteUrl?: string }[] };
}

/** "The Traitors (US)" and "Traitors" are the same show: drop articles, a trailing (US) or (2012), punctuation. */
export function showSlug(show: string): string {
  return show
    .toLowerCase()
    .replace(/\s*\((?:us|uk|au|ca|nz|\d{4})\)\s*$/i, '')
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]/g, '');
}

export function episodeKey(show: string, season: number, episode: number): string {
  return `ep:${showSlug(show)}:${season}:${episode}`;
}

export const tvdbKey = (tvdb: number | undefined, season: number, episode: number) => (tvdb ? `tv:${tvdb}:${season}:${episode}` : undefined);

export function sonarrAdapter(): Adapter<ArrData> {
  const { url, key } = config.sonarr!;
  return {
    id: 'sonarr',
    label: 'Sonarr',
    intervalMs: 5 * MINUTE,
    async fetch() {
      const { start, end } = windowDates(config.upcomingDays);
      const [cal, rest] = await Promise.all([
        getJson<SonarrEpisode[]>(
          `${url}/api/v3/calendar?start=${start.toISOString()}&end=${end.toISOString()}&includeSeries=true`,
          { headers: { 'X-Api-Key': key } },
        ),
        queueAndHealth(url, key),
      ]);
      const upcoming: ReleaseItem[] = cal
        .filter((e) => e.airDateUtc)
        .map((e) => ({
          id: `sonarr-${e.id}`,
          source: 'sonarr',
          kind: 'episode',
          searchId: e.id,
          title: e.series.title,
          subtitle: `S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')} ${e.title ?? ''}`.trim(),
          when: e.airDateUtc!,
          hasFile: e.hasFile,
          url: `${url}/series/${e.series.titleSlug}`,
          key: tvdbKey(e.series.tvdbId, e.seasonNumber, e.episodeNumber) ?? episodeKey(e.series.title, e.seasonNumber, e.episodeNumber),
          alt: [episodeKey(e.series.title, e.seasonNumber, e.episodeNumber)],
          art: (rememberArt(`sonarr:${e.seriesId}`, e.series.images?.find((x) => x.coverType === 'poster')?.remoteUrl), `/api/art/sonarr/${e.seriesId}`),
        }));
      return { upcoming, ...rest };
    },
  };
}

interface RadarrMovie {
  id: number;
  title: string;
  year: number;
  tmdbId: number;
  hasFile: boolean;
  inCinemas?: string;
  digitalRelease?: string;
  physicalRelease?: string;
  images?: { coverType: string; remoteUrl?: string }[];
}

export function radarrAdapter(): Adapter<ArrData> {
  const { url, key } = config.radarr!;
  return {
    id: 'radarr',
    label: 'Radarr',
    intervalMs: 5 * MINUTE,
    async fetch() {
      const { start, end } = windowDates(config.upcomingDays);
      const [cal, rest] = await Promise.all([
        getJson<RadarrMovie[]>(`${url}/api/v3/calendar?start=${start.toISOString()}&end=${end.toISOString()}`, {
          headers: { 'X-Api-Key': key },
        }),
        queueAndHealth(url, key),
      ]);
      const upcoming: ReleaseItem[] = [];
      for (const m of cal) {
        const dates: [string | undefined, string][] = [
          [m.digitalRelease, 'Digital release'],
          [m.physicalRelease, 'Physical release'],
          [m.inCinemas, 'In cinemas'],
        ];
        for (const [when, label] of dates) {
          if (!when) continue;
          const t = Date.parse(when);
          if (t < start.getTime() || t >= end.getTime()) continue;
          upcoming.push({
            id: `radarr-${m.id}-${label}`,
            source: 'radarr',
            kind: 'movie',
            searchId: m.id,
            title: m.title,
            subtitle: label,
            when,
            hasFile: m.hasFile,
            url: `${url}/movie/${m.tmdbId}`,
            key: `mv:${m.tmdbId}:${label}`,
            alt: [`mv:${m.tmdbId}`],
            art: (rememberArt(`radarr:${m.id}`, m.images?.find((x) => x.coverType === 'poster')?.remoteUrl), `/api/art/radarr/${m.id}`),
          });
        }
      }
      return { upcoming, ...rest };
    },
  };
}
