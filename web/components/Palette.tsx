// Command palette (Ctrl/Cmd+K or "/"). One input that reaches every app,
// view, container log, unread article and inbox message, with web search as
// the fallback. Empty, it offers what needs attention and what you picked
// last. Each app is one row: Enter opens it, the right arrow reaches its
// details and logs.

import { HELP } from '../lib/docs.ts';
import { useModal } from '../lib/modal.ts';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FastmailData, MinifluxData } from '../../shared/types.ts';
import { setAppearance, THEMES } from '../lib/appearance.ts';
import { useStore } from '../lib/store.tsx';
import { needsYou } from '../lib/attention.ts';
import { containerMap, isExternal } from '../lib/services.ts';
import { Icon, Led } from './ui.tsx';

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
  /** More words it answers to, such as an app's container name. */
  terms?: string;
  /** The same thing's other pages, at the end of its row: Details, Logs. */
  subs?: { label: string; run: () => unknown }[];
  /** With nothing typed: the heading it sits under. */
  group?: string;
  /** A status light in the icon's place, for what needs attention. */
  led?: 'warn' | 'crit';
}

const RECENT_KEY = 'pb-jump-recent';
const readRecent = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
};
const remember = (id: string) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, 8)));
  } catch {
    /* private window: no memory, no harm */
  }
};
/** Asking for logs ("sonarr logs") lands on the row's Logs. */
const wantsLogs = (q: string) => /\blogs?\b/i.test(q);

/** Subsequence match with a bonus for word starts and contiguous runs. */
function score(query: string, text: string): number {
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  if (!q) return 1;
  if (t.startsWith(q)) return 1000 - t.length;
  const idx = t.indexOf(q);
  if (idx >= 0) return 800 - idx - t.length / 10;
  // Several words in any order: "sonarr restart" finds "Restart sonarr".
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.every((w) => t.includes(w)) ? 700 - t.length / 10 : -1;
  let s = 0;
  let ti = 0;
  let run = 0;
  let first = -1;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    if (first < 0) first = found;
    run = found === ti ? run + 1 : 0;
    s += 10 + run * 5 + (found === 0 || t[found - 1] === ' ' ? 15 : 0);
    ti = found + 1;
  }
  // Letters scattered across the whole name ("son" in "Stop navidrome") aren't a match.
  if (ti - first > q.length * 2 + 1) return -1;
  return s - t.length / 10;
}

