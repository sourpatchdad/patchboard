// A reader over Miniflux. With nothing open, the right side is today's
// edition: a lead story, then a few from each category. Opening an entry marks
// it read. Keyboard: j/k next/previous, o open original, u back to the edition.

import DOMPurify from 'dompurify';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { FeedEntry, FeedsResponse } from '../../shared/types.ts';
import { CustomizePage } from '../components/PageCustomize.tsx';
import { Empty } from '../components/ui.tsx';
import { ago } from '../lib/format.ts';
import { useNow, useStore } from '../lib/store.tsx';
import { useUrlChoice } from '../lib/url.ts';

type FeedSort = 'newest' | 'oldest' | 'quick';

/** Plain text from article HTML, for a card excerpt. DOMParser never runs scripts. */
function excerpt(html: string | undefined, max = 220): string {
  if (!html) return '';
  const text = (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max).replace(/\s\S*$/, '')}...` : text;
}

// Links inside articles always leave the dashboard in a new tab.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/** A card's picture; hides itself if the publisher's image fails. */
function Thumb({ src, className }: { src?: string; className: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return null;
  return <img className={className} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
}

async function post(url: string, body: unknown, action = false): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(action ? { 'X-Patchboard': 'action' } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
}

export function Feeds() {
  const { snap } = useStore();
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<FeedsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<Set<number>>(new Set());
  const [confirmAll, setConfirmAll] = useState(false);
  const [sort, setSort] = useUrlChoice<FeedSort>('sort', ['newest', 'oldest', 'quick'], 'newest');
  const category = params.get('cat') ?? 'All';
  const readerRef = useRef<HTMLElement>(null);
  const selectedId = Number(params.get('e')) || null;

  const fp = snap?.pages?.feeds;
  const cats = useMemo(() => (data?.categories ?? []).filter((c) => !fp?.hideCategories?.includes(c.title)), [data, fp]);
  const catId = category === 'All' ? undefined : data?.categories.find((c) => c.title === category)?.id;

  const load = useCallback(async (id?: number) => {
    try {
      const res = await fetch(`/api/feeds?status=unread${id ? `&cat=${id}` : ''}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setData(body as FeedsResponse);
      setRead(new Set());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  // Reload when the category changes. The first load has no id yet; it brings the category list.
  useEffect(() => {
    void load(catId);
  }, [load, catId]);

  const setCategory = (c: string) => {
    const next = new URLSearchParams(params);
    if (c === 'All') next.delete('cat');
    else next.set('cat', c);
    next.delete('e');
    setParams(next, { replace: true });
    setConfirmAll(false);
  };

  const visible = useMemo(() => {
    const list = (data?.entries ?? []).filter(
      (e) => !fp?.hideFeeds?.includes(e.feed) && !fp?.hideCategories?.includes(e.category) && (category === 'All' || e.category === category),
    );
    const t = (e: FeedEntry) => Date.parse(e.publishedAt);
    if (sort === 'oldest') list.sort((a, b) => t(a) - t(b));
    else if (sort === 'quick') list.sort((a, b) => (a.readingTime || 99) - (b.readingTime || 99) || t(b) - t(a));
    else list.sort((a, b) => t(b) - t(a));
    return list;
  }, [data, fp, category, sort]);

  const selected = visible.find((e) => e.id === selectedId) ?? data?.entries.find((e) => e.id === selectedId) ?? null;

  const markRead = useCallback((ids: number[]) => {
    if (!ids.length) return;
    setRead((prev) => new Set([...prev, ...ids]));
    void post('/api/feeds/read', { ids });
  }, []);

  async function markAll() {
    setConfirmAll(false);
    try {
      await post('/api/feeds/read-all', { category: catId }, true);
      await load(catId);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const select = useCallback(
    (id: number | null) => {
      const next = new URLSearchParams(params);
      if (id) next.set('e', String(id));
      else next.delete('e');
      setParams(next, { replace: !!selectedId });
      if (id) markRead([id]);
      readerRef.current?.scrollTo({ top: 0 });
    },
    [params, setParams, markRead, selectedId],
  );

  // Mark read when arriving from Home with ?e= already set.
  useEffect(() => {
    if (selectedId && !read.has(selectedId) && data?.entries.some((e) => e.id === selectedId)) markRead([selectedId]);
  }, [selectedId, data, read, markRead]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (document.querySelector('.palette')) return;
      const idx = visible.findIndex((x) => x.id === selectedId);
      if (e.key === 'j') select(visible[Math.min(idx + 1, visible.length - 1)]?.id ?? null);
      else if (e.key === 'k') select(visible[Math.max(idx - 1, 0)]?.id ?? null);
      else if (e.key === 'o' && selected) window.open(selected.url, '_blank', 'noopener');
      else if (e.key === 'u') select(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, selectedId, selected, select]);

  const html = useMemo(
    () => (selected?.content ? DOMPurify.sanitize(selected.content, { ADD_ATTR: ['target'], FORBID_TAGS: ['style', 'form'] }) : ''),
    [selected],
  );

  if (snap && !snap.sources.miniflux && !snap.demo) {
    return (
      <div className="page">
        <h1 className="page-title">Feeds</h1>
        <Empty>Feeds come from Miniflux. Set MINIFLUX_URL and MINIFLUX_TOKEN to turn this on.</Empty>
      </div>
    );
  }

  // Miniflux's own count, less what you've opened here since loading.
  const total = data ? Math.max(0, data.total - [...read].filter((id) => data.entries.some((e) => e.id === id)).length) : null;
  const unreadShown = visible.filter((e) => !read.has(e.id));
  const allFeeds = [...new Set([...(data?.entries ?? []).map((e) => e.feed), ...(fp?.hideFeeds ?? [])])].sort();
  const allCats = [...new Set([...(data?.categories ?? []).map((c) => c.title), ...(fp?.hideCategories ?? [])])].sort();

  return (
    <div className={`reader-layout ${selected ? 'has-selection' : ''}`}>
      <aside className="reader-list" aria-label="Unread articles">
        <header className="feeds-head">
          <h1 className="page-title">Feeds</h1>
          <span className="section-count">{total != null ? `${total} unread${category !== 'All' ? ` in ${category}` : ''}` : ''}</span>
          <CustomizePage
            page="feeds"
            title="Feeds"
            lists={[
              { key: 'hideCategories', title: 'Categories', note: 'Tap a category to hide it, here and on Home.', items: allCats },
              { key: 'hideFeeds', title: 'Feeds', note: 'Tap a feed to hide it. Feeds show up here once they have unread articles.', items: allFeeds },
            ]}
          />
        </header>

        {cats.length > 1 && (
          <div className="feeds-cats" role="tablist" aria-label="Categories">
            <button type="button" role="tab" aria-selected={category === 'All'} className="chip" onClick={() => setCategory('All')}>
              All
            </button>
            {cats.map((c) => (
              <button key={c.id} type="button" role="tab" aria-selected={c.title === category} className="chip" onClick={() => setCategory(c.title)} disabled={!c.unread && c.title !== category}>
                {c.title} <span className="chip-count">{c.unread}</span>
              </button>
            ))}
          </div>
        )}

        <div className="feeds-bar">
          <label className="feeds-sort">
            <span className="sr-only">Sort</span>
            <select className="field field-small" value={sort} onChange={(e) => setSort(e.target.value as FeedSort)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="quick">Quick reads first</option>
            </select>
          </label>
          {!snap?.readOnly &&
            (confirmAll ? (
              <span className="feeds-confirm">
                Mark {total} read?
                <button type="button" className="text-button" onClick={() => void markAll()}>
                  Mark read
                </button>
                <button type="button" className="text-button" onClick={() => setConfirmAll(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              (total ?? 0) > 0 && (
                <button type="button" className="text-button" onClick={() => setConfirmAll(true)}>
                  Mark all read
                </button>
              )
            ))}
        </div>

        {error && <Empty>Couldn't load feeds: {error}</Empty>}
        {!data && !error && <Empty>Loading feeds.</Empty>}
        {data && visible.length === 0 && <Empty>You're caught up. New articles show up here as Miniflux fetches them.</Empty>}
        <ul className="entries">
          {visible.map((e) => (
            <li key={e.id}>
              <button type="button" className={`entry ${e.id === selectedId ? 'is-selected' : ''} ${read.has(e.id) ? 'is-read' : ''} ${e.image ? 'has-thumb' : ''}`} onClick={() => select(e.id)}>
                <span className="entry-title">{e.title}</span>
                <span className="feed-meta">
                  <span>{e.feed}</span>
                  <time>{ago(e.publishedAt, now)}</time>
                  {e.readingTime > 0 && <span>{e.readingTime} min</span>}
                </span>
                <Thumb src={e.image} className="entry-thumb" />
              </button>
            </li>
          ))}
        </ul>
        {data && data.total > data.entries.length && <p className="feeds-more">Showing the newest {data.entries.length}. Mark some read to see the rest.</p>}
      </aside>

      <article className="reader" ref={readerRef} aria-live="polite">
        {selected ? (
          <>
            <button type="button" className="text-button reader-back" onClick={() => select(null)}>
              Back to the edition
            </button>
            <header className="reader-head">
              <p className="reader-feed">
                {selected.feed}, {new Date(selected.publishedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
                {selected.readingTime > 0 && `, ${selected.readingTime} min read`}
              </p>
              <h1>{selected.title}</h1>
              <a className="text-button" href={selected.url} target="_blank" rel="noreferrer">
                Open original
              </a>
            </header>
            <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
          </>
        ) : (
          <Edition entries={unreadShown} total={total} now={now} onPick={select} single={category !== 'All'} />
        )}
      </article>
    </div>
  );
}

/** Today's edition: the newest story with a picture leads, then each category's newest few. */
function Edition({ entries, total, now, onPick, single }: { entries: FeedEntry[]; total: number | null; now: number; onPick: (id: number) => void; single: boolean }) {
  if (!entries.length) return <p className="reader-hint">Nothing unread. Pick a category, or come back after Miniflux's next fetch.</p>;
  const lead = entries.find((e) => e.image) ?? entries[0];
  const rest = entries.filter((e) => e.id !== lead.id);
  const sections: [string, FeedEntry[]][] = single
    ? [['', rest.slice(0, 12)]]
    : [...rest.reduce((m, e) => m.set(e.category, [...(m.get(e.category) ?? []), e]), new Map<string, FeedEntry[]>())].map(([c, list]) => [c, list.slice(0, 3)] as [string, FeedEntry[]]);
  return (
    <div className="edition">
      <p className="edition-date">
        {new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        {total != null && <span>, {total} unread</span>}. Press <kbd>j</kbd> to read from the top.
      </p>
      <button type="button" className="edition-lead" onClick={() => onPick(lead.id)}>
        <Thumb src={lead.image} className="edition-lead-img" />
        <span className="edition-lead-text">
          <span className="feed-card-meta">
            <span>{lead.feed}</span>
            <time>{ago(lead.publishedAt, now)}</time>
          </span>
          <span className="edition-lead-title">{lead.title}</span>
          <span className="feed-card-text">{excerpt(lead.content, 280)}</span>
          {lead.readingTime > 0 && <span className="feed-card-time">{lead.readingTime} min read</span>}
        </span>
      </button>
      {sections.map(([cat, list]) => (
        <section key={cat || 'all'} className="edition-section">
          {cat && <h2 className="edition-cat">{cat}</h2>}
          <ul className="feed-cards">
            {list.map((e) => (
              <li key={e.id}>
                <button type="button" className="feed-card" onClick={() => onPick(e.id)}>
                  <Thumb src={e.image} className="feed-card-img" />
                  <span className="feed-card-meta">
                    <span>{e.feed}</span>
                    <time>{ago(e.publishedAt, now)}</time>
                  </span>
                  <span className="feed-card-title">{e.title}</span>
                  <span className="feed-card-text">{excerpt(e.content, 140)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
