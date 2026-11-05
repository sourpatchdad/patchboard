// The otter: Patchboard's mark and mascot, drawn in code so every icon size,
// theme and mood comes from one drawing. A pure string builder with no DOM
// or Node use, so the browser (live favicon, mascot) and the icon script
// (PNGs) share it.
//
// Traced from the designed icon set: a brown dome with round ears, a cream
// face from the eyes down, a rounded-triangle nose over a wide "w" mouth, two
// cream whiskers a side, two paws on one band of water with rounded
// shoulders. Navy, brown, cream, ink and blue carry it; amber marks the alert
// otter and red the tab icon's dot, the same rule as the rest of the
// interface. Below 40 pixels the drawing drops whiskers and mouth and grows
// the eyes and nose, so it still reads on a bookmark bar.

export type OtterMood = 'hello' | 'calm' | 'alert' | 'worried' | 'asleep' | 'happy' | 'lost';
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
  fur: '#a06e48',
  face: '#f1dfc8',
  pale: '#f7efe2',
  ink: '#1d1714',
  water: '#3581ee',
  warn: '#f0a43a',
  crit: '#ef5b4c',
} as const;

const EYE_Y = 48.5;
const EYE_X = [36.3, 63.3] as const;

function eyes(mood: OtterMood, small: boolean): string {
  const c = OTTER.ink;
  const w = small ? 4.6 : 3.2;
  const r = small ? 5 : 4;
  // Happy eyes are arcs bowed up; sleeping eyes bow down.
  const arc = (x: number, up: boolean) =>
    up
      ? `<path d="M${x - 6.3} ${EYE_Y + 2} q6.3 -8 12.6 0" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`
      : `<path d="M${x - 6.3} ${EYE_Y} q6.3 6 12.6 0" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
  const dot = (x: number) => `<circle cx="${x}" cy="${EYE_Y}" r="${r}" fill="${c}"/>`;
  const [l, rr] = EYE_X;
  switch (mood) {
    case 'calm':
    case 'happy':
      return arc(l, true) + arc(rr, true);
    case 'asleep':
      return arc(l, false) + arc(rr, false);
    case 'lost': {
      // Looking up and aside: cream whites with the pupils at the top edge.
      const look = (x: number) =>
        (small ? '' : `<circle cx="${x}" cy="${EYE_Y + 0.5}" r="4.8" fill="${OTTER.face}"/>`) + `<circle cx="${x + 1.4}" cy="${EYE_Y - 1.4}" r="${small ? 4.6 : 3.4}" fill="${c}"/>`;
      return look(l) + look(rr);
    }
    default:
      return dot(l) + dot(rr);
  }
}

function mouth(mood: OtterMood): string {
  const c = OTTER.ink;
  const line = `fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"`;
  switch (mood) {
    case 'happy':
      return `<path d="M41.5 58.5 h17 c0 6.5 -4 10 -8.5 10 c-4.5 0 -8.5 -3.5 -8.5 -10 z" fill="${c}" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>`;
    case 'alert':
      return `<ellipse cx="50" cy="62.5" rx="3.3" ry="4" fill="${c}"/>`;
    case 'worried':
      return `<path d="M44 63 q6 -6 12 0" ${line}/>`;
    case 'lost':
      return `<path d="M50 56 v3.6 M45 64 q5 -5.5 10 0" ${line}/>`;
    case 'asleep':
      return `<path d="M50 56 v2.4 M43 59 q3.5 4.5 7 0 q3.5 4.5 7 0" ${line}/>`;
    default:
      // calm and hello: the wide "w" under a short line from the nose.
      return `<path d="M50 56 v3 M41.5 59.5 q4.25 5.5 8.5 0 q4.25 5.5 8.5 0" ${line}/>`;
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
  const view = o.safe ? '-8 -8 116 116' : small ? '11 22 78 78' : '0 0 100 100';
  const tileFill = bg === 'dark' ? C.navy : C.cream;
  const tile =
    bg === 'none'
      ? ''
      : o.safe
        ? `<rect x="-8" y="-8" width="116" height="116" fill="${tileFill}"/>`
        : `<rect width="100" height="100" rx="${o.square ? 0 : 22}" fill="${tileFill}"/>`;
  const clip = bg === 'none' || o.safe ? '' : ' clip-path="url(#otter-tile)"';
  // With no tile, the water is a rounded pool, so the otter never sits in a box.
  const pool = bg === 'none' ? ' clip-path="url(#otter-pool)"' : '';
  // Marks around the otter: cream on the dark tile, navy on the light one,
  // the page's text color with no tile.
  const fg = bg === 'light' ? C.navy : bg === 'none' ? 'currentColor' : C.cream;

  const ears = `<circle cx="21.5" cy="41.5" r="${small ? 8 : 7.2}" fill="${head}"/><circle cx="78.5" cy="41.5" r="${small ? 8 : 7.2}" fill="${head}"/>`;
  // A dome, round on top, tucked in toward the water.
  const skull = `<path d="M18.5 62 C17 41 31 27 50 27 C69 27 83 41 81.5 62 C80.5 72 75 78 68 80 L32 80 C25 78 19.5 72 18.5 62 Z" fill="${head}"/>`;
  // River otter: the cream face starts under the eyes. Sea otter: a soft muzzle.
  const face =
    coat === 'brown'
      ? `<path d="M21 66 C21 56 30 50 37 50.5 C42 51 45 48.5 50 48.5 C55 48.5 58 51 63 50.5 C70 50 79 56 79 66 C79 76 68 82 50 82 C32 82 21 76 21 66 Z" fill="${C.face}"/>`
      : `<ellipse cx="43" cy="58" rx="9.5" ry="7" fill="#fffaf2"/><ellipse cx="57" cy="58" rx="9.5" ry="7" fill="#fffaf2"/>`;
  // Two whiskers a side, out past the cheeks: cream on navy, brown where
  // cream would vanish.
  const wc = bg === 'light' ? C.fur : bg === 'none' ? 'currentColor' : C.face;
  const whiskers = small
    ? ''
    : `<g stroke="${wc}" stroke-width="2.1" stroke-linecap="round" fill="none"><path d="M26.5 55 q-7 0 -13.5 2"/><path d="M26.5 58 q-7 1 -11.5 5"/><path d="M73.5 55 q7 0 13.5 2"/><path d="M73.5 58 q7 1 11.5 5"/></g>`;
  // A rounded triangle of a nose.
  const nose = small
    ? `<path d="M40 51 C40 47.5 60 47.5 60 51 C60 55 54 59 50 59 C46 59 40 55 40 51 Z" fill="${C.ink}"/>`
    : `<path d="M44.6 52 C44.6 49.6 55.4 49.6 55.4 52 C55.4 54.5 52 57 50 57 C48 57 44.6 54.5 44.6 52 Z" fill="${C.ink}"/>`;
  // One band of water with rounded shoulders.
  const water = `<path d="M-20 88 C-2 80 6 75.4 18 75.4 L82 75.4 C94 75.4 102 80 120 88 L120 120 L-20 120 Z" fill="${C.water}"/>`;
  const paw = (x: number) => `<ellipse cx="${x}" cy="74" rx="${small ? 10.5 : 9.4}" ry="${small ? 7 : 6.2}" fill="${head}"/>`;

  let extra = '';
  if (!small) {
    if (mood === 'asleep')
      extra = `<g fill="none" stroke="${fg}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M47 17 h5 l-5 5.5 h5"/><path d="M56 10 h6.5 l-6.5 8 h6.5"/></g>`;
    else if (mood === 'alert')
      extra = `<g stroke="${C.warn}" stroke-width="3.2" stroke-linecap="round"><path d="M50 10.5 v7.5"/><path d="M36.5 14 l4.3 6.2"/><path d="M63.5 14 l-4.3 6.2"/></g>`;
    else if (mood === 'worried')
      extra = `<path d="M71 37.5 c-2.4 4 -3.3 5.6 -3.3 7.2 a3.3 3.3 0 0 0 6.6 0 c0 -1.6 -0.9 -3.2 -3.3 -7.2 z" fill="${C.face}"/>`;
    else if (mood === 'lost')
      extra = `<g fill="none" stroke="${fg}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M45.5 11.5 c0 -6 9.5 -6 9.5 0 c0 4.5 -5 4.5 -5 9"/></g><circle cx="50" cy="24.5" r="2.1" fill="${fg}"/>`;
  }
  const ring = bg === 'light' ? C.cream : bg === 'dark' ? C.navy : 'none';
  const badge = o.badge
    ? `<circle cx="${small ? 76 : 82}" cy="${small ? 33 : 18}" r="11" fill="${o.badge === 'crit' ? C.crit : C.warn}" stroke="${ring}" stroke-width="${bg === 'none' ? 0 : 4}"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}">
  ${clip ? `<defs><clipPath id="otter-tile"><rect width="100" height="100" rx="${o.square ? 0 : 22}"/></clipPath></defs>` : ''}
  ${pool ? `<defs><clipPath id="otter-pool"><rect x="${small ? 11 : 9}" y="75" width="${small ? 78 : 82}" height="${small ? 25 : 25}" rx="${small ? 9 : 11}"/></clipPath></defs>` : ''}
  ${tile}
  <g${clip}>
    ${ears}${skull}${face}${whiskers}${eyes(mood, small)}${nose}${small ? '' : mouth(mood)}<g${pool}>${water}</g>${paw(26.7)}${paw(73.3)}
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
