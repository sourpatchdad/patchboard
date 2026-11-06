// Netdata and Prometheus: their firing alerts join Needs attention, beside
// everything else. Patchboard doesn't redraw their charts; you keep those
// where they are, and a raised alarm shows up here with a link back.
// Netdata: /api/v1/alarms (raised alarms only).
// Prometheus: /api/v1/alerts; Alertmanager: /api/v2/alerts. Either address works.

import type { MonitorAlert, MonitorData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { getJson } from '../http.ts';
import { type Adapter, SECOND } from './adapter.ts';

export interface NetdataAlarms {
  hostname?: string;
  alarms?: Record<string, { name?: string; chart?: string; status?: string; summary?: string; info?: string; value_string?: string; last_status_change?: number }>;
}

export function fromNetdata(r: NetdataAlarms): MonitorAlert[] {
  return Object.entries(r.alarms ?? {})
    .filter(([, a]) => a.status === 'WARNING' || a.status === 'CRITICAL')
    .map(([key, a]) => ({
      id: key,
      name: (a.summary || a.name || key).replace(/_/g, ' '),
      severity: a.status === 'CRITICAL' ? ('critical' as const) : ('warn' as const),
      detail: [a.value_string, a.chart].filter(Boolean).join(' on ') || a.info,
      instance: r.hostname,
      since: a.last_status_change ? a.last_status_change * 1000 : undefined,
    }));
}

type PromAlert = { labels?: Record<string, string>; annotations?: Record<string, string>; state?: string; activeAt?: string; startsAt?: string; status?: { state?: string } };

/** Prometheus (state: firing) or Alertmanager (status.state: active). Pending and silenced alerts stay out. */
export function fromPrometheus(list: PromAlert[]): MonitorAlert[] {
  return list
    .filter((a) => a.state === 'firing' || a.status?.state === 'active')
    .map((a) => {
      const l = a.labels ?? {};
      const sev = (l.severity ?? '').toLowerCase();
      return {
        id: [l.alertname, l.instance, l.job].filter(Boolean).join('|'),
        name: a.annotations?.summary || l.alertname || 'Alert',
        severity: /crit|page|emerg|error|high/.test(sev) ? ('critical' as const) : ('warn' as const),
        detail: a.annotations?.description,
        instance: l.instance,
        since: Date.parse(a.activeAt ?? a.startsAt ?? '') || undefined,
      };
    });
}

export function netdataAdapter(): Adapter<MonitorData> {
  const { url } = config.netdata!;
  return {
    id: 'netdata',
    label: 'Netdata',
    intervalMs: 30 * SECOND,
    async fetch() {
      return { alerts: fromNetdata(await getJson<NetdataAlarms>(`${url}/api/v1/alarms`)), webUrl: url };
    },
  };
}

export function prometheusAdapter(): Adapter<MonitorData> {
  const { url, key } = config.prometheus!;
  const headers = key ? { Authorization: `Bearer ${key}` } : undefined;
  return {
    id: 'prometheus',
    label: 'Prometheus',
    intervalMs: 30 * SECOND,
    async fetch() {
      try {
        const r = await getJson<{ data?: { alerts?: PromAlert[] } }>(`${url}/api/v1/alerts`, { headers });
        if (r.data?.alerts) return { alerts: fromPrometheus(r.data.alerts), webUrl: url };
      } catch {
        // Not Prometheus: try Alertmanager below.
      }
      return { alerts: fromPrometheus(await getJson<PromAlert[]>(`${url}/api/v2/alerts`, { headers })), webUrl: url };
    },
  };
}
