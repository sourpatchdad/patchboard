// Synology DSM: every volume and drive from Storage Manager's API. DSM only
// shares storage details with administrators, so make a dedicated admin
// account for Patchboard, without two-factor sign-in (DSM's API can't answer
// a code). It signs in, reads, and signs out each time.
// https://global.download.synology.com/download/Document/Software/DeveloperGuide/Os/DSM/All/enu/DSM_Login_Web_API_Guide_enu.pdf

import type { NasDisk, NasSystem, NasVolume } from '../../shared/types.ts';
import { config } from '../config.ts';
import { fetchText } from '../http.ts';
import { type Adapter, MINUTE } from './adapter.ts';

type Reply<T> = { success: boolean; data?: T; error?: { code: number } };

export interface SynoStorage {
  volumes?: { id?: string; vol_path?: string; display_name?: string; status?: string; size?: { total?: string | number; used?: string | number } }[];
  disks?: { id?: string; name?: string; longName?: string; model?: string; temp?: number; status?: string; smart_status?: string; overview_status?: string }[];
}

/** DSM's sign-in error codes, in words. */
const SIGN_IN: Record<number, string> = {
  400: 'the username or password is wrong',
  401: 'the account is disabled',
  402: 'the account has no permission',
  403: 'the account uses two-factor sign-in; give Patchboard an account without it',
  404: 'the two-factor code failed',
  407: 'DSM blocked this address after failed sign-ins; unblock it in Security, Account',
  410: 'the password has expired',
};

const volStatus = (s?: string): NasVolume['status'] => (!s || s === 'normal' ? 'ok' : /crash|fail/.test(s) ? 'failed' : 'warn');
const diskStatus = (d: NonNullable<SynoStorage['disks']>[number]): NasDisk['status'] => {
  const words = [d.status, d.smart_status, d.overview_status].filter(Boolean).join(' ');
  if (/crash|fail|abnormal/i.test(words)) return 'failed';
  if (/warning|degrad|attention/i.test(words)) return 'warn';
  return 'ok';
};

export function toSynology(s: SynoStorage, name: string, url: string): NasSystem {
  return {
    platform: 'Synology',
    name,
    webUrl: url,
    volumes: (s.volumes ?? []).map((v) => ({
      name: v.display_name || v.vol_path?.replace(/^\//, '') || v.id || 'volume',
      used: Number(v.size?.used ?? 0),
      total: Number(v.size?.total ?? 0),
      status: volStatus(v.status),
      detail: volStatus(v.status) === 'ok' ? undefined : v.status,
    })),
    disks: (s.disks ?? []).map((d) => {
      const status = diskStatus(d);
      return {
        name: d.longName || d.name || d.id || 'drive',
        model: d.model?.trim() || undefined,
        status,
        detail: status === 'ok' ? undefined : [d.status, d.smart_status].filter((x) => x && x !== 'normal').join(', ') || undefined,
        tempC: d.temp || undefined,
      };
    }),
  };
}

export function synologyAdapter(): Adapter<NasSystem> {
  const { url, username, password, verifyTls } = config.synology!;
  const api = async <T>(path: string, params: Record<string, string>): Promise<T> => {
    const text = await fetchText(`${url}/webapi/${path}?${new URLSearchParams(params)}`, { verifyTls });
    const r = JSON.parse(text) as Reply<T>;
    if (!r.success) throw Object.assign(new Error(`DSM error ${r.error?.code ?? '?'}`), { code: r.error?.code });
    return r.data as T;
  };
  return {
    id: 'synology',
    label: 'Synology',
    intervalMs: 2 * MINUTE,
    async fetch() {
      let sid: string;
      try {
        sid = (await api<{ sid: string }>('entry.cgi', { api: 'SYNO.API.Auth', version: '6', method: 'login', account: username, passwd: password, session: 'Patchboard', format: 'sid' })).sid;
      } catch (e) {
        const code = (e as { code?: number }).code;
        throw new Error(code && SIGN_IN[code] ? `Can't sign in: ${SIGN_IN[code]}` : (e as Error).message);
      }
      try {
        const [storage, info] = await Promise.all([
          api<SynoStorage>('entry.cgi', { api: 'SYNO.Storage.CGI.Storage', version: '1', method: 'load_info', _sid: sid }),
          api<{ model?: string; hostname?: string }>('entry.cgi', { api: 'SYNO.DSM.Info', version: '2', method: 'getinfo', _sid: sid }).catch(() => ({}) as { model?: string; hostname?: string }),
        ]);
        return toSynology(storage, info.hostname || info.model || new URL(url).hostname, url);
      } finally {
        void api('entry.cgi', { api: 'SYNO.API.Auth', version: '6', method: 'logout', session: 'Patchboard', _sid: sid }).catch(() => {});
      }
    },
  };
}
