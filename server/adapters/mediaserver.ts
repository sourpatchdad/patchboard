// Jellyfin and Emby share one API (Jellyfin forked Emby in 2018): who is
// watching, recently added, and Next up for one user. Posters go through
// /api/img/{jellyfin,emby} so the API key never reaches the browser.

import type { MediaServerData, RecentItem, Stream, LibraryCounts, Play } from '../../shared/types.ts';
import { every } from './every.ts';
import { config } from '../config.ts';
import { getJson, HttpError, request } from '../http.ts';
import { type Adapter, SECOND } from './adapter.ts';

export type MediaKind = 'jellyfin' | 'emby';

export interface Item {
  UserData?: { LastPlayedDate?: string };
  Id: string;
  Name: string;
  Type: string;
  SeriesName?: string;
  SeriesId?: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  ProductionYear?: number;
  DateCreated?: string;
  ChildCount?: number;
  RunTimeTicks?: number;
}

export interface Session {
  UserName?: string;
  NowPlayingItem?: Item;
  PlayState?: { PositionTicks?: number; IsPaused?: boolean; PlayMethod?: string };
  TranscodingInfo?: { IsVideoDirect?: boolean };
}

interface User {
  Id: string;
  Name: string;
  Policy?: { IsAdministrator?: boolean };
}

const settings = (kind: MediaKind) => config[kind]!;

/** Jellyfin wants the MediaBrowser scheme; Emby reads X-Emby-Token. */
export function authHeaders(kind: MediaKind, key: string): Record<string, string> {
  return kind === 'jellyfin'
    ? { Authorization: `MediaBrowser Client="Patchboard", Device="Patchboard", DeviceId="patchboard", Version="1", Token="${key}"` }
    : { 'X-Emby-Token': key };
}

function get<T>(kind: MediaKind, path: string): Promise<T> {
  const { url, key } = settings(kind);
  return getJson<T>(`${url}${path}`, { headers: { Accept: 'application/json', ...authHeaders(kind, key) } });
}

const sxe = (s?: number, e?: number) =>
  s != null && e != null ? `S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}` : undefined;

/** Episodes and seasons show their series' poster. */
const posterId = (it: Item) => (it.Type === 'Episode' || it.Type === 'Season' ? (it.SeriesId ?? it.Id) : it.Id);
const img = (kind: MediaKind, it: Item) => `/api/img/${kind}?id=${encodeURIComponent(posterId(it))}`;

export function toStream(kind: MediaKind, s: Session): Stream | null {
  const it = s.NowPlayingItem;
  if (!it) return null;
  const ep = it.Type === 'Episode';
  const pos = s.PlayState?.PositionTicks ?? 0;
  return {
    itemId: it.Id,
    user: s.UserName ?? 'Someone',
    title: ep ? (it.SeriesName ?? it.Name) : it.Name,
    subtitle: ep ? [sxe(it.ParentIndexNumber, it.IndexNumber), it.Name].filter(Boolean).join(' ') : undefined,
    progress: Number.isFinite(s.PlayState?.PositionTicks) && pos >= 0 && Number.isFinite(it.RunTimeTicks) && it.RunTimeTicks! > 0
      ? Math.min(100, Math.round((pos / it.RunTimeTicks!) * 100)) : -1,
    ...(Number.isFinite(s.PlayState?.PositionTicks) && pos >= 0 ? { positionSec: pos / 10_000_000 } : {}),
    ...(Number.isFinite(it.RunTimeTicks) && it.RunTimeTicks! > 0 ? { durationSec: it.RunTimeTicks! / 10_000_000 } : {}),
    state: s.PlayState?.IsPaused ? 'paused' : 'playing',
    transcode: s.PlayState?.PlayMethod === 'Transcode' || s.TranscodingInfo?.IsVideoDirect === false,
    thumb: img(kind, it),
  };
}

export function toRecent(kind: MediaKind, it: Item): RecentItem {
  const ep = it.Type === 'Episode';
  return {
    id: posterId(it),
    type: it.Type.toLowerCase(),
    title: ep ? (it.SeriesName ?? it.Name) : it.Name,
    subtitle: ep
      ? [sxe(it.ParentIndexNumber, it.IndexNumber), it.Name].filter(Boolean).join(' ')
      : it.Type === 'Series' && it.ChildCount
        ? `${it.ChildCount} new`
        : it.ProductionYear
          ? String(it.ProductionYear)
          : undefined,
    addedAt: it.DateCreated ? Date.parse(it.DateCreated) : 0,
    thumb: img(kind, it),
  };
}

