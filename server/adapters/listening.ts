// Who is listening right now: Audiobookshelf's open sessions and Navidrome's
// now-playing list (the Subsonic API, so other Subsonic servers work too).

import { createHash, randomBytes } from 'node:crypto';
import type { ListeningData, Stream } from '../../shared/types.ts';
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

export function audiobookshelfAdapter(): Adapter<ListeningData> {
  const { url, key } = config.audiobookshelf!;
  return {
    id: 'audiobookshelf',
    label: 'Audiobookshelf',
    intervalMs: 20 * SECOND,
    async fetch() {
      return { streams: fromAudiobookshelf(await getJson(`${url}/api/users/online`, { headers: { Authorization: `Bearer ${key}` } })) };
    },
  };
}

export function navidromeAdapter(): Adapter<ListeningData> {
  const { url, username, password } = config.navidrome!;
  return {
    id: 'navidrome',
    label: 'Navidrome',
    intervalMs: 20 * SECOND,
    async fetch() {
      // Subsonic token auth: md5(password + salt), with a fresh salt each time.
      const s = randomBytes(6).toString('hex');
      const t = createHash('md5').update(password + s).digest('hex');
      const q = new URLSearchParams({ u: username, t, s, v: '1.16.1', c: 'patchboard', f: 'json' });
      return { streams: fromSubsonic(await getJson(`${url}/rest/getNowPlaying.view?${q}`)) };
    },
  };
}
