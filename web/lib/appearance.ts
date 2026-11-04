// Appearance and preferences, per device. Saved in localStorage and applied
// as CSS variables and attributes on <html>. Both the dark and the light
// variables are saved, so the inline script in index.html can paint the right
// theme before any JavaScript bundle loads, even if the system switched
// between dark and light since the last visit. Keep KEY and VARS_KEY in step
// with that script.

import { useSyncExternalStore } from 'react';
import { contrast, type CustomColors, DEFAULT_CUSTOM, FONTS, type FontSet, mix, THEMES, type Tokens, tokensFrom } from './themes.ts';

export type Scheme = 'auto' | 'dark' | 'light';
export type IconMode = 'mono' | 'color';
export type HomeApps = 'tiles' | 'patchbay';
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
  font: 'theme' | FontSet;
  density: Density;
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
  font: 'theme',
  density: 'comfortable',
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
  { id: 'feeds', label: 'Feeds' },
  { id: 'upcoming', label: 'This week' },
  { id: 'now', label: 'Right now' },
  { id: 'changes', label: 'Changes' },
  { id: 'recent', label: 'Recently added' },
];

function read(): Appearance {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Appearance>;
    return { ...DEFAULTS, ...saved, custom: { ...DEFAULTS.custom, ...(saved.custom ?? {}) } };
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
  // Flat themes take their sockets from the surfaces; the patch-bay theme keeps its own hardware colors from CSS.
  if (!def?.hardware) {
    Object.assign(v, { '--rack': t.raised, '--socket': t.surface, '--socket-hi': t.surface, '--screw': 'transparent', '--tape': 'transparent', '--tape-ink': t.ink3 });
  }
  return v;
}

const HARDWARE_VARS = ['--rack', '--socket', '--socket-hi', '--screw', '--tape', '--tape-ink'];

function resolvedScheme(a: Appearance): 'dark' | 'light' {
  if (a.theme === 'custom') return contrast(a.custom.bg, '#000000') > contrast(a.custom.bg, '#ffffff') ? 'light' : 'dark';
  return a.scheme === 'auto' ? (media?.matches ? 'light' : 'dark') : a.scheme;
}

function apply(a: Appearance): void {
  const r = document.documentElement;
  const scheme = resolvedScheme(a);
  const vars = { dark: varsFor(a, 'dark'), light: varsFor(a, 'light') };
  for (const k of HARDWARE_VARS) r.style.removeProperty(k);
  for (const [k, v] of Object.entries(vars[scheme])) r.style.setProperty(k, v);
  const def = THEMES.find((x) => x.id === a.theme);
  r.dataset.theme = def?.hardware ? def.id : a.theme === 'custom' ? 'custom' : (def?.id ?? 'graphite');
  r.dataset.scheme = scheme;
  r.dataset.icons = a.icons;
  r.dataset.density = a.density;
  delete r.dataset.accent;
  try {
    localStorage.setItem(VARS_KEY, JSON.stringify({ ...vars, scheme: a.theme === 'custom' ? scheme : a.scheme, attrs: { theme: r.dataset.theme, icons: a.icons, density: a.density } }));
  } catch {
    // Private mode: fine, the defaults paint first and this applies a moment later.
  }
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) m.content = vars[scheme]['--bg'];
}

media?.addEventListener('change', () => {
  if (current.scheme === 'auto') apply(current);
});

export function setAppearance(patch: Partial<Appearance>): void {
  current = { ...current, ...patch };
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
    setAppearance({ ...DEFAULTS, ...parsed });
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
}

export { THEMES };
