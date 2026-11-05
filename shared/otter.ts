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

const EYE_Y = 53;

function eyes(mood: OtterMood, small: boolean): string {
  const c = OTTER.ink;
  const w = small ? 4.6 : 3.2;
  const r = small ? 5 : 3.8;
  const arc = (x: number, up: boolean) => `<path d="M${x - 5.5} ${EYE_Y + 1} q5.5 ${up ? -6.5 : 5.5} 11 0" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
  const dot = (x: number, dx = 0, dy = 0) => `<circle cx="${x + dx}" cy="${EYE_Y + dy}" r="${r}" fill="${c}"/>`;
  switch (mood) {
    case 'calm':
    case 'happy':
      return arc(36, true) + arc(64, true);
    case 'asleep':
      return arc(36, false) + arc(64, false);
    case 'alert':
    case 'worried':
      return dot(36) + dot(64);
    case 'lost':
      return dot(36, -1.5, -1.5) + dot(64, -1.5, -1.5);
  }
}

function mouth(mood: OtterMood): string {
  const c = OTTER.ink;
  const s = `fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"`;
  switch (mood) {
    case 'happy':
      return `<path d="M44 66 q6 7.5 12 0 z" fill="${c}" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>`;
    case 'worried':
    case 'lost':
      return `<path d="M45.5 69 q4.5 -3.4 9 0" ${s}/>`;
    case 'alert':
      return `<ellipse cx="50" cy="68" rx="2.2" ry="2.8" fill="${c}"/>`;
    default:
      return `<path d="M44.5 65.5 q2.75 2.8 5.5 0 q2.75 2.8 5.5 0" ${s}/>`;
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
  const view = o.safe ? '-8 -8 116 116' : small ? '12 24 76 76' : '0 0 100 100';
  const tileFill = bg === 'dark' ? C.navy : C.cream;
  const tile = bg === 'none' ? '' : o.safe ? `<rect x="-8" y="-8" width="116" height="116" fill="${tileFill}"/>` : `<rect width="100" height="100" rx="${o.square ? 0 : 22}" fill="${tileFill}"/>`;
  const clip = bg === 'none' || o.safe ? '' : ' clip-path="url(#otter-tile)"';
  // With no tile, the water is a rounded pool, so the otter never sits in a box.
  const pool = bg === 'none' ? ' clip-path="url(#otter-pool)"' : '';
  // Marks around the otter: cream on the dark tile, navy on the light one, the
  // page's text color with no tile.
  const fg = bg === 'light' ? C.navy : bg === 'none' ? 'currentColor' : C.cream;

  // Round ears, low on the sides; a broad, domed head.
  const ears = `<circle cx="20" cy="46" r="${small ? 9 : 8}" fill="${head}"/><circle cx="80" cy="46" r="${small ? 9 : 8}" fill="${head}"/>`;
  const skull = `<path d="M15 84 C14 52 27 32 50 32 C73 32 86 52 85 84 Z" fill="${head}"/>`;
  // River otter: the cream face starts just above the eyes, so they sit on
  // cream and stay readable at 16 pixels. Sea otter: a soft muzzle.
  const face =
    coat === 'brown'
      ? `<path d="M19 74 C17 55 27 45 50 45 C73 45 83 55 81 74 C80 83 68 88 50 88 C32 88 20 83 19 74 Z" fill="${C.face}"/>`
      : `<ellipse cx="42.5" cy="62" rx="9.5" ry="7" fill="#fffaf2"/><ellipse cx="57.5" cy="62" rx="9.5" ry="7" fill="#fffaf2"/>`;
  // Whiskers run past the head: cream on navy, brown where cream would vanish.
  const wc = bg === 'light' ? C.fur : bg === 'none' ? 'currentColor' : C.face;
  const whiskers = small
    ? ''
    : `<g stroke="${wc}" stroke-width="2.2" stroke-linecap="round" fill="none"><path d="M33 61 q-12 -3 -23 -1"/><path d="M33 65 q-11 0 -21 5"/><path d="M67 61 q12 -3 23 -1"/><path d="M67 65 q11 0 21 5"/></g>`;
  // A rounded triangle of a nose.
  const nose = small
    ? `<path d="M41 55 h18 c0 4.5 -5 8.5 -9 8.5 c-4 0 -9 -4 -9 -8.5 z" fill="${C.ink}"/>`
    : `<path d="M43.5 55 h13 c0 3.6 -3.6 6.6 -6.5 6.6 c-2.9 0 -6.5 -3 -6.5 -6.6 z" fill="${C.ink}" stroke="${C.ink}" stroke-width="1.2" stroke-linejoin="round"/>`;
  // One band of water with a gentle curve.
  const water = `<path d="M-20 83 Q50 74 120 83 L120 120 L-20 120 Z" fill="${C.water}"/>`;
  const paw = (x: number) => `<ellipse cx="${x}" cy="81" rx="${small ? 11 : 10}" ry="${small ? 7 : 6.5}" fill="${head}"/>`;

  let extra = '';
  if (!small) {
    if (mood === 'asleep') extra = `<g fill="none" stroke="${fg}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M72 22 h6 l-6 7 h6"/><path d="M82 11 h8 l-8 9 h8"/></g>`;
    else if (mood === 'alert') extra = `<g stroke="${C.warn}" stroke-width="3.4" stroke-linecap="round"><path d="M50 13 v8"/><path d="M36 17 l4 6"/><path d="M64 17 l-4 6"/></g>`;
    else if (mood === 'worried') extra = `<path d="M80 30 c-3 5 -4 7 -4 9 a4 4 0 0 0 8 0 c0 -2 -1 -4 -4 -9 z" fill="${fg}"/>`;
    else if (mood === 'lost') extra = `<g fill="none" stroke="${fg}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M74 13 c0 -5 9 -5 9 0 c0 4 -4.5 4 -4.5 8"/></g><circle cx="78.5" cy="26" r="1.9" fill="${fg}"/>`;
  }
  const ring = bg === 'light' ? C.cream : bg === 'dark' ? C.navy : 'none';
  const badge = o.badge
    ? `<circle cx="${small ? 74 : 82}" cy="${small ? 34 : 18}" r="11" fill="${o.badge === 'crit' ? C.crit : C.warn}" stroke="${ring}" stroke-width="${bg === 'none' ? 0 : 4}"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}">
  ${clip ? `<defs><clipPath id="otter-tile"><rect width="100" height="100" rx="${o.square ? 0 : 22}"/></clipPath></defs>` : ''}
  ${pool ? `<defs><clipPath id="otter-pool"><rect x="${small ? 12 : 6}" y="64" width="${small ? 76 : 88}" height="${small ? 40 : 36}" rx="${small ? 13 : 16}"/></clipPath></defs>` : ''}
  ${tile}
  <g${clip}>
    <g${small ? '' : ' transform="translate(50 50) scale(1.06) translate(-50 -50)"'}>
      ${ears}${skull}${face}${whiskers}${eyes(mood, small)}${nose}${small ? '' : mouth(mood)}<g${pool}>${water}</g>${paw(31)}${paw(69)}
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
