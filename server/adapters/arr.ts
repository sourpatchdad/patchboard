// Sonarr and Radarr (v3 API, which v4/v5 still serve). Each gives us three
// things: the release calendar, queue items that need a human, and health.

import type { ArrData, ArrProblem, ReleaseItem } from '../../shared/types.ts';
import { config } from '../config.ts';
import { getJson } from '../http.ts';
import { type Adapter, MINUTE } from './adapter.ts';

interface QueueRecord {
  title: string;
  trackedDownloadStatus?: string;
  trackedDownloadState?: string;
  errorMessage?: string;
  statusMessages?: { title: string; messages: string[] }[];
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
  series: { title: string; titleSlug: string; tvdbId?: number };
}

export function episodeKey(show: string, season: number, episode: number): string {
  return `ep:${show.toLowerCase().replace(/[^a-z0-9]/g, '')}:${season}:${episode}`;
}

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
          title: e.series.title,
          subtitle: `S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')} ${e.title ?? ''}`.trim(),
          when: e.airDateUtc!,
          hasFile: e.hasFile,
          url: `${url}/series/${e.series.titleSlug}`,
          key: episodeKey(e.series.title, e.seasonNumber, e.episodeNumber),
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
            title: m.title,
            subtitle: label,
            when,
            hasFile: m.hasFile,
            url: `${url}/movie/${m.tmdbId}`,
            key: `mv:${m.tmdbId}:${label}`,
          });
        }
      }
      return { upcoming, ...rest };
    },
  };
}
