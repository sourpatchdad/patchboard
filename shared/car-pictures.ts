// A drawing of the car, for the tire pressures: each view with where its four
// tires sit, in percent of its width and height. A tire that view hides has
// no spot, and its pressure shows without a leader. The drawings themselves
// are built in (shared/car-art.ts).

import { TIRES, type TirePos } from './types.ts';

export interface CarPicture {
  /** A built-in drawing: /api/car-art/<car>/<view>.webp. */
  src: string;
  /** Where each tire sits, [x, y] in percent; null when this angle hides it. */
  at: Record<TirePos, [number, number] | null>;
  /** Where the charge port is, [x, y] in percent, for the cable while it's plugged in. */
  port?: [number, number] | null;
  /** Which view this is, so the drawing sheet puts it in its place. */
  view?: CarView;
  /** Width over height, so the space is held before the image loads. */
  aspect?: number;
}

/** Square-on views, and the two three-quarter views a turntable turns through between them. */
export type CarView = 'side' | 'top' | 'front' | 'rear' | 'front34' | 'rear34';

/** Where a tire's pressure goes on a picture: its side, and how far down, in the picture's units. */
export interface LabelSpot {
  left: boolean;
  y: number;
}

/**
 * Each pressure beside its tire, on the side the tire is nearer, at the
 * tire's own height, so every leader is short. Two on one side are moved
 * apart until they clear; a tire this angle hides takes the emptier side.
 * `h` is the picture's height when its width is 100.
 */
export function labelSpots(at: CarPicture['at'], h: number, gap = 11): Record<TirePos, LabelSpot> {
  const top = 8;
  const bottom = h - 4;
  const sides: Record<'left' | 'right', { t: TirePos; y: number }[]> = { left: [], right: [] };
  for (const t of TIRES) {
    const xy = at[t];
    if (xy) sides[xy[0] < 50 ? 'left' : 'right'].push({ t, y: (xy[1] * h) / 100 });
  }
  for (const t of TIRES) {
    if (at[t]) continue;
    const side = sides.left.length <= sides.right.length ? 'left' : 'right';
    // A front tire reads first: a hidden one sits high, a rear one low.
    sides[side].push({ t, y: t.startsWith('f') ? top : bottom });
  }
  const out = {} as Record<TirePos, LabelSpot>;
  for (const side of ['left', 'right'] as const) {
    const list = sides[side].sort((a, b) => a.y - b.y);
    // Clamp, push each down to clear the one above, then back up from the bottom.
    let prev = -Infinity;
    for (const l of list) {
      l.y = Math.max(top, l.y, prev + gap);
      prev = l.y;
    }
    let next = Infinity;
    for (const l of [...list].reverse()) {
      l.y = Math.min(bottom, l.y, next - gap);
      next = l.y;
    }
    for (const l of list) out[l.t] = { left: side === 'left', y: l.y };
  }
  return out;
}
