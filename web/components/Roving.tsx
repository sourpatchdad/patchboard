// One Tab stop for a group of links. Arrow keys move inside it by where
// things sit on screen (Up and Down follow the grid's rows, however it wraps),
// Home and End reach the ends, and Tab leaves for the next group. The last
// link you were on keeps the stop, so Shift+Tab comes back to it.

import { createElement, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

const ITEMS = 'a[href], button:not(:disabled)';

/** The nearest link in the row above or below, closest to the same column. */
function vertical(list: HTMLElement[], at: number, down: boolean): number {
  const cur = list[at].getBoundingClientRect();
  const x = cur.left + cur.width / 2;
  let best = -1;
  let bestRow = Infinity;
  let bestX = Infinity;
  list.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const beyond = down ? r.top >= cur.bottom - 4 : r.bottom <= cur.top + 4;
    if (!beyond) return;
    const row = Math.abs(r.top - cur.top);
    const dx = Math.abs(r.left + r.width / 2 - x);
    if (row < bestRow - 4 || (Math.abs(row - bestRow) <= 4 && dx < bestX)) {
      best = i;
      bestRow = row;
      bestX = dx;
    }
  });
  return best;
}

export function Roving({ as = 'div', className, children }: { as?: 'div' | 'ul'; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const current = useRef(0);
  const items = () => [...(ref.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];
  const sync = () => {
    const list = items();
    if (current.current >= list.length) current.current = 0;
    list.forEach((el, i) => {
      el.tabIndex = i === current.current ? 0 : -1;
    });
  };
  // Every render: live updates can add, drop or reorder links.
  useLayoutEffect(sync);

  const onFocus = (e: { target: EventTarget }) => {
    const i = items().indexOf(e.target as HTMLElement);
    if (i >= 0 && i !== current.current) {
      current.current = i;
      sync();
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    let n: number;
    if (e.key === 'ArrowRight') n = Math.min(i + 1, list.length - 1);
    else if (e.key === 'ArrowLeft') n = Math.max(i - 1, 0);
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = list.length - 1;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      n = vertical(list, i, e.key === 'ArrowDown');
      // Nothing above or below: the arrow scrolls the page as usual.
      if (n < 0) return;
    } else return;
    e.preventDefault();
    list[n].focus();
  };

  return createElement(as, { ref, className, onFocus, onKeyDown }, children);
}
