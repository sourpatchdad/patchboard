// Command palette (Ctrl/Cmd+K or "/"). One input that reaches every app,
// view, container log, unread article and inbox message, with web search as
// the fallback. It replaces the wall of tiles as the main way to launch things.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FastmailData, MinifluxData } from '../../shared/types.ts';
import { setAppearance, THEMES } from '../lib/appearance.ts';
import { useStore } from '../lib/store.tsx';
import { containerMap, isExternal } from '../lib/services.ts';
import { Icon } from './ui.tsx';

interface Item {
  id: string;
  label: string;
  hint: string;
  icon?: string;
  run: () => void;
}

/** Subsequence match with a bonus for word starts and contiguous runs. */
function score(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 1;
  if (t.startsWith(q)) return 1000 - t.length;
  const idx = t.indexOf(q);
  if (idx >= 0) return 800 - idx - t.length / 10;
  let s = 0;
  let ti = 0;
  let run = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    run = found === ti ? run + 1 : 0;
    s += 10 + run * 5 + (found === 0 || t[found - 1] === ' ' ? 15 : 0);
    ti = found + 1;
  }
  return s - t.length / 10;
}

export function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { snap } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    if (!snap) return [];
    const openUrl = (href: string) => () => window.open(href, '_blank', 'noopener');
    const go = (to: string) => () => navigate(to);
    const out: Item[] = [
      { id: 'v-home', label: 'Home', hint: 'View', run: go('/') },
      { id: 'v-server', label: 'Server', hint: 'View', run: go('/server') },
      { id: 'v-stacks', label: 'Stacks', hint: 'View', run: go('/stacks') },
      { id: 'v-feeds', label: 'Feeds', hint: 'View', run: go('/feeds') },
      { id: 'v-up', label: 'Upcoming', hint: 'View', run: go('/upcoming') },
      { id: 'v-weather', label: 'Weather', hint: 'View', run: go('/weather') },
      { id: 'v-logs', label: 'Logs', hint: 'View', run: go('/logs') },
      { id: 'v-apps', label: 'Apps', hint: 'View', run: go('/apps') },
      { id: 'v-settings', label: 'Settings', hint: 'Appearance', run: go('/settings') },
      { id: 'a-dark', label: 'Dark mode', hint: 'Appearance', run: () => setAppearance({ scheme: 'dark' }) },
      { id: 'a-light', label: 'Light mode', hint: 'Appearance', run: () => setAppearance({ scheme: 'light' }) },
      ...THEMES.map((t) => ({ id: `a-${t.id}`, label: `${t.name} theme`, hint: 'Appearance', run: () => setAppearance({ theme: t.id }) })),
    ];
    for (const g of snap.catalog.groups) {
      for (const s of g.services) {
        if (s.href) out.push({ id: `s-${s.name}`, label: s.name, hint: g.name, icon: s.icon, run: isExternal(s.href) ? openUrl(s.href) : go(s.container ? `/c/${s.container}` : '/apps') });
      }
    }
    for (const b of snap.catalog.dock) {
      out.push({ id: `b-${b.name}`, label: b.name, hint: 'Bookmark', icon: b.icon, run: openUrl(b.href) });
    }
    for (const c of containerMap(snap).values()) {
      const hint = c.state === 'running' ? `Container${c.project ? ` in ${c.project}` : ''}` : `Container, ${c.state}`;
      out.push({ id: `c-${c.name}`, label: c.name, hint, run: go(`/c/${c.name}`) });
      out.push({ id: `cl-${c.name}`, label: `${c.name} logs`, hint: 'Logs', run: go(`/logs/${c.name}`) });
    }
    const feeds = snap.sources.miniflux?.data as MinifluxData | null;
    for (const e of feeds?.entries ?? []) {
      out.push({ id: `f-${e.id}`, label: e.title, hint: e.feed, run: go(`/feeds?e=${e.id}`) });
    }
    const mail = snap.sources.fastmail?.data as FastmailData | null;
    for (const m of mail?.messages ?? []) {
      out.push({ id: `m-${m.id}`, label: m.subject, hint: `Mail from ${m.from}`, run: openUrl(mail!.webUrl) });
    }
    return out;
  }, [snap, navigate]);

  const results = useMemo(() => {
    const ranked = items
      .map((it) => ({ it, s: Math.max(score(q, it.label), score(q, `${it.hint} ${it.label}`) - 50) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 9)
      .map((r) => r.it);
    if (q.trim()) {
      ranked.push({
        id: 'web',
        label: `Search the web for "${q.trim()}"`,
        hint: 'Google',
        run: () => window.open(`https://www.google.com/search?q=${encodeURIComponent(q.trim())}`, '_blank', 'noopener'),
      });
    }
    return ranked;
  }, [items, q]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.children[sel]?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!open) return null;

  const choose = (it: Item | undefined) => {
    if (!it) return;
    onClose();
    it.run();
  };

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Jump to" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          autoFocus
          className="palette-input"
          placeholder="Jump to an app, view, container or article"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSel((s) => Math.min(s + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((s) => Math.max(s - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              choose(results[sel]);
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
          aria-controls="palette-results"
          aria-activedescendant={results[sel] ? `pal-${results[sel].id}` : undefined}
        />
        <ul className="palette-results" id="palette-results" role="listbox" ref={listRef}>
          {results.map((it, i) => (
            <li
              key={it.id}
              id={`pal-${it.id}`}
              role="option"
              aria-selected={i === sel}
              className="palette-item"
              onMouseMove={() => setSel(i)}
              onClick={() => choose(it)}
            >
              <span className="palette-icon">{it.icon ? <Icon name={it.label} icon={it.icon} size={18} /> : null}</span>
              <span className="palette-label">{it.label}</span>
              <span className="palette-hint">{it.hint}</span>
            </li>
          ))}
          {results.length === 0 && <li className="palette-none">Type to search apps, containers, feeds and mail.</li>}
        </ul>
      </div>
    </div>
  );
}
