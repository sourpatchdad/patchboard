// The Home board: widgets on a 12-column grid, packed like masonry so tall
// and short widgets never leave ragged gaps. View mode has no handles at all.
// Customize enters edit mode: drag to reorder (or use the arrow buttons),
// pick a size, remove, add from the drawer; Save or Cancel. The board is
// stored on the server, so every device shows the same one; phones show it
// as a single column in the same order.

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { type Board as BoardData, DEFAULT_BOARD, WIDGET_INFO, type Widget, type WidgetSize, type WidgetType } from '../../shared/board.ts';
import { WidgetCtx } from './widget-context.ts';
import type { StatsData, SystemData, TruenasData, UptimeData } from '../../shared/types.ts';
import { AppTiles } from '../components/AppTiles.tsx';
import { PatchRow } from '../components/PatchRow.tsx';
import { Spark, Split } from '../components/Spark.tsx';
import { HealthStrip } from '../components/Squares.tsx';
import { Icon, Meter, Section } from '../components/ui.tsx';
import { useHistory, useJson } from '../lib/api.ts';
import { useAppearance } from '../lib/appearance.ts';
import { pct, size, uptime } from '../lib/format.ts';
import { checkFor, containerMap, serviceFor, shortStatus } from '../lib/services.ts';
import { useSource, useStore } from '../lib/store.tsx';
import { JsonEditor, JsonWidgetView, parseConfig } from './JsonWidget.tsx';
import { Attention, Changes, FeedsBrief, Inbox, NowPlaying, RecentlyAdded, UpcomingBrief } from '../views/Home.tsx';

const ACTION = { 'Content-Type': 'application/json', 'X-Patchboard': 'action' };
const SIZE_LABEL: Record<WidgetSize, string> = { s: 'A quarter of the row', m: 'A third', l: 'Half', w: 'Two thirds', xl: 'The full row' };
const SIZE_SHORT: Record<WidgetSize, string> = { s: '1/4', m: '1/3', l: '1/2', w: '2/3', xl: 'Full' };

function useBoard() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [custom, setCustom] = useState(false);
  useEffect(() => {
    void (async () => {
      try {
        const res = (await (await fetch('/api/board')).json()) as { board: BoardData; custom: boolean };
        setBoard(res.board);
        setCustom(res.custom);
      } catch {
        setBoard(DEFAULT_BOARD);
      }
    })();
  }, []);
  const save = async (b: BoardData | null): Promise<string | null> => {
    const res = await fetch('/api/board', { method: b ? 'PUT' : 'DELETE', headers: ACTION, body: b ? JSON.stringify(b) : undefined });
    const body = (await res.json()) as { board?: BoardData; custom?: boolean; error?: string };
    if (!res.ok || !body.board) return body.error ?? `HTTP ${res.status}`;
    setBoard(body.board);
    setCustom(!!body.custom);
    return null;
  };
  return { board, custom, save };
}

