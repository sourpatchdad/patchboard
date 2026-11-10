// Miniflux is the RSS backend: it does the fetching, dedupe and read state.
// Patchboard is a reader on top of it. Counts come from Miniflux itself, so
// the nav badge, the page and each category always agree.

import type { FeedCategory, FeedEntry, FeedFilter, FeedsResponse, MinifluxData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { proxied, proxyContent } from '../feed-images.ts';
import { getJson, request } from '../http.ts';
import { type Adapter, MINUTE } from './adapter.ts';

interface RawEntry {
  id: number;
  title: string;
  url: string;
  published_at: string;
  reading_time: number;
  content: string;
  enclosures?: { url: string; mime_type: string }[] | null;
  feed: { id: number; title: string; category: { id: number; title: string } };
}

/**
 * The picture for a card: an image enclosure, else the first real image in
 * the article. Skips data: URIs and 1-pixel trackers.
 */
export function previewImage(e: Pick<RawEntry, 'content' | 'enclosures'>): string | undefined {
  const enc = e.enclosures?.find((x) => x.mime_type?.startsWith('image/') && /^https?:\/\//.test(x.url));
  if (enc) return enc.url;
  for (const m of (e.content ?? '').matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = /\ssrc=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!src || !/^https?:\/\//.test(src)) continue;
    if (/\s(width|height)=["']?1["'\s>]/i.test(tag)) continue;
    return src.replace(/&amp;/g, '&');
  }
  return undefined;
}

function toEntry(e: RawEntry, withContent: boolean): FeedEntry {
  const image = previewImage(e);
  return {
    id: e.id,
    title: e.title,
    url: e.url,
    feed: e.feed.title,
    feedId: e.feed.id,
    category: e.feed.category.title,
    categoryId: e.feed.category.id,
    publishedAt: e.published_at,
    readingTime: e.reading_time,
    // Pictures load through Patchboard, never straight from the publisher.
    image: image ? proxied(e.id, 0, image) : undefined,
    content: withContent ? proxyContent(e.id, e.content ?? '') : undefined,
  };
}

const base = () => config.miniflux!.url;
const headers = () => ({ 'X-Auth-Token': config.miniflux!.key });

/** Categories with their unread counts, straight from Miniflux. */
export async function listCategories(): Promise<FeedCategory[]> {
  const cats = await getJson<{ id: number; title: string; total_unread?: number }[]>(`${base()}/v1/categories?counts=true`, { headers: headers() });
  // Miniflux before 2.0.46 ignores counts=true; sum the feed counters instead.
  if (cats.length && cats.every((c) => c.total_unread == null)) {
    const [feeds, counters] = await Promise.all([
      getJson<{ id: number; category: { id: number } }[]>(`${base()}/v1/feeds`, { headers: headers() }),
      getJson<{ unreads: Record<string, number> }>(`${base()}/v1/feeds/counters`, { headers: headers() }),
    ]);
    const byCat = new Map<number, number>();
    for (const f of feeds) byCat.set(f.category.id, (byCat.get(f.category.id) ?? 0) + (counters.unreads[f.id] ?? 0));
    return cats.map((c) => ({ id: c.id, title: c.title, unread: byCat.get(c.id) ?? 0 }));
  }
  return cats.map((c) => ({ id: c.id, title: c.title, unread: c.total_unread ?? 0 }));
}

/** Feeds with unread articles, most unread first. */
export async function listFeeds(): Promise<FeedCategory[]> {
  const [feeds, counters] = await Promise.all([
    getJson<{ id: number; title: string }[]>(`${base()}/v1/feeds`, { headers: headers() }),
    getJson<{ unreads: Record<string, number> }>(`${base()}/v1/feeds/counters`, { headers: headers() }),
  ]);
  return feeds
    .map((f) => ({ id: f.id, title: f.title, unread: counters.unreads[f.id] ?? 0 }))
    .filter((f) => f.unread > 0)
    .sort((a, b) => b.unread - a.unread || a.title.localeCompare(b.title));
}

export async function listEntries(opts: { status: 'unread' | 'all'; limit: number; categoryId?: number } & FeedFilter): Promise<FeedsResponse> {
  const q = new URLSearchParams({ order: 'published_at', direction: 'desc', limit: String(opts.limit) });
  if (opts.status === 'unread') q.set('status', 'unread');
  if (opts.categoryId) q.set('category_id', String(opts.categoryId));
  if (opts.withinHours) q.set('after', String(Math.floor(Date.now() / 1000) - opts.withinHours * 3600));
  if (opts.search) q.set('search', opts.search);
  // One feed has its own endpoint; Miniflux's entry list filters by category only.
  const path = opts.feedId ? `/v1/feeds/${opts.feedId}/entries` : '/v1/entries';
  const [r, categories, feeds] = await Promise.all([
    getJson<{ total: number; entries: RawEntry[] }>(`${base()}${path}?${q}`, { headers: headers() }),
    listCategories(),
    listFeeds().catch(() => undefined),
  ]);
  return { total: r.total, entries: r.entries.map((e) => toEntry(e, true)), categories, feeds };
}

export async function markRead(ids: number[], status: 'read' | 'unread' = 'read'): Promise<void> {
  await request(`${base()}/v1/entries`, {
    method: 'PUT',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry_ids: ids, status }),
  });
}

/** Everything in one category, or everything at all, read in one call. */
export async function markAllRead(categoryId?: number): Promise<void> {
  if (categoryId) {
    await request(`${base()}/v1/categories/${categoryId}/mark-all-as-read`, { method: 'PUT', headers: headers() });
    return;
  }
  const me = await getJson<{ id: number }>(`${base()}/v1/me`, { headers: headers() });
  await request(`${base()}/v1/users/${me.id}/mark-all-as-read`, { method: 'PUT', headers: headers() });
}

export function minifluxAdapter(): Adapter<MinifluxData> {
  return {
    id: 'miniflux',
    label: 'Feeds',
    intervalMs: 5 * MINUTE,
    async fetch() {
      const r = await getJson<{ total: number; entries: RawEntry[] }>(
        `${base()}/v1/entries?status=unread&order=published_at&direction=desc&limit=10`,
        { headers: headers() },
      );
      return { unread: r.total, entries: r.entries.map((e) => toEntry(e, false)) };
    },
  };
}
