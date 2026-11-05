// Renders web/public/icon.svg to the PNGs iOS and Android need for home-screen
// icons. icon.svg is the source; favicon.svg is its simpler twin for 16px tabs.
// Run: npm run icons (needs Chrome or Chromium, like npm run screenshots).

import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const CHROME = process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/chromium');
const svg = readFileSync('web/public/icon.svg', 'utf8');
const browser = await chromium.launch({ executablePath: CHROME });
for (const size of [180, 192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: `web/public/icon-${size}.png`, omitBackground: true });
  console.log(`wrote web/public/icon-${size}.png`);
}
// Android crops a maskable icon to its own shape, so that one fills the square.
const bleed = svg.replace(/rx="228"/g, 'rx="0"').replace(/<rect x="3"[^>]*\/>/, '');
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
await page.setContent(`<style>html,body{margin:0}svg{display:block;width:512px;height:512px}</style>${bleed}`);
await page.screenshot({ path: 'web/public/icon-maskable-512.png' });
console.log('wrote web/public/icon-maskable-512.png');
await browser.close();
