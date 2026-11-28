import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
// fetch with a timeout and an error message that never contains the URL, since
// several integrations (Tautulli) carry their API key in the query string.

export class HttpError extends Error {
  status: number;
  constructor(status: number, statusText: string) {
    super(`HTTP ${status} ${statusText}`.trim());
    this.status = status;
  }
}

/** A header that carries a credential: fetch forwards custom ones like X-Api-Key across redirects. */
const CREDENTIAL = /^(authorization|cookie|x-api-key|x-gotify-key|x-plex-token|x-emby-token|x-mediabrowser-token|.*(api-?key|token|secret|password).*)$/i;

/** Whether a request carries a key, a token or a cookie. */
export function carriesCredential(headers: RequestInit['headers']): boolean {
  if (!headers) return false;
  const names = headers instanceof Headers ? [...headers.keys()] : Array.isArray(headers) ? headers.map(([k]) => k) : Object.keys(headers);
  return names.some((n) => CREDENTIAL.test(n));
}

/**
 * fetch, but a request that carries a credential follows a redirect only to
 * the same host (http to https included), three at most: a service that
 * answers with a redirect can't walk the key off to another address.
 */
async function guardedFetch(url: string, init: RequestInit): Promise<Response> {
  if (init.redirect || !carriesCredential(init.headers)) return fetch(url, init);
  const host = new URL(url).hostname;
  let at = url;
  for (let hop = 0; hop <= 3; hop++) {
    const res = await fetch(at, { ...init, redirect: 'manual' });
    const to = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!to) return res;
    const next = new URL(to, at);
    if (next.hostname !== host || !/^https?:$/.test(next.protocol)) throw new Error('Redirected to another address, which Patchboard does not follow with a key');
    at = next.toString();
  }
  throw new Error('Too many redirects');
}

export async function request(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  let res: Response;
  try {
    res = await guardedFetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if ((err as Error).message.startsWith('Redirected to another address') || (err as Error).message === 'Too many redirects') throw err;
    const cause = (err as { cause?: { code?: string } }).cause?.code;
    if ((err as Error).name === 'TimeoutError') throw new Error(`Timed out after ${timeoutMs / 1000}s`);
    throw new Error(cause ? `Unreachable (${cause})` : 'Unreachable');
  }
  if (!res.ok) {
    const err = new HttpError(res.status, res.statusText);
    const why = await reasonIn(res);
    if (why) err.message += `: ${why}`;
    throw err;
  }
  return res;
}

/**
 * The reason an app gives in an error's JSON body ({"reason": "Daily API
 * request limit exceeded"}), short, with any address masked: the message
 * reaches the browser, and some apps put keys in URLs.
 */
export async function reasonIn(res: Response): Promise<string> {
  try {
    if (!(res.headers.get('content-type') ?? '').includes('json')) return '';
    const body = (await res.json()) as Record<string, unknown>;
    const why = [body.reason, body.message, body.error, body.detail].find((x): x is string => typeof x === 'string' && x.trim().length > 0);
    return why ? why.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '(address)').replace(/\s+/g, ' ').trim().slice(0, 140) : '';
  } catch {
    return '';
  }
}

export async function getJson<T>(url: string, init: RequestInit = {}, timeoutMs?: number): Promise<T> {
  const res = await request(url, init, timeoutMs);
  return (await res.json()) as T;
}

/**
 * GET a page as text. With verifyTls false, a self-signed HTTPS certificate is
 * accepted (most NAS boxes ship one); the message never carries the URL.
 */
export function fetchText(url: string, o: { verifyTls?: boolean; timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<string> {
  const u = new URL(url);
  const lib = u.protocol === 'https:' ? httpsRequest : httpRequest;
  const timeoutMs = o.timeoutMs ?? 8000;
  return new Promise((resolve, reject) => {
    const req = lib(u, { method: 'GET', headers: o.headers, rejectUnauthorized: o.verifyTls ?? true, timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => ((res.statusCode ?? 0) >= 400 ? reject(new HttpError(res.statusCode ?? 0, res.statusMessage ?? '')) : resolve(body)));
    });
    req.on('timeout', () => req.destroy(new Error(`Timed out after ${timeoutMs / 1000}s`)));
    req.on('error', (e: NodeJS.ErrnoException) => reject(new Error(e.code ? `Unreachable (${e.code})` : e.message)));
    req.end();
  });
}
