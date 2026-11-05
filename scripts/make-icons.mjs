// Renders the app icons to the PNGs home screens need. icon.svg (dark) and
// icon-light.svg are the sources; the favicon*.svg files are their simpler
// twins for 16-pixel tabs and bookmarks.
// Run: npm run icons (needs Chrome or Chromium, like npm run screenshots).

import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const CHROME = process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/chromium');
const browser = await chromium.launch({ executablePath: CHROME });

async function render(svg, size, path, transparent = true) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path, omitBackground: transparent });
  await page.close();
  console.log(`wrote ${path}`);
}

for (const [source, prefix] of [
  ['web/public/icon.svg', 'icon'],
  ['web/public/icon-light.svg', 'icon-light'],
]) {
  const svg = readFileSync(source, 'utf8');
  for (const size of [180, 192, 512]) await render(svg, size, `web/public/${prefix}-${size}.png`);
  // Android crops a maskable icon to its own shape, so that one fills the square.
  const bleed = svg.replace(/rx="228"/g, 'rx="0"').replace(/<rect x="3"[^>]*\/>/, '');
  await render(bleed, 512, `web/public/${prefix}-maskable-512.png`, false);
}

// favicon.ico, for browsers and bookmark bars that ask for it by name. An
// .ico can't follow light and dark, so its calm patches take a mid tone that
// reads on both. PNG images inside an ICO container, 16, 32 and 48 pixels.
const fav = readFileSync('web/public/favicon-dark.svg', 'utf8').replace(/#ECE6DA/g, '#98A3B6');
const pngs = [];
for (const size of [16, 32, 48]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${fav}`);
  pngs.push([size, await page.screenshot({ omitBackground: true })]);
  await page.close();
}
const header = Buffer.alloc(6 + 16 * pngs.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngs.length, 4);
let offset = header.length;
pngs.forEach(([size, png], i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(size, e);
  header.writeUInt8(size, e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(png.length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += png.length;
});
writeFileSync('web/public/favicon.ico', Buffer.concat([header, ...pngs.map(([, png]) => png)]));
console.log('wrote web/public/favicon.ico');
await browser.close();
