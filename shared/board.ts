// Boards: ordered lists of widgets, each with a size. Home is the first board;
// more can be added and named. Shared by the server (which stores and
// validates them) and the browser (which draws and edits them), so a saved
// board can never hold something the UI can't render.
// Runtime code is fine here: no Node or DOM use.

import { HA_WIDGETS, parseEntities } from './ha.ts';
import { camerasField, choresField, engineField, eventsField, feedsField, groupsField, reposField, searchUrlField, symbolsField, type WidgetField, zonesField } from './fields.ts';
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
  | 'nextup'
  | 'homeassistant'
  | 'car'
  | 'wake'
  | 'uptime'
  | 'dns'
  | 'speed'
  | 'photos'
  | 'cameras'
  | 'proxmox'
  | 'drives'
  | 'sync'
  | 'hosts'
  | 'power'
  | 'storage'
  | 'dockerhosts'
  | 'network'
  | 'calendar'
  | 'notes'
  | 'books'
  | 'requests'
  | 'downloads'
  | 'watched'
  | 'listening'
  | 'bookmarks'
  | 'search'
  | 'clocks'
  | 'rss'
  | 'releases'
  | 'container'
  | 'json'
  | 'weather'
  | 'markets'
  | 'sky'
  | 'countdown'
  | 'managers'
  | 'documents'
  | 'nextcloud'
  | 'git'
  | 'monitoring'
  | 'halist'
  | 'climate'
  | 'shades'
  | 'people'
  | 'chores'
  | 'rooms'
  | 'miners';

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
  /** Preferred starting column. Narrow screens clamp it to the available columns. */
  column?: number;
  /**
   * Settings. Per type (container, json) plus the common ones: title (the
   * header), limit (items shown), style, days, view (compact or number) and
   * number (which one). All strings.
   */
  config?: Record<string, string>;
}

export interface Board {
  version: 1;
  /** Shown in the board tabs. Home's is "Home" unless renamed. */
  name?: string;
  /** How many columns the board has on a wide screen (2 to 6). Narrower screens use fewer. */
  columns?: number;
  /** Lists show fewer items so the whole board fits the window, on screens wide enough for two columns. */
  fit?: boolean;
  /** Made for a wall screen: one status line instead of the header, no tabs. */
  wall?: boolean;
  widgets: Widget[];
}

/** A board in the tabs: its address and its name. */
export interface BoardRef {
  id: string;
  name: string;
  /** Made for a wall screen: left out of Home's tabs. */
  wall?: boolean;
}

/** The first board, at /. It can be renamed and reset but not deleted. */
export const HOME_ID = 'home';
export const MAX_BOARDS = 12;
export const BOARD_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** A board name: trimmed, single spaces, no control characters, 32 characters at most. */
export function cleanBoardName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32);
  return name || undefined;
}

/**
 * Where a Notes widget's text is kept. Home's notes keep the bare widget id
 * they always had; another board's are prefixed with the board, so the first
 * Notes widget on two boards doesn't share one text.
 */
export const noteKey = (board: string, widget: string): string => (board === HOME_ID ? widget : `${board}.${widget}`);

/** An address for a new board from its name, unlike any taken. */
export function boardId(name: string, taken: string[]): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 28) || 'board';
  let id = base === HOME_ID ? 'home-2' : base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
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

/**
 * How much a widget shows, for any widget that has more than one way: the
 * whole thing, the top three without the small print, or one big number for
 * a small screen. Number needs an entry in NUMBERS; compact needs a list.
 */
export type WidgetView = '' | 'compact' | 'number';

