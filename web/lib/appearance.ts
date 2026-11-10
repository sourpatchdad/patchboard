// Appearance and preferences, per device. Saved in localStorage and applied
// as CSS variables and attributes on <html>. Both the dark and the light
// variables are saved, so the inline script in index.html can paint the right
// theme before any JavaScript bundle loads, even if the system switched
// between dark and light since the last visit. Keep KEY and VARS_KEY in step
// with that script.

import { moodFor, OTTER, otterSrc } from '../../shared/otter.ts';
import { useSyncExternalStore } from 'react';
import { contrast, MEDIA_COLORS, type CustomColors, DEFAULT_CUSTOM, FONTS, type FontSet, mix, THEMES, type Tokens, tokensFrom } from './themes.ts';

export type Scheme = 'auto' | 'dark' | 'light';
export type IconMode = 'mono' | 'color';
export type HomeApps = 'tiles' | 'patchbay';
/** Which app icon this device installs and shows in its tab: follow the mode, or always one. */
export type AppIcon = 'auto' | 'dark' | 'light';
export type Density = 'compact' | 'comfortable' | 'large';
export type TempUnit = 'f' | 'c' | 'both';
export type HomeSection = 'inbox' | 'feeds' | 'upcoming' | 'now' | 'changes' | 'recent';

export interface Appearance {
  theme: string;
  scheme: Scheme;
  /** A preset name, 'default' for the theme's own, or 'custom' for accentHex. */
  accent: string;
  accentHex: string;
  custom: CustomColors;
  icons: IconMode;
  homeApps: HomeApps;
  appIcon: AppIcon;
  /** The otter in empty and quiet moments. The header mark stays either way. */
  otter: boolean;
  font: 'theme' | FontSet;
  density: Density;
  homeClockSize: 'hidden' | 'small' | 'medium' | 'large';
  homeStatusSize: 'hidden' | 'small' | 'medium' | 'large';
  homeWeather: 'hidden' | 'current' | 'summary' | 'hourly';
  homeServer: 'hidden' | 'summary' | 'full' | 'card';
  clock24: boolean;
  temp: TempUnit;
  hidden: HomeSection[];
}

const KEY = 'pb-appearance';
const VARS_KEY = 'pb-vars';
const usesFahrenheit = typeof navigator !== 'undefined' && /^en-(US|LR|MM)$|^en$/.test(navigator.language || 'en-US');

export const DEFAULTS: Appearance = {
  theme: 'graphite',
  scheme: 'auto',
  accent: 'default',
  accentHex: '#5fd0c5',
  custom: DEFAULT_CUSTOM,
  icons: 'mono',
  homeApps: 'tiles',
  appIcon: 'auto',
  otter: true,
  font: 'theme',
  density: 'comfortable',
  homeClockSize: 'small',
  homeStatusSize: 'medium',
  homeWeather: 'current',
  homeServer: 'card',
  clock24: false,
  temp: usesFahrenheit ? 'f' : 'c',
  hidden: [],
};

export const ACCENTS: { id: string; name: string; dark: string; light: string }[] = [
  { id: 'blue', name: 'Blue', dark: '#6ea8fe', light: '#2563c9' },
  { id: 'teal', name: 'Teal', dark: '#5fd0c5', light: '#0f7d74' },
  { id: 'green', name: 'Green', dark: '#5fcf8a', light: '#1d7a45' },
  { id: 'violet', name: 'Violet', dark: '#a99bff', light: '#5b4bd1' },
  { id: 'rose', name: 'Rose', dark: '#ff8fa3', light: '#b4234a' },
  { id: 'sand', name: 'Sand', dark: '#d8bf8f', light: '#8a5a2b' },
  { id: 'mono', name: 'None (white)', dark: '#f2f2f2', light: '#111111' },
];

export const HOME_SECTIONS: { id: HomeSection; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'feeds', label: 'Reading' },
  { id: 'upcoming', label: 'This week' },
  { id: 'now', label: 'Right now' },
  { id: 'changes', label: 'Changes' },
  { id: 'recent', label: 'Recently added' },
];

let hadSaved = false;

/** Older numeric headers adopt the graphical default; explicit off stays off. */
function withDefaults(saved: Partial<Appearance>): Appearance {
  return { ...DEFAULTS, ...saved, homeServer: saved.homeServer === 'hidden' ? 'hidden' : 'card', custom: { ...DEFAULTS.custom, ...(saved.custom ?? {}) } };
}

