// The widget gallery, and the sheet a widget is added or edited in. Every
// widget shows as it would on the board: live with this server's data, or
// with made-up sample data, marked Sample, when its app isn't connected yet.
// Pick one and the sheet shows it large at the width you choose, its options
// beside it, and Add. A widget whose app isn't connected offers Connect first.

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type Board, spanOf, WIDGET_INFO, type Widget, type WidgetType } from '../../shared/board.ts';
import { ALSO_READ, sourceOf, WIDGET_SOURCES } from '../../shared/feeds.ts';
import { HA_WIDGETS } from '../../shared/ha.ts';
import type { HomeAssistantData, Snapshot, SourceState } from '../../shared/types.ts';
import { ConnectOne, providersFor } from '../components/ConnectOne.tsx';
import { Section } from '../components/ui.tsx';
import { locale } from '../lib/region.ts';
import { msg, t } from '../lib/i18n.ts';
import { useModal } from '../lib/modal.ts';
import { containerMap } from '../lib/services.ts';
import { useNow, useStore, WithSources } from '../lib/store.tsx';
import { NEEDS, widgetReady } from './ready.ts';
import { WidgetOptions } from './WidgetOptions.tsx';

/** Draws one widget: Board's own renderer, handed in so this file doesn't import Board. */
export type RenderWidget = (w: Widget, board: string, now: number) => ReactNode;

const GAP_PX = 24;
/** The board name a preview asks the server for: made-up items for widgets that read the web. */
const SAMPLE_BOARD = 'sample';
/** A preview with nothing saved yet: widgets that need a saved board say so. */
const PEEK_BOARD = 'peek';

/** Gallery sections, so 57 widgets read as five short rows. */
export const KINDS: [string, WidgetType[]][] = [
  [msg('Everyday'), ['attention', 'apps', 'calendar', 'inbox', 'feeds', 'rss', 'notes', 'chores', 'bookmarks', 'search', 'clocks', 'weather', 'sky', 'countdown', 'markets']],
  [msg('Media'), ['now', 'upcoming', 'recent', 'nextup', 'watched', 'listening', 'requests', 'downloads', 'managers', 'books', 'photos']],
  [msg('Server'), ['vitals', 'storage', 'drives', 'container', 'changes', 'uptime', 'monitoring', 'proxmox', 'dockerhosts', 'hosts', 'power', 'sync', 'releases', 'json']],
  [msg('Files and work'), ['documents', 'nextcloud', 'git']],
  [msg('House and network'), ['homeassistant', 'halist', 'climate', 'shades', 'people', 'rooms', 'cameras', 'car', 'printer', 'wake', 'network', 'dns', 'speed', 'miners']],
];
const kindOf = (w: WidgetType) => KINDS.find(([, list]) => list.includes(w))?.[0] ?? msg('Other');

/** Words people search with that a widget's own description doesn't use. */
export const ALSO: Partial<Record<WidgetType, string>> = {
  drives: 'disks hard drives smart health',
  storage: 'disks pool space',
  hosts: 'disks machines computers',
  now: 'playing streams watching',
  cameras: 'frigate nvr security',
  halist: 'home assistant shopping grocery todo to-do chores checklist',
  climate: 'home assistant thermostat heat cool temperature hvac',
  shades: 'home assistant blinds curtains covers',
  people: 'home assistant presence family who is home',
  chores: 'plants watering filter recurring days since household',
  rooms: 'home assistant temperature sensors heatmap climate history',
  miners: 'bitaxe nerdqaxe axeos bitcoin mining hashrate asic',
  managers: 'arr lidarr readarr prowlarr bazarr music books subtitles indexers',
  documents: 'paperless scans paper',
  git: 'gitea forgejo code repositories',
  monitoring: 'netdata prometheus alertmanager alarms',
};

/** Beyond what decides whether a widget is offered: Right now also shows downloads, and Weather and Sun and moon need a town. */
const MORE_READS: Partial<Record<WidgetType, string[]>> = { now: ['qbit', 'transmission', 'deluge', 'sabnzbd', 'nzbget'], weather: ['weather'], sky: ['weather'], changes: ['docker'] };

