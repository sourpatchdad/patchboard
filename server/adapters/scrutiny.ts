// Scrutiny: each drive's SMART verdict, temperature and age, from one call to
// /api/summary. Scrutiny has no API key; put it on a private address.
// https://github.com/AnalogJ/scrutiny

import type { DriveHealth, ScrutinyData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { getJson } from '../http.ts';
import { type Adapter, MINUTE } from './adapter.ts';

export interface ScrutinySummary {
  data?: {
    summary?: Record<
      string,
      {
        device?: { wwn?: string; device_name?: string; model_name?: string; serial_number?: string; capacity?: number; device_status?: number; host_id?: string };
        smart?: { collector_date?: string; temp?: number; power_on_hours?: number };
      }
    >;
  };
}

/** Scrutiny's device_status is a bit field: 1 SMART failed, 2 Scrutiny's thresholds failed. */
export function toDrives(raw: ScrutinySummary): DriveHealth[] {
  return Object.entries(raw.data?.summary ?? {})
    .map(([wwn, d]) => {
      const st = d.device?.device_status ?? 0;
      return {
        id: d.device?.wwn ?? wwn,
        name: d.device?.device_name?.replace(/^\/dev\//, '') ?? wwn,
        model: d.device?.model_name ?? '',
        capacity: d.device?.capacity ?? 0,
        host: d.device?.host_id || undefined,
        status: st === 0 ? ('ok' as const) : st & 1 ? ('failed' as const) : ('warn' as const),
        temp: d.smart?.temp || undefined,
        hours: d.smart?.power_on_hours ?? undefined,
        checkedAt: d.smart?.collector_date ? Date.parse(d.smart.collector_date) : undefined,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function scrutinyAdapter(): Adapter<ScrutinyData> {
  const { url } = config.scrutiny!;
  return {
    id: 'scrutiny',
    label: 'Scrutiny',
    intervalMs: 5 * MINUTE,
    async fetch() {
      return { drives: toDrives(await getJson<ScrutinySummary>(`${url}/api/summary`)), webUrl: url };
    },
  };
}
