// Tautulli: current Plex streams and recently added media. Poster images are
// served through /api/img/tautulli so the API key never reaches the browser.

import type { LibraryCounts, Play, RecentItem, Stream, TautulliData } from '../../shared/types.ts';
import { cached, every } from './every.ts';
import { config } from '../config.ts';
import { getJson, request } from '../http.ts';
import { type Adapter, SECOND } from './adapter.ts';

interface TautulliResponse<T> {
  response: { result: string; message?: string; data: T };
}

interface Session {
  rating_key?: string;
  friendly_name: string;
  media_type: string;
  title: string;
  grandparent_title?: string;
  parent_media_index?: string;
  media_index?: string;
  full_title: string;
  progress_percent?: string;
  view_offset?: string | number;
  duration?: string | number;
  state: string;
  transcode_decision?: string;
  thumb?: string;
  grandparent_thumb?: string;
}

interface Added {
  rating_key: string;
  media_type: string;
  title: string;
  parent_title?: string;
  grandparent_title?: string;
  parent_media_index?: string;
  media_index?: string;
  added_at: string;
  thumb?: string;
  parent_thumb?: string;
  grandparent_thumb?: string;
  year?: string;
}

function api(cmd: string, extra = ''): string {
  const { url, key } = config.tautulli!;
  return `${url}/api/v2?apikey=${encodeURIComponent(key)}&cmd=${cmd}${extra}`;
}

async function call<T>(cmd: string, extra = ''): Promise<T> {
  const r = await getJson<TautulliResponse<T>>(api(cmd, extra));
  if (r.response.result !== 'success') throw new Error(r.response.message ?? 'Tautulli error');
  return r.response.data;
}

const img = (path?: string) => (path ? `/api/img/tautulli?path=${encodeURIComponent(path)}` : undefined);
const sxe = (s?: string, e?: string) =>
  s && e ? `S${s.padStart(2, '0')}E${e.padStart(2, '0')}` : undefined;

/** Tautulli supplies playback offsets and duration in milliseconds. */
export function toTautulliStream(s: Session): Stream {
  const ep = s.media_type === 'episode';
  const position = s.view_offset === undefined || s.view_offset === '' ? NaN : Number(s.view_offset);
  const duration = s.duration === undefined || s.duration === '' ? NaN : Number(s.duration);
  const progress = s.progress_percent === undefined || s.progress_percent.trim() === '' ? NaN : Number(s.progress_percent);
  return {
    ...(s.rating_key ? { itemId: s.rating_key } : {}),
    user: s.friendly_name,
    title: ep ? (s.grandparent_title ?? s.title) : s.title,
    subtitle: ep ? [sxe(s.parent_media_index, s.media_index), s.title].filter(Boolean).join(' ') : undefined,
    progress: Number.isFinite(progress) && progress >= 0 ? Math.min(100, progress) : -1,
    ...(Number.isFinite(position) && position >= 0 ? { positionSec: position / 1000 } : {}),
    ...(Number.isFinite(duration) && duration > 0 ? { durationSec: duration / 1000 } : {}),
    state: (['playing', 'paused', 'buffering'].includes(s.state) ? s.state : 'playing') as Stream['state'],
    transcode: s.transcode_decision === 'transcode',
    thumb: img(ep ? s.grandparent_thumb : s.thumb),
  };
}

/**
 * Where a title opens in Plex's web app, after its address and before the
 * item's rating key. Plex addresses items by its server's machine id.
 */
export const plexItemPath = (machineId: string): string => `#!/server/${encodeURIComponent(machineId)}/details?key=%2Flibrary%2Fmetadata%2F`;

/** Plex's machine id, asked of Tautulli once; null when it can't say. */
let machineId: string | null | undefined;
async function serverId(): Promise<string | null> {
  if (machineId !== undefined) return machineId;
  try {
    machineId = (await call<{ machine_identifier?: string }>('get_server_identity')).machine_identifier || null;
  } catch {
    // Asked again next poll; posters open Plex itself meanwhile.
    return null;
  }
  return machineId;
}

