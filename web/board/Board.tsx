// The Home board: widgets on a 12-column grid, packed like masonry so tall
// and short widgets never leave ragged gaps. View mode has no handles at all.
// Customize enters edit mode: drag to reorder (or use the arrow buttons),
// pick a size, remove, add from the drawer; Save or Cancel. The board is
// stored on the server, so every device shows the same one; phones show it
// as a single column in the same order.

import { useModal } from '../lib/modal.ts';
import { Roll } from '../components/Roll.tsx';
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate } from 'react-router-dom';
import {
  type Board as BoardData,
  cleanBoardName,
  DEFAULT_BOARD,
  DEFAULT_COLUMNS,
  EMPTY_BOARD,
  HOME_ID,
  MIN_COLUMN_PX,
  noteKey,
  spanOf,
  STARTERS,
  WIDGET_INFO,
  type Widget,
  type WidgetType,
} from '../../shared/board.ts';
import { HoldButton } from '../components/Hold.tsx';
import { forThisServer, leftOut, NEEDS, setupHref, widgetReady } from './ready.ts';
import { WidgetCtx } from './widget-context.ts';
import { DownloadsWidget } from './Downloads.tsx';
import { ListeningWidget, WatchedWidget } from './Media.tsx';
import { CamerasWidget } from './Cameras.tsx';
import { BookmarksWidget, ClocksWidget, ReleasesWidget, RssWidget, SearchWidget } from './Outside.tsx';
import { canTrimHeight } from './fit.ts';
import { useDragSort } from '../lib/dragsort.ts';
import type { StatsData, SystemData, TruenasData, UptimeData, WeatherData } from '../../shared/types.ts';
import { AppTiles } from '../components/AppTiles.tsx';
import { PatchRow } from '../components/PatchRow.tsx';
import { Spark, Split } from '../components/Spark.tsx';
import { HealthStrip } from '../components/Squares.tsx';
import { Empty, Icon, Meter, Section } from '../components/ui.tsx';
import { useHistory, useJson } from '../lib/api.ts';
import { useAppearance } from '../lib/appearance.ts';
import { useLanding } from '../lib/landing.ts';
import { deg, pct, size, uptime, weatherText } from '../lib/format.ts';
import { checkFor, containerMap, serviceFor, shortStatus } from '../lib/services.ts';
import { storageLevel, useLimits, useSource, useStore } from '../lib/store.tsx';
import { JsonEditor, JsonWidgetView, parseConfig } from './JsonWidget.tsx';
import { Attention, Changes, FeedsBrief, Inbox, NextUp, NowPlaying, RecentlyAdded, UpcomingBrief } from '../views/Home.tsx';
import { CarWidget, HaPicker, HomeAssistantWidget, WakeWidget, UptimeWidget, DnsWidget, SpeedWidget, PhotosWidget, ProxmoxWidget, DrivesWidget, SyncWidget, HostsWidget, PowerWidget, StorageWidget, DockerHostsWidget, NetworkWidget, CalendarWidget, NotesWidget, BooksWidget, RequestsWidget } from './HomeWidgets.tsx';

const ACTION = { 'Content-Type': 'application/json', 'X-Patchboard': 'action' };
const GAP_PX = 24;
const spanLabel = (n: number, cols: number) => (n >= cols ? 'Full' : String(n));
const NONE: Widget[] = [];

function useBoard(id: string) {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [custom, setCustom] = useState(false);
  const [missing, setMissing] = useState(false);
  // Saved from another device or tab: load it again, without a blank frame.
  const saved = useStore().snap?.boardSaved;
  const stamp = saved && (saved.id === id || saved.id === '*') ? saved.at : 0;
  const shownId = useRef(id);
  useEffect(() => {
    let gone = false;
    if (shownId.current !== id) {
      shownId.current = id;
      setBoard(null);
    }
    setMissing(false);
    void (async () => {
      try {
        const res = await fetch(`/api/boards/${encodeURIComponent(id)}`);
        if (gone) return;
        if (res.status === 404) return setMissing(true);
        const body = (await res.json()) as { board: BoardData; custom: boolean };
        setBoard(body.board);
        setCustom(body.custom);
      } catch {
        if (!gone && id === HOME_ID) setBoard(DEFAULT_BOARD);
      }
    })();
    return () => {
      gone = true;
    };
  }, [id, stamp]);
  /** Save, or with null reset Home or delete another board. */
  const save = async (b: BoardData | null): Promise<string | null> => {
    const res = await fetch(`/api/boards/${encodeURIComponent(id)}`, { method: b ? 'PUT' : 'DELETE', headers: ACTION, body: b ? JSON.stringify(b) : undefined });
    const body = (await res.json()) as { board?: BoardData; custom?: boolean; error?: string; deleted?: boolean };
    if (!res.ok) return body.error ?? `HTTP ${res.status}`;
    if (body.board) {
      setBoard(body.board);
      setCustom(!!body.custom);
    }
    return null;
  };
  return { board, custom, missing, save };
}

/**
 * Fit the screen: while the board runs past the bottom of the window, take
 * items off the list widget doing the most to push it there, a few at a time,
 * until it fits or nothing more can go. Starts over when the window's size
 * changes or the board is saved.
 */
