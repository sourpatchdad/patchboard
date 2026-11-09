// Who is listening right now: Audiobookshelf's open sessions and Navidrome's
// now-playing list (the Subsonic API, so other Subsonic servers work too).

import { createHash, randomBytes } from 'node:crypto';
import type { AlbumPlay, BookProgress, ListeningData, Stream } from '../../shared/types.ts';
import { every } from './every.ts';
import { config } from '../config.ts';
import { getJson } from '../http.ts';
import { type Adapter, SECOND } from './adapter.ts';

type AbsSession = { id?: string; userId?: string; displayTitle?: string; displayAuthor?: string; currentTime?: number; duration?: number; updatedAt?: number; user?: { username?: string } };

/** Sessions touched in the last ten minutes count as listening. */
export function fromAudiobookshelf(r: { usersOnline?: { id?: string; username?: string }[]; openSessions?: AbsSession[] }, now = Date.now()): Stream[] {
  const names = new Map((r.usersOnline ?? []).map((u) => [u.id, u.username]));
  return (r.openSessions ?? [])
    .filter((s) => !s.updatedAt || now - s.updatedAt < 10 * 60_000)
    .map((s) => ({
      user: s.user?.username ?? names.get(s.userId) ?? 'Someone',
      title: s.displayTitle ?? 'Something',
      subtitle: s.displayAuthor,
      progress: Number.isFinite(s.currentTime) && s.currentTime! >= 0 && Number.isFinite(s.duration) && s.duration! > 0
        ? Math.min(100, (s.currentTime! / s.duration!) * 100) : -1,
      ...(Number.isFinite(s.currentTime) && s.currentTime! >= 0 ? { positionSec: s.currentTime! } : {}),
      ...(Number.isFinite(s.duration) && s.duration! > 0 ? { durationSec: s.duration! } : {}),
      state: 'playing' as const,
      transcode: false,
    }));
}

type SubEntry = { username?: string; title?: string; artist?: string; album?: string; minutesAgo?: number; duration?: number };

/** Played within the last ten minutes counts. Subsonic gives no position, so no progress bar. */
export function fromSubsonic(r: { 'subsonic-response'?: { status?: string; error?: { message?: string }; nowPlaying?: { entry?: SubEntry[] } } }): Stream[] {
  const s = r['subsonic-response'];
  if (s?.status === 'failed') throw new Error(s.error?.message ?? 'Navidrome refused the request');
  return (s?.nowPlaying?.entry ?? [])
    .filter((e) => (e.minutesAgo ?? 0) < 10)
    .map((e) => ({ user: e.username ?? 'Someone', title: e.title ?? 'A track', subtitle: [e.artist, e.album].filter(Boolean).join(', ') || undefined, progress: -1, ...(Number.isFinite(e.duration) && e.duration! > 0 ? { durationSec: e.duration! } : {}), state: 'playing' as const, transcode: false }));
}

type AbsProgress = { libraryItemId?: string; progress?: number; isFinished?: boolean; lastUpdate?: number; mediaItemType?: string; episodeId?: string | null };
type AbsItem = { id?: string; media?: { metadata?: { title?: string; authorName?: string } } };

/** Books started and not finished, most recent first, with titles from the in-progress list. */
export function absInProgress(me: { mediaProgress?: AbsProgress[] }, items: { libraryItems?: AbsItem[] }): BookProgress[] {
  const meta = new Map((items.libraryItems ?? []).map((i) => [i.id, i.media?.metadata]));
  return (me.mediaProgress ?? [])
    .filter((p) => !p.isFinished && (p.progress ?? 0) > 0 && !p.episodeId && p.libraryItemId && meta.has(p.libraryItemId))
    .sort((a, b) => (b.lastUpdate ?? 0) - (a.lastUpdate ?? 0))
    .slice(0, 8)
    .map((p) => {
      const m = meta.get(p.libraryItemId)!;
      return { id: p.libraryItemId!, title: m?.title ?? 'A book', ...(m?.authorName ? { author: m.authorName } : {}), progress: Math.min(1, p.progress ?? 0), at: p.lastUpdate ?? 0 };
    });
}

export function audiobookshelfAdapter(): Adapter<ListeningData> {
  const { url, key } = config.audiobookshelf!;
  const headers = { Authorization: `Bearer ${key}` };
  const progress = every(2 * 60_000, async () => {
    const [me, items] = await Promise.all([getJson<{ mediaProgress?: AbsProgress[] }>(`${url}/api/me`, { headers }), getJson<{ libraryItems?: AbsItem[] }>(`${url}/api/me/items-in-progress`, { headers })]);
    return absInProgress(me, items);
  });
  return {
    id: 'audiobookshelf',
    label: 'Audiobookshelf',
    intervalMs: 20 * SECOND,
    async fetch() {
      const [online, inProgress] = await Promise.all([getJson<Parameters<typeof fromAudiobookshelf>[0]>(`${url}/api/users/online`, { headers }), progress()]);
      return { streams: fromAudiobookshelf(online), ...(inProgress ? { inProgress } : {}) };
    },
  };
}

/** Subsonic's recent album list. OpenSubsonic servers such as Navidrome say when each was played. */
export function fromAlbumList(r: { 'subsonic-response'?: { albumList2?: { album?: { name?: string; artist?: string; played?: string }[] } } }): AlbumPlay[] {
  return (r['subsonic-response']?.albumList2?.album ?? []).map((a) => ({ title: a.name ?? 'An album', ...(a.artist ? { artist: a.artist } : {}), ...(a.played ? { at: Date.parse(a.played) } : {}) }));
}

export function navidromeAdapter(): Adapter<ListeningData> {
  const { url, username, password } = config.navidrome!;
  /** Subsonic token auth: md5(password + salt), with a fresh salt each time. */
  const auth = () => {
    const s = randomBytes(6).toString('hex');
    const t = createHash('md5').update(password + s).digest('hex');
    return new URLSearchParams({ u: username, t, s, v: '1.16.1', c: 'patchboard', f: 'json' });
  };
  const recent = every(2 * 60_000, async () => fromAlbumList(await getJson(`${url}/rest/getAlbumList2.view?${auth()}&type=recent&size=8`)));
  return {
    id: 'navidrome',
    label: 'Navidrome',
    intervalMs: 20 * SECOND,
    async fetch() {
      const [now, albums] = await Promise.all([getJson<Parameters<typeof fromSubsonic>[0]>(`${url}/rest/getNowPlaying.view?${auth()}`), recent()]);
      return { streams: fromSubsonic(now), ...(albums ? { albums } : {}) };
    },
  };
}
