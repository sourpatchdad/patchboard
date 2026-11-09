// Server side of the JSON widget: fetch the configured endpoint with guard
// rails, pick out the mapped fields, cache per widget.
//
// Guard rails, because this makes the server fetch URLs on a user's behalf:
// - Only URLs saved in the board (or sent to the preview, which needs the
//   action header) are ever fetched; the browser never names a URL to read.
// - http and https only; redirects are refused, not followed.
// - Cloud metadata and link-local addresses are refused.
// - 8 s timeout, 512 KB response cap, JSON only.
// - ${env:NAME} references resolve only for WIDGET_* variables, ${secret:NAME}
//   to keys saved in the UI; resolved values never leave the server.

import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { ENV_REF, type JsonWidgetConfig, readPath, SECRET_REF } from '../shared/jsonwidget.ts';
import { getSecret } from './secrets.ts';
import { piholeSid } from './sessions.ts';

const MAX_BYTES = 512 * 1024;
const TIMEOUT = 8000;

function resolveEnv(s: string): string {
  return s
    .replace(ENV_REF, (_m, name: string) => (name.startsWith('WIDGET_') ? (process.env[name] ?? '') : ''))
    .replace(SECRET_REF, (_m, b64: string | undefined, name: string) => {
      const v = getSecret(name) ?? '';
      return b64 ? Buffer.from(v).toString('base64') : encodeURIComponentIfQuery(v);
    });
}

/** Keys are opaque tokens; leave them as they are (they go in headers or are already URL-safe). */
function encodeURIComponentIfQuery(v: string): string {
  return v;
}

export function blockedAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 169 && b === 254; // link-local, including cloud metadata 169.254.169.254
  }
  const v6 = ip.toLowerCase();
  return v6.startsWith('fe80:') || v6 === 'fd00:ec2::254';
}

export interface JsonResult {
  values: { label: string; value: unknown }[];
  at: number;
  error?: string;
  /** Only for the editor's preview: the start of the raw response. */
  sample?: string;
}

export async function fetchJsonWidget(cfg: JsonWidgetConfig, withSample = false): Promise<JsonResult> {
  const at = Date.now();
  try {
    const url = new URL(resolveEnv(cfg.url));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (host === 'metadata.google.internal') throw new Error('That address is blocked');
    const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
    if (addrs.some(blockedAddress)) throw new Error('That address is blocked');

    const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'Patchboard/1 (json widget)' };
    for (const [k, v] of Object.entries(cfg.headers)) headers[k] = resolveEnv(v);
    const get = () => fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT) });
    let res: Response;
    if (cfg.login?.kind === 'pihole6') {
      headers['X-FTL-SID'] = await piholeSid(url.origin, cfg.login.secret);
      res = await get();
      // An expired or dropped session: sign in once more, then give up.
      if (res.status === 401) {
        headers['X-FTL-SID'] = await piholeSid(url.origin, cfg.login.secret, true);
        res = await get();
      }
    } else {
      res = await get();
    }
    if (res.status >= 300 && res.status < 400) throw new Error(`Redirected (HTTP ${res.status}); use the final URL`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Read at most MAX_BYTES.
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new Error('Response over 512 KB');
      }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Response is not JSON');
    }
    return {
      values: cfg.fields.map((f) => ({ label: f.label, value: readPath(data, f.path) ?? null })),
      at,
      sample: withSample ? JSON.stringify(data, null, 2).slice(0, 4000) : undefined,
    };
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    const msg = e.name === 'TimeoutError' ? 'No answer in 8 s' : e.cause?.code ?? e.message;
    // Never echo the resolved URL: it may contain a WIDGET_ secret.
    return { values: cfg.fields.map((f) => ({ label: f.label, value: null })), at, error: msg };
  }
}

const cache = new Map<string, { key: string; result: JsonResult }>();

/** Cached per widget id; refetched once the widget's interval has passed. */
export async function cachedJsonWidget(id: string, cfg: JsonWidgetConfig): Promise<JsonResult> {
  const key = JSON.stringify(cfg);
  const hit = cache.get(id);
  if (hit && hit.key === key && Date.now() - hit.result.at < cfg.interval * 1000) return hit.result;
  const result = await fetchJsonWidget(cfg);
  cache.set(id, { key, result });
  return result;
}
