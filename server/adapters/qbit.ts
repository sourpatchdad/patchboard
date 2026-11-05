// qBittorrent Web API v2. Login gives a SID cookie; on 403 we log in again.

import type { QbitData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { HttpError, request } from '../http.ts';
import { type Adapter, SECOND } from './adapter.ts';
import type { DownloadControl } from './downloads.ts';

interface Torrent {
  name: string;
  state: string;
  progress: number;
  dlspeed: number;
  eta: number;
}

const DOWNLOADING = new Set(['downloading', 'forcedDL', 'metaDL', 'checkingDL', 'queuedDL']);
const SEEDING = new Set(['uploading', 'forcedUP', 'stalledUP', 'queuedUP']);
const ERRORED = new Set(['error', 'missingFiles']);
// qBittorrent 5 renamed paused to stopped.
const PAUSED = new Set(['pausedDL', 'pausedUP', 'stoppedDL', 'stoppedUP']);
const LOGIN_BACKOFF = 30 * 60 * 1000;

export function qbitAdapter(): Adapter<QbitData> {
  return qbitClient().adapter;
}

export function qbitClient(): { adapter: Adapter<QbitData>; control: DownloadControl } {
  const { url, username, password } = config.qbit!;
  let cookie = '';
  // qBittorrent bans an IP after a few failed logins, and the ban hits every
  // app behind that IP. So: one login in flight at a time, and after a failed
  // login, no further attempts until LOGIN_BACKOFF has passed.
  let pending: Promise<void> | null = null;
  let blockedUntil = 0;

  function login(): Promise<void> {
    pending ??= (async () => {
      if (Date.now() < blockedUntil) {
        throw new Error('qBittorrent login failed earlier; check QBIT_USERNAME/QBIT_PASSWORD. Retrying later.');
      }
      try {
        const res = await request(`${url}/api/v2/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: url, Origin: url },
          body: new URLSearchParams({ username, password }),
        });
        const text = (await res.text()).trim();
        const sid = (res.headers.get('set-cookie') ?? '').split(';')[0];
        // qBittorrent 4.x answers 200 "Ok."; 5.x answers 204 with an empty body.
        // Either way success comes with a session cookie. The body is
        // qBittorrent's own message ("Fails.", a ban notice), never the credentials.
        if ((text !== 'Ok.' && text !== '') || !sid) {
          throw new Error(`qBittorrent rejected the login (HTTP ${res.status}: ${JSON.stringify(text.slice(0, 120))})`);
        }
        cookie = sid;
      } catch (err) {
        cookie = '';
        blockedUntil = Date.now() + LOGIN_BACKOFF;
        throw err;
      }
    })().finally(() => { pending = null; });
    return pending;
  }

  async function send(path: string, init: RequestInit = {}): Promise<Response> {
    if (!cookie) await login();
    const go = () => request(`${url}${path}`, { ...init, headers: { ...(init.headers as Record<string, string>), Cookie: cookie } });
    try {
      return await go();
    } catch (err) {
      // An expired session answers 403. Re-login once; login() itself is rate limited.
      if (err instanceof HttpError && err.status === 403) {
        cookie = '';
        await login();
        return go();
      }
      throw err;
    }
  }

  const get = async <T>(path: string): Promise<T> => (await (await send(path)).json()) as T;

  /** Every torrent at once. qBittorrent 5 calls it stop and start; 4.x, pause and resume. */
  const control: DownloadControl = async (action) => {
    const post = (verb: string) =>
      send(`/api/v2/torrents/${verb}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'hashes=all' });
    try {
      await post(action === 'pause' ? 'stop' : 'start');
    } catch (err) {
      if (!(err instanceof HttpError && err.status === 404)) throw err;
      await post(action);
    }
  };

  const adapter: Adapter<QbitData> = {
    id: 'qbit',
    label: 'qBittorrent',
    intervalMs: 5 * SECOND,
    async fetch() {
      const [info, torrents] = await Promise.all([
        get<{ dl_info_speed: number; up_info_speed: number }>('/api/v2/transfer/info'),
        get<Torrent[]>('/api/v2/torrents/info'),
      ]);
      const active = torrents
        .filter((t) => DOWNLOADING.has(t.state))
        .sort((a, b) => b.dlspeed - a.dlspeed)
        .slice(0, 4)
        .map((t) => ({ name: t.name, progress: t.progress, speed: t.dlspeed, etaSec: t.eta }));
      return {
        kind: 'torrent',
        paused: torrents.length > 0 && torrents.every((t) => PAUSED.has(t.state)),
        down: info.dl_info_speed,
        up: info.up_info_speed,
        downloading: torrents.filter((t) => DOWNLOADING.has(t.state)).length,
        seeding: torrents.filter((t) => SEEDING.has(t.state)).length,
        stalled: torrents.filter((t) => t.state === 'stalledDL').length,
        errored: torrents.filter((t) => ERRORED.has(t.state)).map((t) => t.name),
        active,
      };
    },
  };
  return { adapter, control };
}
