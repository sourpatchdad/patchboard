// The otter: Patchboard's mark and mascot, drawn in code so every icon size,
// theme and mood comes from one drawing. A pure string builder with no DOM
// or Node use, so the browser (live favicon, mascot) and the icon script
// (PNGs) share it.
//
// Flat and few-colored on purpose. Navy tile, one fur tone, a cream face, ink
// features and one band of water; amber and red appear only when the server
// needs you, the same rule the rest of the interface follows. The shape is a
// wide, flat head with tiny ears low on the sides, a broad nose and paws on
// the water line: wide and low reads as otter, tall with ears on top as bear.
// Below 40 pixels the drawing drops whiskers and mouth and grows the eyes and
// nose, so it still reads on a bookmark bar.

export type OtterMood = 'calm' | 'alert' | 'worried' | 'asleep' | 'happy' | 'lost';
export type OtterBadge = 'warn' | 'crit' | null;
/** Brown: a river otter's brown cap over a cream face. Cream: a sea otter's pale head. */
export type OtterCoat = 'brown' | 'cream';

export interface OtterOptions {
  mood?: OtterMood;
  coat?: OtterCoat;
  /** Background: a rounded tile in the dark or light scheme, or none. */
  bg?: 'dark' | 'light' | 'none';
  /** Square corners for platform icons, which apply their own mask. */
  square?: boolean;
  /** Small-size drawing: no whiskers or mouth, bigger eyes and nose. */
  small?: boolean;
  /** A status dot in the top-right corner. */
  badge?: OtterBadge;
  /** Leave room around the otter for maskable icons (Android crops a circle). */
  safe?: boolean;
}

export const OTTER = {
  navy: '#14213b',
  cream: '#f5efe4',
  fur: '#9c6b45',
  face: '#f1e2cc',
  pale: '#f7efe2',
  ink: '#1d1714',
  water: '#3b82f6',
  warn: '#f0a43a',
  crit: '#ef5b4c',
} as const;

const EYE_Y = 49.5;

function eyes(mood: OtterMood, small: boolean): string {
  const c = OTTER.ink;
  const w = small ? 4.6 : 3.2;
  const r = small ? 5 : 3.4;
  const arc = (x: number, up: boolean) => `<path d="M${x - 5.5} ${EYE_Y + 1} q5.5 ${up ? -6.5 : 5.5} 11 0" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
  const dot = (x: number, dx = 0, dy = 0) => `<circle cx="${x + dx}" cy="${EYE_Y + dy}" r="${r}" fill="${c}"/>`;
  switch (mood) {
    case 'calm':
    case 'happy':
      return arc(37, true) + arc(63, true);
    case 'asleep':
      return arc(37, false) + arc(63, false);
    case 'alert':
    case 'worried':
      return dot(37) + dot(63);
    case 'lost':
      return dot(37, -1.5, -1.5) + dot(63, -1.5, -1.5);
  }
}

function mouth(mood: OtterMood): string {
  const c = OTTER.ink;
  const s = `fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"`;
  switch (mood) {
    case 'happy':
      return `<path d="M44 59 q6 7.5 12 0 z" fill="${c}" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>`;
    case 'worried':
    case 'lost':
      return `<path d="M45.5 62 q4.5 -3.4 9 0" ${s}/>`;
    case 'alert':
      return `<ellipse cx="50" cy="61.5" rx="2.2" ry="2.8" fill="${c}"/>`;
    default:
      return `<path d="M50 56.5 v2 M44.5 58.5 q2.75 3 5.5 0 q2.75 3 5.5 0" ${s}/>`;
  }
}

