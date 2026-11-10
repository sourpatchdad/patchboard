// Pictures in Reading come through Patchboard, so the browser talks only to
// Patchboard and a publisher never sees who reads what. The browser gets
// /api/feed-img/<entry>/<n>; the real address stays on the server, so
// Patchboard fetches only pictures from articles it handed out itself.
// Publishers choose those addresses, so the fetch goes to public addresses
// only (no LAN, no loopback, no metadata), checked as each connection opens,
// so redirects and DNS answers get the same check.
// Nothing is kept on disk: the browser caches each picture for a day.

import { lookup as dnsLookup } from 'node:dns';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

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

/** Private, reserved and documentation IPv4 ranges: [first octet, second-octet floor, ceiling]. */
const PRIVATE_V4: [number, number, number][] = [
  [0, 0, 255],
  [10, 0, 255],
  [100, 64, 127], // carrier-grade NAT, Tailscale
  [127, 0, 255],
  [169, 254, 254],
  [172, 16, 31],
  [192, 168, 168],
  [198, 18, 19], // benchmarking
];
const PRIVATE_V4_24 = ['192.0.0.', '192.0.2.', '198.51.100.', '203.0.113.'];

/**
 * True for an address anyone on the internet could reach. IPv6 forms that
 * carry an IPv4 address inside (mapped, compatible, NAT64, 6to4) are refused
 * outright: a public picture host never needs them, and they are how a
 * check like this gets fooled ("::ffff:7f00:1" is 127.0.0.1).
 */
export function publicAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a >= 224) return false;
    if (PRIVATE_V4.some(([x, lo, hi]) => a === x && b >= lo && b <= hi)) return false;
    return !PRIVATE_V4_24.some((p) => ip.startsWith(p));
  }
  if (kind !== 6) return false;
  const v6 = ip.toLowerCase();
  if (v6 === '::' || v6 === '::1') return false;
  if (/^::(ffff:)?[0-9a-f.:]/.test(v6)) return false;
  if (/^(64:ff9b:|2002:|2001:db8:|100::)/.test(v6)) return false;
  return !/^(f[cd]|fe[89ab]|ff)/.test(v6);
}

/**
 * Name resolution for these requests only: every answer has to be public,
 * checked as the socket connects, so a name can't pass a check and then
 * resolve somewhere else for the real request.
 */
const publicLookup: LookupFunction = (host, options, callback) => {
  dnsLookup(host, { all: true }, (err, addrs) => {
    if (err) return callback(err, '', 4);
    if (!addrs.length || !addrs.every((a) => publicAddress(a.address))) return callback(new Error('Not a public address'), '', 4);
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: typeof addrs) => void)(null, addrs);
    callback(null, addrs[0].address, addrs[0].family);
  });
};

interface Answer {
  status: number;
  location?: string;
  type: string;
  body: Uint8Array<ArrayBuffer> | null;
}

/** One GET to a public address, read up to MAX_BYTES of an image. */
function get(url: URL): Promise<Answer> {
  return new Promise((resolve, reject) => {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return reject(new Error('Only http and https'));
    const host = url.hostname.replace(/^\[|\]$/g, '');
    // An address in the URL skips name lookup, so it's checked here.
    if (isIP(host) && !publicAddress(host)) return reject(new Error('Not a public address'));
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = send(url, { headers: { Accept: 'image/*', 'User-Agent': 'Patchboard/1 (reader)' }, lookup: publicLookup, timeout: TIMEOUT }, (res) => {
      const status = res.statusCode ?? 0;
      const type = String(res.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      const empty = (extra: Partial<Answer> = {}) => {
        res.resume();
        resolve({ status, type, body: null, ...extra });
      };
      if (status >= 300 && status < 400) return empty({ location: res.headers.location });
      if (status !== 200 || !type.startsWith('image/') || Number(res.headers['content-length'] ?? 0) > MAX_BYTES) return empty();
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_BYTES) {
          req.destroy();
          resolve({ status, type, body: null });
        } else chunks.push(c);
      });
      res.on('end', () => size <= MAX_BYTES && resolve({ status, type, body: Uint8Array.from(Buffer.concat(chunks)) }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Too slow')));
    req.on('error', reject);
    req.end();
  });
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
      const res = await get(url);
      if (res.location) {
        url = new URL(res.location, url);
        continue;
      }
      return res.body?.length ? { body: res.body, type: res.type } : null;
    }
  } catch {
    // Unreachable, blocked or too slow: the card hides its picture.
  }
  return null;
}