export function Board({ now }: { now: number }) {
  const { snap } = useStore();
  const { board, custom, save } = useBoard();
  const [draft, setDraft] = useState<BoardData | null>(null);
  const [adding, setAdding] = useState(false);
  /** The JSON widget being edited: an existing id, or 'new' while adding one. */
  const [jsonEdit, setJsonEdit] = useState<string | null>(null);
  /** The widget whose settings drawer is open. */
  const [setting, setSetting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const dragFrom = useRef<number | null>(null);
  const editing = draft !== null;
  const shown = draft ?? board;
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

  return (
    <div className={`board-wrap ${editing ? 'is-editing' : ''}`}>
      <div className="board-bar">
        {editing ? (
          <>
            <span className="board-bar-title">Arrange your board</span>
            <span className="board-bar-hint">Drag a widget by its handle, or use the arrows. Changes apply to every device.</span>
            <button type="button" className="button button-quiet" onClick={() => setAdding(true)}>
              Add widget
            </button>
            <button
              type="button"
              className="text-button"
              onClick={async () => {
                const err = await save(null);
                if (err) setError(err);
                else setDraft(null);
              }}
            >
              Reset to default
            </button>
            <button type="button" className="text-button" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="button board-save"
              onClick={async () => {
                const err = await save(draft);
                if (err) setError(err);
                else setDraft(null);
              }}
            >
              Save
            </button>
            {error && <span className="crit-text">{error}</span>}
          </>
        ) : snap?.readOnly ? null : (
          <button type="button" className="text-button board-customize" onClick={() => (setError(''), setDraft(structuredClone(board!)))}>
            {custom ? 'Customize' : 'Customize this board'}
          </button>
        )}
      </div>

      <div className="board">
        {shown.widgets.map((w, i) => (
          <Cell
            key={w.id}
            w={w}
            editing={editing}
            index={i}
            count={shown.widgets.length}
            onMove={move}
            onSize={(s) => update((ws) => ws.map((x) => (x.id === w.id ? { ...x, size: s } : x)))}
            onRemove={() => update((ws) => ws.filter((x) => x.id !== w.id))}
            onConfigure={() => (w.type === 'json' ? setJsonEdit(w.id) : setSetting(w.id))}
            onDragStart={() => (dragFrom.current = i)}
            onDrop={() => {
              if (dragFrom.current != null) move(dragFrom.current, i);
              dragFrom.current = null;
            }}
          >
            <WidgetBody w={w} now={now} saved={!!board?.widgets.some((x) => x.id === w.id && x.config?.json === w.config?.json)} />
          </Cell>
        ))}
      </div>

      {adding && draft && (
        <AddDrawer
          board={draft}
          onClose={() => setAdding(false)}
          onAdd={(w) => {
            setAdding(false);
            if (w.type === 'json') setJsonEdit('new');
            else update((ws) => [...ws, w]);
          }}
        />
      )}

      {setting && draft && draft.widgets.some((x) => x.id === setting) && (
        <SettingsDrawer
          w={draft.widgets.find((x) => x.id === setting)!}
          onClose={() => setSetting(null)}
          onChange={(cfg) => update((ws) => ws.map((x) => (x.id === setting ? { ...x, config: cfg } : x)))}
          onSize={(s) => update((ws) => ws.map((x) => (x.id === setting ? { ...x, size: s } : x)))}
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
  children: ReactNode;
  onMove: (from: number, to: number) => void;
  onSize: (s: WidgetSize) => void;
  onRemove: () => void;
  onConfigure?: () => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const { w, editing, index, count } = props;
  const inner = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(1);
  const [over, setOver] = useState(false);
  const info = WIDGET_INFO[w.type];

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    // Measure in layout pixels. getBoundingClientRect is scaled by the density
    // setting's CSS zoom, but grid rows are not, so divide the zoom back out;
    // otherwise every widget comes up short and the next one overlaps it.
    const measure = () => {
      const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
      setRows(Math.max(1, Math.ceil(el.getBoundingClientRect().height / zoom / 4)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      className={`cell ${over ? 'is-over' : ''}`}
      data-size={w.size}
      data-type={w.type}
      style={{ gridRowEnd: `span ${rows}` }}
      onDragOver={(e) => {
        if (!editing) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        props.onDrop();
      }}
    >
      <div ref={inner} className="cell-inner">
        {editing && (
          <div className="cell-tools" role="toolbar" aria-label={`${info.name} widget`}>
            <span className="cell-handle" draggable onDragStart={props.onDragStart} title="Drag to move" aria-hidden>
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
            <span className="cell-sizes" role="group" aria-label="Width">
              {info.sizes.map((s) => (
                <button key={s} type="button" aria-pressed={w.size === s} title={SIZE_LABEL[s]} onClick={() => props.onSize(s)}>
                  {SIZE_SHORT[s]}
                </button>
              ))}
            </span>
            <button type="button" className="cell-btn" disabled={index === 0} onClick={() => props.onMove(index, index - 1)} aria-label="Move earlier">
              ←
            </button>
            <button type="button" className="cell-btn" disabled={index === count - 1} onClick={() => props.onMove(index, index + 1)} aria-label="Move later">
              →
            </button>
            {props.onConfigure && (
              <button type="button" className="cell-btn" onClick={props.onConfigure} aria-label={`${info.name} settings`} title="Name, items, style">
                ⚙
              </button>
            )}
            {info.removable && (
              <button type="button" className="cell-btn cell-remove" onClick={props.onRemove} aria-label={`Remove ${info.name}`}>
                ×
              </button>
            )}
          </div>
        )}
        <div className="cell-body" inert={editing || undefined}>
          <WidgetCtx.Provider
            value={{
              title: w.config?.title,
              limit: w.config?.limit ? Number(w.config.limit) : undefined,
              style: w.config?.style,
              days: w.config?.days ? Number(w.config.days) : undefined,
            }}
          >
            {props.children}
          </WidgetCtx.Provider>
        </div>
      </div>
    </div>
  );
}

function WidgetBody({ w, now, saved }: { w: Widget; now: number; saved: boolean }) {
  const { snap } = useStore();
  const { homeApps } = useAppearance();
  if (!snap) return null;
  switch (w.type) {
    case 'apps':
      return (w.config?.style || homeApps) === 'patchbay' ? <PatchRow /> : <AppTiles legend />;
    case 'attention':
      return <Attention alerts={snap.alerts} now={now} />;
    case 'vitals':
      return <Vitals />;
    case 'now':
      return <NowPlaying />;
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
    case 'container':
      return <ContainerWidget name={w.config?.container ?? ''} />;
    case 'json':
      return <JsonWidgetView id={w.id} json={w.config?.json} saved={saved} />;
  }
}

/** The server at a glance, each number with its last 24 hours. */
function Vitals() {
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
        <div className="vw">
          <span className="vw-num">{pct(sys.cpuPct)}</span>
          <span className="vw-label">CPU</span>
          <Spark data={h.cpu} max={100} height={22} label="CPU, last 24 hours" />
        </div>
        {m && (
          <div className="vw">
            <span className="vw-num">{size(used)}</span>
            <span className="vw-label">Memory in use</span>
            <Split
              label="Memory: in use, ZFS cache, free"
              parts={[
                { value: used, tone: 'ink', title: `In use ${size(used)}` },
                { value: m.arc, tone: 'mid', title: `ZFS cache ${size(m.arc)}` },
                { value: Math.max(0, m.available), tone: 'faint', title: `Free ${size(m.available)}` },
              ]}
            />
          </div>
        )}
        {storage != null && (
          <div className="vw">
            <span className="vw-num">{Math.round(storage)}%</span>
            <span className="vw-label">Storage{pool ? ` on ${pool.name}` : ''}</span>
            <Meter value={storage} level={storage >= 95 ? 'crit' : storage >= 85 ? 'warn' : 'ok'} />
          </div>
        )}
        <div className="vw">
          <span className="vw-num">{uptime(sys.uptimeSec)}</span>
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

function AddDrawer({ board, onClose, onAdd }: { board: BoardData; onClose: () => void; onAdd: (w: Widget) => void }) {
  const { snap } = useStore();
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const present = new Set(board.widgets.map((w) => w.type));
  const types = (Object.keys(WIDGET_INFO) as WidgetType[]).filter((t) => WIDGET_INFO[t].multiple || !present.has(t));
  const containers = [...containerMap(snap).values()].filter((c) => c.name.includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const id = (base: string) => {
    let n = 1;
    while (board.widgets.some((w) => w.id === `${base}-${n}`)) n++;
    return `${base}-${n}`;
  };

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette drawer" role="dialog" aria-label="Add a widget" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <h2>{picking ? 'Which container?' : 'Add a widget'}</h2>
          <button type="button" className="text-button" onClick={picking ? () => setPicking(false) : onClose}>
            {picking ? 'Back' : 'Close'}
          </button>
        </header>
        {!picking ? (
          <ul className="drawer-list">
            {types.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => (t === 'container' ? setPicking(true) : onAdd({ id: t, type: t, size: WIDGET_INFO[t].size }))}
                >
                  <strong>{WIDGET_INFO[t].name}</strong>
                  <span>{WIDGET_INFO[t].about}</span>
                </button>
              </li>
            ))}
            {types.length === 0 && <li className="settings-note">Everything is already on the board.</li>}
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
function SettingsDrawer({ w, onClose, onChange, onSize }: { w: Widget; onClose: () => void; onChange: (cfg: Record<string, string> | undefined) => void; onSize: (s: WidgetSize) => void }) {
  const info = WIDGET_INFO[w.type];
  const o = info.options;
  const cfg = w.config ?? {};
  const set = (k: string, v: string) => {
    const next = { ...cfg, [k]: v };
    if (!v) delete next[k];
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette drawer widget-settings" role="dialog" aria-label={`${info.name} settings`} onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <h2>{cfg.title || info.name}</h2>
          <button type="button" className="text-button" onClick={onClose}>
            Done
          </button>
        </header>
        <p className="settings-note">{info.about}</p>
        <div className="ws-form">
          {o.title !== false && (
            <label>
              <span>Name</span>
              <input className="field" value={cfg.title ?? ''} maxLength={40} placeholder={info.name} onChange={(e) => set('title', e.target.value)} />
            </label>
          )}
          <div className="ws-row">
            <span>Width</span>
            <span className="seg" role="group" aria-label="Width">
              {info.sizes.map((s) => (
                <button key={s} type="button" aria-pressed={w.size === s} title={SIZE_LABEL[s]} onClick={() => onSize(s)}>
                  {SIZE_SHORT[s]}
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
                onChange={(e) => set('limit', e.target.value)}
              />
            </label>
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
                    {label}
                  </button>
                ))}
              </span>
            </div>
          )}
          {w.type === 'apps' && (
            <p className="settings-note">
              Groups, their names and which app sits where: <Link to="/apps?arrange=1">rearrange apps</Link>. Save this board first; that page saves on its own.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
