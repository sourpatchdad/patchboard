// A reader over Miniflux. With nothing open, the right side is today's
// edition: a lead story, then a few from each category. Opening an entry marks
// it read. Keyboard: j/k next/previous, o open original, u back to the edition.

import DOMPurify from 'dompurify';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { FeedEntry, FeedsResponse } from '../../shared/types.ts';
import { CustomizePage } from '../components/PageCustomize.tsx';
import { Empty } from '../components/ui.tsx';
import { ago, count } from '../lib/format.ts';
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
  /** Articles put back with Keep unread: opening them doesn't mark them read again. */
  const [kept, setKept] = useState<Set<number>>(new Set());
  const keepUnread = (id: number) => {
    setKept((k) => new Set([...k, id]));
    setRead((r) => {
      const n = new Set(r);
      n.delete(id);
      return n;
    });
    void post('/api/feeds/read', { ids: [id], unread: true });
  };
  const [confirmAll, setConfirmAll] = useState(false);
  const [sort, setSort] = useUrlChoice<FeedSort>('sort', ['newest', 'oldest', 'quick'], 'newest');
  const category = params.get('cat') ?? 'All';
  // Narrowing beyond a category: one feed, a time window, words in the title.
  const feedId = Number(params.get('feed')) || undefined;
  const since = params.get('since') === 'day' || params.get('since') === 'week' ? params.get('since')! : '';
  const query = params.get('q') ?? '';
  const [typed, setTyped] = useState(query);
  const filtered = !!(feedId || since || query);
  const readerRef = useRef<HTMLElement>(null);
  const selectedId = Number(params.get('e')) || null;

  const fp = snap?.pages?.feeds;
  const cats = useMemo(() => (data?.categories ?? []).filter((c) => !fp?.hideCategories?.includes(c.title)), [data, fp]);
  const catId = category === 'All' ? undefined : data?.categories.find((c) => c.title === category)?.id;

  const load = useCallback(async (id?: number) => {
    try {
      const q = new URLSearchParams({ status: 'unread' });
      if (id) q.set('cat', String(id));
      if (feedId) q.set('feed', String(feedId));
      if (since) q.set('since', since);
      if (query) q.set('q', query);
      const res = await fetch(`/api/feeds?${q}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setData(body as FeedsResponse);
      setRead(new Set());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [feedId, since, query]);

  // Search as you type, after a pause.
  useEffect(() => {
    if (typed === query) return;
    const t = setTimeout(() => setFilter('q', typed.trim()), 350);
    return () => clearTimeout(t);
  }, [typed]);

  const setFilter = (key: 'feed' | 'since' | 'q', value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('e');
    setParams(next, { replace: true });
    setConfirmAll(false);
  };

  const clearFilters = () => {
    const next = new URLSearchParams(params);
    for (const k of ['feed', 'since', 'q', 'e']) next.delete(k);
    setTyped('');
    setParams(next, { replace: true });
  };

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
    // A filtered view marks only what it shows; the whole category stays as it is.
    if (filtered) {
      markRead(unreadShown.map((e) => e.id));
      return;
    }
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
      if (id && !kept.has(id)) markRead([id]);
      readerRef.current?.scrollTo({ top: 0 });
      // On a phone the page itself scrolls: open the article at its top.
      if (matchMedia('(max-width: 760px)').matches) window.scrollTo({ top: 0 });
    },
    [params, setParams, markRead, selectedId, kept],
  );

  // Mark read when arriving from Home with ?e= already set.
  useEffect(() => {
    if (selectedId && !read.has(selectedId) && !kept.has(selectedId) && data?.entries.some((e) => e.id === selectedId)) markRead([selectedId]);
  }, [selectedId, data, read, kept, markRead]);

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
        <h1 className="page-title">Reading</h1>
        <Empty>
          Reading comes from Miniflux. <Link to="/settings?tab=connections&setup=miniflux">Connect Miniflux</Link> to turn it on.
        </Empty>
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
          <h1 className="page-title">Reading</h1>
          <span className="section-count">{total != null ? `${count(total)} unread${category !== 'All' ? ` in ${category}` : ''}` : ''}</span>
          <CustomizePage
            page="feeds"
            title="Reading"
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
                {c.title} <span className="chip-count">{count(c.unread)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="feeds-filters">
          <input
            className="field field-small feeds-search"
            type="search"
            placeholder="Search titles"
            aria-label="Search titles"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <div className="feeds-selects">
          {(data?.feeds?.length ?? 0) > 1 && (
            <label>
              <span className="sr-only">Feed</span>
              <select className="field field-small" value={feedId ?? ''} onChange={(e) => setFilter('feed', e.target.value)}>
                <option value="">All feeds</option>
                {data!.feeds!.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title} ({count(f.unread)})
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span className="sr-only">Published</span>
            <select className="field field-small" value={since} onChange={(e) => setFilter('since', e.target.value)}>
              <option value="">Any time</option>
              <option value="day">Last 24 hours</option>
              <option value="week">Last 7 days</option>
            </select>
          </label>
          {filtered && (
            <button type="button" className="text-button feeds-clear" onClick={clearFilters}>
              Clear filters
            </button>
          )}
          </div>
        </div>

        <div className="feeds-bar">
          {/* The same sort control as Logs and Stacks. */}
          <div className="seg seg-small" role="group" aria-label="Sort articles">
            {(
              [
                ['newest', 'Newest'],
                ['oldest', 'Oldest'],
                ['quick', 'Quick reads'],
              ] as [FeedSort, string][]
            ).map(([v, label]) => (
              <button key={v} type="button" aria-pressed={sort === v} onClick={() => setSort(v)}>
                {label}
              </button>
            ))}
          </div>
          {!snap?.readOnly &&
            (confirmAll ? (
              <span className="feeds-confirm">
                Mark {count((filtered ? unreadShown.length : total) ?? 0)} read?
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
        {data && data.total > data.entries.length && <p className="feeds-more">Showing the newest {count(data.entries.length)}. Mark some read to see the rest.</p>}
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
              <span className="reader-actions">
                <a className="text-button" href={selected.url} target="_blank" rel="noreferrer">
                  Open original
                </a>
                {!snap?.readOnly &&
                  (kept.has(selected.id) ? (
                    <span className="reader-kept">Kept unread</span>
                  ) : (
                    <button type="button" className="text-button" onClick={() => keepUnread(selected.id)}>
                      Keep unread
                    </button>
                  ))}
              </span>
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
        {total != null && <span>, {count(total)} unread</span>}. Press <kbd>j</kbd> to read from the top.
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
