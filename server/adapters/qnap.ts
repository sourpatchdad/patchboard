// QNAP QTS and QuTS hero: volumes and drives from the same CGI endpoints the
// QTS web interface uses. A regular user can read them; make one for
// Patchboard, without two-step verification. It signs in, reads, and signs
// out each time.

import type { NasDisk, NasSystem, NasVolume } from '../../shared/types.ts';
import { config } from '../config.ts';
import { fetchText } from '../http.ts';
import { type Adapter, MINUTE } from './adapter.ts';

/** The text of the first <name> element, CDATA or not. */
export function tag(xml: string, name: string): string | undefined {
  const m = new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`).exec(xml);
  return m ? m[1].trim() : undefined;
}

/** Every <name> block. */
export function blocks(xml: string, name: string): string[] {
  return [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'g'))].map((m) => m[1]);
}

/** Volumes from chartReq.cgi disk_usage: labels in volumeList, sizes in volumeUseList. */
export function toVolumes(xml: string): NasVolume[] {
  const labels = new Map(blocks(xml, 'volume').map((b) => [tag(b, 'volumeValue'), { label: tag(b, 'volumeLabel'), status: tag(b, 'volumeStatus') }]));
  return blocks(xml, 'volumeUse').map((b) => {
    const id = tag(b, 'volumeValue');
    const total = Number(tag(b, 'total_size') ?? 0);
    const free = Number(tag(b, 'free_size') ?? 0);
    const meta = labels.get(id);
    // volumeStatus: 0 ready; a negative number is an error state.
    const bad = meta?.status != null && Number(meta.status) < 0;
    return { name: meta?.label || `Volume ${id}`, used: Math.max(0, total - free), total, status: bad ? 'warn' : 'ok', detail: bad ? 'not ready' : undefined };
  });
}

/** Drives from qsmart.cgi all_hd_data: health and temperature per bay. */
export function toDisks(xml: string): NasDisk[] {
  return blocks(xml, 'entry')
    .map((b) => {
      const health = (tag(b, 'Health') ?? '').toLowerCase();
      const temp = Number(tag(tag(b, 'Temperature') ?? '', 'oC') ?? tag(b, 'Temperature') ?? NaN);
      const status: NasDisk['status'] = !health || health === 'ok' || health === 'good' ? 'ok' : /abnormal|fail|bad/.test(health) ? 'failed' : 'warn';
      return {
        name: `Drive ${tag(b, 'HDNo') ?? '?'}`,
        model: tag(b, 'Model') || undefined,
        status,
        detail: status === 'ok' ? undefined : health,
        tempC: Number.isFinite(temp) && temp > 0 ? temp : undefined,
      };
    })
    .filter((d) => d.name !== 'Drive ?');
}

export function qnapAdapter(): Adapter<NasSystem> {
  const { url, username, password, verifyTls } = config.qnap!;
  const get = (path: string) => fetchText(`${url}${path}`, { verifyTls });
  return {
    id: 'qnap',
    label: 'QNAP',
    intervalMs: 2 * MINUTE,
    async fetch() {
      const login = await get(`/cgi-bin/authLogin.cgi?${new URLSearchParams({ user: username, pwd: Buffer.from(password).toString('base64'), remme: '0' })}`);
      const sid = tag(login, 'authSid');
      if (tag(login, 'authPassed') !== '1' || !sid) {
        throw new Error(tag(login, 'need_2sv') === '1' ? "Can't sign in: the account uses two-step verification; give Patchboard an account without it" : "Can't sign in: the username or password is wrong");
      }
      try {
        const [usage, smart, sys] = await Promise.all([
          get(`/cgi-bin/management/chartReq.cgi?chart_func=disk_usage&disk_select=all&include=all&sid=${sid}`),
          get(`/cgi-bin/disk/qsmart.cgi?func=all_hd_data&sid=${sid}`).catch(() => ''),
          get(`/cgi-bin/management/manaRequest.cgi?subfunc=sysinfo&hd=no&multicpu=1&sid=${sid}`).catch(() => ''),
        ]);
        return {
          platform: 'QNAP',
          name: tag(sys, 'hostname') || tag(sys, 'serverName') || new URL(url).hostname,
          webUrl: url,
          volumes: toVolumes(usage),
          disks: toDisks(smart),
        };
      } finally {
        void get(`/cgi-bin/authLogout.cgi?sid=${sid}`).catch(() => {});
      }
    },
  };
}
