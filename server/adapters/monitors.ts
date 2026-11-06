// Gatus and Healthchecks.io, read into the same monitors Uptime Kuma gives,
// so one Uptime widget and one alert rule cover all three.
// Gatus: GET /api/v1/endpoints/statuses, no key (https://github.com/TwiN/gatus).
// Healthchecks.io: GET /api/v3/checks/ with a read-only key
// (https://healthchecks.io/docs/api/), self-hosted or the hosted service.

import type { KumaMonitor, KumaState, UptimeKumaData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { getJson } from '../http.ts';
import { type Adapter, SECOND } from './adapter.ts';

export interface GatusEndpoint {
  name?: string;
  group?: string;
  key?: string;
  results?: { success?: boolean; timestamp?: string; duration?: number; errors?: string[]; conditionResults?: { condition?: string; success?: boolean }[] }[];
}

/** Each endpoint's last result decides; its recent results are the beats. */
export function fromGatus(rows: GatusEndpoint[]): KumaMonitor[] {
  return rows.map((e) => {
    const results = e.results ?? [];
    const last = results.at(-1);
    const status: KumaState = !last ? 'unknown' : last.success ? 'up' : 'down';
    // When the current streak began, as far back as the results go.
    let since: number | undefined;
    for (let i = results.length - 1; i >= 0 && results[i].success === last?.success; i--) since = Date.parse(results[i].timestamp ?? '') || since;
    const failed = last?.conditionResults?.find((c) => !c.success)?.condition;
    const ok = results.filter((r) => r.success).length;
    return {
      id: `gatus-${e.key ?? e.name}`,
      name: e.name ?? e.key ?? 'endpoint',
      group: e.group ?? '',
      status,
      ping: last?.duration != null ? Math.round(last.duration / 1e6) : undefined,
      uptime24: results.length ? Math.round((ok / results.length) * 1000) / 10 : undefined,
      since,
      msg: status === 'down' ? (last?.errors?.[0] ?? failed) : undefined,
      beats: results.slice(-30).map((r) => (r.success ? 'up' : 'down')),
    };
  });
}

export interface Healthcheck {
  name?: string;
  slug?: string;
  tags?: string;
  status?: string;
  last_ping?: string | null;
  unique_key?: string;
  ping_url?: string;
}

const HC_STATE: Record<string, KumaState> = { up: 'up', started: 'up', grace: 'pending', down: 'down', paused: 'maintenance', new: 'unknown' };

/** A check is a job that should ping in on time: late (grace) waits, down is down. */
export function fromHealthchecks(rows: Healthcheck[]): KumaMonitor[] {
  return rows.map((c) => {
    const status = HC_STATE[c.status ?? ''] ?? 'unknown';
    const last = c.last_ping ? Date.parse(c.last_ping) : undefined;
    return {
      id: `hc-${c.unique_key ?? c.slug ?? c.name}`,
      name: c.name || c.slug || 'check',
      group: c.tags ?? '',
      status,
      since: status === 'down' ? last : undefined,
      msg: status === 'down' && !last ? 'Never pinged' : undefined,
      beats: [],
    };
  });
}

export function gatusAdapter(): Adapter<UptimeKumaData> {
  const { url } = config.gatus!;
  return {
    id: 'gatus',
    label: 'Gatus',
    intervalMs: 60 * SECOND,
    async fetch() {
      const rows = await getJson<GatusEndpoint[]>(`${url}/api/v1/endpoints/statuses?pageSize=30`);
      return { link: url, monitors: fromGatus(Array.isArray(rows) ? rows : []) };
    },
  };
}

export function healthchecksAdapter(): Adapter<UptimeKumaData> {
  const { url, key } = config.healthchecks!;
  return {
    id: 'healthchecks',
    label: 'Healthchecks',
    intervalMs: 60 * SECOND,
    async fetch() {
      const body = await getJson<{ checks?: Healthcheck[] }>(`${url}/api/v3/checks/`, { headers: { 'X-Api-Key': key } });
      return { link: url, monitors: fromHealthchecks(body.checks ?? []) };
    },
  };
}
