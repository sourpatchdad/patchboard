// The otter: Patchboard's mark and mascot. The art lives in art/otter, one
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
 * The image for a mood. A tile is the otter on its navy (or, for light,
 * cream) square, as on the app icon. Without one the otter floats in its
 * pool; the light version has brown whiskers and navy marks so nothing cream
 * vanishes on a light page.
 */
export function otterSrc(mood: OtterMood, o: { tile?: boolean; light?: boolean } = {}): string {
  return `/otter/${mood}${o.tile ? '' : '-clear'}${o.light ? '-light' : ''}.png`;
}

/** The otter's mood for a server's state: worst alert level, and whether it is night. */
export function moodFor(level: 'critical' | 'warn' | null, night = false): OtterMood {
  if (level === 'critical') return 'worried';
  if (level === 'warn') return 'alert';
  return night ? 'asleep' : 'calm';
}
