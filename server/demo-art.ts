// Poster art for demo mode. The demo's shows and films are invented, so it
// paints its own one-sheets: a scene chosen from words in the title (a harbor
// gets water, a valley gets ridges, a night gets a skyline), in a palette
// chosen by the title's hash, with the title set at the foot. The same title
// always gets the same poster, so screenshots are stable.

const PALETTES = [
  { top: '#1d2b4a', bottom: '#e8875b', accent: '#f6c177', ink: '#fff4e0', mid: '#3b4a6b' },
  { top: '#0f3b3a', bottom: '#2f7f74', accent: '#e9d8a6', ink: '#f7f3e8', mid: '#1d5c57' },
  { top: '#2b1838', bottom: '#7b3f61', accent: '#f0b67f', ink: '#fbeee0', mid: '#4f2a4a' },
  { top: '#1f2933', bottom: '#52606d', accent: '#e4b363', ink: '#f5f7fa', mid: '#323f4b' },
  { top: '#12261c', bottom: '#3f6b45', accent: '#d9c27a', ink: '#f1efe2', mid: '#244a32' },
  { top: '#2a1210', bottom: '#a8442a', accent: '#f4a259', ink: '#fff1e6', mid: '#5e2318' },
  { top: '#c9d9e8', bottom: '#8fa9c4', accent: '#2c4a6e', ink: '#13233a', mid: '#6d8aa8' },
  { top: '#3a1f2b', bottom: '#c46b7a', accent: '#f2c6b4', ink: '#fff5f0', mid: '#6e3445' },
];

type Scene = 'sea' | 'ridges' | 'forest' | 'city' | 'lanterns' | 'sun';
const SCENES: [RegExp, Scene][] = [
  [/lantern/i, 'lanterns'],
  [/night|hours|city|lights/i, 'city'],
  [/harbor|tide|ferry|sea|salt|meridian|shore/i, 'sea'],
  [/valley|range|winter|mountain|copper|cartograph|peak/i, 'ridges'],
  [/field|orchard|notes|wren|pike|wood|glass|garden/i, 'forest'],
  [/cinder|kiln|hotel|sun|ember|fire/i, 'sun'],
];

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** A small seeded random source, so a title always draws the same scene. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const W = 300;
const H = 450;

