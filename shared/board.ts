// The Home board: an ordered list of widgets, each with a size. Shared by the
// server (which stores and validates it) and the browser (which draws and
// edits it), so a saved board can never hold something the UI can't render.
// Runtime code is fine here: no Node or DOM use.

import { validateJsonConfig } from './jsonwidget.ts';

export type WidgetType =
  | 'apps'
  | 'attention'
  | 'vitals'
  | 'now'
  | 'upcoming'
  | 'inbox'
  | 'feeds'
  | 'changes'
  | 'recent'
  | 'container'
  | 'json';

/** Width on a 12-column grid: a quarter, a third, a half, two thirds, the full row. */
export type WidgetSize = 's' | 'm' | 'l' | 'w' | 'xl';

/** Widths from narrowest to widest, for pickers. */
export const SIZES: WidgetSize[] = ['s', 'm', 'l', 'w', 'xl'];

export interface Widget {
  id: string;
  type: WidgetType;
  /** Older boards: a fraction of the row. Kept so they still load. */
  size: WidgetSize;
  /** Columns this widget spans, 1 to the board's columns. Wins over size. */
  span?: number;
  /**
   * Settings. Per type (container, json) plus the common ones: title (the
   * header), limit (items shown), style, days. All strings.
   */
  config?: Record<string, string>;
}

export interface Board {
  version: 1;
  /** How many columns the board has on a wide screen (2 to 6). Narrower screens use fewer. */
  columns?: number;
  widgets: Widget[];
}

export const DEFAULT_COLUMNS = 3;
/** A column is never narrower than this; a narrow window drops columns instead. */
export const MIN_COLUMN_PX = 320;

/** Columns a widget spans on a board of `cols` columns. */
export function spanOf(w: Widget, cols: number): number {
  const raw = w.span ?? Math.round((SPAN[w.size] / 12) * cols);
  return Math.min(cols, Math.max(1, raw));
}

export const SPAN: Record<WidgetSize, number> = { s: 3, m: 4, l: 6, w: 8, xl: 12 };

/** What each widget lets you change beyond its width. */
export interface WidgetOptions {
  /** Items shown: default, min, max. */
  limit?: [number, number, number];
  /** Looks to choose from: value and label. */
  styles?: [string, string][];
  /** Upcoming: one week or two. */
  days?: boolean;
  /** False for widgets whose header lives in their own settings (json). */
  title?: boolean;
  /** Apps: show names under icons, or only on hover. */
  names?: boolean;
}

type Info = { name: string; about: string; size: WidgetSize; sizes: WidgetSize[]; removable: boolean; multiple: boolean; options: WidgetOptions };

const ANY: WidgetSize[] = ['s', 'm', 'l', 'w', 'xl'];
const WIDE: WidgetSize[] = ['m', 'l', 'w', 'xl'];

export const WIDGET_INFO: Record<WidgetType, Info> = {
  attention: { name: 'Needs attention', about: 'Everything broken or about to be. Always on the board.', size: 'm', sizes: ANY, removable: false, multiple: false, options: {} },
  apps: {
    name: 'Apps',
    about: 'Every app in your catalog, as a patch bay of icons or as tiles with one live number each.',
    size: 'xl',
    sizes: WIDE,
    removable: true,
    multiple: false,
    options: {
      styles: [
        ['', 'Your Settings default'],
        ['patchbay', 'Icons'],
        ['tiles', 'Tiles with a live number'],
      ],
      names: true,
    },
  },
  vitals: { name: 'Server', about: 'CPU, memory, storage and uptime, with the last 24 hours.', size: 'm', sizes: ANY, removable: true, multiple: false, options: {} },
  now: { name: 'Right now', about: 'Who is watching Plex and what is downloading.', size: 'm', sizes: ANY, removable: true, multiple: false, options: {} },
  upcoming: { name: 'This week', about: 'Episodes and movies due in the next week or two.', size: 'm', sizes: WIDE, removable: true, multiple: false, options: { limit: [9, 3, 40], days: true } },
  inbox: { name: 'Inbox', about: 'Newest mail and the unread count.', size: 'm', sizes: WIDE, removable: true, multiple: false, options: { limit: [6, 1, 20] } },
  feeds: { name: 'Feeds', about: 'Newest unread articles.', size: 'm', sizes: ANY, removable: true, multiple: false, options: { limit: [6, 1, 30] } },
  changes: { name: 'Changes', about: 'Containers that stopped, started or recovered in the last two days.', size: 'm', sizes: ANY, removable: true, multiple: false, options: { limit: [6, 1, 30] } },
  recent: { name: 'Recently added', about: 'New arrivals on Plex, as posters.', size: 'xl', sizes: ['l', 'w', 'xl'], removable: true, multiple: false, options: { limit: [12, 2, 24] } },
  container: { name: 'Container', about: "One container's CPU, memory, response time and 14 days of health.", size: 's', sizes: ['s', 'm', 'l'], removable: true, multiple: true, options: {} },
  json: { name: 'API numbers', about: 'Up to four values from any JSON API, with thresholds that turn them amber or red.', size: 's', sizes: ['s', 'm', 'l', 'w'], removable: true, multiple: true, options: { title: false } },
};

