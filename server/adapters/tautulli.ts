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
  friendly_name: string;
  media_type: string;
  title: string;
  grandparent_title?: string;
  parent_media_index?: string;
  media_index?: string;
  full_title: string;
  progress_percent: string;
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

export function tautulliAdapter(): Adapter<TautulliData> {
  return {
    id: 'tautulli',
    label: 'Plex',
    intervalMs: 15 * SECOND,
    async fetch() {
      const [activity, added] = await Promise.all([
        call<{ sessions: Session[] }>('get_activity'),
        call<{ recently_added: Added[] }>('get_recently_added', '&count=30'),
      ]);
      const streams: Stream[] = activity.sessions.map((s) => {
        const ep = s.media_type === 'episode';
        return {
          user: s.friendly_name,
          title: ep ? (s.grandparent_title ?? s.title) : s.title,
          subtitle: ep ? [sxe(s.parent_media_index, s.media_index), s.title].filter(Boolean).join(' ') : undefined,
          progress: Number(s.progress_percent) || 0,
          state: (['playing', 'paused', 'buffering'].includes(s.state) ? s.state : 'playing') as Stream['state'],
          transcode: s.transcode_decision === 'transcode',
          thumb: img(ep ? s.grandparent_thumb : s.thumb),
        };
      });
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
      return { streams, recent };
    },
  };
}

/** Proxy a Plex image through Tautulli. Only library paths are allowed. */
export async function tautulliImage(path: string): Promise<Response> {
  if (!/^\/library\/[\w/.-]+$/.test(path)) throw new Error('Bad image path');
  return request(api('pms_image_proxy', `&img=${encodeURIComponent(path)}&width=300&height=450&fallback=poster`));
}