/** The apps a widget shows, any one of which gives it something to show. None: it needs no app. */
export const widgetReads = (w: WidgetType): string[] => [...(WIDGET_SOURCES[w] ?? ALSO_READ[w] ?? []), ...(MORE_READS[w] ?? [])];

/** Whether none of a widget's apps is connected yet. */
export const waitsForApp = (w: WidgetType, snap: Snapshot | null | undefined): boolean => {
  const reads = widgetReads(w);
  return reads.length > 0 && !reads.some((id) => !!snap?.sources[id as keyof Snapshot['sources']]);
};

/** "Plex, Jellyfin or Emby": the apps that could feed these sources, in one phrase. */
export function appsFor(sources: string[], snap: Snapshot | null | undefined): string {
  const names = [...new Set(providersFor(sources, snap).list.map((i) => i.name))];
  const shown = names.length > 4 ? [...names.slice(0, 3), t('another')] : names;
  return new Intl.ListFormat(locale(), { type: 'disjunction' }).format(shown);
}

/**
 * A widget on a board whose app isn't connected yet: its name, what it
 * needs, and Connect, where it would otherwise be a gap with no reason.
 */
export function NeedsApp({ w }: { w: Widget }) {
  const { snap } = useStore();
  const reads = widgetReads(w.type);
  const { list, running } = providersFor(reads, snap);
  // One of its apps runs here already: name it, and Connect goes straight to it.
  const here = list.find((i) => running.has(sourceOf(i.id)));
  return (
    <Section title={w.config?.title || WIDGET_INFO[w.type].name} className="needs-app">
      <p className="settings-note">
        {here ? t('{name} is running here.', { name: here.name }) : list.length > 3 ? t('Connect an app to fill this in.') : t('Shows once {apps} is connected.', { apps: appsFor(reads, snap) })} <ConnectOne sources={here ? [sourceOf(here.id)] : reads} label={t('Connect')} />
      </p>
    </Section>
  );
}

/** What a widget reads beyond the sources that decide whether it's offered. */
const READS: Partial<Record<WidgetType, string[]>> = { weather: ['weather'], sky: ['weather'], vitals: ['system'], changes: ['docker'] };

/** The sources a widget's preview borrows samples for: what it reads, when none of it is connected. */
export function sampleSources(w: WidgetType, snap: Snapshot | null | undefined): string[] {
  const reads = WIDGET_SOURCES[w] ?? ALSO_READ[w] ?? READS[w] ?? [];
  return reads.some((id) => !!snap?.sources[id as keyof Snapshot['sources']]) ? [] : reads;
}

/** Sample values for widgets that show what you type in, until you type it. Never saved. */
const SAMPLE_FIELDS: Partial<Record<WidgetType, Record<string, string>>> = {
  clocks: { zones: 'Home=America/Chicago\nLondon=Europe/London\nTokyo=Asia/Tokyo' },
  countdown: { events: 'Vacation=2027-03-14\nBirthday=06-21' },
  chores: { chores: 'Water the plants=7\nChange the furnace filter=90' },
  rss: { feeds: 'https://example.com/feed.xml' },
  releases: { repos: 'immich-app/immich' },
  markets: { symbols: 'Apple=AAPL\nBitcoin=BTC' },
};

/** The config a preview draws with: yours, with sample values where yours is still empty. */
function previewConfig(w: Widget, snap: Snapshot | null): { config: Record<string, string> | undefined; sample: boolean } {
  const config = { ...(w.config ?? {}) };
  let sample = false;
  for (const [k, v] of Object.entries(SAMPLE_FIELDS[w.type] ?? {}))
    if (!config[k]?.trim()) {
      config[k] = v;
      sample = true;
    }
  const ha = HA_WIDGETS[w.type];
  if (ha && !config.entities) {
    const all = (snap?.sources.homeassistant?.data as HomeAssistantData | null)?.entities ?? [];
    const picks = all.filter((e) => !ha.domains.length || ha.domains.includes(e.id.split('.')[0])).slice(0, Math.min(ha.max, 4));
    if (picks.length) {
      config.entities = picks.map((e) => e.id).join(',');
      sample = true;
    }
  }
  if (w.type === 'container' && !config.container) {
    const first = [...containerMap(snap).values()].find((c) => c.state === 'running');
    if (first) config.container = first.name;
  }
  return { config: Object.keys(config).length ? config : undefined, sample };
}

