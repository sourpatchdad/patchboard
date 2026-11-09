// Overseerr and Jellyseerr (same API): requests waiting for approval, with
// Approve and Decline. Requests carry only a TMDB id, so titles are looked up
// once and remembered; posters go through Patchboard's /api/art proxy, so the
// browser never calls TMDB itself.

import type { SeerrData, SeerrRequest } from '../../shared/types.ts';
import { rememberArt } from '../art.ts';
import { config } from '../config.ts';
import { getJson } from '../http.ts';
import { type Adapter, MINUTE } from './adapter.ts';

export interface RawRequest {
  id: number;
  status: number; // 1 pending, 2 approved, 3 declined
  type?: 'movie' | 'tv';
  is4k?: boolean;
  createdAt: string;
  media?: { tmdbId?: number; mediaType?: 'movie' | 'tv' };
  seasons?: { seasonNumber: number }[];
  requestedBy?: { displayName?: string; username?: string; plexUsername?: string; email?: string };
}

export interface Details {
  title: string;
  year?: number;
  posterPath?: string;
}

export const requester = (r: RawRequest) =>
  r.requestedBy?.displayName || r.requestedBy?.username || r.requestedBy?.plexUsername || r.requestedBy?.email?.split('@')[0] || 'Someone';

export function toRequest(r: RawRequest, d: Details | undefined, web?: string): SeerrRequest {
  const kind = r.type ?? r.media?.mediaType ?? 'movie';
  return {
    ...(web && r.media?.tmdbId ? { href: `${web}/${kind}/${r.media.tmdbId}` } : {}),
    id: r.id,
    kind,
    title: d?.title ?? (kind === 'tv' ? 'A show' : 'A movie'),
    year: d?.year,
    by: requester(r),
    at: Date.parse(r.createdAt),
    seasons: kind === 'tv' && r.seasons?.length ? r.seasons.map((s) => s.seasonNumber) : undefined,
    is4k: !!r.is4k,
    art: d?.posterPath ? `/api/art/seerr/${r.id}` : undefined,
  };
}

/** Request ids the Approve and Decline route may act on: the pending ones last read. */
export const pendingIds = new Set<number>();

export function seerrClient(): { adapter: Adapter<SeerrData>; act: (id: number, action: 'approve' | 'decline') => Promise<void> } {
  const { url, key } = config.overseerr!;
  // Links open the app the requests live in.
  const web = url;
  const headers = { 'X-Api-Key': key, Accept: 'application/json' };
  const titles = new Map<string, Details>();

  async function details(kind: 'movie' | 'tv', tmdbId: number): Promise<Details | undefined> {
    const k = `${kind}:${tmdbId}`;
    if (titles.has(k)) return titles.get(k);
    try {
      const d = await getJson<{ title?: string; name?: string; releaseDate?: string; firstAirDate?: string; posterPath?: string }>(`${url}/api/v1/${kind}/${tmdbId}`, { headers });
      const date = d.releaseDate || d.firstAirDate;
      const got: Details = { title: d.title ?? d.name ?? '', year: date ? Number(date.slice(0, 4)) || undefined : undefined, posterPath: d.posterPath ?? undefined };
      if (titles.size > 500) titles.delete(titles.keys().next().value!);
      titles.set(k, got);
      return got;
    } catch {
      return undefined;
    }
  }

  return {
    adapter: {
      id: 'overseerr',
      label: 'Requests',
      intervalMs: 2 * MINUTE,
      async fetch() {
        const [list, processing, count] = await Promise.all([
          getJson<{ results: RawRequest[] }>(`${url}/api/v1/request?take=20&skip=0&filter=pending&sort=added`, { headers }),
          getJson<{ results: RawRequest[] }>(`${url}/api/v1/request?take=10&skip=0&filter=processing&sort=added`, { headers }).catch(() => ({ results: [] })),
          getJson<{ pending?: number; total?: number; processing?: number; available?: number }>(`${url}/api/v1/request/count`, { headers }),
        ]);
        const withTitles = async (rows: RawRequest[]) => {
          const out: SeerrRequest[] = [];
          for (const r of rows) {
            const kind = r.type ?? r.media?.mediaType ?? 'movie';
            const d = r.media?.tmdbId ? await details(kind, r.media.tmdbId) : undefined;
            if (d?.posterPath) rememberArt(`seerr:${r.id}`, `https://image.tmdb.org/t/p/w342${d.posterPath}`);
            out.push(toRequest(r, d, web));
          }
          return out;
        };
        const out = await withTitles(list.results.filter((r) => r.status === 1));
        const coming = await withTitles(processing.results.filter((r) => r.status === 2));
        pendingIds.clear();
        for (const r of out) pendingIds.add(r.id);
        return { pending: count.pending ?? out.length, processing: count.processing ?? coming.length, requests: out, coming };
      },
    },
    async act(id, action) {
      await getJson(`${url}/api/v1/request/${id}/${action}`, { method: 'POST', headers });
    },
  };
}