/** Items the chosen user finished lately, as plays. */
export function toPlays(kind: MediaKind, items: Item[], user: string): Play[] {
  return items
    .filter((it) => it.UserData?.LastPlayedDate)
    .map((it) => ({ ...toPlay(kind, it), user, at: Date.parse(it.UserData!.LastPlayedDate!) }));
}

function toPlay(kind: MediaKind, it: Item): Omit<Play, 'user' | 'at'> {
  const r = toRecent(kind, it);
  return { title: r.title, ...(r.subtitle ? { subtitle: r.subtitle } : {}), itemId: it.Id, thumb: r.thumb };
}

/** /Items/Counts in the board's words. */
export function toCounts(c: { MovieCount?: number; SeriesCount?: number; EpisodeCount?: number; SongCount?: number }): LibraryCounts {
  return { movies: c.MovieCount ?? 0, shows: c.SeriesCount ?? 0, episodes: c.EpisodeCount ?? 0, ...(c.SongCount ? { songs: c.SongCount } : {}) };
}

export const ITEM_PATH: Record<MediaKind, string> = {
  jellyfin: '/web/#/details?id=',
  emby: '/web/index.html#!/item?id=',
};

export function mediaServerAdapter(kind: MediaKind): Adapter<MediaServerData> {
  let userId: string | null = null;
  let userName = 'Someone';

  async function user(): Promise<string> {
    if (userId) return userId;
    const users = await get<User[]>(kind, '/Users');
    const want = settings(kind).user?.toLowerCase();
    const pick = want
      ? users.find((u) => u.Name.toLowerCase() === want)
      : (users.find((u) => u.Policy?.IsAdministrator) ?? users[0]);
    if (!pick) throw new Error(want ? `No user named ${settings(kind).user}` : 'No users on the server');
    userId = pick.Id;
    userName = pick.Name;
    return userId;
  }

  /** Jellyfin 10.9 moved Latest to /Items/Latest; Emby and older Jellyfin keep the per-user route. */
  async function latest(uid: string): Promise<Item[]> {
    const q = 'Limit=30&Fields=DateCreated,ProductionYear,ChildCount&GroupItems=true';
    if (kind === 'jellyfin') {
      try {
        return await get<Item[]>(kind, `/Items/Latest?userId=${uid}&${q}`);
      } catch (err) {
        if (!(err instanceof HttpError) || err.status !== 404) throw err;
      }
    }
    return get<Item[]>(kind, `/Users/${uid}/Items/Latest?${q}`);
  }

  const played = every(5 * 60_000, async () => {
    const uid = await user();
    const r = await get<{ Items: Item[] }>(kind, `/Users/${uid}/Items?SortBy=DatePlayed&SortOrder=Descending&Filters=IsPlayed&Recursive=true&IncludeItemTypes=Movie,Episode&Limit=15&Fields=DateCreated,ProductionYear`);
    return toPlays(kind, r.Items, userName);
  });
  const counts = every(5 * 60_000, async () => toCounts(await get(kind, '/Items/Counts')));

  return {
    id: kind,
    label: kind === 'jellyfin' ? 'Jellyfin' : 'Emby',
    intervalMs: 15 * SECOND,
    async fetch() {
      const uid = await user();
      const [sessions, added, next, watched, library] = await Promise.all([
        get<Session[]>(kind, '/Sessions?ActiveWithinSeconds=120'),
        latest(uid),
        get<{ Items: Item[] }>(kind, `/Shows/NextUp?UserId=${uid}&Limit=12&Fields=DateCreated`).catch(() => ({ Items: [] as Item[] })),
        played(),
        counts(),
      ]);
      return {
        streams: sessions.map((s) => toStream(kind, s)).filter((s): s is Stream => s !== null),
        recent: added.map((it) => toRecent(kind, it)).sort((a, b) => b.addedAt - a.addedAt),
        nextUp: next.Items.map((it) => ({ ...toRecent(kind, it), id: it.Id })),
        itemPath: ITEM_PATH[kind],
        ...(watched ? { watched } : {}),
        ...(library ? { library } : {}),
      };
    },
  };
}

/** Proxy one poster. Ids are Jellyfin GUIDs or Emby numbers, nothing else. */
export async function mediaImage(kind: MediaKind, id: string): Promise<Response> {
  if (!/^[\w-]{1,64}$/.test(id)) throw new Error('Bad image id');
  const { url, key } = settings(kind);
  return request(`${url}/Items/${id}/Images/Primary?maxHeight=450&quality=85`, { headers: authHeaders(kind, key) });
}
