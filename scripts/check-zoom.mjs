// Actual Chromium zoom and minimum-font checks against an isolated demo database.
// Uses a temporary browser profile; never changes the shared browser settings.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const dir = mkdtempSync(join(tmpdir(), 'pb-zoom-check-'));
const base = 'http://localhost:3299';
const server = spawn(process.execPath, ['server/index.ts'], {
  env: { ...process.env, DEMO: '1', DATA_DIR: dir, PORT: '3299' }, stdio: 'ignore',
});
let context;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/api/session`)).ok) { ready = true; break; } } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(ready, 'demo server started');
  const profile = join(dir, 'browser');
  for (const options of [{ channel: 'chrome' }, { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' }, { channel: 'chromium' }]) {
    try {
      context = await chromium.launchPersistentContext(profile, { ...options, headless: true, viewport: null, args: ['--window-size=1440,1000'] });
      break;
    } catch {}
  }
  assert(context, 'Install Chrome/Chromium or set CHROMIUM_PATH');
  const settings = context.pages()[0];
  await settings.goto('chrome://settings/appearance');
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const setup = async () => {
    const { exportedAt, ...saved } = await (await page.request.get(`${base}/api/setup`)).json();
    return saved;
  };
  const before = await setup();
  const paths = ['/', '/server', '/stacks', '/reading', '/upcoming', '/apps', '/settings?tab=home', '/settings?tab=connections'];
  const go = async (path) => {
    await page.goto(base + path);
    await page.waitForFunction(() => !!document.querySelector('main h1, main h2'));
    await page.evaluate(async () => { await document.fonts.ready; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
  };
  let baseDpr;
  for (const zoom of [1, 2, 4]) {
    await settings.evaluate((factor) => chrome.settingsPrivate.setDefaultZoom(factor), zoom);
    for (const path of paths) {
      await go(path);
      const metrics = await page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio, scroll: document.documentElement.scrollWidth }));
      baseDpr ??= metrics.dpr;
      assert(Math.abs(metrics.dpr / baseDpr - zoom) < 0.01, `${path}: actual browser zoom is ${zoom * 100}%`);
      assert(metrics.scroll <= metrics.width + 1, `${path}: no horizontal document scrolling at ${zoom * 100}%`);
    }
    await go('/server');
    await page.getByRole('button', { name: 'Customize', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Customize Server' });
    assert(await dialog.evaluate((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; }), `editor fits at ${zoom * 100}%`);
    await dialog.getByRole('button', { name: 'Save', exact: true }).focus();
    assert(await dialog.getByRole('button', { name: 'Save', exact: true }).evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), 'editor actions scroll into view');
    await page.keyboard.press('Escape');
  }
  await settings.evaluate(() => chrome.settingsPrivate.setDefaultZoom(1));
  assert(await settings.evaluate(() => new Promise((resolve) => chrome.settingsPrivate.setPref('webkit.webprefs.minimum_font_size', 24, '', resolve))), 'browser accepts 24px minimum font');
  const font = await settings.evaluate(() => new Promise((resolve) => chrome.settingsPrivate.getPref('webkit.webprefs.minimum_font_size', resolve)));
  assert.equal(font.value, 24, 'browser applies the requested minimum font');
  for (const path of paths) {
    await go(path);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${path}: enlarged text stays within the document`);
  }
  await go('/');
  const overlaps = await page.evaluate(() => {
    const issues = [];
    const lines = [...document.querySelector('.header-context .weather-text').children];
    for (let i = 1; i < lines.length; i++) {
      if (lines[i - 1].getBoundingClientRect().bottom > lines[i].getBoundingClientRect().top + 1) issues.push('weather lines');
    }
    for (const row of document.querySelectorAll('.agenda-compact .rel')) {
      const time = row.querySelector('.rel-time');
      if (!time.textContent.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(time);
      if (range.getBoundingClientRect().right > row.querySelector('.rel-main').getBoundingClientRect().left + 1) issues.push('calendar time');
    }
    const rows = [...document.querySelectorAll('.feedlist a')];
    for (const row of rows) {
      const title = row.querySelector('.feed-title'), meta = row.querySelector('.feed-meta');
      if (title && meta && title.getBoundingClientRect().bottom > meta.getBoundingClientRect().top + 1) issues.push('reading lines');
    }
    return issues;
  });
  assert.deepEqual(overlaps, [], 'enlarged weather, Reading and calendar text does not overlap');
  assert.deepEqual(await setup(), before, 'zoom and cancelled editors preserve saved setup');
  assert.deepEqual(errors, [], 'no browser errors');
  console.log('Actual 100/200/400% browser zoom, editor reachability, 24px minimum text and saved setup passed.');
} finally {
  await context?.close();
  await new Promise((resolve) => server.exitCode !== null ? resolve() : (server.once('exit', resolve), server.kill()));
  rmSync(dir, { recursive: true, force: true });
}
