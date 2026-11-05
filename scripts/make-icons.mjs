// Builds every app icon from the otter in shared/otter.ts: the SVGs the
// browser loads, the PNGs home screens need, and favicon.ico.
// Run: npm run icons (needs Chrome or Chromium, like npm run screenshots).

import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { otterSvg } from '../shared/otter.ts';

const out = (name, body) => {
  writeFileSync(`web/public/${name}`, `${body.trim()}\n`);
  console.log(`wrote web/public/${name}`);
};

// SVGs. The tab icon is the small drawing with no tile, so it sits on any
// browser theme; the two fixed choices put it on a tile.
out('icon.svg', otterSvg({ bg: 'dark' }));
out('icon-light.svg', otterSvg({ bg: 'light' }));
out('favicon.svg', otterSvg({ small: true, bg: 'none' }));
out('favicon-dark.svg', otterSvg({ small: true, bg: 'dark' }));
out('favicon-light.svg', otterSvg({ small: true, bg: 'light' }));

const CHROME = process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/chromium');
const browser = await chromium.launch({ executablePath: CHROME });

async function png(svg, size, transparent = true) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  const buf = await page.screenshot({ omitBackground: transparent });
  await page.close();
  return buf;
}

// Home screens round the corners themselves, so these fill the square.
for (const [bg, prefix] of [
  ['dark', 'icon'],
  ['light', 'icon-light'],
]) {
  for (const size of [180, 192, 512]) {
    writeFileSync(`web/public/${prefix}-${size}.png`, await png(otterSvg({ bg, square: true }), size, false));
    console.log(`wrote web/public/${prefix}-${size}.png`);
  }
  // Android crops a maskable icon to a circle or squircle: keep the otter in the safe zone.
  writeFileSync(`web/public/${prefix}-maskable-512.png`, await png(otterSvg({ bg, safe: true }), 512, false));
  console.log(`wrote web/public/${prefix}-maskable-512.png`);
}

// favicon.ico, for browsers and bookmark bars that ask for it by name: the
// small otter with no tile, as PNGs inside an ICO, 16, 32 and 48 pixels.
const pngs = [];
for (const size of [16, 32, 48]) pngs.push([size, await png(otterSvg({ small: true, bg: 'none' }), size)]);
const header = Buffer.alloc(6 + 16 * pngs.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngs.length, 4);
let offset = header.length;
pngs.forEach(([size, buf], i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(size, e);
  header.writeUInt8(size, e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(buf.length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += buf.length;
});
writeFileSync('web/public/favicon.ico', Buffer.concat([header, ...pngs.map(([, buf]) => buf)]));
console.log('wrote web/public/favicon.ico');
await browser.close();