/** Widget samples for the gallery, fetched once: one request for every source a preview borrows. */
function useSamples(types: WidgetType[]): Record<string, SourceState> {
  const { snap } = useStore();
  const [samples, setSamples] = useState<Record<string, SourceState>>({});
  const want = [...new Set(types.flatMap((w) => sampleSources(w, snap)))].sort().join(',');
  useEffect(() => {
    if (!want) return;
    let gone = false;
    fetch(`/api/samples?sources=${encodeURIComponent(want)}`)
      .then((r) => (r.ok ? r.json() : { sources: {} }))
      .then((b: { sources: Record<string, SourceState> }) => !gone && setSamples(b.sources))
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [want]);
  return samples;
}

/**
 * One widget drawn at its width on the board, scaled down to fit the space it
 * has. A picture, not a control: nothing in it takes a click.
 */
function Preview({ w, columns, colWidth, onScreen, samples, render, thumb = false }: { w: Widget; columns: number; colWidth: number; /** Columns this screen shows: fewer than the board has on a narrow window. */ onScreen: number; samples: Record<string, SourceState>; render: RenderWidget; thumb?: boolean }) {
  const { snap } = useStore();
  const borrow = sampleSources(w.type, snap);
  const lent = Object.fromEntries(borrow.filter((id) => samples[id]).map((id) => [id, samples[id]]));
  return (
    <WithSources sources={lent as Partial<Snapshot['sources']>}>
      <PreviewBody w={w} columns={columns} colWidth={colWidth} onScreen={onScreen} render={render} thumb={thumb} borrowed={borrow.length > 0} />
    </WithSources>
  );
}

function PreviewBody({ w, columns, colWidth, onScreen, render, thumb, borrowed }: { w: Widget; columns: number; colWidth: number; /** Columns this screen shows: fewer than the board has on a narrow window. */ onScreen: number; render: RenderWidget; thumb: boolean; borrowed: boolean }) {
  const { snap } = useStore();
  const now = useNow(15_000);
  const stage = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  const [tall, setTall] = useState(0);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => {
      const s = stage.current;
      const pad = s ? parseFloat(getComputedStyle(s).paddingLeft) + parseFloat(getComputedStyle(s).paddingRight) : 0;
      setRoom(s ? s.clientWidth - pad : 0);
      setTall(inner.current?.offsetHeight ?? 0);
    });
    if (stage.current) ro.observe(stage.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);
  const { config, sample } = previewConfig(w, snap);
  // A narrow window shows fewer columns than the board has: a wide widget spans what's there.
  const span = Math.min(spanOf(w, columns), onScreen);
  const width = Math.round(span * colWidth + (span - 1) * GAP_PX);
  const scale = room ? Math.min(1, room / width) : 1;
  const shown = { ...w, config };
  const card = w.type !== 'apps' && w.type !== 'json';
  // Nothing drawn: say what it would show instead of an empty frame.
  const empty = tall < 8;
  return (
    <div className={`ws-stage ${thumb ? 'is-thumb' : ''}`} ref={stage}>
      <div className="ws-scale" style={{ width: width * scale, height: empty ? undefined : tall * scale }}>
        <div className={`ws-preview cell-body ${card ? 'is-card' : ''} ${w.config?.view ? `is-${w.config.view}` : ''}`} ref={inner} inert style={{ width, transform: scale < 1 ? `scale(${scale})` : undefined }}>
          {render(shown, borrowed || sample ? SAMPLE_BOARD : PEEK_BOARD, now)}
        </div>
      </div>
      {empty && <p className="ws-empty">{NEEDS[w.type] ? t('Shows here once {name} is connected.', { name: NEEDS[w.type]!.label }) : t('No preview for this one.')}</p>}
      {borrowed && !empty && <span className="ws-sample">{t('Sample')}</span>}
    </div>
  );
}

/**
 * A widget large, with its options beside it: where one is added from the
 * gallery and where one on the board is edited. The preview follows every
 * change, so what you see is what lands on the board.
 */
