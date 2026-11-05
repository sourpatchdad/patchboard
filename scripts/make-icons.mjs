// Builds every otter image from the designed art in art/otter: the app
// icons home screens need, the tab icons, favicon.ico, and the per-mood
// images the header and the mascot use.
// Run: npm run icons (needs Chrome or Chromium, like npm run screenshots).
//
// The art is one 1254-pixel PNG per mood, the otter on a navy tile. Chrome's
// canvas does the work: it lifts the otter off the navy (keeping the soft
// edges), then places it on a navy tile, a cream tile, a full square for
// home screens, or nothing at all for the mascot. On cream and on light
// pages, whiskers turn brown and the marks above the head turn navy, so
// nothing cream vanishes against a light background.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const MOODS = ['hello', 'calm', 'alert', 'worried', 'asleep', 'happy', 'lost'];
const CHROME = process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/chromium');

mkdirSync('web/public/otter', { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage();
await page.setContent('<canvas></canvas>');

// Everything below runs in the page, once per mood.
const build = async ({ src, jobs }) => {
  const NAVY = [17, 34, 59];
  const CREAM = [245, 239, 228];
  const FUR = [163, 111, 73];
  const FACE = [242, 223, 200];
  const WATER = [52, 129, 246];
  const AMBER = [245, 172, 51];
  // The tile inside the 1254-pixel art.
  const X0 = 38;
  const Y0 = 37;
  const S = 1178;
  const RADIUS = 300 / S;

  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = (w, h = w) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const src0 = canvas(S);
  src0.getContext('2d').drawImage(img, X0, Y0, S, S, 0, 0, S, S);
  const data = src0.getContext('2d').getImageData(0, 0, S, S);
  const px = data.data;
  const N = S * S;
  const dist = (i, c) => Math.hypot(px[i] - c[0], px[i + 1] - c[1], px[i + 2] - c[2]);

  // 1. The navy around the otter: flood from the edges through navy and
  // through the clear corners. Ink (eyes, nose) is close to navy but sits
  // inside the cream face, so the flood never reaches it.
  const bg = new Uint8Array(N);
  const stack = [];
  const seed = (k) => {
    if (!bg[k]) {
      const i = k * 4;
      if (px[i + 3] < 128 || dist(i, NAVY) < 30) {
        bg[k] = 1;
        stack.push(k);
      }
    }
  };
  // The art outlines its tile with a thin light line: everything outside a
  // tile inset a few pixels counts as background, so the line goes too.
  const IN = 10;
  const r = S * RADIUS - IN;
  const inside = (x, y) => {
    const cx = Math.min(Math.max(x, IN + r), S - IN - r);
    const cy = Math.min(Math.max(y, IN + r), S - IN - r);
    return Math.hypot(x - cx, y - cy) <= r;
  };
  for (let k = 0; k < N; k++) {
    if (!inside(k % S, (k / S) | 0)) {
      bg[k] = 1;
      stack.push(k);
    }
  }
  while (stack.length) {
    const k = stack.pop();
    const x = k % S;
    const y = (k / S) | 0;
    if (x > 0) seed(k - 1);
    if (x < S - 1) seed(k + 1);
    if (y > 0) seed(k - S);
    if (y < S - 1) seed(k + S);
  }

  // 2. Lift the otter off: background clear, and each edge pixel split into
  // the color it blends with navy and how much of it shows.
  const near = (k, r) => {
    const x = k % S;
    const y = (k / S) | 0;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < S && yy < S && bg[yy * S + xx]) return true;
      }
    return false;
  };
  const clear = new Uint8ClampedArray(px);
  for (let k = 0; k < N; k++) {
    const i = k * 4;
    if (bg[k]) {
      clear[i + 3] = 0;
      continue;
    }
    if (px[i + 3] < 250 || !near(k, 2)) continue;
    let best = null;
    for (const c of [FUR, FACE, WATER, AMBER]) {
      const d = [c[0] - NAVY[0], c[1] - NAVY[1], c[2] - NAVY[2]];
      const p = [px[i] - NAVY[0], px[i + 1] - NAVY[1], px[i + 2] - NAVY[2]];
      const a = Math.min(1, Math.max(0, (p[0] * d[0] + p[1] * d[1] + p[2] * d[2]) / (d[0] ** 2 + d[1] ** 2 + d[2] ** 2)));
      const err = Math.hypot(p[0] - a * d[0], p[1] - a * d[1], p[2] - a * d[2]);
      if (!best || err < best.err) best = { c, a, err };
    }
    clear.set(best.c, i);
    clear[i + 3] = Math.round(best.a * 255);
  }

  // 3. The light version: cream next to the background is a whisker (brown)
  // or a mark above the head (navy).
  const R = 16;
  const reach = new Uint8Array(N);
  {
    const row = new Uint8Array(N);
    for (let y = 0; y < S; y++) {
      let last = -1e9;
      for (let x = 0; x < S; x++) {
        if (bg[y * S + x]) last = x;
        if (x - last <= R) row[y * S + x] = 1;
      }
      last = 1e9;
      for (let x = S - 1; x >= 0; x--) {
        if (bg[y * S + x]) last = x;
        if (last - x <= R) row[y * S + x] = 1;
      }
    }
    for (let x = 0; x < S; x++) {
      let last = -1e9;
      for (let y = 0; y < S; y++) {
        if (row[y * S + x]) last = y;
        if (y - last <= R) reach[y * S + x] = 1;
      }
      last = 1e9;
      for (let y = S - 1; y >= 0; y--) {
        if (row[y * S + x]) last = y;
        if (last - y <= R) reach[y * S + x] = 1;
      }
    }
  }
  const light = new Uint8ClampedArray(clear);
  for (let k = 0; k < N; k++) {
    const i = k * 4;
    if (!light[i + 3] || !reach[k]) continue;
    if (Math.hypot(light[i] - FACE[0], light[i + 1] - FACE[1], light[i + 2] - FACE[2]) > 45) continue;
    light.set(((k / S) | 0) < S * 0.27 ? NAVY : FUR, i);
  }

  const layer = (pixels) => {
    const c = canvas(S);
    c.getContext('2d').putImageData(new ImageData(pixels, S, S), 0, 0);
    return c;
  };
  const otter = { dark: layer(clear), light: layer(light) };

  // Shrink in halves so the small sizes stay crisp.
  const shrink = (c, size) => {
    let cur = c;
    while (cur.width / 2 > size) {
      const n = canvas(Math.round(cur.width / 2));
      const g = n.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(cur, 0, 0, n.width, n.height);
      cur = n;
    }
    const out = canvas(size);
    const g = out.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, size, size);
    return out;
  };
  const rgb = (c) => `rgb(${c.join(',')})`;

  // A finished picture at full size, then shrunk.
  const compose = ({ tile, shape, safe }) => {
    const c = canvas(S);
    const g = c.getContext('2d');
    const fill = tile === 'light' ? CREAM : NAVY;
    const art = otter[tile === 'none-light' || tile === 'light' ? 'light' : 'dark'];
    if (tile === 'none' || tile === 'none-light') {
      g.drawImage(art, 0, 0);
      return c;
    }
    if (shape === 'round') {
      g.beginPath();
      g.roundRect(0, 0, S, S, S * RADIUS);
      g.clip();
    }
    g.fillStyle = rgb(fill);
    g.fillRect(0, 0, S, S);
    // Water runs to the edge wherever the platform's mask leaves room.
    const k = safe ? 0.8 : 1;
    const off = (S * (1 - k)) / 2;
    g.fillStyle = rgb(WATER);
    g.fillRect(0, off + S * k * 0.86, S, S);
    g.drawImage(art, off, off, S * k, S * k);
    return c;
  };

  const out = {};
  for (const job of jobs) out[job.name] = shrink(compose(job), job.size).toDataURL('image/png');
  return out;
};

