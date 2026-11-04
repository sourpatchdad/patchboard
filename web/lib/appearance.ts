// Appearance: theme, light/dark, accent and icon style. Saved per device in
// localStorage and applied as attributes on <html>. index.html runs the same
// logic inline before first paint, so a reload never flashes the wrong theme;
// keep the two in step (KEY and the attribute names).

import { useSyncExternalStore } from 'react';

export type ThemeId = 'graphite' | 'nbnstack';
export type Scheme = 'auto' | 'dark' | 'light';
export type Accent = 'default' | 'blue' | 'green' | 'amber' | 'violet' | 'rose' | 'mono';
export type IconMode = 'mono' | 'color';
export type HomeApps = 'tiles' | 'patchbay';

export interface Appearance {
  theme: ThemeId;
  scheme: Scheme;
  accent: Accent;
  icons: IconMode;
  /** Home's app panel: live tiles, or the compact patch bay. */
  homeApps: HomeApps;
}

const KEY = 'pb-appearance';
const DEFAULTS: Appearance = { theme: 'graphite', scheme: 'auto', accent: 'default', icons: 'mono', homeApps: 'tiles' };

export const THEMES: { id: ThemeId; name: string; note: string; swatch: string[] }[] = [
  { id: 'graphite', name: 'Graphite', note: 'Plain dark, one accent, Geist type.', swatch: ['#0b0c0e', '#191b1f', '#777c85', '#e3e4e6'] },
  { id: 'nbnstack', name: 'nbnstack', note: 'Warm, serif titles, patch-bay hardware.', swatch: ['#0e1114', '#1a1f24', '#e3dfd3', '#69aee8'] },
];

export const ACCENTS: { id: Accent; name: string; color: string }[] = [
  { id: 'default', name: "Theme's own", color: 'conic-gradient(#6ea8fe, #5fcf8a, #f0b45a, #a99bff, #6ea8fe)' },
  { id: 'blue', name: 'Blue', color: '#6ea8fe' },
  { id: 'green', name: 'Green', color: '#5fcf8a' },
  { id: 'amber', name: 'Amber', color: '#f0b45a' },
  { id: 'violet', name: 'Violet', color: '#a99bff' },
  { id: 'rose', name: 'Rose', color: '#ff8fa3' },
  { id: 'mono', name: 'None (white)', color: '#e3e4e6' },
];

function read(): Appearance {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Appearance>) };
  } catch {
    return DEFAULTS;
  }
}

let current = read();
const listeners = new Set<() => void>();
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;

function apply(a: Appearance): void {
  const r = document.documentElement;
  r.dataset.theme = a.theme;
  r.dataset.icons = a.icons;
  if (a.accent === 'default') delete r.dataset.accent;
  else r.dataset.accent = a.accent;
  const scheme = a.scheme === 'auto' ? (media?.matches ? 'light' : 'dark') : a.scheme;
  r.dataset.scheme = scheme;
  // Keep the phone's status bar in step with the page.
  const bg = getComputedStyle(r).getPropertyValue('--bg').trim();
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) m.content = bg || m.content;
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

export function useAppearance(): Appearance {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
  );
}

/** Called once at startup; the inline script already did the same, this syncs the meta color. */
export function initAppearance(): void {
  apply(current);
}
