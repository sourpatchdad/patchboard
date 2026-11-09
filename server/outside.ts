// Feeds and GitHub releases for the no-setup widgets. The server fetches only
// addresses saved in a board; the browser asks by board and widget. Feeds go
// through the same address fence as the API widget (no cloud metadata, no
// link-local), follow at most three redirects, each checked again, and stop
// at one megabyte. Both cache, so a board full of feeds doesn't hammer anyone.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { FeedItem, ReleaseInfo } from '../shared/types.ts';
import { blockedAddress } from './jsonwidget.ts';

const TIMEOUT = 8000;
const MAX_BYTES = 1024 * 1024;

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const inner = (xml: string, name: string) => new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml)?.[1];

/** RSS items or Atom entries: title, link and date, newest first. */
export function parseFeed(xml: string, source: string): FeedItem[] {
  const channelTitle = decode(inner(xml, 'title') ?? '') || source;
  const atom = /<feed[\s>]/i.test(xml);
  const blocks = [...xml.matchAll(atom ? /<entry[\s>]([\s\S]*?)<\/entry>/gi : /<item[\s>]([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  return blocks
    .map((b) => {
      const title = decode(inner(b, 'title') ?? '');
      const link = atom
        ? (/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i.exec(b) ?? /<link[^>]*href=["']([^"']+)["']/i.exec(b))?.[1]
        : decode(inner(b, 'link') ?? '') || decode(inner(b, 'guid') ?? '');
      const when = decode(inner(b, atom ? 'updated' : 'pubDate') ?? inner(b, 'published') ?? inner(b, 'dc:date') ?? '');
      const at = Date.parse(when);
      return { title, link: link && /^https?:\/\//i.test(link) ? link.replace(/&amp;/g, '&') : undefined, at: Number.isFinite(at) ? at : 0, source: channelTitle };
    })
    .filter((i) => i.title)
    .sort((a, b) => b.at - a.at)
    .slice(0, 30) as FeedItem[];
}

async function fenced(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'metadata.google.internal') throw new Error('That address is blocked');
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (addrs.some(blockedAddress)) throw new Error('That address is blocked');
}

/** One feed's text, through the fence. */
async function fetchText(address: string): Promise<string> {
  let url = new URL(address);
  for (let hop = 0; hop < 4; hop++) {
    await fenced(url);
    const res = await fetch(url, { headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml', 'User-Agent': 'Patchboard/1 (feeds widget)' }, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT) });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location')!, url);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error('Too large');
    return text;
  }
  throw new Error('Too many redirects');
}

const feedCache = new Map<string, { at: number; items: FeedItem[] | null; error?: string }>();

/** Every feed's newest items together, newest first. Feeds that fail are named, not fatal. */
export async function readFeeds(addresses: string[], now = Date.now()): Promise<{ items: FeedItem[]; failed: string[] }> {
  const results = await Promise.all(
    addresses.map(async (a) => {
      const hit = feedCache.get(a);
      if (hit && now - hit.at < 15 * 60_000) return { a, ...hit };
      try {
        const items = parseFeed(await fetchText(a), new URL(a).hostname);
        const entry = { at: now, items };
        feedCache.set(a, entry);
        return { a, ...entry };
      } catch (err) {
        const entry = { at: now - 10 * 60_000, items: hit?.items ?? null, error: (err as Error).message };
        feedCache.set(a, entry);
        return { a, ...entry };
      }
    }),
  );
  return {
    items: results.flatMap((r) => r.items ?? []).sort((x, y) => y.at - x.at),
    failed: results.filter((r) => r.error && !r.items).map((r) => new URL(r.a).hostname),
  };
}

const releaseCache = new Map<string, { at: number; info: ReleaseInfo | null }>();

/** The newest release of each project, from GitHub's public API, cached for an hour. */
export async function latestReleases(repos: string[], now = Date.now()): Promise<ReleaseInfo[]> {
  const out = await Promise.all(
    repos.map(async (repo) => {
      const hit = releaseCache.get(repo);
      if (hit && now - hit.at < 60 * 60_000) return hit.info;
      try {
        const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=1`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Patchboard/1 (releases widget)' }, signal: AbortSignal.timeout(TIMEOUT) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const [r] = (await res.json()) as { tag_name?: string; name?: string; published_at?: string; html_url?: string; prerelease?: boolean }[];
        const info: ReleaseInfo | null = r?.tag_name ? { repo, version: r.tag_name, name: r.name || undefined, at: Date.parse(r.published_at ?? '') || 0, url: r.html_url ?? `https://github.com/${repo}/releases`, prerelease: !!r.prerelease } : { repo, version: '', at: 0, url: `https://github.com/${repo}/releases`, none: true };
        releaseCache.set(repo, { at: now, info });
        return info;
      } catch {
        // GitHub limits anonymous calls to 60 an hour: keep the last answer and try later.
        releaseCache.set(repo, { at: now - 45 * 60_000, info: hit?.info ?? null });
        return hit?.info ?? null;
      }
    }),
  );
  return out.filter((r): r is ReleaseInfo => !!r).sort((a, b) => b.at - a.at);
}
