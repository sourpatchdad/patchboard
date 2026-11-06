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

export async function request(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const cause = (err as { cause?: { code?: string } }).cause?.code;
    if ((err as Error).name === 'TimeoutError') throw new Error(`Timed out after ${timeoutMs / 1000}s`);
    throw new Error(cause ? `Unreachable (${cause})` : 'Unreachable');
  }
  if (!res.ok) throw new HttpError(res.status, res.statusText);
  return res;
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
