// Transmission, Deluge, SABnzbd and NZBGet, reported in qBittorrent's shape so
// the board shows every download client the same way. Each one can also pause
// and resume everything, through POST /api/downloads/:id/:action.

import type { ActiveTorrent, DownloadClientId, QbitData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { HttpError, request } from '../http.ts';
import { type Adapter, SECOND } from './adapter.ts';

export type DownloadAction = 'pause' | 'resume';
export type DownloadControl = (action: DownloadAction) => Promise<void>;

const basic = (user?: string, pass?: string): Record<string, string> =>
  user || pass ? { Authorization: `Basic ${Buffer.from(`${user ?? ''}:${pass ?? ''}`).toString('base64')}` } : {};

const top = (list: ActiveTorrent[]) => list.sort((a, b) => b.speed - a.speed).slice(0, 4);

// ---------- Transmission: JSON RPC with a session id it hands out on a 409 ----------

interface TrTorrent {
  name: string;
  status: number; // 0 stopped, 1-2 checking, 3 queued, 4 downloading, 5 queued to seed, 6 seeding
  percentDone: number;
  rateDownload: number;
  eta: number;
  error: number;
}

export function transmissionClient() {
  const { url, username, password } = config.transmission!;
  let session = '';
  async function rpc<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await request(`${url}/transmission/rpc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Transmission-Session-Id': session, ...basic(username, password) },
          body: JSON.stringify({ method, arguments: args }),
        });
        const body = (await res.json()) as { result: string; arguments: T };
        if (body.result !== 'success') throw new Error(`Transmission: ${body.result}`);
        return body.arguments;
      } catch (err) {
        // The first call, and any call after a restart, gets 409 with a fresh id.
        if (err instanceof HttpError && err.status === 409 && attempt === 0) {
          const res = await fetch(`${url}/transmission/rpc`, { method: 'POST', headers: basic(username, password), signal: AbortSignal.timeout(8000) }).catch(() => null);
          session = res?.headers.get('x-transmission-session-id') ?? '';
          continue;
        }
        throw err;
      }
    }
    throw new Error('Transmission refused the session');
  }

  const adapter: Adapter<QbitData> = {
    id: 'transmission',
    label: 'Transmission',
    intervalMs: 5 * SECOND,
    async fetch() {
      const [stats, list] = await Promise.all([
        rpc<{ downloadSpeed: number; uploadSpeed: number }>('session-stats'),
        rpc<{ torrents: TrTorrent[] }>('torrent-get', { fields: ['name', 'status', 'percentDone', 'rateDownload', 'eta', 'error'] }),
      ]);
      const t = list.torrents;
      const downloading = t.filter((x) => x.status === 4 || x.status === 3);
      return {
        kind: 'torrent',
        down: stats.downloadSpeed,
        up: stats.uploadSpeed,
        downloading: downloading.length,
        seeding: t.filter((x) => x.status === 6 || x.status === 5).length,
        stalled: downloading.filter((x) => x.status === 4 && x.rateDownload === 0).length,
        errored: t.filter((x) => x.error > 0).map((x) => x.name),
        paused: t.length > 0 && t.every((x) => x.status === 0),
        active: top(downloading.map((x) => ({ name: x.name, progress: x.percentDone, speed: x.rateDownload, etaSec: x.eta }))),
      };
    },
  };
  const control: DownloadControl = async (action) => {
    await rpc(action === 'pause' ? 'torrent-stop' : 'torrent-start');
  };
  return { adapter, control };
}

// ---------- Deluge: the Web UI's JSON RPC, signed in with its password ----------

interface DeTorrent {
  name: string;
  state: string;
  progress: number; // 0-100
  download_payload_rate: number;
  eta: number;
}

export function delugeClient() {
  const { url, password } = config.deluge!;
  let cookie = '';
  let id = 0;
  async function call<T>(method: string, params: unknown[] = []): Promise<T> {
    const res = await request(`${url}/json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ method, params, id: ++id }),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const body = (await res.json()) as { result: T; error: { message: string; code: number } | null };
    if (body.error) {
      const e = new Error(`Deluge: ${body.error.message}`);
      (e as Error & { code?: number }).code = body.error.code;
      throw e;
    }
    return body.result;
  }
  async function ready(): Promise<void> {
    if (!cookie && !(await call<boolean>('auth.login', [password]))) throw new Error('Deluge rejected the password');
    // The Web UI talks to a daemon; connect to the first one when it isn't.
    if (!(await call<boolean>('web.connected'))) {
      const hosts = await call<[string, ...unknown[]][]>('web.get_hosts');
      if (!hosts.length) throw new Error('Deluge has no daemon to connect to');
      await call('web.connect', [hosts[0][0]]);
    }
  }
  async function withLogin<T>(fn: () => Promise<T>): Promise<T> {
    try {
      await ready();
      return await fn();
    } catch (err) {
      // An expired session answers with error code 1, "Not authenticated".
      if ((err as { code?: number }).code !== 1) throw err;
      cookie = '';
      await ready();
      return fn();
    }
  }

  const adapter: Adapter<QbitData> = {
    id: 'deluge',
    label: 'Deluge',
    intervalMs: 5 * SECOND,
    fetch: () =>
      withLogin(async () => {
        const ui = await call<{ torrents: Record<string, DeTorrent>; stats: { download_rate: number; upload_rate: number } }>('web.update_ui', [
          ['name', 'state', 'progress', 'download_payload_rate', 'eta'],
          {},
        ]);
        const paused = await call<boolean>('core.is_session_paused').catch(() => false);
        const t = Object.values(ui.torrents ?? {});
        const downloading = t.filter((x) => x.state === 'Downloading' || x.state === 'Queued');
        return {
          kind: 'torrent',
          down: ui.stats.download_rate,
          up: ui.stats.upload_rate,
          downloading: downloading.length,
          seeding: t.filter((x) => x.state === 'Seeding').length,
          stalled: downloading.filter((x) => x.state === 'Downloading' && x.download_payload_rate === 0).length,
          errored: t.filter((x) => x.state === 'Error').map((x) => x.name),
          paused,
          active: top(downloading.map((x) => ({ name: x.name, progress: x.progress / 100, speed: x.download_payload_rate, etaSec: x.eta }))),
        };
      }),
  };
  const control: DownloadControl = (action) =>
    withLogin(async () => {
      await call(action === 'pause' ? 'core.pause_session' : 'core.resume_session');
    });
  return { adapter, control };
}