function useFit(on: boolean, el: HTMLDivElement | null, widgets: Widget[]): { trim: Record<string, number>; posters: Record<string, number>; over: number } {
  const [trim, setTrim] = useState<Record<string, number>>({});
  const [posters, setPosters] = useState<Record<string, number>>({});
  /** Pixels still past the window once nothing more can be trimmed. */
  const [over, setOver] = useState(0);
  const [viewport, setViewport] = useState(() => `${window.innerWidth}:${window.innerHeight}`);
  useEffect(() => {
    const onResize = () => setViewport(`${window.innerWidth}:${window.innerHeight}`);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  /** The last cut, to check it bought room: the widget, its count before, its height before. */
  const lastCut = useRef<{ id: string; before?: number; height: number; expect: number } | null>(null);
  /** Widgets whose cuts bought nothing (a poster row, a list already shorter than its count). */
  const noGain = useRef(new Set<string>());
  const shape = JSON.stringify(widgets.map(({ id, type, size, span, config }) => ({ id, type, size, span, config })).sort((a, b) => a.id.localeCompare(b.id)));
  useEffect(() => {
    setTrim({});
    setPosters({});
    setOver(0);
    lastCut.current = null;
    noGain.current = new Set();
  }, [on, viewport, shape]);
  useEffect(() => {
    if (!on || !el) return;
    const home = el.closest('.home');
    if (!home) return;
    // Only available room matters. Observing the board's parent also catches
    // Welcome disappearing and board tabs appearing, without resetting when
    // Fit itself changes the board's height.
    let room = '';
    const ro = new ResizeObserver(() => {
      const foot = el.parentElement?.querySelector<HTMLElement>('.board-foot');
      const next = `${el.getBoundingClientRect().top + window.scrollY}:${el.clientWidth}:${foot?.getBoundingClientRect().height ?? 0}`;
      if (next === room) return;
      room = next;
      setTrim({});
      setPosters({});
      setOver(0);
      lastCut.current = null;
      noGain.current = new Set();
    });
    ro.observe(home);
    for (const child of home.children) if (!child.contains(el)) ro.observe(child);
    const foot = el.parentElement?.querySelector('.board-foot');
    if (foot) ro.observe(foot);
    return () => ro.disconnect();
  }, [on, el]);
  useEffect(() => {
    if (!on || !el) return;
    let timer = 0;
    const check = () => {
      // Page coordinates, so a scrolled page measures the same as one at the top.
      // The foot (Customize, New board) stays on screen too.
      const foot = el.parentElement?.querySelector<HTMLElement>('.board-foot');
      const reserve = foot ? foot.getBoundingClientRect().height + parseFloat(getComputedStyle(foot).marginTop) : 0;
      const floor = window.innerHeight - reserve - 20 - window.scrollY;
      const cells = [...el.querySelectorAll<HTMLElement>(':scope > .cell')].map((c) => ({ c, r: c.getBoundingClientRect(), w: widgets.find((x) => `w-${x.id}` === c.id) }));
      const shown = (x: Widget) => trim[x.id] ?? Number(x.config?.limit ?? WIDGET_INFO[x.type].options.limit?.[0] ?? 0);
      // Restore cuts that bought no height. Fixed headings can make a useful
      // removed row much smaller than the widget average, so measure the gain.
      const cut = lastCut.current;
      if (cut) {
        lastCut.current = null;
        const now = cells.find((x) => x.w?.id === cut.id);
        if (now && cut.height - now.r.height < Math.min(4, cut.expect * 0.4)) {
          noGain.current.add(cut.id);
          setTrim((t) => {
            const next = { ...t };
            if (cut.before === undefined) delete next[cut.id];
            else next[cut.id] = cut.before;
            return next;
          });
          return;
        }
      }
      const over = cells.filter((x) => x.r.bottom > floor).sort((a, b) => b.r.bottom - a.r.bottom);
      for (const low of over) {
        // Anything sharing its columns, at or above it, can make room. The
        // list with the most to spare goes first, so cuts spread evenly
        // instead of leaving one widget with a single row.
        const pick = cells
          .filter((x) => x.w && !noGain.current.has(x.w.id) && x.r.top <= low.r.top && x.r.left < low.r.right - 1 && x.r.right > low.r.left + 1)
          // Poster shelves use a horizontal row. Removing their posters
          // leaves the same height and only creates empty space.
          .filter((x) => canTrimHeight([...x.c.querySelectorAll('li')].map((item) => item.getBoundingClientRect().top)))
          .map((x) => {
            const lim = WIDGET_INFO[x.w!.type].options.limit;
            const now = shown(x.w!);
            // Rows actually shown: list items, or for Right now the longest server or client's rows.
            const blocks = [...x.c.querySelectorAll('.now-block')].map((b) => b.querySelectorAll('.stream').length);
            const rows = blocks.length ? Math.max(...blocks) : x.c.querySelectorAll('li').length;
            const items = Math.max(1, Math.min(now, rows || now));
            // Height per row across the whole widget, for what a cut should save.
            const perRow = x.r.height / Math.max(1, blocks.length ? blocks.reduce((a, b) => a + b, 0) : rows || items);
            return { ...x, w: x.w!, now, items, perRow, min: lim?.[1] ?? Infinity };
          })
          .filter((x) => x.items > x.min)
          .sort((a, b) => b.items - b.min - (a.items - a.min) || b.r.height - a.r.height)[0];
        if (!pick) continue;
        const need = Math.ceil((low.r.bottom - floor) / pick.perRow);
        const step = Math.max(1, Math.min(need, Math.ceil((pick.items - pick.min) / 2)));
        lastCut.current = { id: pick.w.id, before: trim[pick.w.id], height: pick.r.height, expect: step * pick.perRow };
        setTrim((t) => ({ ...t, [pick.w.id]: Math.max(pick.min, pick.items - step) }));
        return;
      }
      // Keep every item in a horizontal shelf. When rows alone cannot fit,
      // reduce artwork size with its aspect ratio intact, never its count.
      for (const low of over) {
        const shelf = cells.find((x) => x.w?.type === 'recent' && x.r.top <= low.r.top && x.r.left < low.r.right && x.r.right > low.r.left && (x.c.querySelector('.posters .poster')?.getBoundingClientRect().height ?? 0) > 109);
        const art = shelf?.c.querySelector('.posters .poster')?.getBoundingClientRect();
        if (shelf?.w && art) {
          setPosters((p) => ({ ...p, [shelf.w!.id]: Math.max(108, Math.floor(art.height - (low.r.bottom - floor) - 4)) }));
          return;
        }
      }
      setOver(over.length ? Math.round(over[0].r.bottom - floor) : 0);
    };
    const queue = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(check, 90);
    };
    const ro = new ResizeObserver(queue);
    ro.observe(el);
    queue();
    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
    };
  }, [on, el, widgets, trim, posters]);
  return on ? { trim, posters, over } : { trim: {}, posters: {}, over: 0 };
}

/** Align close-sized reading/calendar cards without adding more than 48px. */
function useListCardAlignment(el: HTMLDivElement | null, widgets: string): Record<string, number> {
  const [aligned, setAligned] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!el) return;
    let frame = 0;
    const measure = () => {
      const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
      const foot = el.parentElement?.querySelector<HTMLElement>('.board-foot');
      const reserve = foot ? foot.getBoundingClientRect().height + parseFloat(getComputedStyle(foot).marginTop) : 0;
      const freeRoom = (innerHeight - el.getBoundingClientRect().bottom - scrollY - reserve - 20) / zoom;
      const occupied = [...el.querySelectorAll<HTMLElement>(':scope > .cell')].map((cell) => ({ cell, rect: cell.getBoundingClientRect() }));
      const cards = occupied.filter(({ cell }) => cell.dataset.type === 'feeds' || cell.dataset.type === 'upcoming').map(({ cell, rect }) => {
        const body = cell.querySelector<HTMLElement>('.cell-body')!;
        const content = body.firstElementChild;
        const style = getComputedStyle(body);
        const height = (content?.getBoundingClientRect().height ?? 0) / zoom + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 24;
        return { id: cell.id.slice(2), rect, top: rect.top, height, extra: Math.max(0, rect.height / zoom - height) };
      });
      const room = freeRoom + Math.max(0, ...cards.map((card) => card.extra));
      const next: Record<string, number> = {};
      for (const card of cards) {
        const following = occupied.filter(({ rect }) => rect.top > card.top + 1 && rect.left < card.rect.right - 1 && rect.right > card.rect.left + 1);
        const boundary = Math.min(el.getBoundingClientRect().bottom, ...following.map(({ rect }) => rect.top));
        // Use already-empty space below a shorter card before spending any
        // page height. A full-width row below both cards should never move.
        const clearance = Math.max(0, (boundary - card.top) / zoom - card.height);
        const capacity = Math.min(48, clearance + Math.max(0, room));
        const peer = cards.find((other) => other.id !== card.id && Math.abs(other.top - card.top) < 4 && Math.max(0, other.height - card.height) <= capacity && Math.abs(other.height - card.height) <= 48);
        if (peer) next[card.id] = Math.max(card.height, peer.height);
      }
      setAligned((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const queue = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(queue);
    observer.observe(el);
    for (const section of el.querySelectorAll('.feeds-brief, .upcoming-brief')) observer.observe(section);
    window.addEventListener('resize', queue);
    queue();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', queue); };
  }, [el, widgets]);
  return aligned;
}

