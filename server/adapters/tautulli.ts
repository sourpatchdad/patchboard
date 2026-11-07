// Tautulli: current Plex streams and recently added media. Poster images are
// served through /api/img/tautulli so the API key never reaches the browser.

import type { RecentItem, Stream, TautulliData } from '../../shared/types.ts';
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

export function tautulliAdapter(): Adapter<TautulliData> {
  return {
    id: 'tautulli',
    label: 'Plex',
    intervalMs: 15 * SECOND,
    async fetch() {
      const [activity, added, id] = await Promise.all([
        call<{ sessions: Session[] }>('get_activity'),
        call<{ recently_added: Added[] }>('get_recently_added', '&count=30'),
        serverId(),
      ]);
      const streams = activity.sessions.map(toTautulliStream);
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
      return { streams, recent, ...(id ? { itemPath: plexItemPath(id) } : {}) };
    },
  };
}

/** Proxy a Plex image through Tautulli. Only library paths are allowed. */
export async function tautulliImage(path: string): Promise<Response> {
  if (!/^\/library\/[\w/.-]+$/.test(path)) throw new Error('Bad image path');
  return request(api('pms_image_proxy', `&img=${encodeURIComponent(path)}&width=300&height=450&fallback=poster`));
}
