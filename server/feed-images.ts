// Pictures in Reading come through Patchboard, so the browser talks only to
// Patchboard and a publisher never sees who reads what. The browser gets
// /api/feed-img/<entry>/<n>; the real address stays on the server, so
// Patchboard fetches only pictures from articles it handed out itself.
// Publishers choose those addresses, so the fetch goes to public addresses
// only (no LAN, no loopback, no metadata), checked again on each redirect.
// Nothing is kept on disk: the browser caches each picture for a day.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_URLS = 5000;
const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT = 10_000;

/** entry/n -> the publisher's address. Oldest forgotten first. */
const urls = new Map<string, string>();

export function proxied(entry: number, n: number, url: string): string {
  const key = `${entry}/${n}`;
  urls.delete(key);
  urls.set(key, url);
  if (urls.size > MAX_URLS) urls.delete(urls.keys().next().value!);
  return `/api/feed-img/${key}`;
}

/**
 * Article HTML with every picture pointed at Patchboard. srcset and
 * <source> would let the browser pick a publisher's copy, so they go.
 */
export function proxyContent(entry: number, html: string, first = 1): string {
  let n = first;
  return html
    .replace(/<source\b[^>]*>/gi, '')
    .replace(/<img\b[^>]*>/gi, (tag) =>
      tag
        .replace(/\s(srcset|sizes|data-src|data-srcset)=("[^"]*"|'[^']*')/gi, '')
        .replace(/\ssrc=(["'])(https?:\/\/[^"']+)\1/i, (_m, q: string, src: string) => ` src=${q}${proxied(entry, n++, src.replace(/&amp;/g, '&'))}${q}`),
    );
}

/** True for an address anyone on the internet could reach. */
export function publicAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT, Tailscale
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    return true;
  }
  const v6 = ip.toLowerCase();
  if (v6 === '::' || v6 === '::1') return false;
  if (v6.startsWith('::ffff:')) return publicAddress(v6.slice(7));
  return !/^(f[cd]|fe[89ab]|ff)/.test(v6);
}

async function fenced(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (!addrs.length || !addrs.every(publicAddress)) throw new Error('Not a public address');
}

/** The body, read until it passes MAX_BYTES and then dropped. */
async function capped(res: Response): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export interface Picture {
  body: Uint8Array<ArrayBuffer>;
  type: string;
}

/** The picture behind /api/feed-img/<entry>/<n>, or null. */
export async function feedPicture(entry: string, n: string): Promise<Picture | null> {
  const address = urls.get(`${Number(entry)}/${Number(n)}`);
  if (!address) return null;
  try {
    let url = new URL(address);
    for (let hop = 0; hop < 4; hop++) {
      await fenced(url);
      const res = await fetch(url, { headers: { Accept: 'image/*', 'User-Agent': 'Patchboard/1 (reader)' }, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT) });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        url = new URL(res.headers.get('location')!, url);
        continue;
      }
      const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (!res.ok || !type.startsWith('image/') || Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) return null;
      const body = await capped(res);
      return body?.length ? { body, type } : null;
    }
  } catch {
    // Unreachable, blocked or too slow: the card hides its picture.
  }
  return null;
}