export function Board({ id = HOME_ID, now, onWidgets }: { id?: string; now: number; onWidgets?: (types: string[]) => void }) {
  const { snap } = useStore();
  const navigate = useNavigate();
  const { board, custom, missing, save } = useBoard(id);
  const { homeApps, homeStatusSize } = useAppearance();
  // An alert that points at a widget (#w-power) lands on it once the board is drawn.
  useLanding(!!board);
  const types = board?.widgets.map((w) => (w.type === 'attention' && (w.config?.style === 'card' || homeStatusSize === 'hidden') ? 'attention-card' : w.type)).join(',') ?? '';
  useEffect(() => {
    if (board) onWidgets?.(types.split(','));
  }, [types]);
  const [draft, setDraft] = useState<BoardData | null>(null);
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  /** The JSON widget being edited: an existing id, or 'new' while adding one. */
  const [jsonEdit, setJsonEdit] = useState<string | null>(null);
  /** The widget whose settings drawer is open. */
  const [setting, setSetting] = useState<string | null>(null);
  /** Settings opened from the widget itself, outside Arrange: closing them saves. */
  const [quick, setQuick] = useState(false);
  /** Phones: the arrange bar's second row of tools, shown on request. */
  const [tools, setTools] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [error, setError] = useState('');
  /** A note about the last layout applied, such as what it left out. */
  const [notice, setNotice] = useState('');
  useEffect(() => {
    setDraft(null);
    setError('');
    setNotice('');
  }, [id]);
  const editing = draft !== null;
  // Unsaved arranging asks before it's thrown away: leaving the page, the
  // tab, or switching boards.
  const dirty = editing && !quick && JSON.stringify(draft) !== JSON.stringify(board);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('Leave without saving your changes to this board?')) blocker.proceed();
    else blocker.reset();
  }, [blocker.state]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const shown = draft ?? board;
  // Columns: the board's choice, fewer when the window can't fit them.
  const [boardEl, setBoardEl] = useState<HTMLDivElement | null>(null);
  const [boardW, setBoardW] = useState(0);
  useEffect(() => {
    if (!boardEl) return;
    setBoardW(boardEl.clientWidth);
    const ro = new ResizeObserver(() => setBoardW(boardEl.clientWidth));
    ro.observe(boardEl);
    return () => ro.disconnect();
  }, [boardEl]);
  const chosen = shown?.columns ?? DEFAULT_COLUMNS;
  const cols = boardW ? Math.min(chosen, Math.max(1, Math.floor((boardW + GAP_PX) / (MIN_COLUMN_PX + GAP_PX)))) : chosen;
  const { trim, posters, over } = useFit(!!shown?.fit && cols > 1, boardEl, shown?.widgets ?? NONE);
  const alignedHeights = useListCardAlignment(boardEl, shown?.widgets.map((w) => `${w.id}:${w.column ?? ''}:${w.span ?? ''}`).join(',') ?? '');
  const short = over;
  const sort = useDragSort('cell', () => {}, { onPoint: (drag, x, y) => {
    if (!boardEl || !draft) return;
    const rect = boardEl.getBoundingClientRect();
    const cells = [...boardEl.querySelectorAll<HTMLElement>(':scope > .cell')].map((el) => ({ id: el.id.slice(2), rect: el.getBoundingClientRect() }));
    const moving = draft.widgets.find((w) => w.id === drag);
    if (!moving) return;
    const span = Math.min(spanOf(moving, chosen), cols);
    const unit = (rect.width + GAP_PX) / cols;
    const column = Math.max(1, Math.min(cols - span + 1, Math.floor((x - rect.left) / unit) + 1));
    const peers = cells.filter((c) => c.id !== drag && c.rect.left < rect.left + (column - 1 + span) * unit - GAP_PX && c.rect.right > rect.left + (column - 1) * unit).sort((a, b) => a.rect.top - b.rect.top);
    const before = peers.find((c) => y < c.rect.top + c.rect.height / 2);
    const after = before ? null : peers.at(-1);
    setDraft((d) => {
      if (!d) return d;
      // Pin the current columns on the first placement, so other columns do
      // not get repacked merely because this card became shorter or moved.
      const ws = d.widgets.map((w) => {
        const cell = cells.find((c) => c.id === w.id);
        return { ...w, column: w.id === drag ? column : w.column ?? (cell ? Math.round((cell.rect.left - rect.left) / unit) + 1 : undefined) };
      });
      const from = ws.findIndex((w) => w.id === drag);
      const [widget] = ws.splice(from, 1);
      const target = before ? ws.findIndex((w) => w.id === before.id) : after ? ws.findIndex((w) => w.id === after.id) + 1 : Math.min(from, ws.length);
      ws.splice(Math.max(0, target), 0, widget);
      return JSON.stringify(ws) === JSON.stringify(d.widgets) ? d : { ...d, widgets: ws };
    });
  } });
  if (missing)
    return (
      <Empty>
        That board was deleted. <Link to="/">Back to {snap?.boards?.[0]?.name ?? 'Home'}</Link>
      </Empty>
    );
  if (!shown) return <div className="board board-loading" aria-busy="true" />;

  const update = (fn: (w: Widget[]) => Widget[]) => setDraft((d) => (d ? { ...d, widgets: fn(d.widgets) } : d));
  const move = (from: number, to: number) =>
    update((ws) => {
      if (to < 0 || to >= ws.length || from === to) return ws;
      const next = [...ws];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  const visibleWidgets = shown.widgets.filter((w) => w.type !== 'attention' || w.config?.style === 'card' || homeStatusSize === 'hidden');
  const home = id === HOME_ID;
  /** Apps shown as tiles, which take far more room than icons. */
  const tiles = shown.widgets.some((w) => w.type === 'apps' && (w.config?.style || homeApps) !== 'patchbay');

  return (
    <div className={`board-wrap ${editing ? 'is-editing' : ''}`}>
      {/* Editing pins the arrange bar to the top; otherwise Customize waits
          at the foot of the board and the widgets start right under the masthead. */}
      {editing && (
        <div className="board-bar">
          <div className="board-bar-row">
            <input
              className="field board-name"
              // Arrange took focus from a button that is now inert: land here instead.
              autoFocus={!quick}
              aria-label="Board name"
              maxLength={32}
              value={draft.name ?? (home ? 'Home' : '')}
              placeholder="Name this board"
              onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
            />
            <span className="board-bar-hint">Drag into a column, then above or below another card. Hover or focus for controls.</span>
            {error && <span className="crit-text" role="alert">{error}</span>}
            {notice && !error && <span className="drawer-note">{notice}</span>}
            <button type="button" className="text-button board-tools-toggle" aria-expanded={tools} onClick={() => setTools(!tools)}>
              {tools ? 'Fewer tools' : 'Tools'}
            </button>
            <button type="button" className="text-button" onClick={() => (setDraft(null), setNotice(''))}>
              Cancel
            </button>
            <button
              type="button"
              className="button board-save"
              onClick={async () => {
                const err = await save({ ...draft, name: draft.name?.trim() || undefined });
                if (err) setError(err);
                else setDraft(null);
              }}
            >
              Save
            </button>
          </div>
          <div className={`board-bar-row board-bar-tools ${tools ? 'is-open' : ''}`}>
            <button type="button" className="button button-quiet" onClick={() => setAdding(true)}>
              Add widget
            </button>
            {draft.widgets.filter((w) => w.type === 'attention' && w.config?.style !== 'card' && homeStatusSize !== 'hidden').map((w) => (
              <button key={w.id} type="button" className="button button-quiet" onClick={() => setSetting(w.id)}>Needs attention settings</button>
            ))}
            <span className="board-cols" role="group" aria-label="Columns">
              <span>Columns</span>
              <span className="seg">
                {[2, 3, 4, 5, 6].map((n) => (
                  <button key={n} type="button" aria-pressed={chosen === n} onClick={() => setDraft((d) => (d ? { ...d, columns: n } : d))}>
                    {n}
                  </button>
                ))}
              </span>
              {cols < chosen && <small>{cols} fit in this window</small>}
            </span>
            <label className="check board-fit" title="Lists show fewer items so the board ends at the bottom of the window. Phones still scroll.">
              <input type="checkbox" checked={!!draft.fit} onChange={(e) => setDraft((d) => (d ? { ...d, fit: e.target.checked || undefined } : d))} />
              Fit the window
            </label>
            {draft.fit && short > 4 && (
              <span className="drawer-note">
                {short < 120 ? 'A little too tall to fit, even with lists at their shortest.' : 'Too tall to fit, even with lists at their shortest.'} {tiles ? 'Apps as icons, or moving a widget to another board, would make room.' : 'Moving a widget to another board would make room.'}
              </span>
            )}
            <select
              className="field starter-pick"
              aria-label="Start over from a layout"
              value=""
              onChange={(e) => {
                const st = STARTERS.find((x) => x.id === e.target.value);
                if (!st) return;
                setDraft({ ...forThisServer(st.board, snap), name: draft.name });
                const gone = leftOut(st.board, snap);
                setNotice(gone.length ? `Left out ${gone.join(', ')} until their integrations are set up.` : '');
              }}
            >
              <option value="" disabled>
                Start over from a layout
              </option>
              {STARTERS.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}: {st.about}
                </option>
              ))}
            </select>
            {home ? (
              <HoldButton
                className="text-button"
                danger
                hint="Hold to reset"
                onConfirm={async () => {
                  const err = await save(null);
                  if (err) setError(err);
                  else setDraft(null);
                }}
              >
                Reset to default
              </HoldButton>
            ) : (
              <HoldButton
                className="text-button"
                danger
                hint="Hold to delete"
                onConfirm={async () => {
                  const err = await save(null);
                  if (err) return setError(err);
                  setDraft(null);
                  navigate('/');
                }}
              >
                Delete this board
              </HoldButton>
            )}
          </div>
        </div>
      )}

      <div className="board" ref={setBoardEl} data-cols={cols} data-fit={!!shown.fit && cols > 1 || undefined} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {visibleWidgets.map((w) => {
          const peers = w.column ? visibleWidgets.filter((other) => other.column === w.column) : visibleWidgets;
          return (<Cell
            key={w.id}
            w={w}
            editing={editing}
            index={peers.indexOf(w)}
            count={peers.length}
            span={Math.min(spanOf(w, chosen), cols)}
            cols={cols}
            chosen={chosen}
            limit={trim[w.id]}
            posterHeight={posters[w.id]}
            alignedHeight={alignedHeights[w.id]}
            onMove={(from, to) => {
              if (peers[from] && peers[to]) move(shown.widgets.indexOf(peers[from]), shown.widgets.indexOf(peers[to]));
            }}
            onSpan={(n) => update((ws) => ws.map((x) => (x.id === w.id ? { ...x, span: n } : x)))}
            onRemove={() => update((ws) => ws.filter((x) => x.id !== w.id))}
            onConfigure={() => (w.type === 'json' ? setJsonEdit(w.id) : setSetting(w.id))}
            onQuick={snap?.readOnly || editing || w.type === 'json' || !board ? undefined : () => (setError(''), setNotice(''), setDraft(structuredClone(board)), setQuick(true), setSetting(w.id))}
            bind={editing ? sort.bind(w.id) : undefined}
            dragging={sort.dragging === w.id}
          >
            <WidgetBody w={w} board={id} now={now} editing={editing} downloadsOnBoard={shown.widgets.some((x) => x.type === 'downloads')} saved={!!board?.widgets.some((x) => x.id === w.id && x.config?.json === w.config?.json)} />
          </Cell>);
        })}
      </div>

      <div className="board-foot" inert={editing || undefined}>
          <Link className="text-button board-header-settings" to="/settings?tab=home#home-header">Header settings</Link>
          {!snap?.readOnly && <><button type="button" className="text-button board-customize" onClick={() => (setError(''), setNotice(''), setDraft(structuredClone(board!)))}>
            Arrange board
          </button>
          <button type="button" className="text-button board-customize" onClick={() => setCreating(true)}>
            New board
          </button></>}
        </div>

      {creating && <NewBoard onClose={() => setCreating(false)} />}

      {adding && draft && (
        <AddDrawer
          board={draft}
          onClose={() => setAdding(false)}
          onAdd={(w) => {
            setAdding(false);
            if (w.type === 'json') setJsonEdit('new');
            else {
              update((ws) => [...ws, w]);
              // Show where it landed, with its controls ready.
              setTimeout(() => {
                const el = document.getElementById(`w-${w.id}`);
                el?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
                el?.querySelector<HTMLElement>('.cell-tools button')?.focus({ preventScroll: true });
              }, 60);
            }
          }}
        />
      )}

      {setting && draft && draft.widgets.some((x) => x.id === setting) && (
        <SettingsDrawer
          w={draft.widgets.find((x) => x.id === setting)!}
          onCancel={quick ? () => (setSetting(null), setQuick(false), setDraft(null)) : undefined}
          onClose={() => {
            setSetting(null);
            if (!quick) return;
            setQuick(false);
            const d = draftRef.current;
            if (d) void save(d).then((err) => (err ? setError(err) : setDraft(null)));
          }}
          columns={chosen}
          onColumn={(column) => update((ws) => ws.map((x) => x.id === setting ? { ...x, column } : x))}
          onChange={(cfg) => update((ws) => ws.map((x) => (x.id === setting ? { ...x, config: cfg } : x)))}
          onSpan={(n) => update((ws) => ws.map((x) => (x.id === setting ? { ...x, span: n } : x)))}
        />
      )}

      {jsonEdit && draft && (
        <JsonEditor
          initial={jsonEdit === 'new' ? null : parseConfig(draft.widgets.find((x) => x.id === jsonEdit)?.config?.json)}
          onClose={() => setJsonEdit(null)}
          onSave={(json) => {
            if (jsonEdit === 'new') {
              let n = 1;
              while (draft.widgets.some((x) => x.id === `api-${n}`)) n++;
              update((ws) => [...ws, { id: `api-${n}`, type: 'json', size: 's', config: { json } }]);
            } else {
              update((ws) => ws.map((x) => (x.id === jsonEdit ? { ...x, config: { json } } : x)));
            }
            setJsonEdit(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * One widget on the grid. It measures its content and spans that many 4px
 * rows, which is what lets the grid pack like masonry.
 */
function Cell(props: {
  w: Widget;
  editing: boolean;
  index: number;
  count: number;
  /** Columns spanned now, and the board's columns now and as chosen. */
  span: number;
  cols: number;
  chosen: number;
  /** Items shown when fitting the window trimmed this widget. */
  limit?: number;
  posterHeight?: number;
  alignedHeight?: number;
  children: ReactNode;
  onMove: (from: number, to: number) => void;
  onSpan: (n: number) => void;
  onRemove: () => void;
  onConfigure?: () => void;
  /** Settings from the widget itself, outside Arrange. */
  onQuick?: () => void;
  /** Drag-sort props while editing. */
  bind?: Record<string, unknown>;
  dragging: boolean;
}) {
  const { w, editing, index, count } = props;
  const inner = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(1);
  const [resizing, setResizing] = useState(false);
  const info = WIDGET_INFO[w.type];

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    // Measure in layout pixels. getBoundingClientRect is scaled by the density
    // setting's CSS zoom, but grid rows are not, so divide the zoom back out;
    // otherwise every widget comes up short and the next one overlaps it.
    const measure = () => {
      const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
      const body = el.querySelector<HTMLElement>('.cell-body');
      const content = body?.firstElementChild;
      const alignable = w.type === 'feeds' || w.type === 'upcoming';
      const style = body && getComputedStyle(body);
      const natural = alignable && content && style
        ? content.getBoundingClientRect().height / zoom + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 24
        : el.getBoundingClientRect().height / zoom;
      setRows(Math.max(1, Math.ceil(Math.max(natural, props.alignedHeight ?? 0) / 4)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const content = el.querySelector('.cell-body')?.firstElementChild;
    if (content) ro.observe(content);
    return () => ro.disconnect();
  }, [props.alignedHeight]);

  return (
    <div
      {...(props.bind ?? {})}
      className={`cell ${props.dragging ? 'is-dragging' : ''} ${resizing ? 'is-resizing' : ''}`}
      data-span={props.span}
      data-type={w.type}
      id={`w-${w.id}`}
      style={{ gridRowEnd: `span ${rows}`, gridColumn: w.column ? `${Math.max(1, Math.min(w.column, props.cols - props.span + 1))} / span ${props.span}` : `span ${props.span}` }}
    >
      <div ref={inner} className="cell-inner">
        {editing && (
          <div className="cell-tools" role="toolbar" aria-label={`${info.name} widget`}>
            <span className="cell-handle" data-grip="cell" title="Drag to move" aria-hidden>
              ⠿
            </span>
            <span className="cell-name">
              {info.name}
              {w.config?.title
                ? `: ${w.config.title}`
                : w.config?.container
                  ? `: ${w.config.container}`
                  : w.config?.json
                    ? `: ${parseConfig(w.config.json)?.title ?? ''}`
                    : ''}
            </span>
            <span className="cell-sizes" role="group" aria-label="Columns wide">
              {Array.from({ length: props.chosen }, (_, k) => k + 1).map((n) => (
                <button key={n} type="button" aria-pressed={spanOf(w, props.chosen) === n} title={`${n} of ${props.chosen} columns`} onClick={() => props.onSpan(n)}>
                  {spanLabel(n, props.chosen)}
                </button>
              ))}
            </span>
            <button type="button" className="cell-btn" disabled={index === 0} onClick={() => props.onMove(index, index - 1)} aria-label="Move earlier">
              {props.cols === 1 ? '↑' : '←'}
            </button>
            <button type="button" className="cell-btn" disabled={index === count - 1} onClick={() => props.onMove(index, index + 1)} aria-label="Move later">
              {props.cols === 1 ? '↓' : '→'}
            </button>
            {props.onConfigure && (
              <button type="button" className="cell-btn cell-settings" onClick={props.onConfigure} aria-label={`${info.name} settings`} title="Name, width, items, look">
                Settings
              </button>
            )}
            {info.removable && (
              <button type="button" className="cell-btn cell-remove" onClick={props.onRemove} aria-label={`Remove ${info.name}`}>
                ×
              </button>
            )}
          </div>
        )}
        {editing && props.cols > 1 && (
          <span
            className="cell-resize"
            role="presentation"
            title="Drag to resize"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const handle = e.currentTarget;
              const cell = handle.closest('.cell') as HTMLElement;
              const left = cell.getBoundingClientRect().left;
              const width = (cell.parentElement as HTMLElement).getBoundingClientRect().width;
              let current = props.span;
              handle.setPointerCapture(e.pointerId);
              setResizing(true);
              const onMove = (ev: PointerEvent) => {
                const frac = (ev.clientX - left) / width;
                const best = Math.min(props.cols, Math.max(1, Math.round(frac * props.cols)));
                if (best !== current) {
                  current = best;
                  props.onSpan(best);
                }
              };
              const done = () => {
                handle.removeEventListener('pointermove', onMove);
                handle.removeEventListener('pointerup', done);
                handle.removeEventListener('pointercancel', done);
                setResizing(false);
              };
              handle.addEventListener('pointermove', onMove);
              handle.addEventListener('pointerup', done);
              handle.addEventListener('pointercancel', done);
            }}
          >
            <span className="cell-resize-size">
              {props.span} of {props.cols}
            </span>
          </span>
        )}
        <div className="cell-body" inert={editing || undefined} style={{ minHeight: props.alignedHeight ? `${props.alignedHeight - 24}px` : undefined, '--fit-poster-height': props.posterHeight ? `${props.posterHeight}px` : undefined } as CSSProperties}>
          <WidgetCtx.Provider
            value={{
              title: w.config?.title,
              limit: props.limit ?? (w.config?.limit ? Number(w.config.limit) : undefined),
              style: w.config?.style,
              days: w.config?.days ? Number(w.config.days) : undefined,
              editing,
              configure: props.onQuick,
            }}
          >
            {props.children}
          </WidgetCtx.Provider>
        </div>
      </div>
    </div>
  );
}

function WidgetBody({ w, board, now, saved, editing, downloadsOnBoard }: { w: Widget; board: string; now: number; saved: boolean; editing?: boolean; downloadsOnBoard?: boolean }) {
  const { snap } = useStore();
  const { homeApps, homeStatusSize } = useAppearance();
  if (!snap) return null;
  switch (w.type) {
    case 'apps':
      return (w.config?.style || homeApps) === 'patchbay' ? <PatchRow names={w.config?.names === 'show'} /> : <AppTiles legend />;
    case 'attention':
      if (w.config?.style !== 'card' && homeStatusSize !== 'hidden')
        return editing ? (
          <Section title="Needs attention" className="attention">
            <p className="settings-note">Shows in the header, under the status line. Its settings put it back on the board as a card.</p>
          </Section>
        ) : null;
      return <Attention alerts={snap.alerts} now={now} />;
    case 'vitals':
      return <Vitals />;
    case 'now':
      return <NowPlaying downloads={!downloadsOnBoard} />;
    case 'upcoming':
      return <UpcomingBrief now={now} />;
    case 'inbox':
      return <Inbox now={now} />;
    case 'feeds':
      return <FeedsBrief now={now} />;
    case 'changes':
      return <Changes changes={snap.changes} now={now} />;
    case 'recent':
      return <RecentlyAdded now={now} />;
    case 'nextup':
      return <NextUp />;
    case 'homeassistant':
      return <HomeAssistantWidget entities={w.config?.entities} />;
    case 'car':
      return <CarWidget />;
    case 'wake':
      return <WakeWidget />;
    case 'uptime':
      return <UptimeWidget now={now} />;
    case 'dns':
      return <DnsWidget now={now} />;
    case 'speed':
      return <SpeedWidget now={now} />;
    case 'photos':
      return <PhotosWidget />;
    case 'proxmox':
      return <ProxmoxWidget now={now} />;
    case 'drives':
      return <DrivesWidget now={now} />;
    case 'sync':
      return <SyncWidget now={now} />;
    case 'hosts':
      return <HostsWidget />;
    case 'power':
      return <PowerWidget />;
    case 'storage':
      return <StorageWidget />;
    case 'dockerhosts':
      return <DockerHostsWidget />;
    case 'network':
      return <NetworkWidget now={now} />;
    case 'calendar':
      return <CalendarWidget now={now} />;
    case 'notes':
      return <NotesWidget id={noteKey(board, w.id)} />;
    case 'books':
      return <BooksWidget />;
    case 'requests':
      return <RequestsWidget now={now} />;
    case 'downloads':
      return <DownloadsWidget />;
    case 'watched':
      return <WatchedWidget now={now} />;
    case 'cameras':
      return <CamerasWidget config={w.config} now={now} />;
    case 'bookmarks':
      return <BookmarksWidget />;
    case 'search':
      return <SearchWidget config={w.config} />;
    case 'clocks':
      return <ClocksWidget config={w.config} now={now} />;
    case 'rss':
      return <RssWidget board={board} id={w.id} config={w.config} now={now} />;
    case 'releases':
      return <ReleasesWidget board={board} id={w.id} config={w.config} now={now} />;
    case 'listening':
      return <ListeningWidget now={now} />;
    case 'container':
      return <ContainerWidget name={w.config?.container ?? ''} />;
    case 'json':
      return <JsonWidgetView board={board} id={w.id} json={w.config?.json} saved={saved} />;
    case 'weather':
      return <WeatherWidget />;
  }
}

/** The server at a glance, each number with its last 24 hours, each leading to its own section. */
export function Vitals({ compact = false }: { compact?: boolean }) {
  const limits = useLimits();
  const { data: sys } = useSource<SystemData>('system');
  const { data: nas } = useSource<TruenasData>('truenas');
  const h = useHistory(['cpu', 'mem.used'], 24, 120);
  if (!sys) return null;
  const pool = nas?.pools.slice().sort((a, b) => b.sizeBytes - a.sizeBytes)[0];
  const storage = pool?.usedPct ?? sys.pool?.usedPct ?? null;
  const m = sys.mem;
  const used = m ? Math.max(0, m.total - m.available - m.arc) : 0;
  return (
    <Section title="Server" action={{ label: 'Details', to: '/server' }} className="vitals-widget">
      <div className="vw-grid">
        <Link to="/server#cpu" className="vw" title="CPU by hour, and what's using it">
          <Roll className="vw-num" value={pct(sys.cpuPct)} />
          <span className="vw-label">CPU</span>
          <Spark data={h.cpu} max={100} height={compact ? 16 : 22} label="CPU, last 24 hours" />
        </Link>
        {m && (
          <Link to="/server#resources" className="vw" title="What memory goes to">
            <Roll className="vw-num" value={size(used)} />
            <span className="vw-label">Memory in use</span>
            <Split
              label="Memory: in use, ZFS cache, free"
              parts={[
                { value: used, tone: 'ink', title: `In use ${size(used)}` },
                { value: m.arc, tone: 'mid', title: `ZFS cache ${size(m.arc)}` },
                { value: Math.max(0, m.available), tone: 'faint', title: `Free ${size(m.available)}` },
              ]}
            />
          </Link>
        )}
        {storage != null && (
          <Link to={pool ? `/server#storage-${encodeURIComponent(pool.name)}` : '/server#storage'} className="vw" title="Space, growth and snapshots">
            <Roll className="vw-num" value={`${Math.round(storage)}%`} />
            <span className="vw-label" title={pool ? `Storage on ${pool.name}` : 'Storage'}>Storage{pool ? ` on ${pool.name}` : ''}</span>
            <Meter label={pool ? `Storage used on ${pool.name}` : 'Storage used'} value={storage} level={storageLevel(storage, limits)} />
          </Link>
        )}
        {/* Uptime has nowhere more to say, so it isn't a link. */}
        <div className="vw" title={`Up since ${new Date(Date.now() - sys.uptimeSec * 1000).toLocaleString()}`}>
          <Roll className="vw-num" value={uptime(sys.uptimeSec)} />
          <span className="vw-label">Uptime</span>
        </div>
      </div>
    </Section>
  );
}

/** Any container's numbers: CPU, memory, how fast it answers, two weeks of health. */
function ContainerWidget({ name }: { name: string }) {
  const { snap } = useStore();
  const { data: stats } = useSource<StatsData>('stats');
  const up = useJson<UptimeData>('/api/uptime?days=14', 5 * 60_000).data;
  const h = useHistory([`ctr.cpu:${name}`], 24, 96);
  if (!snap) return null;
  const c = containerMap(snap).get(name);
  const svc = serviceFor(snap, name);
  const ck = svc ? checkFor(snap, svc.name) : undefined;
  const s = stats?.containers[name];
  const running = c?.state === 'running';
  return (
    <section className={`section cw ${!c ? '' : running ? '' : 'is-down'}`}>
      <Link to={`/c/${name}`} className="cw-head">
        {svc?.icon && <Icon name={svc.name} icon={svc.icon} size={22} />}
        <span className="cw-name">{svc?.name ?? name}</span>
        <span className="cw-state">{!c ? 'Not found' : running ? `Up ${shortStatus(c)}` : c.status}</span>
      </Link>
      {!running ? (
        <p className="cw-nums">{c ? 'Not running, so no CPU or memory to show.' : 'No container by this name. Remove this widget or pick another.'}</p>
      ) : (
      <div className="cw-nums">
        <span>
          <b>{s ? pct(s.cpu) : '...'}</b> CPU
        </span>
        <span>
          <b>{s ? size(s.memBytes) : '...'}</b> memory
        </span>
        {ck && (
          <span>
            <b className={ck.ok ? '' : 'warn-text'}>{ck.ok ? `${ck.ms} ms` : ck.error}</b> {ck.ok ? 'to answer' : ''}
          </span>
        )}
      </div>
      )}
      {running && <Spark data={h[`ctr.cpu:${name}`]} height={20} label={`${name} CPU, last 24 hours`} />}
      <HealthStrip states={up?.containers[name]} days={up?.days ?? []} label={`${name}, last 14 days`} />
    </section>
  );
}

/** Name a new board and pick what it starts with; it opens once made. */
function NewBoard({ onClose }: { onClose: () => void }) {
  const { snap } = useStore();
  const navigate = useNavigate();
  const modal = useModal<HTMLFormElement>(onClose);
  const [name, setName] = useState('');
  const [pick, setPick] = useState('empty');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const choices = [{ id: 'empty', name: 'Empty', about: 'Nothing yet. Add the widgets you want.', board: EMPTY_BOARD }, ...STARTERS];
  const create = async () => {
    const clean = cleanBoardName(name);
    if (!clean) return setError('Give it a name');
    const st = choices.find((c) => c.id === pick) ?? choices[0];
    setBusy(true);
    const res = await fetch('/api/boards', { method: 'POST', headers: ACTION, body: JSON.stringify({ ...forThisServer(st.board, snap), name: clean }) });
    const body = (await res.json()) as { id?: string; error?: string };
    setBusy(false);
    if (!res.ok || !body.id) return setError(body.error ?? `HTTP ${res.status}`);
    onClose();
    navigate(`/b/${body.id}`);
  };
  return (
    <div className="palette-backdrop" onClick={onClose}>
      <form
        className="palette drawer"
        role="dialog"
        ref={modal}
        aria-label="New board"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <header className="drawer-head">
          <h2>New board</h2>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </header>
        <input className="field palette-input" aria-label="Board name" placeholder="Name, like Media or Server room" maxLength={32} value={name} onChange={(e) => (setName(e.target.value), setError(''))} autoFocus />
        <p className="drawer-sub">Start with</p>
        <ul className="drawer-list" aria-label="Start with">
          {choices.map((c) => (
            <li key={c.id}>
              <button type="button" aria-pressed={pick === c.id} onClick={() => setPick(c.id)}>
                <strong>{c.name}</strong>
                <span>{c.about}</span>
              </button>
            </li>
          ))}
        </ul>
        <footer className="drawer-foot">
          {(() => {
            const gone = leftOut((choices.find((c) => c.id === pick) ?? choices[0]).board, snap);
            return gone.length ? <span className="drawer-note">Leaves out {gone.join(', ')} until their integrations are set up.</span> : null;
          })()}
          {error && <span className="crit-text" role="alert">{error}</span>}
          <button type="submit" className="button board-save" disabled={busy}>
            {busy ? 'Creating...' : 'Create board'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function AddDrawer({ board, onClose, onAdd }: { board: BoardData; onClose: () => void; onAdd: (w: Widget) => void }) {
  const { snap } = useStore();
  const modal = useModal<HTMLDivElement>(onClose);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const [find, setFind] = useState('');
  const present = new Set(board.widgets.map((w) => w.type));
  // Search by name or by what it shows: "plex", "disk", "camera".
  const matches = (t: WidgetType) => {
    const f = find.trim().toLowerCase();
    return !f || `${WIDGET_INFO[t].name} ${WIDGET_INFO[t].about} ${NEEDS[t]?.label ?? ''}`.toLowerCase().includes(f);
  };
  // Integration widgets appear once their integration is on, so nothing lands empty.
  const ready = widgetReady(snap);
  const open = (Object.keys(WIDGET_INFO) as WidgetType[]).filter((t) => WIDGET_INFO[t].multiple || !present.has(t));
  const types = open.filter((t) => ready[t] !== false && matches(t));
  // The rest wait on an integration: listed after, each leading to its setup.
  const waiting = open.filter((t) => ready[t] === false && matches(t));
  const containers = [...containerMap(snap).values()].filter((c) => c.name.includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const id = (base: string) => {
    let n = 1;
    while (board.widgets.some((w) => w.id === `${base}-${n}`)) n++;
    return `${base}-${n}`;
  };

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette drawer" ref={modal} role="dialog" aria-label="Add a widget" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <h2>{picking ? 'Which container?' : 'Add a widget'}</h2>
          <button type="button" className="text-button" onClick={picking ? () => setPicking(false) : onClose}>
            {picking ? 'Back' : 'Close'}
          </button>
        </header>
        {!picking && (
          <input className="field palette-input" type="search" placeholder="Search widgets: plex, disks, cameras" aria-label="Search widgets" value={find} onChange={(e) => setFind(e.target.value)} autoFocus />
        )}
        {!picking ? (
          <ul className="drawer-list">
            {types.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => (t === 'container' ? setPicking(true) : onAdd({ id: WIDGET_INFO[t].multiple ? id(t) : t, type: t, size: WIDGET_INFO[t].size }))}
                >
                  <strong>{WIDGET_INFO[t].name}</strong>
                  <span>{WIDGET_INFO[t].about}</span>
                </button>
              </li>
            ))}
            {types.length === 0 && waiting.length === 0 && <li className="settings-note">{find.trim() ? `No widget matches "${find.trim()}".` : 'Everything is already on the board.'}</li>}
            {waiting.length > 0 && <li className="drawer-sub">Set up first</li>}
            {waiting.map((t) => (
              <li key={t} className="is-waiting">
                <Link to={setupHref(t)} onClick={onClose}>
                  <strong>{WIDGET_INFO[t].name}</strong>
                  <span>Needs {NEEDS[t]?.label}. Set it up</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <input className="field palette-input" placeholder="Filter containers" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            <ul className="drawer-list drawer-containers">
              {containers.map((c) => (
                <li key={c.name}>
                  <button type="button" onClick={() => onAdd({ id: id('ctr'), type: 'container', size: 's', config: { container: c.name } })}>
                    <strong className="mono">{c.name}</strong>
                    <span>{c.project ? `${c.project} stack` : c.image}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * One widget's settings: its name, width, how many items, its look. Changes
 * go into the draft board; Save on the board bar keeps them.
 */
function SettingsDrawer({
  w,
  onColumn,
  columns,
  onClose,
  onChange,
  onSpan,
  onCancel,
}: {
  w: Widget;
  columns: number;
  onClose: () => void;
  /** Opened from the widget itself: Escape and Cancel throw the change away; Save keeps it. */
  onCancel?: () => void;
  onChange: (cfg: Record<string, string> | undefined) => void;
  onSpan: (n: number) => void;
  onColumn: (n: number | undefined) => void;
}) {
  const dismiss = onCancel ?? onClose;
  const modal = useModal<HTMLDivElement>(dismiss);
  const info = WIDGET_INFO[w.type];
  const o = info.options;
  const cfg = w.config ?? {};
  // Apps: the look in effect, this widget's own or the Settings default it follows.
  const { homeApps } = useAppearance();
  const appsLook = cfg.style || homeApps;
  const limitN = Number(cfg.limit);
  const badLimit = !!o.limit && !!cfg.limit && !(Number.isInteger(limitN) && limitN >= o.limit[1] && limitN <= o.limit[2]);
  const set = (k: string, v: string) => {
    const next = { ...cfg, [k]: v };
    if (!v) delete next[k];
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <div className="palette-backdrop" onClick={dismiss}>
      <div className="palette drawer widget-settings" ref={modal} role="dialog" aria-label={`${info.name} settings`} onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <h2>{cfg.title || info.name}</h2>
          {onCancel ? (
            <span className="drawer-head-actions">
              <button type="button" className="text-button" onClick={onCancel}>
                Cancel
              </button>
              <button type="button" className="button board-save" onClick={onClose}>
                Save
              </button>
            </span>
          ) : (
            <button type="button" className="button board-save" onClick={onClose} title="Back to the board; its Save keeps this">
              Done
            </button>
          )}
        </header>
        <label className="settings-label">Column
          <select className="field" value={w.column ?? ''} onChange={(e) => onColumn(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">Automatic</option>
            {Array.from({ length: Math.max(1, columns - spanOf(w, columns) + 1) }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select>
        </label>
        <p className="settings-note">{info.about}</p>
        <div className="ws-form">
          {o.title !== false && (
            <label>
              <span>Name</span>
              <input className="field" value={cfg.title ?? ''} maxLength={40} placeholder={info.name} onChange={(e) => set('title', e.target.value)} />
            </label>
          )}
          <div className="ws-row">
            <span>Columns wide, of {columns}</span>
            <span className="seg" role="group" aria-label="Columns wide">
              {Array.from({ length: columns }, (_, k) => k + 1).map((n) => (
                <button key={n} type="button" aria-pressed={spanOf(w, columns) === n} onClick={() => onSpan(n)}>
                  {spanLabel(n, columns)}
                </button>
              ))}
            </span>
          </div>
          {o.limit && (
            <label>
              <span>Items to show, {o.limit[1]} to {o.limit[2]}</span>
              <input
                className="field"
                type="number"
                min={o.limit[1]}
                max={o.limit[2]}
                value={cfg.limit ?? ''}
                placeholder={String(o.limit[0])}
                aria-invalid={badLimit || undefined}
                onChange={(e) => set('limit', e.target.value)}
              />
              {badLimit && (
                <small className="ws-hint warn-text" role="alert">
                  Use a whole number from {o.limit[1]} to {o.limit[2]}. Until then it shows {o.limit[0]}.
                </small>
              )}
            </label>
          )}
          {(o.fields ?? []).map((f) =>
            f.choices ? (
              <label key={f.key}>
                <span>{f.label}</span>
                <select className="field" value={cfg[f.key] ?? f.choices[0][0]} onChange={(e) => set(f.key, e.target.value)}>
                  {f.choices.map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label key={f.key}>
                <span>{f.label}</span>
                {f.multiline ? (
                  <textarea className="field" rows={4} value={cfg[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
                ) : (
                  <input className="field" value={cfg[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
                )}
                {cfg[f.key]?.trim() && f.check(cfg[f.key]) === null ? (
                  <small className="ws-hint warn-text" role="alert">
                    Nothing here can be used yet. {f.hint}
                  </small>
                ) : (
                  f.hint && <small className="ws-hint">{f.hint}</small>
                )}
              </label>
            ),
          )}
          {o.days && (
            <div className="ws-row">
              <span>Look ahead</span>
              <span className="seg" role="group" aria-label="Look ahead">
                {[
                  ['', 'One week'],
                  ['14', 'Two weeks'],
                ].map(([v, label]) => (
                  <button key={v} type="button" aria-pressed={(cfg.days ?? '') === v || (v === '' && cfg.days === '7')} onClick={() => set('days', v)}>
                    {label}
                  </button>
                ))}
              </span>
            </div>
          )}
          {o.styles && (
            <div className="ws-row">
              <span>Look</span>
              <span className="seg" role="group" aria-label="Look">
                {o.styles.map(([v, label]) => (
                  <button key={v} type="button" aria-pressed={(cfg.style ?? '') === v} onClick={() => set('style', v)}>
                    {v === '' && w.type === 'apps' ? `${label} (${homeApps === 'patchbay' ? 'icons' : 'tiles'})` : label}
                  </button>
                ))}
              </span>
            </div>
          )}
          {o.names && appsLook === 'patchbay' && (
            <div className="ws-row">
              <span>Names under icons</span>
              <span className="seg" role="group" aria-label="Names under icons">
                {[
                  ['', 'On hover'],
                  ['show', 'Always'],
                ].map(([v, label]) => (
                  <button key={v} type="button" aria-pressed={(cfg.names ?? '') === v} onClick={() => set('names', v)}>
                    {label}
                  </button>
                ))}
              </span>
            </div>
          )}
          {w.type === 'homeassistant' && <HaPicker value={cfg.entities} onChange={(v) => set('entities', v)} />}
          {w.type === 'apps' && (
            <p className="settings-note">
              <Link to="/apps?arrange=1">Edit apps</Link> reorders, regroups, renames, hides and adds apps. Save this board first; Edit apps saves on its own.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Weather as a card: now, the next 12 hours, three days. Opens the Weather page. */
function WeatherWidget() {
  const { state, data: w } = useSource<WeatherData>('weather');
  const { temp: unit, clock24 } = useAppearance();
  if (!state || !w) return null;
  const hours = (w.hours ?? []).slice(0, 12);
  const today = w.days[0];
  return (
    <Section title="Weather" count={w.label} action={{ label: 'Forecast', to: '/weather' }} className="weather-widget">
      <Link to="/weather" className="ww-now">
        <span className="ww-temp">{deg(w.tempNow, unit)}°</span>
        <span className="ww-text">
          {weatherText(w.codeNow)}
          {today && (
            <small>
              High {deg(today.high, unit)}°, low {deg(today.low, unit)}°{today.precipPct >= 30 ? `, ${today.precipPct}% rain` : ''}
            </small>
          )}
        </span>
      </Link>
      {(w.alerts ?? []).length > 0 && <Link to="/weather" className="ww-alert">{w.alerts![0].event}</Link>}
      {hours.length > 0 && (
        <div className="ww-hours">
          {hours.map((h, i) => (
            <span key={h.time} className="ww-hour" title={`${weatherText(h.code)}, ${h.precipPct}% rain`}>
              <b>{deg(h.temp, unit)}°</b>
              <i style={{ height: `${Math.max(2, h.precipPct * 0.28)}px` }} data-rain={h.precipPct >= 20 || undefined} />
              <small>{i === 0 ? 'Now' : new Date(h.time).toLocaleTimeString(undefined, { hour: 'numeric', hour12: !clock24 }).replace(/\s?([AP])M/i, (_m, a: string) => a.toLowerCase())}</small>
            </span>
          ))}
        </div>
      )}
      <ol className="ww-days">
        {w.days.slice(1, 4).map((d) => (
          <li key={d.date}>
            <span>{new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</span>
            <span className="ww-cond">{weatherText(d.code)}</span>
            <span className="mono">
              {deg(d.high, unit)}° <small>{deg(d.low, unit)}°</small>
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
}
