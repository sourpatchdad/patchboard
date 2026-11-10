// Themes are data. Each one is a dark and a light set of color tokens plus a
// type pairing; appearance.ts turns the chosen one into CSS variables on
// <html>. To add a theme, add an entry here: nothing in styles.css needs to
// change, because every rule below the token block uses tokens only.
//
// Every theme keeps the same rule: color means trouble. `ok`, `warn` and
// `crit` must stay clearly apart from `accent`, and `ink3` must stay readable
// on `bg` (aim for 5:1 or better).

/** Playback brands identify the source. Warnings keep their own text and status colors. */
export const MEDIA_COLORS = {
  plex: { dark: '#e5a00d', light: '#986800' },
  jellyfin: { dark: '#aa72d8', light: '#7940a3' },
  emby: { dark: '#62bc50', light: '#347c26' },
  tracearr: { dark: '#53a8f5', light: '#246fb5' },
  audiobookshelf: { dark: '#dbb45c', light: '#886615' },
  navidrome: { dark: '#53b6dc', light: '#257494' },
};
export type MediaService = keyof typeof MEDIA_COLORS;

export interface Tokens {
  bg: string;
  raised: string;
  surface: string;
  line: string;
  lineSoft: string;
  ink: string;
  ink2: string;
  ink3: string;
  head: string;
  accent: string;
  ok: string;
  warn: string;
  crit: string;
  termBg: string;
}

export type FontSet = 'geist' | 'dm' | 'system' | 'mono';

export interface ThemeDef {
  id: string;
  name: string;
  note: string;
  fonts: FontSet;
  dark: Tokens;
  light: Tokens;
}