/** The numbers a widget can show on its own, first the default: key and label. */
export const NUMBERS: Partial<Record<WidgetType, [string, string][]>> = {
  attention: [['count', 'Things that need you']],
  vitals: [
    ['cpu', 'CPU'],
    ['memory', 'Memory in use'],
    ['storage', 'Storage used'],
    ['uptime', 'Uptime'],
  ],
  weather: [
    ['now', 'Temperature now'],
    ['high', "Today's high"],
    ['rain', 'Chance of rain today'],
  ],
  markets: [['first', 'The first price on the list']],
  countdown: [['next', 'Days to the next date']],
  car: [
    ['battery', 'Battery'],
    ['range', 'Range'],
    ['tire', 'Lowest tire'],
  ],
  dns: [
    ['blocked', 'Blocked today'],
    ['pct', 'Share blocked'],
  ],
  speed: [
    ['down', 'Download'],
    ['up', 'Upload'],
    ['ping', 'Ping'],
  ],
  power: [
    ['charge', 'Battery charge'],
    ['runtime', 'Runtime on battery'],
    ['load', 'Load'],
  ],
  photos: [
    ['photos', 'Photos'],
    ['videos', 'Videos'],
  ],
  requests: [['pending', 'Requests waiting']],
  dockerhosts: [
    ['running', 'Containers running'],
    ['unhealthy', 'Unhealthy containers'],
  ],
  network: [['clients', 'Clients online']],
  drives: [
    ['problems', 'Drives with problems'],
    ['hottest', 'Hottest drive'],
  ],
  sync: [['behind', 'Folders not up to date']],
  inbox: [['unread', 'Unread mail']],
  feeds: [['unread', 'Unread articles']],
  managers: [
    ['trouble', 'Apps that need you'],
    ['queued', 'Queued, all together'],
  ],
  documents: [
    ['inbox', 'In the inbox'],
    ['total', 'Documents'],
  ],
  nextcloud: [
    ['files', 'Files'],
    ['active', 'People on today'],
    ['free', 'Free space'],
  ],
  git: [
    ['unread', 'Notifications'],
    ['repos', 'Repositories'],
  ],
  monitoring: [['firing', 'Alerts firing']],
  halist: [['open', 'Items on the list']],
  climate: [
    ['current', 'Temperature inside'],
    ['target', 'Set to'],
  ],
  people: [['home', 'People home']],
  miners: [
    ['hash', 'Hashrate, all together'],
    ['temp', 'Hottest ASIC'],
    ['power', 'Power, all together'],
  ],
};

/** The ways this widget can be shown, for its settings. */
export function viewsOf(type: WidgetType): [WidgetView, string][] {
  const out: [WidgetView, string][] = [['', 'Detailed']];
  if (WIDGET_INFO[type].options.limit) out.push(['compact', 'Compact']);
  if (NUMBERS[type]) out.push(['number', 'One number']);
  return out.length > 1 ? out : [];
}

/** Needs attention sits in Home's header unless the board asks for a card. */
export const attentionInHeader = (b: Board | null | undefined): boolean => !b?.widgets.some((w) => w.type === 'attention' && w.config?.style === 'card');

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
  /** Text settings: feeds, places, projects, a search engine. */
  fields?: WidgetField[];
}

type Info = { name: string; about: string; size: WidgetSize; sizes: WidgetSize[]; removable: boolean; multiple: boolean; options: WidgetOptions };

const ANY: WidgetSize[] = ['s', 'm', 'l', 'w', 'xl'];
const WIDE: WidgetSize[] = ['m', 'l', 'w', 'xl'];

