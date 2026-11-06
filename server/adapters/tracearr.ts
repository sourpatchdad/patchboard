// Tracearr: watches Plex, Jellyfin and Emby together. Patchboard takes the two
// things that need a person: a media server Tracearr sees as down, and
// violations nobody has dealt with yet (shared accounts, impossible travel).
// Public API v2, with a key from Tracearr's Settings.
// https://github.com/connorgallopo/Tracearr

import type { TracearrData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { getJson } from '../http.ts';
import { type Adapter, SECOND } from './adapter.ts';

export interface TrServer {
  server_id: string;
  server_name: string;
  status: 'up' | 'down' | 'unknown';
  reason?: string | null;
  server_type?: string;
  historical?: boolean;
  active_streams?: number;
}

export interface TrViolation {
  id: string;
  severity: 'low' | 'warning' | 'high';
  created_at: string;
  acknowledged_at?: string | null;
  rule?: { name?: string };
  server?: { name?: string };
  user?: { username?: string };
}

export function toTracearr(servers: TrServer[], violations: TrViolation[], webUrl: string): TracearrData {
  return {
    webUrl,
    servers: servers
      .filter((s) => !s.historical)
      .map((s) => ({ id: s.server_id, name: s.server_name, type: s.server_type ?? '', status: s.status, reason: s.reason ?? undefined, streams: s.active_streams ?? 0 })),
    // Unacknowledged only; low severity is Tracearr's own bookkeeping.
    violations: violations
      .filter((v) => !v.acknowledged_at && v.severity !== 'low')
      .map((v) => ({
        id: v.id,
        severity: v.severity === 'high' ? ('high' as const) : ('warning' as const),
        rule: v.rule?.name ?? 'A rule',
        user: v.user?.username ?? 'someone',
        server: v.server?.name ?? '',
        at: Date.parse(v.created_at) || Date.now(),
      })),
  };
}

export function tracearrAdapter(): Adapter<TracearrData> {
  const { url, key } = config.tracearr!;
  const headers = { Authorization: `Bearer ${key}` };
  return {
    id: 'tracearr',
    label: 'Tracearr',
    intervalMs: 60 * SECOND,
    async fetch() {
      const [servers, violations] = await Promise.all([
        getJson<{ data?: TrServer[] }>(`${url}/api/v2/public/servers`, { headers }),
        getJson<{ data?: TrViolation[] }>(`${url}/api/v2/public/violations?acknowledged=false&pageSize=50`, { headers }),
      ]);
      return toTracearr(servers.data ?? [], violations.data ?? [], url);
    },
  };
}
