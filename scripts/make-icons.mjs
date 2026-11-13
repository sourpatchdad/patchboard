// Draws Patchboard's app icons and favicon from the mark below.
// Run: npm run icons (needs Chrome or Chromium, like npm run screenshots).
//
// The mark is a P on a 512 grid: an open bowl in the tile's ink, and a blue
// tab under its top bar with a slanted foot. Dark and light share the
// geometry; only the tile and the ink change. Mono is for e-ink and comes in
// two: black on white for a light phone, white on black for a dark one, the
// tab a quiet gray instead of blue. The whole
// mark sits inside the circle Android crops maskable icons to, so one file
// serves both purposes.

import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BOWL = 'M152 124H305A101 101 0 0 1 305 326H232V266H305A41 41 0 0 0 305 184H152A10 10 0 0 1 142 174V134A10 10 0 0 1 152 124Z';
const TAB = 'M142 266H232V376L142 413Z';
const BLUE = '#3b82f6';
const TILES = {
  dark: { tile: '#0b0c0e', ink: '#f1e2cc' },
  light: { tile: '#f7f7f8', ink: '#20252d' },
  mono: { tile: '#ffffff', ink: '#000000', tab: '#b4b4b4' },
  'mono-dark': { tile: '#000000', ink: '#ffffff', tab: '#6e6e6e' },
};

/** The mark on a tile. `scale` grows it about the center; `radius` rounds the tile. */
export const iconSvg = (tone, { scale = 1, radius = 0 } = {}) => {
  const { tile, ink, tab = BLUE } = TILES[tone];
  const mark = `<path fill="${ink}" d="${BOWL}"/><path fill="${tab}" d="${TAB}"/>`;
  const grown = scale === 1 ? mark : `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${mark}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${radius}" fill="${tile}"/>${grown}</svg>`;
};

const jobs = [
  // Home screens and the install manifest: a full square, as designed.
  ...[180, 192, 512].flatMap((size) => [
    { name: `icon-${size}.png`, svg: iconSvg('dark'), size },
    { name: `icon-light-${size}.png`, svg: iconSvg('light'), size },
    { name: `icon-mono-${size}.png`, svg: iconSvg('mono'), size },
    { name: `icon-mono-dark-${size}.png`, svg: iconSvg('mono-dark'), size },
  ]),
  { name: 'favicon-mono.png', svg: iconSvg('mono', { scale: 1.3, radius: 96 }), size: 64 },
  { name: 'favicon-mono-dark.png', svg: iconSvg('mono-dark', { scale: 1.3, radius: 96 }), size: 64 },
  // The tab icon and the sizes inside favicon.ico: a rounded tile with the
  // mark grown, so the P still reads at 16 pixels on light and dark tab bars.
  { name: 'favicon.png', svg: iconSvg('dark', { scale: 1.3, radius: 96 }), size: 64 },
  ...[16, 32, 48].map((size) => ({ name: `ico-${size}`, svg: iconSvg('dark', { scale: 1.3, radius: 96 }), size })),
];

if (process.argv[1]?.endsWith('make-icons.mjs')) {
  const CHROME = process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/chromium');
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  const ico = [];
  for (const { name, svg, size } of jobs) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    if (name.startsWith('ico-')) ico.push([size, buf]);
    else writeFileSync(`web/public/${name}`, buf);
  }
  await browser.close();

  // favicon.ico, for browsers and bookmark bars that ask for it by name: PNGs inside an ICO directory.
  const header = Buffer.alloc(6 + 16 * ico.length);
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
  console.log(`Wrote ${jobs.length - ico.length} icons and favicon.ico.`);
}
