// Cuts a car's drawings into the Car widget's views: one transparent image
// per view, trimmed to the car, in server/car-art/<id>/. Then add the entry it
// prints to CAR_ART in shared/car-art.ts.
// Run: npm run car-art -- scripts/car-art/<id>.json (needs Chrome or Chromium).
//
// The spec names the source pictures (dark lines on white paper: a spec
// sheet with several views, or one picture per view) and, per view, the part
// of its source to use and where its tires and charge port sit, all in
// percent of the source picture. The script turns paper into transparency,
// erases the dimension and extension lines a sheet crop catches (thin,
// straight ink running in from the crop's edge), trims each view to its ink
// and re-expresses the spots in percent of the new image.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const specPath = process.argv[2];
if (!specPath) {
  console.error('Usage: npm run car-art -- scripts/car-art/<id>.json');
  process.exit(1);
}
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const out = resolve('server/car-art', spec.id);
mkdirSync(out, { recursive: true });

let browser;
for (const channel of ['chrome', 'msedge', 'chromium', undefined]) {
  try {
    browser = await chromium.launch(channel === 'chromium' ? { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' } : channel ? { channel } : {});
    break;
  } catch {
    /* try the next */
  }
}
if (!browser) throw new Error('No browser found. Install Chrome, or run: npx playwright install chromium');
const page = await browser.newPage();

const entries = [];
for (const v of spec.views) {
  const file = resolve(dirname(specPath), spec.sources[v.source]);
  const src = `data:image/${file.split('.').pop()};base64,${readFileSync(file).toString('base64')}`;
  const r = await page.evaluate(cut, { src, crop: v.crop ?? null, at: v.at ?? {}, port: v.port ?? null });
  writeFileSync(resolve(out, `${v.view}.webp`), Buffer.from(r.webp.split(',')[1], 'base64'));
  const entry = { view: v.view, aspect: Math.round((r.w / r.h) * 1000) / 1000, at: r.at };
  if (r.port) entry.port = r.port;
  entries.push(entry);
  console.error(`${v.view}: ${r.w}x${r.h}`);
}
await browser.close();

const fmt = (xy) => (xy ? `[${xy.join(', ')}]` : 'null');
console.log(`  {
    id: '${spec.id}',
    name: '${spec.name}',
    model: '${spec.model}',
    views: [
${entries.map((e) => `      { view: '${e.view}', aspect: ${e.aspect}, at: { fl: ${fmt(e.at.fl)}, fr: ${fmt(e.at.fr)}, rl: ${fmt(e.at.rl)}, rr: ${fmt(e.at.rr)} }${e.port ? `, port: ${fmt(e.port)}` : ''} },`).join('\n')}
    ],
  },`);

/** Runs in the page: paper to transparency, guides out, trimmed; WebP back. */
async function cut({ src, crop, at, port }) {
  const im = new Image();
  im.src = src;
  await im.decode();
  const W = im.naturalWidth;
  const H = im.naturalHeight;
  const [cx, cy, cw, ch] = crop ?? [0, 0, 100, 100];
  const box = { x: Math.round((cx / 100) * W), y: Math.round((cy / 100) * H) };
  const w = Math.round(((cx + cw) / 100) * W) - box.x;
  const h = Math.round(((cy + ch) / 100) * H) - box.y;
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(im, box.x, box.y, w, h, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  // Ink strength: 0 on paper, 255 on a solid line.
  const PAPER = 232;
  const a = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) {
    const l = (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000;
    a[i] = l >= PAPER ? 0 : Math.min(255, Math.round(((PAPER - l) * 255) / (PAPER - 40)));
  }
  if (crop) dropGuides(a, w, h);
  // Trim to the ink, with a little room.
  let [x0, y0, x1, y1] = [w, h, -1, -1];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (a[y * w + x] > 40) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  const pad = Math.round(0.02 * Math.max(x1 - x0, y1 - y0));
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w, x1 + 1 + pad);
  y1 = Math.min(h, y1 + 1 + pad);
  const tw = x1 - x0;
  const th = y1 - y0;
  const o = new OffscreenCanvas(tw, th);
  const octx = o.getContext('2d');
  const data = octx.createImageData(tw, th);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) data.data[(y * tw + x) * 4 + 3] = a[(y + y0) * w + x + x0];
  octx.putImageData(data, 0, 0);
  // Quality 1 makes Chrome's WebP encoder lossless, alpha and all.
  const blob = await o.convertToBlob({ type: 'image/webp', quality: 1 });
  const webp = await new Promise((done) => {
    const fr = new FileReader();
    fr.onload = () => done(fr.result);
    fr.readAsDataURL(blob);
  });
  const ox = box.x + x0;
  const oy = box.y + y0;
  const rel = (xy) => (xy ? [Math.round((((xy[0] / 100) * W - ox) / tw) * 1000) / 10, Math.round((((xy[1] / 100) * H - oy) / th) * 1000) / 10] : null);
  return { webp, w: tw, h: th, at: { fl: rel(at.fl), fr: rel(at.fr), rl: rel(at.rl), rr: rel(at.rr) }, port: rel(port) };

  /** Erase dimension and extension lines a sheet crop caught. */
  function dropGuides(a, w, h) {
    const on = (i) => a[i] > 12;
    const seen = new Uint8Array(w * h);
    const edge = Math.max(4, Math.round(0.03 * Math.max(w, h)));
    let total = 0;
    for (let i = 0; i < w * h; i++) if (on(i)) total++;
    for (let s = 0; s < w * h; s++) {
      if (seen[s] || !on(s)) continue;
      const stack = [s];
      const part = [];
      seen[s] = 1;
      let [mx0, my0, mx1, my1] = [w, h, -1, -1];
      while (stack.length) {
        const i = stack.pop();
        part.push(i);
        const x = i % w;
        const y = (i - x) / w;
        if (x < mx0) mx0 = x;
        if (x > mx1) mx1 = x;
        if (y < my0) my0 = y;
        if (y > my1) my1 = y;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            const j = ny * w + nx;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h && !seen[j] && on(j)) {
              seen[j] = 1;
              stack.push(j);
            }
          }
      }
      const bw = mx1 - mx0 + 1;
      const bh = my1 - my0 + 1;
      const atEdge = mx0 < edge || my0 < edge || mx1 >= w - edge || my1 >= h - edge;
      const thin = Math.min(bw, bh) <= 6 && Math.max(bw, bh) >= 15;
      // Lettering the crop cut through: a small piece right on the edge.
      const clipped = Math.max(bw, bh) <= 16 && (mx0 <= 1 || my0 <= 1 || mx1 >= w - 2 || my1 >= h - 2);
      // A dimension line and its extension meeting in an L: all line, no fill.
      const sparse = atEdge && part.length <= 3 * (bw + bh) && part.length < 0.2 * total;
      if ((thin && atEdge) || clipped || sparse) for (const i of part) a[i] = 0;
    }
    // An extension line that touches the car survives that: take any thin vertical
    // run in from the top or bottom edge, down to where something sits beside it.
    for (const fromTop of [true, false]) {
      const row = (r) => (fromTop ? r : h - 1 - r);
      const ink = (r, x) => x >= 0 && x < w && on(row(r) * w + x);
      for (let x = 0; x < w; x++) {
        let start = -1;
        for (let r = 0; r < 8; r++) if (ink(r, x)) {
          start = r;
          break;
        }
        if (start < 0) continue;
        const beside = (r) => [x - 5, x - 4, x - 3, x + 3, x + 4, x + 5].some((nx) => ink(r, nx));
        let r = start;
        while (r < h && ink(r, x) && !beside(r)) r++;
        if (r - start >= 10) for (let k = 0; k < r - 2; k++) for (let nx = Math.max(0, x - 2); nx <= Math.min(w - 1, x + 2); nx++) a[row(k) * w + nx] = 0;
      }
    }
  }
}
