// The otter: Patchboard's mark and mascot. The art lives in scripts/otter, one
// PNG per mood; `npm run icons` turns it into the app icons and the per-mood
// images in web/public/otter. This module names the moods, picks one for the
// server's state, and points at the right file.

export type OtterMood = 'hello' | 'calm' | 'alert' | 'worried' | 'asleep' | 'happy' | 'lost';

export const OTTER_MOODS: readonly OtterMood[] = ['hello', 'calm', 'alert', 'worried', 'asleep', 'happy', 'lost'];

/** The palette the art uses, for anything drawn next to it (the tab icon's dot). */
export const OTTER = {
  navy: '#11223b',
  cream: '#f5efe4',
  warn: '#f0a43a',
  crit: '#ef5b4c',
} as const;

/**
 * The image for a mood: the otter on its navy tile (or, with light, the
 * cream tile), or with no tile, floating in its pool. The art is never
 * recolored; light pages show the navy tile so the cream whiskers show.
 * The mark is the otter with no tile, cropped close, for the header and tab.
 */
export function otterSrc(mood: OtterMood, o: { tile?: boolean; light?: boolean; mark?: boolean } = {}): string {
  if (o.mark) return `/otter/${mood}-mark.png`;
  if (!o.tile) return `/otter/${mood}-clear.png`;
  return `/otter/${mood}${o.light ? '-light' : ''}.png`;
}

/**
 * The otter's mood for a server's state: worst alert level, whether it is
 * night, and how many quiet notes (image updates, an app it can't reach)
 * are waiting. Notes wake it, eyes open, without the alarm of a problem;
 * at night they can wait until morning.
 */
export function moodFor(level: 'critical' | 'warn' | null, night = false, notes = 0): OtterMood {
  if (level === 'critical') return 'worried';
  if (level === 'warn') return 'alert';
  if (night) return 'asleep';
  return notes ? 'hello' : 'calm';
}