export const WIDGET_INFO: Record<WidgetType, Info> = {
  attention: {
    name: 'Needs attention',
    about: 'Everything broken or about to be. Always on Home: in the header under the status line, or as a card on the board.',
    size: 'm',
    sizes: ANY,
    removable: false,
    multiple: false,
    options: {
      styles: [
        ['', 'In the header'],
        ['card', 'A card on the board'],
      ],
    },
  },
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
      fields: [groupsField],
    },
  },
  weather: {
    name: 'Weather',
    about: 'Now, the next 12 hours and three days. With this on the board, the weather leaves the header.',
    size: 'm',
    sizes: ANY,
    removable: true,
    multiple: false,
    options: {},
  },
  vitals: { name: 'Server', about: 'CPU, memory, storage and uptime, with the last 24 hours.', size: 'm', sizes: ANY, removable: true, multiple: false, options: {} },
  now: { name: 'Right now', about: 'Who is watching Plex, Jellyfin or Emby, and what is downloading.', size: 'm', sizes: ANY, removable: true, multiple: false, options: { limit: [6, 1, 20] } },
  upcoming: { name: 'This week', about: 'Episodes and movies due in the next week or two.', size: 'm', sizes: WIDE, removable: true, multiple: false, options: { limit: [9, 3, 40], days: true } },
  inbox: { name: 'Inbox', about: 'Newest mail and the unread count.', size: 'm', sizes: WIDE, removable: true, multiple: false, options: { limit: [6, 1, 20] } },
  feeds: { name: 'Reading', about: 'Newest unread articles from Miniflux.', size: 'm', sizes: ANY, removable: true, multiple: false, options: { limit: [6, 1, 30] } },
  changes: { name: 'Changes', about: 'Containers that stopped, started or recovered in the last two days.', size: 'm', sizes: ANY, removable: true, multiple: false, options: { limit: [6, 1, 30] } },
  recent: { name: 'Recently added', about: 'New arrivals on Plex, Jellyfin and Emby, as posters, each once. A wide screen shows the posters that fit one row. Each opens its own page in Plex, Jellyfin or Emby.', size: 'xl', sizes: ['l', 'w', 'xl'], removable: true, multiple: false, options: { limit: [24, 2, 30] } },
  nextup: { name: 'Next up', about: 'The next episode of each show you are watching on Jellyfin or Emby.', size: 'w', sizes: ['l', 'w', 'xl'], removable: true, multiple: false, options: { limit: [8, 2, 24] } },
  homeassistant: { name: 'Home Assistant', about: 'Lights, switches, sensors and scenes you pick. Tap to toggle a light or run a scene.', size: 'm', sizes: ANY, removable: true, multiple: true, options: {} },
  car: { name: 'Car', about: 'Your Tesla through Tessie: battery, range, charging, climate and locks.', size: 'm', sizes: ANY, removable: true, multiple: false, options: {} },
  uptime: { name: 'Uptime', about: 'Uptime Kuma, Gatus and Healthchecks.io: problems first, with recent checks and uptime.', size: 'm', sizes: ANY, removable: true, multiple: false, options: { limit: [8, 2, 40] } },
  dns: { name: 'Ad blocking', about: 'Pi-hole or AdGuard Home: what it blocked today, and Pause for 5, 30 or 60 minutes.', size: 's', sizes: ANY, removable: true, multiple: false, options: {} },
  speed: { name: 'Internet', about: 'Speedtest Tracker: the latest download, upload and ping, and the last day as a line.', size: 's', sizes: ANY, removable: true, multiple: false, options: {} },
  calendar: { name: 'Calendar', about: 'The days ahead from your iCal calendars: Google, iCloud, Outlook, Nextcloud and more.', size: 'm', sizes: ANY, removable: true, multiple: false, options: { limit: [8, 1, 40] } },
  books: { name: 'Books', about: 'Hardcover or Goodreads: what you are reading now, with covers.', size: 's', sizes: ANY, removable: true, multiple: false, options: { limit: [4, 1, 12] } },
  notes: { name: 'Notes', about: 'A note or checklist the whole house shares. Lines starting with "- [ ]" become checkboxes.', size: 's', sizes: ANY, removable: true, multiple: true, options: {} },
  network: { name: 'Network', about: 'UniFi and Tailscale: clients, devices online or offline, and tailnet keys about to expire.', size: 's', sizes: ANY, removable: true, multiple: false, options: { limit: [6, 1, 50] } },
  dockerhosts: { name: 'Docker hosts', about: 'Portainer: every Docker environment, up or down, with running, stopped and unhealthy containers.', size: 's', sizes: ANY, removable: true, multiple: false, options: { limit: [8, 1, 60] } },
  storage: { name: 'Storage', about: 'Unraid, Synology or QNAP: every volume and pool, and every disk with its state and temperature.', size: 'm', sizes: ANY, removable: true, multiple: false, options: { limit: [10, 1, 60] } },
  power: { name: 'Power', about: 'NUT: every UPS, on mains or on battery, with charge, runtime and load.', size: 's', sizes: ANY, removable: true, multiple: false, options: {} },
  hosts: { name: 'Hosts', about: 'Glances or Beszel: CPU, memory, the fullest disk, network and temperature for every machine.', size: 'm', sizes: ANY, removable: true, multiple: false, options: { limit: [6, 1, 50] } },
  sync: { name: 'Sync', about: 'Syncthing: each folder up to date or how far along, and when each device last checked in.', size: 's', sizes: ANY, removable: true, multiple: false, options: { limit: [8, 1, 40] } },
  drives: { name: 'Drives', about: "Scrutiny: every drive's SMART verdict, temperature and age.", size: 's', sizes: ANY, removable: true, multiple: false, options: { limit: [8, 1, 40] } },
  proxmox: { name: 'Proxmox', about: 'Proxmox VE: each node and every VM and container, running or stopped.', size: 'm', sizes: ANY, removable: true, multiple: false, options: { limit: [8, 1, 40] } },
  photos: { name: 'Photos', about: 'Immich: photos, videos and library size, and what Immich is working on.', size: 's', sizes: ANY, removable: true, multiple: false, options: {} },
  bookmarks: { name: 'Bookmarks', about: 'The links in Edit apps, Bookmarks, or brought over from Homepage, grouped as you keep them.', size: 'm', sizes: ANY, removable: true, multiple: false, options: {} },
  search: { name: 'Search', about: 'A search box for DuckDuckGo, Google, Bing, Kagi, Startpage or any site you name. Opens the results in a new tab.', size: 'm', sizes: ANY, removable: true, multiple: true, options: { title: false, fields: [engineField, searchUrlField] } },
  clocks: {
    name: 'Clocks',
    about: 'The time where your people are, with the day when it differs from yours. Big clock shows your own time and date across a wall tablet.',
    size: 's',
    sizes: ANY,
    removable: true,
    multiple: true,
    options: {
      styles: [
        ['', 'List'],
        ['big', 'Big clock'],
      ],
      fields: [zonesField],
    },
  },
  markets: {
    name: 'Markets',
    about: "Coins, stocks, funds, indexes and currencies: the price, the day's change and a line of the day. No key needed. Prices can run 15 minutes behind.",
    size: 'm',
    sizes: ANY,
    removable: true,
    multiple: true,
    options: {
      styles: [
        ['', 'List'],
        ['big', 'Big numbers'],
      ],
      fields: [symbolsField],
    },
  },
  sky: { name: 'Sun and moon', about: "Sunrise, sunset, how long the day is and how it's changing, and the moon tonight. Uses the weather's place.", size: 's', sizes: ANY, removable: true, multiple: false, options: {} },
  managers: { name: 'Media managers', about: "Lidarr, Readarr, Prowlarr and Bazarr, a line each: whether it's healthy, what's stuck, and what's queued or missing subtitles.", size: 's', sizes: ANY, removable: true, multiple: false, options: {} },
  documents: { name: 'Documents', about: 'Paperless-ngx: documents waiting in the inbox, and how many it holds.', size: 's', sizes: ANY, removable: true, multiple: false, options: {} },
  nextcloud: { name: 'Nextcloud', about: 'Files, people on today, free space, and app updates waiting.', size: 's', sizes: ANY, removable: true, multiple: false, options: {} },
  git: { name: 'Git', about: 'Gitea or Forgejo: notifications waiting and how many repositories it holds.', size: 's', sizes: ANY, removable: true, multiple: false, options: {} },
  monitoring: { name: 'Monitoring alerts', about: 'Alerts firing now in Netdata or Prometheus, critical first, each linking back to where it fired.', size: 'm', sizes: ANY, removable: true, multiple: false, options: { limit: [6, 1, 20] } },
  halist: { name: 'List', about: 'A Home Assistant to-do list, such as Shopping list or Chores: tick items off and add new ones, from any screen, wall tablets too.', size: 's', sizes: ANY, removable: true, multiple: true, options: { limit: [12, 3, 40] } },
  climate: { name: 'Thermostat', about: "A Home Assistant thermostat: the temperature inside, what it's set to with minus and plus, and whether it's heating or cooling.", size: 's', sizes: ANY, removable: true, multiple: true, options: {} },
  shades: { name: 'Shades', about: 'Home Assistant blinds, shades and curtains: how far open each is, and open, stop or close. Garage doors and gates show their state only.', size: 's', sizes: ANY, removable: true, multiple: true, options: {} },
  people: { name: 'People', about: "Who's home and who's out, from Home Assistant's people, and since when.", size: 'm', sizes: ANY, removable: true, multiple: false, options: {} },
  miners: { name: 'Miners', about: 'BitAxe and other AxeOS miners: hashrate with its last day, the ASIC temperature, power and efficiency, the best difficulty and shares, a line each.', size: 'm', sizes: ANY, removable: true, multiple: false, options: {} },
  rooms: { name: 'Rooms', about: "Each room's temperature from Home Assistant, with a strip of its last day.", size: 'm', sizes: ANY, removable: true, multiple: true, options: {} },
  chores: { name: 'Chores', about: "Things done every so often, like watering the plants or changing a filter: the days since each was last done, and Done to start the count again, from any screen, wall tablets too.", size: 's', sizes: ANY, removable: true, multiple: true, options: { fields: [choresField] } },
  countdown: { name: 'Countdown', about: 'Days until the dates you name: a trip, a birthday, the holidays. A date without a year comes around every year.', size: 's', sizes: ANY, removable: true, multiple: true, options: { fields: [eventsField] } },
  rss: { name: 'Feeds', about: 'The newest posts from any RSS or Atom feeds you list, no reader app needed. Patchboard fetches them every 15 minutes.', size: 'm', sizes: ANY, removable: true, multiple: true, options: { limit: [8, 2, 30], fields: [feedsField] } },
  releases: { name: 'Releases', about: "The newest release of the GitHub projects you follow, such as the apps you run, checked every hour.", size: 'm', sizes: ANY, removable: true, multiple: true, options: { limit: [8, 1, 20], fields: [reposField] } },
  cameras: { name: 'Cameras', about: "Frigate: each camera's newest frame, refreshed every 5 seconds while on screen (tap one to watch it live), and what the cameras that detect saw today. Anyone who can open this board sees the pictures.", size: 'w', sizes: ANY, removable: true, multiple: true, options: { limit: [6, 1, 20], styles: [['', 'Frames and today'], ['big', 'Large frames']], fields: [camerasField] } },
  watched: { name: 'Watched', about: 'What was played lately on Plex, Jellyfin and Emby, newest first, with who watched and when. Each opens in its app.', size: 'm', sizes: ANY, removable: true, multiple: false, options: { limit: [8, 2, 15] } },
  listening: { name: 'Listening', about: 'Audiobookshelf books in progress, with how far along, and albums played lately on Navidrome.', size: 'm', sizes: ANY, removable: true, multiple: false, options: { limit: [6, 1, 8] } },
  downloads: { name: 'Downloads', about: 'Every unfinished download across your clients, with pause, resume and remove, and what Sonarr and Radarr are stuck on, with Try another release. With this on the board, Right now leaves downloads to it.', size: 'm', sizes: ANY, removable: true, multiple: false, options: { limit: [8, 2, 30] } },
  requests: { name: 'Requests', about: 'Overseerr or Jellyseerr: requests waiting for you, with Approve and Decline, and approved ones still on the way. Hidden while there are neither.', size: 'm', sizes: ANY, removable: true, multiple: false, options: { limit: [5, 1, 20] } },
  wake: { name: 'Wake', about: 'Wake-on-LAN buttons for the machines you name in Settings, Connections.', size: 's', sizes: ANY, removable: true, multiple: false, options: {} },
  container: { name: 'Container', about: "One container's CPU, memory, response time and 14 days of health.", size: 's', sizes: ['s', 'm', 'l'], removable: true, multiple: true, options: {} },
  json: { name: 'API numbers', about: 'Up to four values from any JSON API, with warning and alarm thresholds.', size: 's', sizes: ['s', 'm', 'l', 'w'], removable: true, multiple: true, options: { title: false } },
};

