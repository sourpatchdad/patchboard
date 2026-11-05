// Renders the app icons to the PNGs home screens need. icon.svg (dark) and
// icon-light.svg are the sources; the favicon*.svg files are their simpler
// twins for 16-pixel tabs and bookmarks.
// Run: npm run icons (needs Chrome or Chromium, like npm run screenshots).

import { readFileSync } from 'node:fs';
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
await browser.close();
