// Reachability: does each app actually answer? A container can be "running"
// while the app inside serves 502s or hangs, and only a request finds that.
// Every minute, one GET per service link, redirects not followed. Any HTTP
// answer below 500 counts as up (a login redirect or 401 still means the app
// is alive); 5xx, timeouts and refused connections count as down.
//
// Which links get checked: hrefs on private or tailnet addresses, and hrefs
// on CHECK_DOMAINS. Public sites (GitHub, the Cloudflare dashboard) are left
// alone. A service can opt out with `check: false` or point elsewhere with
// `check: http://...`.

import type { ChecksData, Service, ServiceCheck } from '../../shared/types.ts';
import { getCatalog } from '../catalog.ts';
import { config } from '../config.ts';
import { type Adapter, MINUTE } from './adapter.ts';

const TIMEOUT = 8000;

function isPrivateHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.ts.net')) return true;
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127);
}

/** The URL to check for a service, or null if it shouldn't be checked. */
export function checkUrl(s: Service): URL | null {
  if (s.check === false) return null;
  const raw = typeof s.check === 'string' ? s.check : s.href;
  if (!raw || !/^https?:\/\//.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (s.check === true || typeof s.check === 'string') return url;
  const host = url.hostname.toLowerCase();
  if (isPrivateHost(host)) return url;
  if (config.checkDomains.some((d) => host === d || host.endsWith(`.${d}`))) return url;
  return null;
}

function reason(err: unknown): string {
  const e = err as Error & { cause?: { code?: string } };
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return `No answer in ${TIMEOUT / 1000} s`;
  const code = e.cause?.code;
  if (code === 'ECONNREFUSED') return 'Connection refused';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Name not found';
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return 'Host unreachable';
  if (code === 'ECONNRESET') return 'Connection reset';
  if (code?.startsWith('ERR_TLS') || code?.includes('CERT')) return 'TLS certificate problem';
  return code ?? 'Request failed';
}

async function probe(name: string, url: URL, prev?: ServiceCheck): Promise<ServiceCheck> {
  const target = url.host;
  const start = performance.now();
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT), headers: { 'User-Agent': 'Patchboard/1 (health check)' } });
    const ms = Math.round(performance.now() - start);
    void res.body?.cancel();
    const ok = res.status < 500;
    return { name, target, ok, status: res.status, ms, at: Date.now(), fails: ok ? 0 : (prev?.fails ?? 0) + 1, error: ok ? undefined : `HTTP ${res.status}` };
  } catch (err) {
    return { name, target, ok: false, status: null, ms: null, at: Date.now(), fails: (prev?.fails ?? 0) + 1, error: reason(err) };
  }
}

export function checksAdapter(): Adapter<ChecksData> {
  let last: Record<string, ServiceCheck> = {};
  return {
    id: 'checks',
    label: 'Service checks',
    intervalMs: MINUTE,
    async fetch() {
      const services = getCatalog().groups.flatMap((g) => g.services);
      const results = await Promise.all(
        services.map((s) => {
          const url = checkUrl(s);
          return url ? probe(s.name, url, last[s.name]) : null;
        }),
      );
      last = Object.fromEntries(results.filter((r): r is ServiceCheck => !!r).map((r) => [r.name, r]));
      return { services: last };
    },
  };
}