export const DEFAULT_BOARD: Board = {
  version: 1,
  columns: 3,
  widgets: [
    { id: 'apps', type: 'apps', size: 'xl', span: 3 },
    { id: 'attention', type: 'attention', size: 'm', span: 1 },
    { id: 'now', type: 'now', size: 'm', span: 1 },
    { id: 'upcoming', type: 'upcoming', size: 'm', span: 1 },
    { id: 'inbox', type: 'inbox', size: 'm', span: 1 },
    { id: 'vitals', type: 'vitals', size: 'm', span: 1 },
    { id: 'feeds', type: 'feeds', size: 'm', span: 1 },
    { id: 'changes', type: 'changes', size: 'm', span: 1 },
    { id: 'recent', type: 'recent', size: 'xl', span: 3 },
  ],
};

const ID = /^[a-z0-9-]{1,40}$/;
const CONTAINER = /^[\w.-]{1,128}$/;

/** A clean board from untrusted input, or an error message. */
export function validateBoard(input: unknown): { board: Board } | { error: string } {
  const raw = input as { widgets?: unknown; columns?: unknown } | null;
  if (!raw || !Array.isArray(raw.widgets)) return { error: 'Expected { widgets: [...] }' };
  if (raw.widgets.length > 40) return { error: 'At most 40 widgets' };
  const seen = new Set<string>();
  const widgets: Widget[] = [];
  for (const w of raw.widgets as Partial<Widget>[]) {
    if (!w || typeof w !== 'object') return { error: 'Each widget must be an object' };
    const info = WIDGET_INFO[w.type as WidgetType];
    if (!info) return { error: `Unknown widget type ${String(w.type)}` };
    if (typeof w.id !== 'string' || !ID.test(w.id) || seen.has(w.id)) return { error: `Bad or duplicate widget id ${String(w.id)}` };
    if (!info.multiple && widgets.some((x) => x.type === w.type)) return { error: `Only one ${info.name} widget` };
    seen.add(w.id);
    const size = info.sizes.includes(w.size as WidgetSize) ? (w.size as WidgetSize) : info.size;
    let config: Record<string, string> | undefined;
    if (w.type === 'container') {
      const name = (w.config as Record<string, unknown> | undefined)?.container;
      if (typeof name !== 'string' || !CONTAINER.test(name)) return { error: 'A container widget needs a container name' };
      config = { container: name };
    }
    if (w.type === 'json') {
      let parsed: unknown;
      try {
        parsed = JSON.parse((w.config as Record<string, string> | undefined)?.json ?? '');
      } catch {
        return { error: 'An API numbers widget needs its settings' };
      }
      const v = validateJsonConfig(parsed);
      if ('error' in v) return { error: v.error };
      config = { json: JSON.stringify(v.config) };
    }
    const common = commonOptions(info, w.config);
    if (Object.keys(common).length) config = { ...(config ?? {}), ...common };
    const span = Number.isInteger(w.span) && (w.span as number) >= 1 && (w.span as number) <= 6 ? (w.span as number) : undefined;
    widgets.push({ id: w.id, type: w.type as WidgetType, size, ...(span ? { span } : {}), ...(config ? { config } : {}) });
  }
  // Needs attention is part of what Patchboard is; it can move but not leave.
  if (!widgets.some((w) => w.type === 'attention')) widgets.unshift({ id: 'attention', type: 'attention', size: 'm' });
  const columns = Number.isInteger(raw.columns) && (raw.columns as number) >= 2 && (raw.columns as number) <= 6 ? (raw.columns as number) : undefined;
  return { board: { version: 1, ...(columns ? { columns } : {}), widgets } };
}

/** The shared settings, kept only when they make sense for this widget. */
function commonOptions(info: Info, raw: unknown): Record<string, string> {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  if (info.options.title !== false && typeof c.title === 'string' && c.title.trim()) out.title = c.title.trim().slice(0, 40);
  const lim = info.options.limit;
  if (lim && c.limit != null && c.limit !== '') {
    const n = Number(c.limit);
    if (Number.isInteger(n) && n >= lim[1] && n <= lim[2]) out.limit = String(n);
  }
  const st = info.options.styles;
  if (st && typeof c.style === 'string' && c.style && st.some(([v]) => v === c.style)) out.style = c.style;
  if (info.options.days && (c.days === '7' || c.days === '14')) out.days = c.days;
  if (info.options.names && c.names === 'show') out.names = 'show';
  return out;
}
