// qBittorrent Web API v2. Login gives a SID cookie; on 403 we log in again.

import type { QbitData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { HttpError, request } from '../http.ts';
import { type Adapter, SECOND } from './adapter.ts';

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
const LOGIN_BACKOFF = 30 * 60 * 1000;

export function qbitAdapter(): Adapter<QbitData> {
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

  async function get<T>(path: string): Promise<T> {
    if (!cookie) await login();
    try {
      return (await (await request(`${url}${path}`, { headers: { Cookie: cookie } })).json()) as T;
    } catch (err) {
      // An expired session answers 403. Re-login once; login() itself is rate limited.
      if (err instanceof HttpError && err.status === 403) {
        cookie = '';
        await login();
        return (await (await request(`${url}${path}`, { headers: { Cookie: cookie } })).json()) as T;
      }
      throw err;
    }
  }

  return {
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
}
