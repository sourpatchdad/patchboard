// A real reader over Miniflux. Opening an entry marks it read. Keyboard:
// j/k next/previous, o open original, u back to list (on phones).

import DOMPurify from 'dompurify';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { FeedEntry } from '../../shared/types.ts';
import { Empty } from '../components/ui.tsx';
import { ago } from '../lib/format.ts';
import { useNow, useStore } from '../lib/store.tsx';

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
  const [category, setCategory] = useState<string>('All');
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

  const visible = useMemo(
    () => (entries ?? []).filter((e) => category === 'All' || e.category === category),
    [entries, category],
  );

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
      setParams(id ? { e: String(id) } : {}, { replace: !!selectedId });
      if (id) markRead([id]);
      readerRef.current?.scrollTo({ top: 0 });
    },
    [setParams, markRead, selectedId],
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
          <div className="reader-empty">
            <p>Pick an article, or press <kbd>j</kbd> to start at the top.</p>
          </div>
        )}
      </article>
    </div>
  );
}
