// Miniflux is the RSS backend: it does the fetching, dedupe and read state.
// Patchboard is a reader on top of it.

import type { FeedEntry, MinifluxData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { getJson, request } from '../http.ts';
import { type Adapter, MINUTE } from './adapter.ts';

interface RawEntry {
  id: number;
  title: string;
  url: string;
  published_at: string;
  reading_time: number;
  content: string;
  feed: { title: string; category: { title: string } };
}

function toEntry(e: RawEntry, withContent: boolean): FeedEntry {
  return {
    id: e.id,
    title: e.title,
    url: e.url,
    feed: e.feed.title,
    category: e.feed.category.title,
    publishedAt: e.published_at,
    readingTime: e.reading_time,
    content: withContent ? e.content : undefined,
  };
}

const headers = () => ({ 'X-Auth-Token': config.miniflux!.key });

export async function listEntries(opts: { status: 'unread' | 'all'; limit: number }): Promise<FeedEntry[]> {
  const status = opts.status === 'unread' ? '&status=unread' : '';
  const r = await getJson<{ total: number; entries: RawEntry[] }>(
    `${config.miniflux!.url}/v1/entries?order=published_at&direction=desc&limit=${opts.limit}${status}`,
    { headers: headers() },
  );
  return r.entries.map((e) => toEntry(e, true));
}

export async function markRead(ids: number[]): Promise<void> {
  await request(`${config.miniflux!.url}/v1/entries`, {
    method: 'PUT',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry_ids: ids, status: 'read' }),
  });
}

export function minifluxAdapter(): Adapter<MinifluxData> {
  return {
    id: 'miniflux',
    label: 'Feeds',
    intervalMs: 5 * MINUTE,
    async fetch() {
      const r = await getJson<{ total: number; entries: RawEntry[] }>(
        `${config.miniflux!.url}/v1/entries?status=unread&order=published_at&direction=desc&limit=10`,
        { headers: headers() },
      );
      return { unread: r.total, entries: r.entries.map((e) => toEntry(e, false)) };
    },
  };
}