interface HistoryRow {
  friendly_name?: string;
  media_type?: string;
  title?: string;
  grandparent_title?: string;
  parent_media_index?: string | number;
  media_index?: string | number;
  date?: number;
  stopped?: number;
  rating_key?: string | number;
  thumb?: string;
  grandparent_thumb?: string;
}

/** Tautulli's history as plays: the show for an episode, with its number and name. */
export function fromHistory(rows: HistoryRow[]): Play[] {
  return rows.map((r) => {
    const ep = r.media_type === 'episode';
    return {
      user: r.friendly_name ?? 'Someone',
      title: (ep ? r.grandparent_title : r.title) ?? r.title ?? 'Something',
      ...(ep ? { subtitle: [sxe(String(r.parent_media_index ?? ''), String(r.media_index ?? '')), r.title].filter(Boolean).join(' ') } : {}),
      at: ((r.stopped || r.date) ?? 0) * 1000,
      ...(r.rating_key != null ? { itemId: String(r.rating_key) } : {}),
      ...(img(ep ? r.grandparent_thumb : r.thumb) ? { thumb: img(ep ? r.grandparent_thumb : r.thumb) } : {}),
    };
  });
}

/** Tautulli's libraries summed by kind: films, shows and their episodes, artists' tracks. */
export function libraryCounts(libs: { section_type?: string; count?: string | number; child_count?: string | number }[]): LibraryCounts {
  const n = (v: unknown) => Number(v) || 0;
  const of = (t: string) => libs.filter((l) => l.section_type === t);
  const songs = of('artist').reduce((s, l) => s + n(l.child_count), 0);
  return {
    movies: of('movie').reduce((s, l) => s + n(l.count), 0),
    shows: of('show').reduce((s, l) => s + n(l.count), 0),
    episodes: of('show').reduce((s, l) => s + n(l.child_count), 0),
    ...(songs ? { songs } : {}),
  };
}

export function tautulliAdapter(): Adapter<TautulliData> {
  const history = every(5 * 60_000, async () => fromHistory((await call<{ data: HistoryRow[] }>('get_history', '&length=15')).data ?? []));
  const library = every(5 * 60_000, async () => libraryCounts(await call<{ section_type?: string; count?: string; child_count?: string }[]>('get_libraries')));
  // New arrivals change slowly; only "who is watching" follows the fast poll.
  const fresh = cached(60_000, () => call<{ recently_added: Added[] }>('get_recently_added', '&count=30'));
  let watching = false;
  return {
    id: 'tautulli',
    label: 'Plex',
    // While someone watches, every 5 seconds so Right now keeps up; otherwise 15.
    get intervalMs() {
      return watching ? 5 * SECOND : 15 * SECOND;
    },
    async fetch() {
      const [activity, addedNow, id, watched, lib] = await Promise.all([
        call<{ sessions: Session[] }>('get_activity'),
        fresh(),
        serverId(),
        history(),
        library(),
      ]);
      const streams = activity.sessions.map(toTautulliStream);
      watching = streams.length > 0;
      const added = addedNow;
      const recent: RecentItem[] = added.recently_added.map((a) => {
        const ep = a.media_type === 'episode';
        const season = a.media_type === 'season';
        return {
          id: a.rating_key,
          type: a.media_type,
          title: ep ? (a.grandparent_title ?? a.title) : season ? (a.parent_title ?? a.title) : a.title,
          subtitle: ep
            ? [sxe(a.parent_media_index, a.media_index), a.title].filter(Boolean).join(' ')
            : season
              ? a.title
              : a.year,
          addedAt: Number(a.added_at) * 1000,
          thumb: img(ep ? a.grandparent_thumb : season ? (a.parent_thumb ?? a.thumb) : a.thumb),
        };
      });
      return { streams, recent, ...(id ? { itemPath: plexItemPath(id) } : {}), ...(watched ? { watched } : {}), ...(lib ? { library: lib } : {}) };
    },
  };
}

/** Proxy a Plex image through Tautulli. Only library paths are allowed. */
export async function tautulliImage(path: string): Promise<Response> {
  if (!/^\/library\/[\w/.-]+$/.test(path)) throw new Error('Bad image path');
  return request(api('pms_image_proxy', `&img=${encodeURIComponent(path)}&width=300&height=450&fallback=poster`));
}
