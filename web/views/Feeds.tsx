// A real reader over Miniflux. Opening an entry marks it read. Keyboard:
// j/k next/previous, o open original, u back to list (on phones).

import DOMPurify from 'dompurify';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { FeedEntry } from '../../shared/types.ts';
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

export function Feeds() {
  const { snap } = useStore();
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const [entries, setEntries] = useState<FeedEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<Set<number>>(new Set());
  const [sort, setSort] = useUrlChoice<FeedSort>('sort', ['newest', 'oldest', 'quick'], 'newest');
  const category = params.get('cat') ?? 'All';
  const setCategory = (c: string) => {
    const next = new URLSearchParams(params);
    if (c === 'All') next.delete('cat');
    else next.set('cat', c);
    setParams(next, { replace: true });
  };
  const readerRef = useRef<HTMLElement>(null);

  const selectedId = Number(params.get('e')) || null;

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/feeds?status=unread');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setEntries(body as FeedEntry[]);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(() => {
    const set = new Set((entries ?? []).map((e) => e.category));
    return ['All', ...[...set].sort()];
  }, [entries]);

  const visible = useMemo(() => {
    const list = (entries ?? []).filter((e) => category === 'All' || e.category === category);
    const t = (e: FeedEntry) => Date.parse(e.publishedAt);
    if (sort === 'oldest') list.sort((a, b) => t(a) - t(b));
    else if (sort === 'quick') list.sort((a, b) => (a.readingTime || 99) - (b.readingTime || 99) || t(b) - t(a));
    else list.sort((a, b) => t(b) - t(a));
    return list;
  }, [entries, category, sort]);

  const selected = visible.find((e) => e.id === selectedId) ?? entries?.find((e) => e.id === selectedId) ?? null;

  const markRead = useCallback((ids: number[]) => {
    if (!ids.length) return;
    setRead((prev) => new Set([...prev, ...ids]));
    void fetch('/api/feeds/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  }, []);

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
    if (selectedId && !read.has(selectedId) && entries?.some((e) => e.id === selectedId)) markRead([selectedId]);
  }, [selectedId, entries, read, markRead]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
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

  const unreadLeft = visible.filter((e) => !read.has(e.id)).length;

  return (
    <div className={`reader-layout ${selected ? 'has-selection' : ''}`}>
      <aside className="reader-list" aria-label="Unread entries">
        <div className="reader-list-head">
          <h1 className="page-title">Feeds</h1>
          <span className="section-count">{entries ? `${unreadLeft} unread` : ''}</span>
          {unreadLeft > 0 && (
            <button type="button" className="text-button" onClick={() => markRead(visible.map((e) => e.id))}>
              Mark these read
            </button>
          )}
        </div>
        {categories.length > 2 && (
          <div className="chips" role="tablist" aria-label="Categories">
            {categories.map((c) => (
              <button key={c} type="button" role="tab" aria-selected={c === category} className="chip" onClick={() => setCategory(c)}>
                {c}
              </button>
            ))}
          </div>
        )}
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
        {error && <Empty>Couldn't load feeds: {error}</Empty>}
        {!entries && !error && <Empty>Loading feeds.</Empty>}
        {entries && visible.length === 0 && <Empty>You're caught up. New articles show up here as Miniflux fetches them.</Empty>}
        <ul className="entries">
          {visible.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className={`entry ${e.id === selectedId ? 'is-selected' : ''} ${read.has(e.id) ? 'is-read' : ''}`}
                onClick={() => select(e.id)}
              >
                <span className="entry-title">{e.title}</span>
                <span className="feed-meta">
                  <span>{e.feed}</span>
                  <time>{ago(e.publishedAt, now)}</time>
                  {e.readingTime > 0 && <span>{e.readingTime} min</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <article className="reader" ref={readerRef} aria-live="polite">
        {selected ? (
          <>
            <button type="button" className="text-button reader-back" onClick={() => select(null)}>
              Back to list
            </button>
            <header className="reader-head">
              <p className="reader-feed">
                {selected.feed}, {new Date(selected.publishedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
              </p>
              <h1>{selected.title}</h1>
              <a className="text-button" href={selected.url} target="_blank" rel="noreferrer">
                Open original
              </a>
            </header>
            <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
          </>
        ) : (
          <div className="reader-overview">
            <p className="reader-hint">
              Pick an article, or press <kbd>j</kbd> to start at the top.
            </p>
            <ul className="feed-cards">
              {visible
                .filter((e) => !read.has(e.id))
                .slice(0, 24)
                .map((e) => (
                  <li key={e.id}>
                    <button type="button" className="feed-card" onClick={() => select(e.id)}>
                      <span className="feed-card-meta">
                        <span>{e.feed}</span>
                        <time>{ago(e.publishedAt, now)}</time>
                      </span>
                      <span className="feed-card-title">{e.title}</span>
                      <span className="feed-card-text">{excerpt(e.content)}</span>
                      {e.readingTime > 0 && <span className="feed-card-time">{e.readingTime} min read</span>}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </article>
    </div>
  );
}
