// Uptime Kuma: every monitor on one status page, with its last beats and
// 24-hour uptime. Status pages are public by design, so this needs no key;
// pick the page that holds the monitors you want on Home.
// Kuma sends heartbeat times in UTC without a zone ("2026-11-05 07:42:10.123").

import type { KumaMonitor, KumaState, UptimeKumaData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { getJson } from '../http.ts';
import { type Adapter, SECOND } from './adapter.ts';

interface Page {
  publicGroupList?: { name: string; monitorList?: { id: number; name: string }[] }[];
}

interface Beat {
  status: number; // 0 down, 1 up, 2 pending, 3 maintenance
  time: string;
  msg?: string;
  ping?: number | null;
}

interface Beats {
  heartbeatList?: Record<string, Beat[]>;
  uptimeList?: Record<string, number>;
}

const STATES: KumaMonitor['beats'] = ['down', 'up', 'pending', 'maintenance'];
/** How many recent beats the strip shows. */
export const KUMA_BEATS = 30;

export function kumaTime(t: string): number {
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : `${t.replace(' ', 'T')}Z`;
  const n = Date.parse(iso);
  return Number.isNaN(n) ? 0 : n;
}

export function toMonitors(page: Page, beats: Beats): KumaMonitor[] {
  const out: KumaMonitor[] = [];
  for (const g of page.publicGroupList ?? []) {
    for (const m of g.monitorList ?? []) {
      const list = [...(beats.heartbeatList?.[String(m.id)] ?? [])].sort((a, b) => kumaTime(a.time) - kumaTime(b.time));
      const last = list[list.length - 1];
      const status: KumaState = last ? (STATES[last.status] ?? 'pending') : 'unknown';
      // When the current state began: walk back over beats in the same state.
      let since: number | undefined;
      for (let i = list.length - 1; i >= 0 && list[i].status === last?.status; i--) since = kumaTime(list[i].time);
      const uptime = beats.uptimeList?.[`${m.id}_24`];
      out.push({
        id: m.id,
        name: m.name,
        group: g.name,
        status,
        ping: last?.ping ?? undefined,
        uptime24: typeof uptime === 'number' ? Math.round(uptime * 10000) / 100 : undefined,
        since,
        msg: status === 'up' ? undefined : last?.msg || undefined,
        beats: list.slice(-KUMA_BEATS).map((b) => STATES[b.status] ?? 'pending'),
      });
    }
  }
  return out;
}

export function uptimeKumaAdapter(): Adapter<UptimeKumaData> {
  const { url, slug } = config.uptimekuma!;
  const page = encodeURIComponent(slug);
  return {
    id: 'uptimekuma',
    label: 'Uptime Kuma',
    intervalMs: 30 * SECOND,
    async fetch() {
      const [p, b] = await Promise.all([getJson<Page>(`${url}/api/status-page/${page}`), getJson<Beats>(`${url}/api/status-page/heartbeat/${page}`)]);
      return { link: `${url}/status/${page}`, monitors: toMonitors(p, b) };
    },
  };
}
