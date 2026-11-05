// The otter: Patchboard's mark and mascot, drawn in code so every icon size,
// theme and mood comes from one drawing. A pure string builder with no DOM
// or Node use, so the browser (live favicon, mascot) and the icon script
// (PNGs) share it.
//
// One shape vocabulary on a 100 by 100 grid: a broad head that peeks over a
// line of water, small low ears, a pale muzzle, a dark nose, two paws on the
// edge. Below 40 pixels the drawing drops whiskers, mouth and ear detail and
// grows the eyes and nose, so it still reads as a face on a bookmark bar.

export type OtterMood = 'calm' | 'alert' | 'worried' | 'asleep' | 'happy' | 'lost';
export type OtterBadge = 'warn' | 'crit' | null;

export interface OtterOptions {
  mood?: OtterMood;
  /** Background: a rounded tile in the dark or light scheme, a full square for PNGs, or none. */
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
  navyDeep: '#0e182c',
  cream: '#f5efe4',
  fur: '#9c6b45',
  furDark: '#7a5135',
  face: '#f1e2cc',
  ink: '#1d1714',
  water: '#3b82f6',
  waterDeep: '#2563c9',
  warn: '#f0a43a',
  crit: '#ef5b4c',
} as const;

function eyes(mood: OtterMood, small: boolean): string {
  const c = OTTER.ink;
  const w = small ? 4.4 : 3;
  const y = 50;
  const arc = (x: number, up: boolean) =>
    `<path d="M${x - 5} ${y + 1} q5 ${up ? -6 : 5} 10 0" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
  const dot = (x: number, r: number) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>` + (small ? '' : `<circle cx="${x + 1.2}" cy="${y - 1.3}" r="${r * 0.33}" fill="#fff"/>`);
  const r = small ? 4.6 : 3.5;
  switch (mood) {
    case 'calm':
    case 'happy':
      return arc(37, true) + arc(63, true);
    case 'asleep':
      return arc(37, false) + arc(63, false);
    case 'alert':
      return dot(37, r) + dot(63, r);
    case 'worried':
      return dot(37, r) + dot(63, r);
    case 'lost': {
      // Eyes glancing up and aside.
      const look = (x: number) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>` + (small ? '' : `<circle cx="${x - 1.4}" cy="${y - 1.4}" r="${r * 0.35}" fill="#fff"/>`);
      return look(36) + look(62);
    }
  }
}

function mouth(mood: OtterMood): string {
  const c = OTTER.ink;
  if (mood === 'happy') return `<path d="M44 65 q6 6 12 0 z" fill="${c}" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>`;
  if (mood === 'worried' || mood === 'lost') return `<path d="M45.5 67 q4.5 -3 9 0" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`;
  if (mood === 'alert') return `<ellipse cx="50" cy="66.5" rx="2" ry="2.4" fill="${c}"/>`;
  return `<path d="M45 64.5 q2.5 2.6 5 0 q2.5 2.6 5 0" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** The otter as an SVG document. */
export function otterSvg(o: OtterOptions = {}): string {
  const mood = o.mood ?? 'calm';
  const small = !!o.small;
  const bg = o.bg ?? 'dark';
  const C = OTTER;
  // Small: crop to the face so it fills a 16-pixel square.
  const view = o.safe ? '-8 -8 116 116' : small ? '15 24 70 70' : '0 0 100 100';
  const tile =
    bg === 'none'
      ? ''
      : o.safe
        ? `<rect x="-8" y="-8" width="116" height="116" fill="${bg === 'dark' ? C.navy : C.cream}"/>`
        : `<rect width="100" height="100" rx="${o.square ? 0 : 22}" fill="${bg === 'dark' ? C.navy : C.cream}"/>`;
  const clip = bg === 'none' || o.safe ? '' : ' clip-path="url(#otter-tile)"';
  // With no tile, the water is a rounded pool, so the otter never sits in a box.
  const pool = bg === 'none' ? ' clip-path="url(#otter-pool)"' : '';
  // Tiny ears, set wide and low on the sides of the head: the otter tell.
  const ear = (x: number) =>
    `<circle cx="${x}" cy="44" r="${small ? 6 : 5}" fill="${C.furDark}"/>` + (small ? '' : `<circle cx="${x}" cy="44.5" r="2.3" fill="${C.ink}" opacity=".4"/>`);
  // A wide, flat head: broader than tall.
  const head = `<path d="M16 70 C14 47 31 35 50 35 C69 35 86 47 84 70 L84 84 L16 84 Z" fill="${C.fur}"/>`;
  // The pale face from the eyes down, with puffy whisker pads.
  const face = `<path d="M22 66 C22 52 34 45 50 45 C66 45 78 52 78 66 C78 76 66 80 50 80 C34 80 22 76 22 66 Z" fill="${C.face}"/>`;
  const pads = `<ellipse cx="43" cy="62" rx="8" ry="6.5" fill="#fbf4ea"/><ellipse cx="57" cy="62" rx="8" ry="6.5" fill="#fbf4ea"/>`;
  const freckles = small
    ? ''
    : `<g fill="${C.furDark}" opacity=".55"><circle cx="40" cy="61" r=".9"/><circle cx="43" cy="63.5" r=".9"/><circle cx="39.5" cy="64.5" r=".9"/><circle cx="60" cy="61" r=".9"/><circle cx="57" cy="63.5" r=".9"/><circle cx="60.5" cy="64.5" r=".9"/></g>`;
  const whiskers = small
    ? ''
    : `<g stroke="${C.furDark}" stroke-width="1.2" stroke-linecap="round">
        <path d="M36 61 l-14 -3"/><path d="M36 64 l-14 1"/><path d="M37 66.5 l-12 4"/>
        <path d="M64 61 l14 -3"/><path d="M64 64 l14 1"/><path d="M63 66.5 l12 4"/>
      </g>`;
  // A broad, dark nose.
  const nose = small
    ? `<path d="M41 54 h18 c0 5 -5 9 -9 9 c-4 0 -9 -4 -9 -9 z" fill="${C.ink}"/>`
    : `<path d="M42.5 54.5 h15 c0 4.5 -4 7.5 -7.5 7.5 c-3.5 0 -7.5 -3 -7.5 -7.5 z" fill="${C.ink}"/><ellipse cx="46.5" cy="56" rx="2.2" ry="1.1" fill="#fff" opacity=".35"/>`;
  const water = `<path d="M-20 79 C0 73 14 83 30 78 C44 74 56 83 70 78 C84 73 96 82 120 77 L120 120 L-20 120 Z" fill="${C.water}"/>
    <path d="M-20 89 C0 84 16 93 32 89 C48 85 60 93 76 89 C90 85 104 92 120 88 L120 120 L-20 120 Z" fill="${C.waterDeep}"/>`;
  const paw = (x: number) =>
    `<ellipse cx="${x}" cy="78.5" rx="${small ? 9.5 : 8.5}" ry="${small ? 5.5 : 5}" fill="${C.furDark}"/>` +
    (small ? '' : `<path d="M${x - 3.2} 76.5 v3 M${x} 76 v3.5 M${x + 3.2} 76.5 v3" stroke="${C.ink}" stroke-width="1" stroke-linecap="round" opacity=".45"/>`);
  const zz =
    mood === 'asleep' && !small
      ? `<g fill="none" stroke="${bg === 'light' ? C.navy : bg === 'none' ? 'currentColor' : C.cream}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" opacity=".8"><path d="M74 22 h7 l-7 8 h7"/><path d="M84 11 h5 l-5 6 h5"/></g>`
      : '';
  // With no tile, marks around the otter take the page's text color.
  const fg = bg === 'light' ? C.navy : bg === 'none' ? 'currentColor' : C.cream;
  const extra =
    small
      ? ''
      : mood === 'worried'
        ? `<path d="M79 40 c-3 5 -4 7 -4 9 a4 4 0 0 0 8 0 c0 -2 -1 -4 -4 -9 z" fill="#8cc4ff"/>`
        : mood === 'lost'
          ? `<g fill="none" stroke="${fg}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".85"><path d="M75 15 c0 -5 9 -5 9 0 c0 4 -5 4 -5 8"/></g><circle cx="79" cy="28" r="1.8" fill="${fg}" opacity=".85"/>`
          : '';
  const ring = bg === 'light' ? C.cream : bg === 'dark' ? C.navy : 'none';
  const badge = o.badge
    ? `<circle cx="${small ? 76 : 82}" cy="${small ? 34 : 18}" r="${small ? 11 : 11}" fill="${o.badge === 'crit' ? C.crit : C.warn}" stroke="${ring}" stroke-width="${bg === 'none' ? 0 : 4}"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}">
  ${clip ? `<defs><clipPath id="otter-tile"><rect width="100" height="100" rx="${o.square ? 0 : 22}"/></clipPath></defs>` : ''}
  ${pool ? `<defs><clipPath id="otter-pool"><rect x="${small ? 15 : 6}" y="60" width="${small ? 70 : 88}" height="${small ? 34 : 36}" rx="${small ? 12 : 16}"/></clipPath></defs>` : ''}
  ${tile}
  <g${clip}>
    ${ear(22)}${ear(78)}${head}${face}${pads}${freckles}${whiskers}${eyes(mood, small)}${nose}${small ? '' : mouth(mood)}<g${pool}>${water}</g>${paw(37)}${paw(63)}
  </g>
  ${zz}${extra}${badge}
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