export function WidgetSheet({
  w,
  mode,
  boardName,
  columns,
  colWidth,
  onScreen,
  samples,
  render,
  fitShows,
  onWidget,
  onPrimary,
  onCancel,
  onBack,
}: {
  w: Widget;
  mode: 'add' | 'edit' | 'quick';
  boardName: string;
  columns: number;
  colWidth: number;
  /** Columns this screen shows: fewer than the board has on a narrow window. */
  onScreen: number;
  samples: Record<string, SourceState>;
  render: RenderWidget;
  fitShows?: number;
  onWidget: (w: Widget) => void;
  onPrimary: () => void;
  onCancel: () => void;
  onBack?: () => void;
}) {
  const { snap } = useStore();
  const modal = useModal<HTMLDivElement>(onCancel);
  const info = WIDGET_INFO[w.type];
  const ready = widgetReady(snap)[w.type] !== false;
  const needsPick = w.type === 'container' && !w.config?.container;
  const sources = widgetReads(w.type);
  const waiting = waitsForApp(w.type, snap);
  return (
    <div className="palette-backdrop" onClick={onCancel}>
      <div className="palette drawer widget-sheet" ref={modal} role="dialog" aria-label={mode === 'add' ? t('Add {name}', { name: info.name }) : t('Edit {name}', { name: w.config?.title || info.name })} onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <h2>{w.config?.title || info.name}</h2>
          {onBack ? (
            <button type="button" className="text-button" onClick={onBack}>
              {t('All widgets')}
            </button>
          ) : (
            <button type="button" className="text-button" onClick={onCancel}>
              {t('Cancel')}
            </button>
          )}
        </header>
        <div className="ws-split">
          <Preview w={w} columns={columns} colWidth={colWidth} onScreen={onScreen} samples={samples} render={render} />
          <div className="ws-side">
            <p className="settings-note">{info.about}</p>
            {waiting && <p className="ws-needs">{providersFor(sources, snap).list.length > 3 ? t('Connect an app and this shows your own.') : t('Needs {name}. Connect it and this shows your own.', { name: appsFor(sources, snap) })}</p>}
            <WidgetOptions
              w={w}
              columns={columns}
              fitShows={fitShows}
              where={mode !== 'add'}
              onChange={(config) => onWidget({ ...w, config })}
              onSpan={(span) => onWidget({ ...w, span })}
              onColumn={(column) => onWidget({ ...w, column })}
            />
          </div>
        </div>
        <footer className="ws-foot">
          {waiting && <ConnectOne sources={sources} className="button board-save" label={t('Connect')} />}
          <button type="button" className={waiting ? 'button button-quiet' : 'button board-save'} disabled={(mode === 'add' && !ready) || needsPick} onClick={onPrimary}>
            {mode === 'add' ? t('Add to {board}', { board: boardName }) : mode === 'quick' ? t('Save') : t('Done')}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** A gallery card: the widget at its usual width, drawn once it scrolls into view. */
function Card({ type, columns, colWidth, onScreen, samples, render, taken, onOpen }: { type: WidgetType; columns: number; colWidth: number; /** Columns this screen shows: fewer than the board has on a narrow window. */ onScreen: number; samples: Record<string, SourceState>; render: RenderWidget; taken: boolean; onOpen: () => void }) {
  const { snap } = useStore();
  const ref = useRef<HTMLLIElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (setSeen(true), io.disconnect()), { rootMargin: '200px' });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  const info = WIDGET_INFO[type];
  const ready = widgetReady(snap)[type] !== false;
  const w: Widget = { id: 'gallery', type, size: info.size };
  const tag = taken ? t('On this board') : waitsForApp(type, snap) ? t('Not connected') : '';
  const sub = info.about;
  return (
    <li ref={ref} className={`gallery-card ${ready ? '' : 'is-waiting'}`}>
      <button type="button" disabled={taken} onClick={onOpen} aria-label={[info.name, tag, sub].filter(Boolean).join('. ')}>
        <span className="gallery-thumb" aria-hidden>
          {seen && <Preview w={w} columns={columns} colWidth={colWidth} onScreen={onScreen} samples={samples} render={render} thumb />}
        </span>
        <strong>
          {info.name} {tag && <span className="gallery-tag">{tag}</span>}
        </strong>
        <span className="gallery-sub">{sub}</span>
      </button>
    </li>
  );
}

/**
 * Every widget, as a picture of itself. Pick one to see it large with its
 * options; Add puts it on the board.
 */
export function WidgetGallery({ board, boardName, columns, colWidth, onScreen, initialFind = '', render, onClose, onAdd }: { board: Board; boardName: string; columns: number; colWidth: number; /** Columns this screen shows: fewer than the board has on a narrow window. */ onScreen: number; initialFind?: string; render: RenderWidget; onClose: () => void; onAdd: (w: Widget) => void }) {
  const modal = useModal<HTMLDivElement>(onClose);
  const [find, setFind] = useState(initialFind);
  const [kind, setKind] = useState('');
  const [open, setOpen] = useState<Widget | null>(null);
  const all = Object.keys(WIDGET_INFO) as WidgetType[];
  const samples = useSamples(all);
  const { snap } = useStore();
  const ready = widgetReady(snap);
  const present = new Set(board.widgets.map((w) => w.type));
  const taken = (w: WidgetType) => !WIDGET_INFO[w].multiple && present.has(w);
  const matches = (w: WidgetType) => {
    const f = find.trim().toLowerCase();
    return !f || `${WIDGET_INFO[w].name} ${WIDGET_INFO[w].about} ${NEEDS[w]?.label ?? ''} ${ALSO[w] ?? ''}`.toLowerCase().includes(f);
  };
  // Ready first, then the ones waiting on an app; what's already on the board last.
  const rank = (w: WidgetType) => (taken(w) ? 2 : ready[w] === false ? 1 : 0);
  const shown = all.filter((w) => matches(w) && (!kind || kindOf(w) === kind));
  const id = (base: string) => {
    let n = 1;
    while (board.widgets.some((w) => w.id === `${base}-${n}`)) n++;
    return `${base}-${n}`;
  };
  const pick = (w: WidgetType) => {
    const fresh: Widget = { id: WIDGET_INFO[w].multiple ? id(w) : w, type: w, size: WIDGET_INFO[w].size };
    // API numbers has its own editor, with a test against the address.
    if (w === 'json') onAdd(fresh);
    else setOpen(fresh);
  };

  if (open)
    return (
      <WidgetSheet
        w={open}
        mode="add"
        boardName={boardName}
        columns={columns}
        colWidth={colWidth}
        onScreen={onScreen}
        samples={samples}
        render={render}
        onWidget={setOpen}
        onPrimary={() => onAdd(open)}
        onCancel={onClose}
        onBack={() => setOpen(null)}
      />
    );

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette drawer gallery" ref={modal} role="dialog" aria-label={t('Add widget')} onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <h2>{t('Add widget')}</h2>
          <button type="button" className="text-button" onClick={onClose}>
            {t('Close')}
          </button>
        </header>
        <div className="gallery-tools">
          <input className="field palette-input" type="search" placeholder={t('Search widgets: plex, disks, cameras')} aria-label={t('Search widgets')} value={find} onChange={(e) => setFind(e.target.value)} autoFocus />
          <span className="seg" role="group" aria-label={t('Kind')}>
            {['', ...KINDS.map(([k]) => k)].map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {k ? t(k) : t('All')}
              </button>
            ))}
          </span>
        </div>
        <div className="gallery-scroll">
          {shown.length === 0 && <p className="settings-note">{t('No widget matches "{find}".', { find: find.trim() })}</p>}
          {(kind ? [kind] : [...KINDS.map(([k]) => k), msg('Other')]).map((k) => {
            const list = shown.filter((w) => kindOf(w) === k).sort((a, b) => rank(a) - rank(b));
            if (!list.length) return null;
            return (
              <section key={k} className="gallery-kind" aria-label={t(k)}>
                {!kind && <h3>{t(k)}</h3>}
                <ul className="gallery-grid">
                  {list.map((w) => (
                    <Card key={w} type={w} columns={columns} colWidth={colWidth} onScreen={onScreen} samples={samples} render={render} taken={taken(w)} onOpen={() => pick(w)} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Samples for one sheet opened on its own (editing a widget on the board). */
export function useSheetSamples(w: WidgetType | null): Record<string, SourceState> {
  return useSamples(w ? [w] : []);
}