/** The otter as an SVG document. */
export function otterSvg(o: OtterOptions = {}): string {
  const mood = o.mood ?? 'calm';
  const coat = o.coat ?? 'brown';
  const small = !!o.small;
  const bg = o.bg ?? 'dark';
  const C = OTTER;
  const head = coat === 'brown' ? C.fur : C.pale;
  const view = o.safe ? '-8 -8 116 116' : small ? '8 16 84 84' : '0 0 100 100';
  const tileFill = bg === 'dark' ? C.navy : C.cream;
  const tile = bg === 'none' ? '' : o.safe ? `<rect x="-8" y="-8" width="116" height="116" fill="${tileFill}"/>` : `<rect width="100" height="100" rx="${o.square ? 0 : 22}" fill="${tileFill}"/>`;
  const clip = bg === 'none' || o.safe ? '' : ' clip-path="url(#otter-tile)"';
  // With no tile, the water is a rounded pool, so the otter never sits in a box.
  const pool = bg === 'none' ? ' clip-path="url(#otter-pool)"' : '';
  // Marks around the otter: cream on the dark tile, navy on the light one, the
  // page's text color with no tile.
  const fg = bg === 'light' ? C.navy : bg === 'none' ? 'currentColor' : C.cream;

  // Round ears at the top corners of a wide, low dome.
  const ears = `<circle cx="19" cy="38" r="${small ? 8 : 7}" fill="${head}"/><circle cx="81" cy="38" r="${small ? 8 : 7}" fill="${head}"/>`;
  const skull = `<path d="M12 57 C12 36 29 24 50 24 C71 24 88 36 88 57 C88 66 84 72 78 75 L22 75 C16 72 12 66 12 57 Z" fill="${head}"/>`;
  // River otter: a brown cap over a cream face that starts at the eyes.
  // Sea otter: a soft muzzle.
  const face =
    coat === 'brown'
      ? `<path d="M17 64 C17 50 31 41.5 50 41.5 C69 41.5 83 50 83 64 C83 77 69 86 50 86 C31 86 17 77 17 64 Z" fill="${C.face}"/>`
      : `<ellipse cx="42.5" cy="56" rx="9.5" ry="7" fill="#fffaf2"/><ellipse cx="57.5" cy="56" rx="9.5" ry="7" fill="#fffaf2"/>`;
  // Three whiskers a side, out past the cheeks: cream on navy, brown where
  // cream would vanish.
  const wc = bg === 'light' ? C.fur : bg === 'none' ? 'currentColor' : C.face;
  const whiskers = small
    ? ''
    : `<g stroke="${wc}" stroke-width="2" stroke-linecap="round" fill="none"><path d="M29 51.5 l-19 -2"/><path d="M29 55 l-20 1.5"/><path d="M29.5 58.5 l-18 5"/><path d="M71 51.5 l19 -2"/><path d="M71 55 l20 1.5"/><path d="M70.5 58.5 l18 5"/></g>`;
  // A rounded triangle of a nose.
  const nose = small
    ? `<path d="M41 50 h18 c0 4.5 -5 8.5 -9 8.5 c-4 0 -9 -4 -9 -8.5 z" fill="${C.ink}"/>`
    : `<path d="M44 50.5 h12 c0 3.6 -3.4 6.2 -6 6.2 c-2.6 0 -6 -2.6 -6 -6.2 z" fill="${C.ink}" stroke="${C.ink}" stroke-width="1.2" stroke-linejoin="round"/>`;
  // One band of water.
  const water = `<path d="M-20 81 Q50 76 120 81 L120 120 L-20 120 Z" fill="${C.water}"/>`;
  const paw = (x: number) => `<ellipse cx="${x}" cy="79" rx="${small ? 11.5 : 10.5}" ry="${small ? 7.5 : 7}" fill="${head}"/>`;

  let extra = '';
  if (!small) {
    if (mood === 'asleep') extra = `<g fill="none" stroke="${fg}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M70 14 h6 l-6 7 h6"/><path d="M80 4 h8 l-8 9 h8"/></g>`;
    else if (mood === 'alert') extra = `<g stroke="${C.warn}" stroke-width="3.4" stroke-linecap="round"><path d="M50 6 v8"/><path d="M36 10 l4 6"/><path d="M64 10 l-4 6"/></g>`;
    else if (mood === 'worried') extra = `<path d="M77 25 c-3 5 -4 7 -4 9 a4 4 0 0 0 8 0 c0 -2 -1 -4 -4 -9 z" fill="${fg}"/>`;
    else if (mood === 'lost') extra = `<g fill="none" stroke="${fg}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M73 8 c0 -5 9 -5 9 0 c0 4 -4.5 4 -4.5 8"/></g><circle cx="77.5" cy="21" r="1.9" fill="${fg}"/>`;
  }
  const ring = bg === 'light' ? C.cream : bg === 'dark' ? C.navy : 'none';
  const badge = o.badge
    ? `<circle cx="${small ? 74 : 82}" cy="${small ? 34 : 18}" r="11" fill="${o.badge === 'crit' ? C.crit : C.warn}" stroke="${ring}" stroke-width="${bg === 'none' ? 0 : 4}"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}">
  ${clip ? `<defs><clipPath id="otter-tile"><rect width="100" height="100" rx="${o.square ? 0 : 22}"/></clipPath></defs>` : ''}
  ${pool ? `<defs><clipPath id="otter-pool"><rect x="${small ? 8 : 7}" y="${small ? 74 : 75}" width="${small ? 84 : 86}" height="${small ? 26 : 25}" rx="${small ? 10 : 12}"/></clipPath></defs>` : ''}
  ${tile}
  <g${clip}>
    <g${small ? '' : ''}>
      ${ears}${skull}${face}${whiskers}${eyes(mood, small)}${nose}${small ? '' : mouth(mood)}<g${pool}>${water}</g>${paw(27)}${paw(73)}
    </g>
  </g>
  ${extra}${badge}
</svg>`;
}

/** As a data URL, for a favicon link or an img src. */
export const otterDataUrl = (o: OtterOptions = {}) => `data:image/svg+xml,${encodeURIComponent(otterSvg(o))}`;

/** The otter's mood for a server's state: worst alert level, and whether it is night. */
export function moodFor(level: 'critical' | 'warn' | null, night = false): OtterMood {
  if (level === 'critical') return 'worried';
  if (level === 'warn') return 'alert';
  return night ? 'asleep' : 'calm';
}