function scene(kind: Scene, p: (typeof PALETTES)[number], r: () => number): string {
  const out: string[] = [];
  switch (kind) {
    case 'sea': {
      out.push(`<circle cx="${80 + r() * 140}" cy="${150 + r() * 40}" r="${38 + r() * 22}" fill="${p.accent}" opacity=".92"/>`);
      for (let i = 0; i < 5; i++) {
        const y = 250 + i * 26;
        const amp = 6 + r() * 8;
        let d = `M0 ${y}`;
        for (let x = 0; x <= W; x += 50) d += ` Q ${x + 25} ${y + (i % 2 ? amp : -amp)} ${x + 50} ${y}`;
        out.push(`<path d="${d} L${W} ${H} L0 ${H} Z" fill="${i % 2 ? p.mid : p.top}" opacity="${0.55 + i * 0.1}"/>`);
      }
      out.push(`<path d="M${120 + r() * 60} 246 l26 -34 l3 34 Z" fill="${p.ink}" opacity=".85"/>`);
      break;
    }
    case 'ridges': {
      out.push(`<circle cx="${70 + r() * 160}" cy="${110 + r() * 50}" r="${26 + r() * 16}" fill="${p.accent}" opacity=".9"/>`);
      for (let i = 0; i < 4; i++) {
        const base = 230 + i * 40;
        let d = `M0 ${base}`;
        for (let x = 0; x <= W; x += 30) d += ` L${x} ${base - 20 - r() * (90 - i * 15)}`;
        out.push(`<path d="${d} L${W} ${H} L0 ${H} Z" fill="${i % 2 ? p.mid : p.top}" opacity="${0.5 + i * 0.15}"/>`);
      }
      break;
    }
    case 'forest': {
      out.push(`<circle cx="${200 + r() * 50}" cy="${90 + r() * 40}" r="${30 + r() * 12}" fill="${p.accent}" opacity=".85"/>`);
      out.push(`<ellipse cx="${W / 2}" cy="${H + 40}" rx="${W}" ry="200" fill="${p.mid}" opacity=".9"/>`);
      for (let i = 0; i < 16; i++) {
        const x = r() * W;
        const h = 40 + r() * 70;
        const y = 300 + r() * 60;
        out.push(`<path d="M${x} ${y - h} L${x + h * 0.32} ${y} L${x - h * 0.32} ${y} Z" fill="${p.top}" opacity="${0.6 + r() * 0.4}"/>`);
      }
      break;
    }
    case 'city': {
      out.push(`<circle cx="${60 + r() * 180}" cy="${90 + r() * 40}" r="22" fill="${p.ink}" opacity=".9"/>`);
      let x = -10;
      while (x < W) {
        const w = 24 + r() * 34;
        const h = 90 + r() * 170;
        out.push(`<rect x="${x}" y="${H - 70 - h}" width="${w}" height="${h + 70}" fill="${p.top}" opacity=".95"/>`);
        for (let wy = H - 60 - h; wy < H - 90; wy += 14) {
          for (let wx = x + 5; wx < x + w - 6; wx += 9) if (r() < 0.32) out.push(`<rect x="${wx}" y="${wy}" width="4" height="6" fill="${p.accent}" opacity=".85"/>`);
        }
        x += w + 2;
      }
      break;
    }
    case 'lanterns': {
      for (let i = 0; i < 9; i++) {
        const cx = 30 + r() * 240;
        const cy = 60 + r() * 230;
        const s = 10 + r() * 18;
        out.push(`<line x1="${cx}" y1="0" x2="${cx}" y2="${cy - s}" stroke="${p.ink}" stroke-width="1" opacity=".35"/>`);
        out.push(`<ellipse cx="${cx}" cy="${cy}" rx="${s * 0.8}" ry="${s}" fill="${p.accent}" opacity="${0.6 + r() * 0.4}"/>`);
        out.push(`<ellipse cx="${cx}" cy="${cy}" rx="${s * 2}" ry="${s * 2.2}" fill="${p.accent}" opacity=".08"/>`);
      }
      break;
    }
    case 'sun': {
      const cy = 210 + r() * 30;
      out.push(`<circle cx="${W / 2}" cy="${cy}" r="${90 + r() * 20}" fill="${p.accent}"/>`);
      for (let i = 0; i < 6; i++) out.push(`<rect x="0" y="${cy + 10 + i * 14}" width="${W}" height="${3 + i * 1.6}" fill="${p.bottom}"/>`);
      out.push(`<rect x="0" y="${cy + 100}" width="${W}" height="${H}" fill="${p.top}" opacity=".9"/>`);
      break;
    }
  }
  return out.join('');
}

/** The title in up to three lines, sized to fit. */
function titleBlock(title: string, ink: string): string {
  const words = title.split(/\s+/);
  const lines: string[] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && (last + ' ' + w).length <= 12) lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
  }
  const longest = Math.max(...lines.map((l) => l.length));
  const size = Math.min(46, Math.floor(262 / (longest * 0.52)));
  const top = H - 30 - (lines.length - 1) * size * 1.02;
  return lines
    .slice(0, 3)
    .map((l, i) => `<text x="20" y="${top + i * size * 1.02}" font-family="Georgia, 'Times New Roman', serif" font-size="${size}" fill="${ink}" letter-spacing="-0.5">${esc(l)}</text>`)
    .join('');
}

export function demoPoster(title: string): string {
  const h = hash(title);
  const p = PALETTES[h % PALETTES.length];
  const kind = SCENES.find(([re]) => re.test(title))?.[1] ?? (['sea', 'ridges', 'forest', 'city', 'sun'] as Scene[])[h % 5];
  const r = rng(h);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.top}"/><stop offset="1" stop-color="${p.bottom}"/></linearGradient>
<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>${scene(kind, p, r)}<rect width="${W}" height="${H}" fill="url(#f)"/>${titleBlock(title, p.ink === '#13233a' ? '#f5f7fa' : p.ink)}</svg>`;
}

/** Where a demo item's poster is served. */
export const demoPosterUrl = (title: string) => `/api/demo-art?t=${encodeURIComponent(title)}`;
