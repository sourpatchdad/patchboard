// Arriving from a link that points at one part of a page: scroll to it and
// mark it, so the eye lands where the click meant. The mark is still (the
// rule under it takes the accent) and clears the moment you do something.

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

let clear: (() => void) | undefined;

export function land(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  clear?.();
  el.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  el.classList.add('is-landing');
  const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
  const off = () => {
    el.classList.remove('is-landing');
    for (const e of events) window.removeEventListener(e, off, true);
    clear = undefined;
  };
  // The click that brought you here is still settling; listen from the next frame.
  requestAnimationFrame(() => {
    for (const e of events) window.addEventListener(e, off, { capture: true, passive: true });
  });
  clear = off;
}

/** Land on the element the URL's #hash names, once the page has its data. */
export function useLanding(ready: boolean): void {
  const { hash } = useLocation();
  useEffect(() => {
    if (ready && hash) land(decodeURIComponent(hash.slice(1)));
  }, [hash, ready]);
  useEffect(() => () => clear?.(), []);
}