function read(): Appearance {
  try {
    const raw = localStorage.getItem(KEY);
    hadSaved = raw !== null;
    const saved = JSON.parse(raw ?? '{}') as Partial<Appearance>;
    return withDefaults(saved);
  } catch {
    return DEFAULTS;
  }
}

let current = read();
const listeners = new Set<() => void>();
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;

/** The token set for one scheme, with the accent choice applied. */
export function tokensFor(a: Appearance, scheme: 'dark' | 'light'): Tokens {
  let t: Tokens;
  if (a.theme === 'custom') t = tokensFrom(a.custom);
  else {
    const def = THEMES.find((x) => x.id === a.theme) ?? THEMES[0];
    t = { ...def[scheme] };
  }
  if (a.accent === 'custom') {
    // Keep a picked accent legible: darken it on light backgrounds if needed.
    t.accent = contrast(a.accentHex, t.bg) < 3 ? mix(a.accentHex, scheme === 'light' ? '#000000' : '#ffffff', 0.35) : a.accentHex;
  } else if (a.accent !== 'default') {
    const p = ACCENTS.find((x) => x.id === a.accent);
    if (p) t.accent = p[scheme];
  }
  return t;
}

function varsFor(a: Appearance, scheme: 'dark' | 'light'): Record<string, string> {
  const t = tokensFor(a, scheme);
  const def = THEMES.find((x) => x.id === a.theme);
  const fonts = FONTS[a.font === 'theme' ? (def?.fonts ?? 'geist') : a.font];
  const v: Record<string, string> = {
    'color-scheme': scheme,
    '--bg': t.bg,
    '--raised': t.raised,
    '--surface': t.surface,
    '--line': t.line,
    '--line-soft': t.lineSoft,
    '--ink': t.ink,
    '--ink-2': t.ink2,
    '--ink-3': t.ink3,
    '--head': t.head,
    '--accent': t.accent,
    '--ok': t.ok,
    '--warn': t.warn,
    '--crit': t.crit,
    '--term-bg': t.termBg,
    '--f-display': fonts.display,
    '--f-body': fonts.body,
    '--f-mono': fonts.mono,
    '--display-weight': String(fonts.weight),
    '--display-tracking': fonts.tracking,
    '--clock-weight': String(fonts.clock),
  };
  for (const [name, colors] of Object.entries(MEDIA_COLORS)) v[`--media-${name}`] = colors[scheme];
  return v;
}

function resolvedScheme(a: Appearance): 'dark' | 'light' {
  if (a.theme === 'custom') return contrast(a.custom.bg, '#000000') > contrast(a.custom.bg, '#ffffff') ? 'light' : 'dark';
  return a.scheme === 'auto' ? (media?.matches ? 'light' : 'dark') : a.scheme;
}

function apply(a: Appearance): void {
  const r = document.documentElement;
  const scheme = resolvedScheme(a);
  const vars = { dark: varsFor(a, 'dark'), light: varsFor(a, 'light') };
  for (const [k, v] of Object.entries(vars[scheme])) r.style.setProperty(k, v);
  const def = THEMES.find((x) => x.id === a.theme);
  r.dataset.theme = a.theme === 'custom' ? 'custom' : (def?.id ?? 'graphite');
  r.dataset.scheme = scheme;
  r.dataset.icons = a.icons;
  r.dataset.density = a.density;
  try {
    localStorage.setItem(VARS_KEY, JSON.stringify({ ...vars, scheme: a.theme === 'custom' ? scheme : a.scheme, appIcon: a.appIcon, attrs: { theme: r.dataset.theme, icons: a.icons, density: a.density } }));
  } catch {
    // Private mode: fine, the defaults paint first and this applies a moment later.
  }
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) m.content = vars[scheme]['--bg'];
  applyIcon(a.appIcon, scheme);
}

/**
 * Point the tab icon, the home-screen icon and the install manifest at the
 * chosen variant. Browsers read these links when you add Patchboard to a home
 * screen or install it, so the choice here is what gets installed. The same
 * logic runs in index.html before the bundle loads.
 */
export function iconFiles(choice: AppIcon, scheme: 'dark' | 'light') {
  const fixed = choice === 'dark' || choice === 'light';
  const v = fixed ? choice : scheme;
  return {
    favicon: '/favicon.png',
    touch: v === 'light' ? '/icon-light-180.png' : '/icon-180.png',
    manifest: v === 'light' ? '/manifest-light.webmanifest' : '/manifest.webmanifest',
  };
}

