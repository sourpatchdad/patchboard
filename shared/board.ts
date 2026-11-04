// The Home board: an ordered list of widgets, each with a size. Shared by the
// server (which stores and validates it) and the browser (which draws and
// edits it), so a saved board can never hold something the UI can't render.
// Runtime code is fine here: this file has no imports and no Node or DOM use.

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
  | 'container';

/** Width on a 12-column grid: a quarter, a third, a half, the full row. */
export type WidgetSize = 's' | 'm' | 'l' | 'xl';

export interface Widget {
  id: string;
  type: WidgetType;
  size: WidgetSize;
  /** Per-type settings, e.g. { container: 'plex' } for a container widget. */
  config?: Record<string, string>;
}

export interface Board {
  version: 1;
  widgets: Widget[];
}

export const SPAN: Record<WidgetSize, number> = { s: 3, m: 4, l: 6, xl: 12 };

export const WIDGET_INFO: Record<WidgetType, { name: string; about: string; size: WidgetSize; sizes: WidgetSize[]; removable: boolean; multiple: boolean }> = {
  attention: { name: 'Needs attention', about: 'Everything broken or about to be. Always on the board.', size: 'm', sizes: ['m', 'l', 'xl'], removable: false, multiple: false },
  apps: { name: 'Apps', about: 'Every app in your catalog with one live number each.', size: 'xl', sizes: ['l', 'xl'], removable: true, multiple: false },
  vitals: { name: 'Server', about: 'CPU, memory, storage and uptime, with the last 24 hours.', size: 'm', sizes: ['s', 'm', 'l'], removable: true, multiple: false },
  now: { name: 'Right now', about: 'Who is watching Plex and what is downloading.', size: 'm', sizes: ['m', 'l'], removable: true, multiple: false },
  upcoming: { name: 'This week', about: 'Episodes and movies due in the next seven days.', size: 'm', sizes: ['m', 'l'], removable: true, multiple: false },
  inbox: { name: 'Inbox', about: 'Newest mail and the unread count.', size: 'm', sizes: ['m', 'l'], removable: true, multiple: false },
  feeds: { name: 'Feeds', about: 'Newest unread articles.', size: 'm', sizes: ['m', 'l'], removable: true, multiple: false },
  changes: { name: 'Changes', about: 'Containers that stopped, started or recovered in the last two days.', size: 'm', sizes: ['s', 'm', 'l'], removable: true, multiple: false },
  recent: { name: 'Recently added', about: 'New arrivals on Plex, as posters.', size: 'xl', sizes: ['l', 'xl'], removable: true, multiple: false },
  container: { name: 'Container', about: "One container's CPU, memory, response time and 14 days of health.", size: 's', sizes: ['s', 'm'], removable: true, multiple: true },
};

export const DEFAULT_BOARD: Board = {
  version: 1,
  widgets: [
    { id: 'apps', type: 'apps', size: 'xl' },
    { id: 'attention', type: 'attention', size: 'm' },
    { id: 'now', type: 'now', size: 'm' },
    { id: 'upcoming', type: 'upcoming', size: 'm' },
    { id: 'inbox', type: 'inbox', size: 'm' },
    { id: 'vitals', type: 'vitals', size: 'm' },
    { id: 'feeds', type: 'feeds', size: 'm' },
    { id: 'changes', type: 'changes', size: 'm' },
    { id: 'recent', type: 'recent', size: 'xl' },
  ],
};

const ID = /^[a-z0-9-]{1,40}$/;
const CONTAINER = /^[\w.-]{1,128}$/;

/** A clean board from untrusted input, or an error message. */
export function validateBoard(input: unknown): { board: Board } | { error: string } {
  const raw = input as { widgets?: unknown } | null;
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
    widgets.push({ id: w.id, type: w.type as WidgetType, size, ...(config ? { config } : {}) });
  }
  // Needs attention is part of what Patchboard is; it can move but not leave.
  if (!widgets.some((w) => w.type === 'attention')) widgets.unshift({ id: 'attention', type: 'attention', size: 'm' });
  return { board: { version: 1, widgets } };
}
