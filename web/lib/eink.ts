// E-ink: a screen that flashes on every redraw and shows no color. When a
// device is set to it, from Settings for a household device or under Look
// for any browser, the page goes black on white with no motion, status
// shows by shape, and live updates are gathered and drawn once a minute.

import { useSyncExternalStore } from 'react';

/** How often an e-ink screen is redrawn with what changed. */
export const EINK_MS = 60_000;

let on = false;
const listeners = new Set<() => void>();

export function einkOn(): boolean {
  return on;
}

export function setEink(next: boolean): void {
  if (next === on) return;
  on = next;
  document.documentElement.toggleAttribute('data-eink', on);
  for (const fn of listeners) fn();
}

/** Called whenever e-ink turns on or off, from anywhere. */
export function onEink(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useEink(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => on,
  );
}