export function Palette({ open, onClose, onKeys }: { open: boolean; onClose: () => void; onKeys?: () => void }) {
  const modal = useModal<HTMLDivElement>(onClose, open);
  const { snap } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [armed, setArmed] = useState<string | null>(null);
  /** A touch screen has no Enter: the second press is a tap. */
  const coarse = matchMedia('(pointer: coarse)').matches;
  /** Which part of the selected row: 0 the row itself, then its subs. */
  const [part, setPart] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Cleared as it closes, so the next open starts empty before you type.
  useEffect(() => {
    setQ('');
    setSel(0);
    setArmed(null);
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
    const ctrs = containerMap(snap);
    const pages = (name: string, withDetails: boolean) => [
      ...(withDetails ? [{ label: 'Details', run: go(`/c/${encodeURIComponent(name)}`) }] : []),
      { label: 'Logs', run: go(`/logs/${encodeURIComponent(name)}`) },
    ];
    // An app and its container are one row; a container no app claims gets its own.
    const claimed = new Set<string>();
    for (const g of snap.catalog.groups) {
      for (const s of g.services) {
        const c = s.container ? ctrs.get(s.container) : undefined;
        if (!s.href && !c) continue;
        const external = !!s.href && isExternal(s.href);
        if (c) claimed.add(c.name);
        out.push({
          id: `s-${s.name}`,
          label: s.name,
          hint: c && c.state !== 'running' ? `${g.name}, ${c.state}` : g.name,
          icon: s.icon,
          terms: c ? `${c.name} container logs details` : undefined,
          run: external ? openUrl(s.href!) : go(c ? `/c/${encodeURIComponent(c.name)}` : '/apps'),
          subs: c ? pages(c.name, external) : undefined,
        });
      }
    }
    for (const b of snap.catalog.dock) {
      out.push({ id: `b-${b.name}`, label: b.name, hint: 'Bookmark', icon: b.icon, run: openUrl(b.href) });
    }
    for (const c of ctrs.values()) {
      const hint = c.state === 'running' ? `Container${c.project ? ` in ${c.project}` : ''}` : `Container, ${c.state}`;
      if (!claimed.has(c.name)) out.push({ id: `c-${c.name}`, label: c.name, hint, terms: 'container logs details', run: go(`/c/${encodeURIComponent(c.name)}`), subs: pages(c.name, false) });
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
            ...(a !== 'start' ? { confirm: `${a} ${c.name}` } : {}),
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
    // Nothing typed: what needs you, what you picked last, then the pages.
    if (!q.trim()) {
      const ctrs = snap ? containerMap(snap) : new Map();
      const trouble = needsYou(snap?.alerts);
      // The first four by name; past that, one row that says how many and opens the rest on Home.
      const attention: Item[] = trouble
        .slice(0, trouble.length > 4 ? 3 : 4)
        .map((a) => {
          const to = a.href ?? (a.subject && ctrs.has(a.subject) ? `/c/${encodeURIComponent(a.subject)}` : '/');
          return {
            id: `al-${a.id}`,
            label: a.title,
            hint: a.level === 'critical' ? 'Down' : 'Warning',
            group: 'Needs attention',
            led: a.level === 'critical' ? 'crit' : 'warn',
            run: () => (isExternal(to) ? window.open(to, '_blank', 'noopener') : navigate(to)),
          };
        });
      if (trouble.length > 4)
        attention.push({
          id: 'al-more',
          label: `All ${trouble.length} that need you`,
          hint: 'Home',
          group: 'Needs attention',
          // Home opens its full list on arrival, not just the first three.
          run: () => navigate('/', { state: { attention: true } }),
        });
      const byId = new Map(items.map((it) => [it.id, it]));
      const recent = readRecent()
        .map((id) => byId.get(id))
        .filter((it): it is Item => !!it)
        .slice(0, 5)
        .map((it) => ({ ...it, group: 'Recent' }));
      const seen = new Set(recent.map((it) => it.id));
      const views = items.filter((it) => it.id.startsWith('v-') && !seen.has(it.id)).map((it) => ({ ...it, group: 'Pages' }));
      return [...attention, ...recent, ...views].slice(0, Math.max(9, attention.length + recent.length + 3));
    }
    const ranked = items
      .map((it) => {
        // Articles and mail match where the words appear, never by scattered letters.
        const loose = it.id.startsWith('f-') || it.id.startsWith('m-');
        const s = loose
          ? it.label.toLowerCase().includes(q.trim().toLowerCase())
            ? score(q, it.label)
            : -1
          : Math.max(score(q, it.label), score(q, `${it.hint} ${it.label}`) - 50, it.terms ? score(q, `${it.label} ${it.terms}`) - 60 : -1);
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
  }, [items, q, snap, navigate]);

  useEffect(() => {
    // Nothing of yours matches: no default, so Enter can't send the words to a search engine.
    setSel(results[0]?.id === 'none' ? -1 : 0);
    setArmed(null);
  }, [q]);
  // Keyed on the row, not the list: live updates rebuild the list every few seconds.
  const selId = results[sel]?.id;
  useEffect(() => {
    const it = results[sel];
    const logs = it?.subs?.findIndex((x) => x.label === 'Logs') ?? -1;
    setPart(wantsLogs(q) && logs >= 0 ? logs + 1 : 0);
    if (it) document.getElementById(`pal-${it.id}`)?.scrollIntoView({ block: 'nearest' });
  }, [selId, q]);

  if (!open) return null;

  const choose = (it: Item | undefined, p = part) => {
    if (!it || it.id === 'none') return;
    if (it.confirm && armed !== it.id) return setArmed(it.id);
    onClose();
    // Opening things is worth remembering; actions and one-off alerts aren't.
    if (!it.confirm && !it.id.startsWith('a-') && !it.id.startsWith('al-') && it.id !== 'web') remember(it.id);
    const sub = p > 0 ? it.subs?.[p - 1] : undefined;
    (sub ?? it).run();
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
              setSel((s) => Math.min(Math.max(s, results[0]?.id === 'none' ? 0 : -1) + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((s) => Math.max(s - 1, results[0]?.id === 'none' ? 1 : 0));
            } else if (e.key === 'ArrowRight' && results[sel]?.subs && part < results[sel].subs!.length && e.currentTarget.selectionStart === q.length) {
              e.preventDefault();
              setPart((p) => p + 1);
            } else if (e.key === 'ArrowLeft' && part > 0) {
              e.preventDefault();
              setPart((p) => p - 1);
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
        {/* No Escape key on a phone: a way out you can tap. */}
        <button type="button" className="text-button palette-cancel" onClick={onClose}>
          Cancel
        </button>
        <ul className="palette-results" id="palette-results" role="listbox" ref={listRef}>
          {results.map((it, i) => it.id === 'none' ? (
            <li key="none" className="palette-none" role="presentation">
              {it.label}
            </li>
          ) : (
            <Fragment key={it.id}>
              {it.group && it.group !== results[i - 1]?.group && (
                <li className="palette-group" role="presentation">
                  {it.group}
                </li>
              )}
              <li
                id={`pal-${it.id}`}
                role="option"
                aria-selected={i === sel}
                aria-label={`${it.label}, ${it.hint}${i === sel && it.subs?.[part - 1] ? `: ${it.subs[part - 1].label}` : it.subs ? `. Right arrow for ${it.subs.map((x) => x.label.toLowerCase()).join(' and ')}` : ''}`}
                className={`palette-item ${i === sel && it.subs?.[part - 1] ? 'is-sub' : ''}`}
                onMouseMove={() => (i !== sel ? (setSel(i), setArmed(null)) : undefined)}
                onClick={() => choose(it, 0)}
              >
                <span className="palette-icon">{it.led ? <Led state={it.led} /> : it.icon ? <Icon name={it.label} icon={it.icon} size={18} /> : null}</span>
                <span className={`palette-label ${armed === it.id ? 'is-armed' : ''}`}>{armed === it.id ? `${coarse ? 'Tap' : 'Press Enter or click'} again to ${it.confirm}` : it.label}</span>
                <span className="palette-hint">{it.hint}</span>
                {it.subs && (
                  <span className="palette-subs" aria-hidden>
                    {it.subs.map((x, k) => (
                      <span
                        key={x.label}
                        className={`palette-sub ${i === sel && part === k + 1 ? 'is-on' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          choose(it, k + 1);
                        }}
                      >
                        {x.label}
                      </span>
                    ))}
                  </span>
                )}
              </li>
            </Fragment>
          ))}
          {results.length === 0 && <li className="palette-none">Type to search apps, containers, articles and mail.</li>}
        </ul>
      </div>
    </div>
  );
}
