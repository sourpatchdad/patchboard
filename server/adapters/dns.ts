// Pi-hole (v6 API) and AdGuard Home: today's queries and blocks, whether
// blocking is on, and a timed pause. A pause always carries a timer, so
// blocking comes back on its own even if nobody remembers to resume it.

import type { DnsData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { getJson, request } from '../http.ts';
import { type Adapter, SECOND } from './adapter.ts';

/** null resumes; a number pauses for that many minutes. */
export type DnsControl = (minutes: number | null) => Promise<void>;
export interface DnsClient {
  adapter: Adapter<DnsData>;
  dns: DnsControl;
}

/** The pauses the widget offers. The route accepts only these. */
export const PAUSE_MINUTES = [5, 30, 60];

const pct = (blocked: number, total: number) => (total ? Math.round((blocked / total) * 1000) / 10 : 0);

// ---------- Pi-hole 6 ----------

interface PiSummary {
  queries: { total: number; blocked: number; percent_blocked?: number };
  gravity?: { domains_being_blocked?: number };
}

export function toPihole(sum: PiSummary, blocking: { blocking: string; timer?: number | null }, now = Date.now()): DnsData {
  const on = blocking.blocking === 'enabled';
  return {
    kind: 'pihole',
    queries: sum.queries.total,
    blocked: sum.queries.blocked,
    pct: sum.queries.percent_blocked != null ? Math.round(sum.queries.percent_blocked * 10) / 10 : pct(sum.queries.blocked, sum.queries.total),
    protecting: on,
    resumesAt: !on && blocking.timer ? now + blocking.timer * 1000 : undefined,
    listSize: sum.gravity?.domains_being_blocked,
  };
}

export function piholeClient(): DnsClient {
  const { url, password } = config.pihole!;
  // Pi-hole hands out a limited number of sessions, so keep one and only
  // sign in again when it expires.
  // Calls made together share one sign-in instead of each taking a session.
  let sid: string | null = null;
  let signingIn: Promise<void> | null = null;
  function signIn(): Promise<void> {
    signingIn ??= (async () => {
      try {
        const r = await getJson<{ session: { valid: boolean; sid: string | null } }>(`${url}/api/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: password ?? '' }),
        });
        if (!r.session.valid) throw new Error('Pi-hole refused the password');
        sid = r.session.sid;
      } catch (err) {
        if ((err as { status?: number }).status === 401) throw new Error('Pi-hole refused the password');
        throw err;
      } finally {
        signingIn = null;
      }
    })();
    return signingIn;
  }
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (sid === null && password) await signIn();
    const used = sid;
    const go = () => getJson<T>(`${url}${path}`, { ...init, headers: { ...(init.headers as Record<string, string>), ...(sid ? { 'X-FTL-SID': sid } : {}) } });
    try {
      return await go();
    } catch (err) {
      if ((err as { status?: number }).status !== 401 || !password) throw err;
      // Another call may have signed in again already.
      if (sid === used) await signIn();
      return go();
    }
  }
  return {
    adapter: {
      id: 'pihole',
      label: 'Pi-hole',
      intervalMs: 30 * SECOND,
      async fetch() {
        const [sum, blocking] = await Promise.all([call<PiSummary>('/api/stats/summary'), call<{ blocking: string; timer?: number | null }>('/api/dns/blocking')]);
        return toPihole(sum, blocking);
      },
    },
    async dns(minutes) {
      await call('/api/dns/blocking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(minutes === null ? { blocking: true, timer: null } : { blocking: false, timer: minutes * 60 }),
      });
    },
  };
}

// ---------- AdGuard Home ----------

interface AgStatus {
  protection_enabled: boolean;
  /** Milliseconds left on a timed pause. */
  protection_disabled_duration?: number;
}

interface AgStats {
  num_dns_queries: number;
  num_blocked_filtering: number;
  num_replaced_safebrowsing?: number;
  num_replaced_parental?: number;
}

export function toAdguard(stats: AgStats, status: AgStatus, now = Date.now()): DnsData {
  const blocked = stats.num_blocked_filtering + (stats.num_replaced_safebrowsing ?? 0) + (stats.num_replaced_parental ?? 0);
  return {
    kind: 'adguard',
    queries: stats.num_dns_queries,
    blocked,
    pct: pct(blocked, stats.num_dns_queries),
    protecting: status.protection_enabled,
    resumesAt: !status.protection_enabled && status.protection_disabled_duration ? now + status.protection_disabled_duration : undefined,
  };
}

export function adguardClient(): DnsClient {
  const { url, username, password } = config.adguard!;
  const auth: Record<string, string> = username ? { Authorization: `Basic ${Buffer.from(`${username}:${password ?? ''}`).toString('base64')}` } : {};
  return {
    adapter: {
      id: 'adguard',
      label: 'AdGuard Home',
      intervalMs: 30 * SECOND,
      async fetch() {
        const [stats, status] = await Promise.all([getJson<AgStats>(`${url}/control/stats`, { headers: auth }), getJson<AgStatus>(`${url}/control/status`, { headers: auth })]);
        return toAdguard(stats, status);
      },
    },
    async dns(minutes) {
      await request(`${url}/control/protection`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(minutes === null ? { enabled: true } : { enabled: false, duration: minutes * 60_000 }),
      });
    },
  };
}