/**
 * A fresh install's Home: server details live in the header. Apps as icons,
 * Right now, the week, reading and changes fit into the board below.
 */
export const DEFAULT_BOARD: Board = {
  version: 1,
  columns: 3,
  fit: true,
  widgets: [
    // Pinned columns: Fit's cuts then stay with the card they were made for,
    // instead of cards reflowing to another column after the first cut.
    { id: 'apps', type: 'apps', size: 'w', span: 2, column: 1, config: { style: 'patchbay' } },
    { id: 'now', type: 'now', size: 'm', span: 1, column: 3 },
    { id: 'attention', type: 'attention', size: 'm', span: 1, column: 1 },
    { id: 'upcoming', type: 'upcoming', size: 'm', span: 1, column: 1 },
    { id: 'feeds', type: 'feeds', size: 'm', span: 1, column: 2 },
    { id: 'changes', type: 'changes', size: 'm', span: 1, column: 3 },
  ],
};

/** Every everyday widget, three columns, scrolling: the old default. */
const EVERYTHING: Board = {
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

/** A new board with nothing on it but Needs attention, which lives in the header. */
export const EMPTY_BOARD: Board = { version: 1, columns: 3, widgets: [{ id: 'attention', type: 'attention', size: 'm' }] };

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
    if (HA_WIDGETS[w.type as WidgetType]) {
      const ids = parseEntities((w.config as Record<string, unknown> | undefined)?.entities as string | undefined, w.type as WidgetType);
      if (ids.length) config = { entities: ids.join(',') };
    }
    const common = commonOptions(info, w.config, w.type as WidgetType);
    if (Object.keys(common).length) config = { ...(config ?? {}), ...common };
    const span = Number.isInteger(w.span) && (w.span as number) >= 1 && (w.span as number) <= 6 ? (w.span as number) : undefined;
    const column = Number.isInteger(w.column) && (w.column as number) >= 1 && (w.column as number) <= 6 ? w.column : undefined;
    widgets.push({ ...(column ? { column } : {}), id: w.id, type: w.type as WidgetType, size, ...(span ? { span } : {}), ...(config ? { config } : {}) });
  }
  // Needs attention is part of what Patchboard is; it can move but not leave.
  if (!widgets.some((w) => w.type === 'attention')) widgets.unshift({ id: 'attention', type: 'attention', size: 'm' });
  const columns = Number.isInteger(raw.columns) && (raw.columns as number) >= 2 && (raw.columns as number) <= 6 ? (raw.columns as number) : undefined;
  const name = cleanBoardName((raw as { name?: unknown }).name);
  const fit = (raw as { fit?: unknown }).fit === true;
  const wall = (raw as { wall?: unknown }).wall === true;
  return { board: { version: 1, ...(name ? { name } : {}), ...(columns ? { columns } : {}), ...(fit ? { fit } : {}), ...(wall ? { wall } : {}), widgets } };
}

