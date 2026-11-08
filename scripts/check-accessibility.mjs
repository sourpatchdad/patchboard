// Browser accessibility-tree and reflow checks against an isolated demo database.
// This complements, rather than replaces, a spoken screen-reader walkthrough.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const dir = mkdtempSync(join(tmpdir(), 'pb-a11y-check-'));
const base = 'http://localhost:3298';
const server = spawn(process.execPath, ['server/index.ts'], {
  env: { ...process.env, DEMO: '1', DATA_DIR: dir, PORT: '3298' }, stdio: 'ignore',
});
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/api/session`)).ok) { ready = true; break; } } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(ready, 'demo server started');
  for (const options of [{ channel: 'chrome' }, { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' }, {}]) {
    try { browser = await chromium.launch(options); break; } catch {}
  }
  assert(browser, 'Install Chrome/Chromium or set CHROMIUM_PATH');
  const page = await browser.newPage({ colorScheme: 'dark' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Accessibility.enable');
  const setup = async () => {
    const { exportedAt, ...saved } = await (await page.request.get(`${base}/api/setup`)).json();
    return saved;
  };
  const before = await setup();
  const paths = ['/', '/server', '/stacks', '/feeds', '/upcoming', '/apps', '/settings?tab=home', '/settings?tab=connections'];
  const checkTree = async (scope) => {
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const exposed = nodes.filter((node) => !node.ignored);
    const namedRoles = ['button', 'link', 'textbox', 'combobox', 'checkbox', 'slider', 'spinbutton', 'meter', 'dialog', 'navigation'];
    const unnamed = exposed.filter((node) => namedRoles.includes(node.role?.value) && !node.name?.value.trim());
    assert.deepEqual(unnamed.map((node) => node.role.value), [], `${scope}: controls and meters have accessible names`);
    for (const meter of exposed.filter((node) => node.role?.value === 'meter')) {
      assert(meter.value?.value >= 0 && meter.value.value <= 100, `${scope}: ${meter.name.value} has a percentage value`);
    }
    return exposed;
  };
  // CSS viewports corresponding to 200% of 1920px and 400% of 1280px.
  // These exercise reflow; browser UI zoom and text-only zoom still need manual checks.
  for (const width of [960, 320]) {
    await page.setViewportSize({ width, height: 720 });
    for (const path of paths) {
      await page.goto(base + path);
      await page.locator('main').waitFor();
      await page.waitForFunction(() => !!document.querySelector('main h1, main h2'));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${path} reflows at ${width}px`);
      const tree = await checkTree(`${path} at ${width}px`);
      assert.equal(tree.filter((node) => node.role?.value === 'main').length, 1, `${path} exposes one main landmark`);
      assert(tree.some((node) => node.role?.value === 'navigation' && node.name?.value === 'Views'), `${path} exposes named navigation`);
    }
  }
  // Both Windows-style palettes: bars must survive background-color replacement.
  await page.setViewportSize({ width: 1920, height: 1080 });
  for (const colorScheme of ['dark', 'light']) {
    await page.emulateMedia({ forcedColors: 'active', colorScheme });
    await page.goto(base + '/');
    await page.locator('.header-board-vitals .meter').waitFor();
    assert(await page.evaluate(() => matchMedia('(forced-colors: active)').matches));
    const graphics = await page.evaluate(() => {
      const style = (selector) => getComputedStyle(document.querySelector(selector));
      return {
        fill: style('.header-board-vitals .meter > span').backgroundColor,
        track: style('.header-board-vitals .meter').backgroundColor,
        parts: [...document.querySelectorAll('.header-board-vitals .split > span')].map((el) => getComputedStyle(el).backgroundColor),
        playback: [...document.querySelectorAll('.playback .meter > span')].map((el) => ({ fill: getComputedStyle(el).backgroundColor, track: getComputedStyle(el.parentElement).backgroundColor })),
        cards: ['.masthead-status', '.header-board-vitals > .section', '.header-context'].map((selector) => ({ width: style(selector).outlineWidth, type: style(selector).outlineStyle })),
      };
    });
    assert.notEqual(graphics.fill, graphics.track, `${colorScheme}: usage fill differs from its track`);
    assert(graphics.playback.length > 0 && graphics.playback.every((bar) => bar.fill !== bar.track), `${colorScheme}: playback progress remains visible`);
    assert(new Set(graphics.parts).size >= 2, `${colorScheme}: memory segments remain distinct`);
    assert(graphics.cards.every((card) => parseFloat(card.width) >= 1 && card.type === 'solid'), `${colorScheme}: header cards retain boundaries`);
    await checkTree(`Home in forced ${colorScheme} colors`);
    // Dialog names and focus must also survive high contrast and narrow reflow.
    await page.setViewportSize({ width: 320, height: 720 });
    await page.locator('.wordmark').focus();
    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await dialog.waitFor();
    assert(await dialog.evaluate((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), 'help fits narrow high-contrast viewport');
    await checkTree('Keyboard shortcuts in forced colors');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1920, height: 1080 });
  }
  assert.deepEqual(await setup(), before, 'accessibility checks preserve saved setup');
  assert.deepEqual(errors, [], 'no browser errors');
  console.log('Accessible names, meter values, landmarks, 320/960px reflow, high-contrast graphics and narrow help passed.');
} finally {
  await browser?.close();
  await new Promise((resolve) => server.exitCode !== null ? resolve() : (server.once('exit', resolve), server.kill()));
  rmSync(dir, { recursive: true, force: true });
}