const jobs = (mood) => {
  const list = [
    { name: `otter/${mood}.png`, tile: 'dark', shape: 'round', size: 160 },
    { name: `otter/${mood}-light.png`, tile: 'light', shape: 'round', size: 160 },
    { name: `otter/${mood}-clear.png`, tile: 'none', size: 280 },
    { name: `otter/${mood}-clear-light.png`, tile: 'none-light', size: 280 },
  ];
  if (mood !== 'hello') return list;
  return [
    ...list,
    // Home screens round the corners themselves, so these fill the square.
    ...[180, 192, 512].flatMap((size) => [
      { name: `icon-${size}.png`, tile: 'dark', shape: 'square', size },
      { name: `icon-light-${size}.png`, tile: 'light', shape: 'square', size },
    ]),
    // Android crops a maskable icon to a circle or squircle: keep the otter in the safe zone.
    { name: 'icon-maskable-512.png', tile: 'dark', shape: 'square', safe: true, size: 512 },
    { name: 'icon-light-maskable-512.png', tile: 'light', shape: 'square', safe: true, size: 512 },
    // Tab icons, and the sizes inside favicon.ico.
    { name: 'favicon-dark.png', tile: 'dark', shape: 'round', size: 64 },
    { name: 'favicon-light.png', tile: 'light', shape: 'round', size: 64 },
    ...[16, 32, 48].map((size) => ({ name: `ico-${size}`, tile: 'dark', shape: 'round', size })),
  ];
};

const ico = [];
for (const mood of MOODS) {
  const src = `data:image/png;base64,${readFileSync(`art/otter/${mood}.png`).toString('base64')}`;
  const files = await page.evaluate(build, { src, jobs: jobs(mood) });
  for (const [name, url] of Object.entries(files)) {
    const buf = Buffer.from(url.split(',')[1], 'base64');
    if (name.startsWith('ico-')) {
      ico.push([Number(name.slice(4)), buf]);
      continue;
    }
    writeFileSync(`web/public/${name}`, buf);
    console.log(`wrote web/public/${name}`);
  }
}

// favicon.ico, for browsers and bookmark bars that ask for it by name.
const header = Buffer.alloc(6 + 16 * ico.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(ico.length, 4);
let offset = header.length;
ico.forEach(([size, buf], i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(size, e);
  header.writeUInt8(size, e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(buf.length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += buf.length;
});
writeFileSync('web/public/favicon.ico', Buffer.concat([header, ...ico.map(([, buf]) => buf)]));
console.log('wrote web/public/favicon.ico');
await browser.close();
