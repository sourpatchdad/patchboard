// Arriving from a link that points at one part of a page: scroll to it and
// light it up for a moment, so the eye lands where the click meant.

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function land(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  el.classList.add('is-landing');
  setTimeout(() => el.classList.remove('is-landing'), 1800);
}

/** Land on the element the URL's #hash names, once the page has its data. */
export function useLanding(ready: boolean): void {
  const { hash } = useLocation();
  useEffect(() => {
    if (ready && hash) land(decodeURIComponent(hash.slice(1)));
  }, [hash, ready]);
}
