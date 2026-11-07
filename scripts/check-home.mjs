// Uses an isolated demo database. Run after building, with Chrome or Chromium.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const dir = mkdtempSync(join(tmpdir(), 'pb-home-check-'));
const port = 3296;
const base = `http://localhost:${port}`;
const server = spawn(process.execPath, ['server/index.ts'], {
  env: { ...process.env, DEMO: '1', DATA_DIR: dir, PORT: String(port) }, stdio: 'ignore',
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
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, colorScheme: 'dark' });
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  const go = async (path = '/') => { await page.goto(base + path); await page.locator('.board .cell').first().waitFor(); };
  const board = async () => (await page.request.get(`${base}/api/boards/home`)).json();
  const action = async (path, data) => {
    const res = await page.request.put(base + path, { data, headers: { 'X-Patchboard': 'action' } });
    assert(res.ok(), `${path}: ${await res.text()}`);
  };
  const fits = () => page.waitForFunction(() => {
    const foot = document.querySelector('.board-foot');
    return foot && foot.getBoundingClientRect().bottom + window.scrollY <= innerHeight;
  });
  const created = await page.request.post(`${base}/api/boards`, {
    data: { version: 1, name: 'Other board', widgets: [] }, headers: { 'X-Patchboard': 'action' },
  });
  assert(created.ok(), 'a second board adds the tabs above Home');
  await go();
  await fits();
  const original = await board();
  const initialFeeds = await page.locator('#w-feeds li').count();
  // Changing available space above the board must trim, then restore rows.
  await page.evaluate(() => {
    const welcome = document.createElement('section');
    welcome.id = 'fit-room-check';
    welcome.style.height = '300px';
    document.querySelector('.home').insertBefore(welcome, document.querySelector('.board-wrap'));
  });
  await page.waitForFunction((count) => document.querySelectorAll('#w-feeds li').length < count, initialFeeds);
  await page.evaluate(() => document.getElementById('fit-room-check').remove());
  await page.waitForFunction((count) => document.querySelectorAll('#w-feeds li').length >= count, initialFeeds);
  await fits();
  // Header choices are device preferences and must not rewrite a saved board.
  await page.evaluate(() => localStorage.setItem('pb-appearance', JSON.stringify({ homeStatusSize: 'hidden', homeServer: 'hidden', homeWeather: 'hidden', homeClockSize: 'large' })));
  await go();
  await page.locator('#w-attention').waitFor();
  assert.deepEqual(await board(), original);
  assert.equal(await page.locator('#w-attention').count(), 1);
  // A horizontal shelf keeps its complete configured row, even in a short window.
  const shelf = { version: 1, name: 'Preserved board', columns: 3, fit: true, widgets: [
    { id: 'recent', type: 'recent', size: 'xl', span: 3, config: { limit: '12' } },
    { id: 'feeds', type: 'feeds', size: 'm', config: { limit: '6' } },
  ] };
  await action('/api/boards/home', shelf);
  await go();
  const saved = await board();
  const posters = await page.locator('#w-recent li').count();
  assert(posters > 1, 'demo has a full poster shelf');
  await page.setViewportSize({ width: 1920, height: 600 });
  await page.waitForTimeout(1600);
  assert.equal(await page.locator('#w-recent li').count(), posters);
  assert.deepEqual(await board(), saved, 'Fit never persists its temporary limits');
  for (const viewport of [{ width: 1440, height: 900 }, { width: 402, height: 874 }]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(600);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${viewport.width}px has no horizontal page overflow`);
  }
  assert.deepEqual(await board(), saved);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole('button', { name: 'New board', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New board', exact: true });
  await dialog.waitFor();
  assert.equal(await dialog.getAttribute('aria-modal'), 'true');
  await dialog.getByLabel('Board name').fill('Keyboard board');
  await page.keyboard.press('Control+k');
  assert.equal(await page.getByRole('dialog').count(), 1, 'page shortcuts do not open a second overlay');
  const last = dialog.getByRole('button', { name: 'Create board', exact: true });
  await last.focus();
  await page.keyboard.press('Tab');
  assert(await dialog.evaluate((el) => el.contains(document.activeElement)), 'Tab stays in drawer');
  await page.keyboard.press('Shift+Tab');
  assert(await last.evaluate((el) => el === document.activeElement), 'Shift+Tab wraps');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert(await page.getByRole('button', { name: 'New board', exact: true }).evaluate((el) => el === document.activeElement), 'focus returns to New board');
  await page.getByRole('button', { name: /^Customize/ }).click();
  await page.getByRole('button', { name: 'Reading settings', exact: true }).click();
  await page.getByRole('dialog', { name: 'Reading settings' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Add widget', exact: true }).click();
  await page.getByRole('dialog', { name: 'Add a widget' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.deepEqual(await board(), saved, 'Cancel leaves the saved board intact');
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Jump to' }).fill('server');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[inert]').count(), 0, 'closing overlays restores the page');
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  assert(await page.locator('#main-content').evaluate((el) => el === document.activeElement), 'Skip to content moves focus to main');
  assert.deepEqual(errors, []);
  console.log('Home, Fit, saved boards, poster rows, phone layout and keyboard paths passed.');
} finally {
  await browser?.close();
  await new Promise((resolve) => server.exitCode !== null ? resolve() : (server.once('exit', resolve), server.kill()));
  rmSync(dir, { recursive: true, force: true });
}
