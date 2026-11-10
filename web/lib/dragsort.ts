// Drag to reorder with pointer events: mouse, touch and pen. The list
// reorders live under the pointer, with no ghost image and no drop guessing.
// Items carry data-<attr>="<id>"; while one is dragged it ignores the pointer,
// so whatever is under the pointer is the target. With a mouse, the whole item
// drags; with touch, only an element marked data-grip="<attr>" does, so the
// page still scrolls under a finger.

import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';

export function useDragSort(attr: string, onOver: (dragId: string, overId: string) => void, opts: { onDone?: () => void; gripOnly?: boolean; onPoint?: (id: string, x: number, y: number) => void } = {}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const s = useRef<{ id: string; x: number; y: number; started: boolean; last?: string } | null>(null);
  const cb = useRef({ onOver, onDone: opts.onDone, onPoint: opts.onPoint });
  cb.current = { onOver, onDone: opts.onDone, onPoint: opts.onPoint };

  useEffect(() => {
    let raf = 0;
    let dy = 0;
    const scroll = () => {
      if (dy) window.scrollBy(0, dy);
      raf = dy ? requestAnimationFrame(scroll) : 0;
    };
    const move = (e: PointerEvent) => {
      const d = s.current;
      if (!d) return;
      if (!d.started) {
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
        d.started = true;
        setDragging(d.id);
        document.body.classList.add('is-sorting');
      }
      e.preventDefault();
      cb.current.onPoint?.(d.id, e.clientX, e.clientY);
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(`[data-${attr}]`);
      const over = el?.dataset[attr];
      if (!cb.current.onPoint && over && over !== d.id && over !== d.last) {
        d.last = over;
        cb.current.onOver(d.id, over);
      } else if (!over) d.last = undefined;
      // Near the top or bottom edge, scroll so long lists stay reachable.
      const edge = 70;
      dy = e.clientY < edge ? -Math.ceil((edge - e.clientY) / 5) : e.clientY > innerHeight - edge ? Math.ceil((e.clientY - innerHeight + edge) / 5) : 0;
      if (dy && !raf) raf = requestAnimationFrame(scroll);
    };
    const end = () => {
      const d = s.current;
      s.current = null;
      dy = 0;
      if (d?.started) {
        setDragging(null);
        document.body.classList.remove('is-sorting');
        cb.current.onDone?.();
      }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      cancelAnimationFrame(raf);
    };
  }, [attr]);

  /** Spread on the item: <li {...bind(id)}>. */
  const bind = (id: string) => ({
    [`data-${attr}`]: id,
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement;
      if (t.closest('button, select, input, textarea, label, a[href]')) return;
      // A grip belongs to one kind of item: data-grip="<attr>".
      const onGrip = !!t.closest(`[data-grip="${attr}"]`);
      if ((opts.gripOnly || e.pointerType !== 'mouse') && !onGrip) return;
      // Only the innermost sortable item starts a drag (a tile inside a group).
      if (t.closest(`[data-${attr}]`) !== e.currentTarget) return;
      s.current = { id, x: e.clientX, y: e.clientY, started: false };
    },
  });

  return { dragging, bind };
}

/** Move one item in a list. */
export function moved<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}