export const THEMES: ThemeDef[] = [
  {
    id: 'graphite',
    name: 'Graphite',
    note: 'Neutral dark, one accent.',
    fonts: 'geist',
    dark: {
      bg: '#0b0c0e', raised: '#141619', surface: '#1d2024', line: '#2f3338', lineSoft: '#22252a',
      ink: '#e6e7e9', ink2: '#b1b4ba', ink3: '#8d929b', head: '#f7f7f8',
      accent: '#6ea8fe', ok: '#6fbf8a', warn: '#e3a253', crit: '#ef6b5e', termBg: '#08090b',
    },
    light: {
      bg: '#f7f7f8', raised: '#efeff1', surface: '#e6e7ea', line: '#d3d5da', lineSoft: '#e4e5e9',
      ink: '#1f2328', ink2: '#454a52', ink3: '#626771', head: '#0b0c0e',
      accent: '#2563c9', ok: '#1d7a45', warn: '#9a5b00', crit: '#c0362c', termBg: '#fbfbfc',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    note: 'Deep navy, cool blue.',
    fonts: 'geist',
    dark: {
      bg: '#0a0e17', raised: '#101624', surface: '#172033', line: '#28344d', lineSoft: '#1b2539',
      ink: '#e3e8f2', ink2: '#aab4c8', ink3: '#8590a8', head: '#f5f8ff',
      accent: '#7aa2ff', ok: '#6cc3a0', warn: '#f0b45a', crit: '#ff7a85', termBg: '#070a12',
    },
    light: {
      bg: '#f4f6fb', raised: '#eceff7', surface: '#e1e6f1', line: '#cdd5e6', lineSoft: '#e1e6f1',
      ink: '#1a2233', ink2: '#3f4a62', ink3: '#5b6782', head: '#0b1220',
      accent: '#3355cc', ok: '#1f7a55', warn: '#93600c', crit: '#bf3546', termBg: '#fafbfe',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    note: 'Green-black, moss accent.',
    fonts: 'geist',
    dark: {
      bg: '#0a0f0c', raised: '#111813', surface: '#18211b', line: '#29362d', lineSoft: '#1c271f',
      ink: '#e4ebe5', ink2: '#aebbb0', ink3: '#87978c', head: '#f3f8f4',
      accent: '#86c7a0', ok: '#b6d97a', warn: '#e6b45c', crit: '#ee7b67', termBg: '#070b08',
    },
    light: {
      bg: '#f4f7f3', raised: '#ecf1eb', surface: '#e1e9e0', line: '#cdd9cc', lineSoft: '#e0e8df',
      ink: '#1b241d', ink2: '#3f4c42', ink3: '#5a6a5e', head: '#0d140f',
      accent: '#2f7a50', ok: '#4f7a12', warn: '#93600c', crit: '#b23a2a', termBg: '#fafcf9',
    },
  },
  {
    id: 'dusk',
    name: 'Dusk',
    note: 'Violet-black, lavender accent.',
    fonts: 'geist',
    dark: {
      bg: '#0e0b14', raised: '#15111d', surface: '#1d1828', line: '#312a42', lineSoft: '#221c2f',
      ink: '#ebe6f3', ink2: '#b9b0c8', ink3: '#9188a5', head: '#faf7ff',
      accent: '#b49cff', ok: '#7fc8a9', warn: '#e9b15a', crit: '#f27a8a', termBg: '#0a0810',
    },
    light: {
      bg: '#f7f5fb', raised: '#f0edf6', surface: '#e7e2f1', line: '#d5cde6', lineSoft: '#e7e2f1',
      ink: '#221b2e', ink2: '#4a4058', ink3: '#685d7a', head: '#120c1c',
      accent: '#6a4fd1', ok: '#2d7a5a', warn: '#94600c', crit: '#b8344a', termBg: '#fcfbfe',
    },
  },
  {
    id: 'paper',
    name: 'Paper',
    note: 'Warm neutrals, serif titles.',
    fonts: 'dm',
    dark: {
      bg: '#121110', raised: '#1a1917', surface: '#23211e', line: '#36322e', lineSoft: '#282522',
      ink: '#ece8e1', ink2: '#bcb6ac', ink3: '#948e84', head: '#faf7f2',
      accent: '#9cc0d6', ok: '#8fbf8a', warn: '#e9a65a', crit: '#e9776a', termBg: '#0e0d0c',
    },
    light: {
      bg: '#fbf9f4', raised: '#f4f1ea', surface: '#ebe7dd', line: '#dad3c5', lineSoft: '#ebe6dc',
      ink: '#22201c', ink2: '#4c4840', ink3: '#69645a', head: '#12110e',
      accent: '#2f5f7a', ok: '#3d7a55', warn: '#94580f', crit: '#b0402f', termBg: '#fdfcf9',
    },
  },
];

export const FONTS: Record<FontSet, { label: string; display: string; body: string; mono: string; weight: number; tracking: string; clock: number }> = {
  geist: {
    label: 'Geist',
    display: "'Geist Variable', 'Geist', system-ui, sans-serif",
    body: "'Geist Variable', 'Geist', system-ui, sans-serif",
    mono: "'Geist Mono Variable', 'Geist Mono', ui-monospace, Menlo, monospace",
    weight: 600,
    tracking: '-0.025em',
    clock: 300,
  },
  dm: {
    label: 'DM Serif and Sans',
    display: "'DM Serif Display', Georgia, serif",
    body: "'DM Sans Variable', 'DM Sans', system-ui, sans-serif",
    mono: "'DM Mono', ui-monospace, Menlo, monospace",
    weight: 400,
    tracking: '0',
    clock: 400,
  },
  system: {
    label: 'System',
    display: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    body: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    mono: "ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace",
    weight: 600,
    tracking: '-0.015em',
    clock: 300,
  },
  mono: {
    label: 'Mono everywhere',
    display: "'Geist Mono Variable', 'Geist Mono', ui-monospace, monospace",
    body: "'Geist Mono Variable', 'Geist Mono', ui-monospace, monospace",
    mono: "'Geist Mono Variable', 'Geist Mono', ui-monospace, monospace",
    weight: 600,
    tracking: '-0.04em',
    clock: 300,
  },
};

// ---------- Custom themes from three colors ----------

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: number[]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** Linear blend: t = 0 gives a, t = 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex(x.map((v, i) => v + (y[i] - v) * t));
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export interface CustomColors {
  bg: string;
  ink: string;
  accent: string;
}

/**
 * Every token from three picks. Layers step from the background toward the
 * text; status colors are fixed so trouble always reads as trouble.
 */
export function tokensFrom(c: CustomColors): Tokens {
  const dark = luminance(c.bg) < luminance(c.ink);
  return {
    bg: c.bg,
    raised: mix(c.bg, c.ink, 0.04),
    surface: mix(c.bg, c.ink, 0.08),
    line: mix(c.bg, c.ink, 0.17),
    lineSoft: mix(c.bg, c.ink, 0.1),
    ink: c.ink,
    ink2: mix(c.ink, c.bg, 0.25),
    ink3: mix(c.ink, c.bg, 0.4),
    head: mix(c.ink, dark ? '#ffffff' : '#000000', 0.5),
    accent: c.accent,
    ok: dark ? '#6fbf8a' : '#1d7a45',
    warn: dark ? '#e3a253' : '#9a5b00',
    crit: dark ? '#ef6b5e' : '#c0362c',
    termBg: mix(c.bg, dark ? '#000000' : '#ffffff', 0.3),
  };
}

export const DEFAULT_CUSTOM: CustomColors = { bg: '#101214', ink: '#e8e6e1', accent: '#5fd0c5' };