// ---------- SABnzbd: one API key in the query string ----------

interface SabSlot {
  filename: string;
  percentage: string;
  timeleft: string; // H:MM:SS
  status: string;
}

const hms = (s: string) => s.split(':').reduce((n, p) => n * 60 + (Number(p) || 0), 0);

export function sabnzbdClient() {
  const { url, key } = config.sabnzbd!;
  const api = <T>(mode: string, extra = '') =>
    request(`${url}/api?mode=${mode}&output=json&apikey=${encodeURIComponent(key)}${extra}`).then((r) => r.json() as Promise<T>);

  const adapter: Adapter<QbitData> = {
    id: 'sabnzbd',
    label: 'SABnzbd',
    intervalMs: 5 * SECOND,
    async fetch() {
      const [{ queue }, { history }] = await Promise.all([
        api<{ queue: { paused: boolean; kbpersec: string; slots: SabSlot[] } }>('queue'),
        api<{ history: { slots: { name: string; status: string; completed: number }[] } }>('history', '&limit=20'),
      ]);
      const rate = Number(queue.kbpersec) * 1024 || 0;
      const slots = queue.slots ?? [];
      const day = Date.now() / 1000 - 86_400;
      return {
        kind: 'usenet',
        down: rate,
        up: 0,
        downloading: slots.length,
        seeding: 0,
        stalled: 0,
        errored: (history.slots ?? []).filter((h) => h.status === 'Failed' && h.completed > day).map((h) => h.name),
        paused: queue.paused,
        active: slots.slice(0, 4).map((s, i) => ({
          name: s.filename,
          progress: (Number(s.percentage) || 0) / 100,
          // SABnzbd downloads one job at a time; the rest wait.
          speed: i === 0 && !queue.paused ? rate : 0,
          etaSec: hms(s.timeleft),
        })),
      };
    },
  };
  const control: DownloadControl = async (action) => {
    await api(action);
  };
  return { adapter, control };
}

// ---------- NZBGet: JSON RPC behind basic auth ----------

interface NzbGroup {
  NZBName: string;
  FileSizeMB: number;
  RemainingSizeMB: number;
  Status: string;
}

export function nzbgetClient() {
  const { url, username, password } = config.nzbget!;
  async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
    const res = await request(`${url}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...basic(username, password) },
      body: JSON.stringify({ method, params }),
    });
    const body = (await res.json()) as { result: T; error?: { message: string } };
    if (body.error) throw new Error(`NZBGet: ${body.error.message}`);
    return body.result;
  }

  const adapter: Adapter<QbitData> = {
    id: 'nzbget',
    label: 'NZBGet',
    intervalMs: 5 * SECOND,
    async fetch() {
      const [status, groups, history] = await Promise.all([
        rpc<{ DownloadRate: number; DownloadPaused: boolean }>('status'),
        rpc<NzbGroup[]>('listgroups', [0]),
        rpc<{ Name: string; Status: string; HistoryTime: number }[]>('history', [false]).catch(() => []),
      ]);
      const rate = status.DownloadRate;
      const day = Date.now() / 1000 - 86_400;
      return {
        kind: 'usenet',
        down: rate,
        up: 0,
        downloading: groups.length,
        seeding: 0,
        stalled: 0,
        errored: history.filter((h) => h.Status.startsWith('FAILURE') && h.HistoryTime > day).map((h) => h.Name),
        paused: status.DownloadPaused,
        active: groups.slice(0, 4).map((g, i) => {
          const leftBytes = g.RemainingSizeMB * 1_048_576;
          const speed = i === 0 && g.Status === 'DOWNLOADING' ? rate : 0;
          return {
            name: g.NZBName,
            progress: g.FileSizeMB ? 1 - g.RemainingSizeMB / g.FileSizeMB : 0,
            speed,
            etaSec: speed ? Math.round(leftBytes / speed) : -1,
          };
        }),
      };
    },
  };
  const control: DownloadControl = async (action) => {
    await rpc(action === 'pause' ? 'pausedownload' : 'resumedownload');
  };
  return { adapter, control };
}

export const DOWNLOAD_CLIENTS: DownloadClientId[] = ['qbit', 'transmission', 'deluge', 'sabnzbd', 'nzbget'];