/** The shared settings, kept only when they make sense for this widget. */
function commonOptions(info: Info, raw: unknown, type: WidgetType): Record<string, string> {
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
  if ((c.view === 'compact' || c.view === 'number') && viewsOf(type).some(([v]) => v === c.view)) out.view = c.view;
  if (out.view === 'number' && typeof c.number === 'string' && NUMBERS[type]?.some(([k]) => k === c.number)) out.number = c.number;
  for (const f of info.options.fields ?? []) {
    if (typeof c[f.key] !== 'string' || !(c[f.key] as string).trim()) continue;
    const v = f.check(c[f.key] as string);
    if (v) out[f.key] = v;
  }
  return out;
}

/** Starting layouts, offered in Customize and on the first run. `wall` ones are made for a tablet or screen on the wall, and start new boards. */
export const STARTERS: { id: string; name: string; about: string; board: Board; wall?: boolean }[] = [
  { id: 'home', name: 'One screen', about: 'The server, Right now, apps as icons, the week, reading and changes, fit to the window.', board: DEFAULT_BOARD },
  { id: 'everything', name: 'Everything', about: 'The everyday widgets with apps as tiles and posters, three columns. Scrolls.', board: EVERYTHING },
  {
    id: 'media',
    name: 'Media night',
    about: "What's playing, what's coming, what's new.",
    board: {
      version: 1,
      columns: 3,
      widgets: [
        { id: 'apps', type: 'apps', size: 'xl', span: 3, config: { style: 'patchbay' } },
        { id: 'now', type: 'now', size: 'm', span: 1 },
        // Two wide: the row stays full while Needs attention lives in the header.
        { id: 'upcoming', type: 'upcoming', size: 'm', span: 2, config: { days: '14', limit: '14' } },
        { id: 'recent', type: 'recent', size: 'xl', span: 3 },
        { id: 'nextup', type: 'nextup', size: 'xl', span: 3 },
        { id: 'attention', type: 'attention', size: 'm', span: 1 },
      ],
    },
  },
  {
    id: 'ops',
    name: 'Server room',
    about: 'Problems, resources and what changed, on four columns.',
    board: {
      version: 1,
      columns: 4,
      widgets: [
        { id: 'attention', type: 'attention', size: 'l', span: 2 },
        { id: 'vitals', type: 'vitals', size: 'l', span: 2 },
        { id: 'changes', type: 'changes', size: 'l', span: 2, config: { limit: '12' } },
        { id: 'now', type: 'now', size: 'm', span: 1 },
        { id: 'weather', type: 'weather', size: 'm', span: 1 },
        { id: 'apps', type: 'apps', size: 'xl', span: 4 },
      ],
    },
  },
  {
    id: 'calm',
    name: 'Calm',
    about: 'Weather, the week, and only what needs you.',
    board: {
      version: 1,
      columns: 2,
      widgets: [
        { id: 'attention', type: 'attention', size: 'm', span: 1 },
        { id: 'weather', type: 'weather', size: 'm', span: 1 },
        { id: 'upcoming', type: 'upcoming', size: 'm', span: 1 },
        { id: 'feeds', type: 'feeds', size: 'm', span: 1, config: { limit: '4' } },
        { id: 'apps', type: 'apps', size: 'xl', span: 2, config: { style: 'patchbay' } },
      ],
    },
  },
  {
    id: 'wall-clock',
    name: 'Wall: clock and weather',
    about: 'A big clock and the date, the weather, the sun and moon, and your countdowns. For a tablet in the kitchen or hall.',
    wall: true,
    board: {
      version: 1,
      columns: 2,
      fit: true,
      wall: true,
      widgets: [
        { id: 'attention', type: 'attention', size: 'm' },
        { id: 'clocks', type: 'clocks', size: 'l', span: 1, config: { style: 'big' } },
        { id: 'weather', type: 'weather', size: 'l', span: 1 },
        { id: 'sky', type: 'sky', size: 'l', span: 1 },
        { id: 'countdown', type: 'countdown', size: 'l', span: 1, config: { events: 'New Year=01-01' } },
      ],
    },
  },
  {
    id: 'wall-markets',
    name: 'Wall: markets',
    about: "Bitcoin, the big indexes and a currency as large tiles with the day's line. Change what it follows in the widget.",
    wall: true,
    board: {
      version: 1,
      columns: 2,
      fit: true,
      wall: true,
      widgets: [
        { id: 'attention', type: 'attention', size: 'm' },
        { id: 'markets', type: 'markets', size: 'w', span: 2, config: { style: 'big', symbols: 'Bitcoin=BTC\nEthereum=ETH\nS&P 500=^GSPC\nNasdaq=^IXIC\nEUR/USD' } },
      ],
    },
  },
  {
    id: 'wall-house',
    name: 'Wall: house',
    about: 'Lights, scenes and the thermostat from Home Assistant beside the weather, and the cameras. Pin what you want in the Home Assistant widget.',
    wall: true,
    board: {
      version: 1,
      columns: 2,
      fit: true,
      wall: true,
      widgets: [
        { id: 'attention', type: 'attention', size: 'm' },
        { id: 'homeassistant', type: 'homeassistant', size: 'l', span: 1 },
        { id: 'weather', type: 'weather', size: 'l', span: 1 },
        { id: 'cameras', type: 'cameras', size: 'xl', span: 2 },
      ],
    },
  },
  {
    id: 'wall-cameras',
    name: 'Wall: cameras',
    about: 'Every camera, large, refreshed every few seconds. Tap one to watch it live.',
    wall: true,
    board: {
      version: 1,
      columns: 2,
      fit: true,
      wall: true,
      widgets: [
        { id: 'attention', type: 'attention', size: 'm' },
        { id: 'cameras', type: 'cameras', size: 'xl', span: 2, config: { style: 'big' } },
      ],
    },
  },
  {
    id: 'wall-media',
    name: 'Wall: media',
    about: "What's playing, downloading and coming up this week, and what was added.",
    wall: true,
    board: {
      version: 1,
      columns: 2,
      fit: true,
      wall: true,
      widgets: [
        { id: 'attention', type: 'attention', size: 'm' },
        { id: 'now', type: 'now', size: 'l', span: 1 },
        { id: 'upcoming', type: 'upcoming', size: 'l', span: 1, config: { days: '7' } },
        { id: 'downloads', type: 'downloads', size: 'l', span: 1 },
        { id: 'recent', type: 'recent', size: 'l', span: 1 },
      ],
    },
  },
];