/**
 * The server's state, for the tab icon: the otter looks up with an amber dot
 * when something needs you and worries with a red one when something is down.
 * When all is quiet the tab shows the plain icon file.
 */
let status: { level: 'critical' | 'warn' | null; count: number } = { level: null, count: 0 };
let appName = 'Patchboard';
let pageName = '';

const showTitle = () => {
  if (typeof document === 'undefined') return;
  const name = pageName ? `${pageName} - ${appName}` : appName;
  document.title = status.count ? `(${status.count}) ${name}` : name;
};

/** The page in the tab title, "Stacks - HomeNAS"; empty on Home. */
export function setPageName(name: string): void {
  pageName = name;
  showTitle();
}

/** The name in the tab, set in Settings, Look. */
export function setAppName(name: string): void {
  appName = name;
  showTitle();
}

export function setStatus(level: 'critical' | 'warn' | null, count: number): void {
  if (level === status.level && count === status.count) return;
  status = { level, count };
  applyIcon(current.appIcon, resolvedScheme(current));
  showTitle();
  // An installed app shows the count on its icon where the platform allows it.
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (count && nav.setAppBadge) void nav.setAppBadge(count).catch(() => {});
    else if (!count && nav.clearAppBadge) void nav.clearAppBadge().catch(() => {});
  } catch {
    /* not supported here */
  }
}

let drawn = 0;

/** The mood's tile with a status dot in the corner, as a data URL. */
async function statusIcon(level: 'critical' | 'warn'): Promise<string> {
  const img = new Image();
  img.src = otterSrc(moodFor(level), { mark: true });
  await img.decode();
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) throw new Error('no canvas');
  g.drawImage(img, 0, 0, 64, 64);
  g.beginPath();
  g.arc(51, 13, 11, 0, Math.PI * 2);
  g.fillStyle = level === 'critical' ? OTTER.crit : OTTER.warn;
  g.fill();
  return c.toDataURL('image/png');
}

function applyIcon(choice: AppIcon, scheme: 'dark' | 'light'): void {
  const f = iconFiles(choice, scheme);
  const set = (sel: string, href: string) => {
    const el = document.querySelector<HTMLLinkElement>(sel);
    if (el && el.getAttribute('href') !== href) el.setAttribute('href', href);
  };
  set('link[rel="apple-touch-icon"]', f.touch);
  set('link[rel="manifest"]', f.manifest);
  const turn = ++drawn;
  const level = status.level;
  if (!level) {
    set('link[rel="icon"]', f.favicon);
    return;
  }
  statusIcon(level)
    .then((url) => turn === drawn && set('link[rel="icon"]', url))
    .catch(() => turn === drawn && set('link[rel="icon"]', f.favicon));
}

media?.addEventListener('change', () => {
  if (current.scheme === 'auto') apply(current);
});

let pushTimer: ReturnType<typeof setTimeout> | undefined;

/** Save the look on the server too, so a new browser or home-screen app starts from it. */
function pushToServer(): void {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void fetch('/api/appearance', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-patchboard': 'action' }, body: JSON.stringify(current) }).catch(() => {});
  }, 800);
}

export function setAppearance(patch: Partial<Appearance>, o: { push?: boolean } = {}): void {
  current = { ...current, ...patch };
  hadSaved = true;
  if (o.push !== false) pushToServer();
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Private mode: the choice lasts for this visit only.
  }
  apply(current);
  for (const fn of listeners) fn();
}

export function resetAppearance(): void {
  setAppearance({ ...DEFAULTS });
}

/** Settings as a short JSON string, to carry to another device. */
export function exportAppearance(): string {
  return JSON.stringify(current);
}

export function importAppearance(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as Partial<Appearance>;
    if (typeof parsed !== 'object' || !parsed) return false;
    setAppearance(withDefaults(parsed));
    return true;
  } catch {
    return false;
  }
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
  );
}

export function getAppearance(): Appearance {
  return current;
}

/** Called once at startup; the inline script already painted, this makes it exact. */
export function initAppearance(): void {
  apply(current);
  if (hadSaved) return;
  // Nothing saved here yet: start from the last look saved on any device.
  void fetch('/api/appearance')
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { appearance?: Partial<Appearance> | null } | null) => {
      if (j?.appearance && !hadSaved) setAppearance(withDefaults(j.appearance), { push: false });
    })
    .catch(() => {});
}

export { THEMES };
