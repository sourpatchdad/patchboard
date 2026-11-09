// Command palette (Ctrl/Cmd+K or "/"). One input that reaches every app,
// view, container log, unread article and inbox message, with web search as
// the fallback. It replaces the wall of tiles as the main way to launch things.

import { HELP } from '../lib/docs.ts';
import { useModal } from '../lib/modal.ts';
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
  run: () => unknown;
  /** Takes something down: Enter once arms it, Enter again runs it. */
  confirm?: string;
  /** Sorts ahead of its peers, such as an action on a container that's down. */
  boost?: number;
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

export function Palette({ open, onClose, onKeys }: { open: boolean; onClose: () => void; onKeys?: () => void }) {
  const modal = useModal<HTMLDivElement>(onClose, open);
  const { snap } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [armed, setArmed] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      setArmed(null);
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
      { id: 'v-feeds', label: 'Reading', hint: 'View', run: go('/reading') },
      { id: 'v-up', label: 'Upcoming', hint: 'View', run: go('/upcoming') },
      { id: 'v-weather', label: 'Weather', hint: 'View', run: go('/weather') },
      { id: 'v-logs', label: 'Logs', hint: 'View', run: go('/logs') },
      { id: 'v-apps', label: 'Apps', hint: 'View', run: go('/apps') },
      { id: 'v-settings', label: 'Settings', hint: 'Appearance', run: go('/settings') },
      ...([['look', 'Look'], ['home', 'Home'], ['alerts', 'Alerts'], ['connections', 'Connections'], ['activity', 'Activity']] as const).map(([t, label]) => ({ id: `set-${t}`, label: `Settings: ${label}`, hint: 'Settings', run: go(`/settings?tab=${t}`) })),
      { id: 'h-tour', label: 'Help: a tour of every page', hint: 'Help', run: openUrl(HELP.tour) },
      { id: 'h-integrations', label: 'Help: setting up integrations', hint: 'Help', run: openUrl(HELP.integrations) },
      ...(onKeys ? [{ id: 'h-keys', label: 'Keyboard shortcuts', hint: 'Help', run: onKeys }] : []),
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
      // Actions by name: "restart sonarr". Stop and restart ask first, as the
      // hold buttons do; the container page then follows it through.
      if (!snap.readOnly && c.name !== (snap.self?.container ?? 'patchboard')) {
        const trouble = c.state !== 'running' || c.health === 'unhealthy';
        for (const a of c.state === 'running' ? (['restart', 'stop'] as const) : (['start'] as const)) {
          const verb = a.charAt(0).toUpperCase() + a.slice(1);
          out.push({
            id: `a-${a}-${c.name}`,
            label: `${verb} ${c.name}`,
            hint: 'Action',
            ...(a !== 'start' ? { confirm: `Press Enter again to ${a} ${c.name}` } : {}),
            // A container in trouble comes first: that's the one you came for.
            boost: trouble ? 200 : 0,
            run: async () => {
              const res = await fetch(`/api/containers/${encodeURIComponent(c.name)}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Patchboard': 'action' },
                body: JSON.stringify({ action: a }),
              });
              if (!res.ok) return window.alert(`${verb} failed: ${((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`}`);
              navigate(`/c/${encodeURIComponent(c.name)}?sent=${a}`);
            },
          });
        }
      }
    }
    const feeds = snap.sources.miniflux?.data as MinifluxData | null;
    for (const e of feeds?.entries ?? []) {
      out.push({ id: `f-${e.id}`, label: e.title, hint: e.feed, run: go(`/reading?e=${e.id}`) });
    }
    const mail = snap.sources.fastmail?.data as FastmailData | null;
    for (const m of mail?.messages ?? []) {
      out.push({ id: `m-${m.id}`, label: m.subject, hint: `Mail from ${m.from}`, run: openUrl(mail!.webUrl) });
    }
    return out;
  }, [snap, navigate]);

  const results = useMemo(() => {
    const ranked = items
      .map((it) => {
        // Articles and mail match where the words appear, never by scattered letters.
        const loose = it.id.startsWith('f-') || it.id.startsWith('m-');
        const s = loose ? (it.label.toLowerCase().includes(q.trim().toLowerCase()) ? score(q, it.label) : -1) : Math.max(score(q, it.label), score(q, `${it.hint} ${it.label}`) - 50);
        // The boost ranks a match; it never makes one.
        return { it, s: s > 0 && q.trim() ? s + (it.boost ?? 0) : s };
      })
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || a.it.label.localeCompare(b.it.label))
      .slice(0, 9)
      .map((r) => r.it);
    if (q.trim()) {
      if (!ranked.length) ranked.push({ id: 'none', label: `Nothing here matches "${q.trim()}"`, hint: '', run: () => undefined });
      ranked.push({
        id: 'web',
        label: `Search the web for "${q.trim()}"`,
        hint: 'Google',
        run: () => window.open(`https://www.google.com/search?q=${encodeURIComponent(q.trim())}`, '_blank', 'noopener'),
      });
    }
    return ranked;
  }, [items, q]);

  useEffect(() => {
    setSel(results[0]?.id === 'none' ? 1 : 0);
    setArmed(null);
  }, [q]);
  useEffect(() => {
    listRef.current?.children[sel]?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!open) return null;

  const choose = (it: Item | undefined) => {
    if (!it || it.id === 'none') return;
    if (it.confirm && armed !== it.id) return setArmed(it.id);
    onClose();
    it.run();
  };

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" ref={modal} role="dialog" aria-modal="true" aria-label="Jump to" onMouseDown={(e) => e.stopPropagation()}>
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
              setSel((s) => Math.max(s - 1, results[0]?.id === 'none' ? 1 : 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              choose(results[sel]);
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
          role="combobox"
          aria-label="Jump to"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls="palette-results"
          aria-activedescendant={results[sel] ? `pal-${results[sel].id}` : undefined}
        />
        <ul className="palette-results" id="palette-results" role="listbox" ref={listRef}>
          {results.map((it, i) => it.id === 'none' ? (
            <li key="none" className="palette-none" role="presentation">
              {it.label}
            </li>
          ) : (
            <li
              key={it.id}
              id={`pal-${it.id}`}
              role="option"
              aria-selected={i === sel}
              className="palette-item"
              onMouseMove={() => (i !== sel ? (setSel(i), setArmed(null)) : undefined)}
              onClick={() => choose(it)}
            >
              <span className="palette-icon">{it.icon ? <Icon name={it.label} icon={it.icon} size={18} /> : null}</span>
              <span className={`palette-label ${armed === it.id ? 'is-armed' : ''}`}>{armed === it.id ? it.confirm : it.label}</span>
              <span className="palette-hint">{it.hint}</span>
            </li>
          ))}
          {results.length === 0 && <li className="palette-none">Type to search apps, containers, feeds and mail.</li>}
        </ul>
      </div>
    </div>
  );
}
