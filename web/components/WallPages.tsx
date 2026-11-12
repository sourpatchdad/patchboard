// A household device with more than one page: a swipe moves between them,
// dots at the bottom show where it is, and it can turn the pages by itself.
// The pages and the timing are set in Settings for each device. Mounted in
// the page frame and in the Monitor, which sits outside it.

import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store.tsx';
import { t } from '../lib/i18n.ts';

// A touch counts as a swipe past this far sideways, and mostly sideways.
const SWIPE_PX = 70;
// After someone touches the screen, turning by itself waits this long.
const HOLD_MS = 3 * 60_000;
// Swipes from the very edge belong to the browser or the kiosk app.
const EDGE_PX = 24;
// The last touch or key, shared: the Monitor and the other pages each mount
// their own copy of this, and a page turn mustn't forget the touch.
let touchedAt = 0;

/** Inside something that scrolls sideways, a sideways drag is that scroll's. */
function scrollsSideways(el: Element | null): boolean {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 2 && /(auto|scroll)/.test(getComputedStyle(n).overflowX)) return true;
    if (n.matches('input, textarea, select, [contenteditable]')) return true;
  }
  return false;
}

export function WallPages() {
  const { snap } = useStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const h = snap?.household;
  const list = h?.opens ? [h.opens, ...(h.pages ?? [])] : [];
  const at = list.indexOf(pathname);
  const [lit, setLit] = useState(false);

  const go = (step: number) => {
    if (list.length < 2) return;
    const next = list[((at < 0 ? -step : at) + step + list.length) % list.length];
    navigate(next);
  };
  const goRef = useRef(go);
  goRef.current = go;

  // Swipes and arrow keys. A sideways drag is the page's to read, so the
  // browser doesn't take it as a pan or a swipe back; something inside that
  // scrolls sideways still scrolls. The page follows the finger a little
  // while it moves, and the touch that ends a swipe isn't a tap: it opens no
  // preview, link or menu underneath.
  useEffect(() => {
    if (list.length < 2) return;
    const root = document.documentElement;
    root.classList.add('wall-swipe');
    let start: { x: number; y: number; t: number } | null = null;
    let swallowUntil = 0;
    let frame = 0;
    // Only the page showing moves, by its own transform: a style change on
    // the whole document would restyle every element on each frame.
    let moved: HTMLElement | null = null;
    const drag = (px: number) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        moved ??= [...document.querySelectorAll<HTMLElement>('.shell > main, .monitor')].find((el) => el.getClientRects().length > 0) ?? null;
        if (!moved) return;
        moved.style.transition = px ? 'none' : '';
        moved.style.transform = px ? `translateX(${px}px)` : '';
        if (!px) moved = null;
      });
    };
    const down = (e: PointerEvent) => {
      touchedAt = Date.now();
      start = e.pointerType !== 'mouse' && e.clientX > EDGE_PX && e.clientX < innerWidth - EDGE_PX && !scrollsSideways(e.target as Element) ? { x: e.clientX, y: e.clientY, t: e.timeStamp } : null;
    };
    const move = (e: PointerEvent) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      // Clearly sideways: follow it, at a third of the distance.
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) drag(Math.round(dx / 3));
    };
    const up = (e: PointerEvent) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      // Timed by the touch itself, not by when a busy page got round to it.
      const quick = e.timeStamp - start.t < 800;
      start = null;
      drag(0);
      if (Math.abs(dx) > 12) swallowUntil = Date.now() + 450;
      if (quick && Math.abs(dx) > SWIPE_PX && Math.abs(dy) < Math.abs(dx) * 0.6) goRef.current(dx < 0 ? 1 : -1);
    };
    // The click a browser sends after a drag, and the long-press menu.
    const click = (e: Event) => {
      if (Date.now() < swallowUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const menu = (e: Event) => e.preventDefault();
    const key = (e: KeyboardEvent) => {
      touchedAt = Date.now();
      if (e.altKey || e.ctrlKey || e.metaKey || (e.target as Element)?.matches?.('input, textarea, select')) return;
      if (e.key === 'ArrowRight') goRef.current(1);
      if (e.key === 'ArrowLeft') goRef.current(-1);
    };
    const cancel = () => {
      start = null;
      drag(0);
    };
    addEventListener('pointerdown', down, { passive: true });
    addEventListener('pointermove', move, { passive: true });
    addEventListener('pointerup', up, { passive: true });
    addEventListener('pointercancel', cancel);
    addEventListener('click', click, true);
    addEventListener('contextmenu', menu);
    addEventListener('keydown', key);
    return () => {
      root.classList.remove('wall-swipe');
      cancelAnimationFrame(frame);
      if (moved) moved.style.transform = moved.style.transition = '';
      removeEventListener('pointerdown', down);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', cancel);
      removeEventListener('click', click, true);
      removeEventListener('contextmenu', menu);
      removeEventListener('keydown', key);
    };
  }, [list.length]);

  // Turning by itself, held off for a while after a touch.
  useEffect(() => {
    if (list.length < 2 || !h?.rotate) return;
    const t = setInterval(() => {
      if (Date.now() - touchedAt > HOLD_MS) goRef.current(1);
    }, h.rotate * 1000);
    return () => clearInterval(t);
  }, [list.length, h?.rotate, pathname]);

  // The dots brighten for a moment on each new page, then fade back.
  useEffect(() => {
    setLit(true);
    const t = setTimeout(() => setLit(false), 2500);
    return () => clearTimeout(t);
  }, [pathname]);

  if (list.length < 2) return null;
  return (
    <nav className={`wall-dots${lit ? ' is-lit' : ''}`} aria-label={t('Pages')}>
      {list.map((p, i) => (
        <button key={p} type="button" aria-label={t('Page {n} of {all}', { n: i + 1, all: list.length })} aria-current={i === at ? 'page' : undefined} onClick={() => navigate(p)} />
      ))}
    </nav>
  );
}
