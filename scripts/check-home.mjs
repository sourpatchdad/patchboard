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
  let headerCase = 'demo';
  await page.route('**/api/snapshot', async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    snapshot.sources.miniflux.data.unread = 1006;
    if (headerCase !== 'demo') {
      snapshot.alerts = headerCase === 'blind' ? [{ id: 'src-nextcloud', source: 'nextcloud', level: 'info', title: "Can't reach Nextcloud", detail: 'Timed out after 8s', since: Date.now() - 120000, href: '/settings?tab=connections' }] : [];
      const sample = snapshot.sources.docker.data.containers[0];
      snapshot.sources.docker.data.containers = Array.from({ length: 60 }, (_, i) => ({ ...sample, name: `container-${i}`, state: 'running' }));
      snapshot.sources.weather.data.alerts = [];
    }
    await route.fulfill({ response, json: snapshot });
  });
  await page.route('**/api/events', (route) => route.abort());
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
  await page.waitForTimeout(800);
  const original = await board();
  assert(!original.board.widgets.some((w) => w.type === 'vitals'), 'a fresh board uses header stats without a duplicate Server card');
  headerCase = 'quiet';
  await go();
  for (const width of [2048, 1920, 1440, 1280]) {
    await page.setViewportSize({ width, height: 1080 });
    await page.waitForTimeout(300);
    const geometry = await page.evaluate(() => {
      const header = document.querySelector('.masthead');
      const status = header.querySelector('.status-line');
      const clock = header.querySelector('.masthead-time').getBoundingClientRect();
      const weather = header.querySelector('.header-weather').getBoundingClientRect();
      return { height: header.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(status).lineHeight), statusHeight: status.getBoundingClientRect().height, timeBottom: clock.bottom, weatherTop: weather.top, overflow: document.documentElement.scrollWidth - innerWidth };
    });
    assert.match(await page.locator('.status-line').innerText(), /All quiet. 60 containers running./);
    assert(geometry.statusHeight <= geometry.lineHeight * 1.2, `${width}px quiet status stays on one line`);
    assert(geometry.height <= 132, `${width}px default header stays compact: ${geometry.height}px`);
    assert(geometry.timeBottom <= geometry.weatherTop, 'time and date sit above weather');
    const cards = await page.evaluate(() => {
      const frames = ['.masthead-status', '.header-board-vitals > .section', '.header-context'].map((selector) => {
        const el = document.querySelector(selector), r = el.getBoundingClientRect(), s = getComputedStyle(el);
        return { top: r.top, bottom: r.bottom, surface: s.backgroundColor, edge: s.boxShadow, radius: s.borderRadius };
      });
      const context = document.querySelector('.header-context').getBoundingClientRect();
      const clock = document.querySelector('.header-context .clock').getBoundingClientRect();
      const temp = document.querySelector('.header-context .temp').getBoundingClientRect();
      const weather = document.querySelector('.header-context .weather-text').getBoundingClientRect();
      return { frames, center: context.x + context.width / 2, clockCenter: clock.x + clock.width / 2, weatherCenter: (temp.left + weather.right) / 2, weatherEdge: getComputedStyle(document.querySelector('.header-weather')).borderWidth };
    });
    assert(Math.max(...cards.frames.map((r) => r.top)) - Math.min(...cards.frames.map((r) => r.top)) < 1, `${width}px header card tops align`);
    assert(Math.max(...cards.frames.map((r) => r.bottom)) - Math.min(...cards.frames.map((r) => r.bottom)) < 1, `${width}px header card bottoms align`);
    assert(cards.frames.every((r) => r.surface === cards.frames[0].surface && r.edge === cards.frames[0].edge && r.radius === cards.frames[0].radius), 'header cards share their surface, edge and radius');
    assert(Math.abs(cards.center - cards.clockCenter) < 1, 'clock is centered in its card');
    assert(Math.abs(cards.center - cards.weatherCenter) < 1, 'weather is centered under the clock');
    assert.equal(cards.weatherEdge, '0px', 'weather belongs to the shared card without a nested box');
    assert.equal(geometry.overflow, 0);
  }
  await page.setViewportSize({ width: 402, height: 874 });
  await page.waitForTimeout(300);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'default header fits a phone without sideways scrolling');
  await page.setViewportSize({ width: 1920, height: 1080 });
  headerCase = 'blind';
  await go();
  assert.equal(await page.locator('.status-line').innerText(), "Can't reach Nextcloud.");
  assert(!await page.locator('.home').innerText().then((text) => text.includes('Nothing wrong')));
  await page.evaluate(() => localStorage.setItem('pb-appearance', JSON.stringify({ homeStatusSize: 'hidden', homeServer: 'card' })));
  await go();
  assert.equal(await page.locator('.attention .all-clear strong').innerText(), 'Connection problem.');
  await page.evaluate(() => localStorage.setItem('pb-appearance', JSON.stringify({ homeServer: 'summary' })));
  headerCase = 'demo';
  await go();
  assert.equal(await page.locator('.header-board-vitals').count(), 1, 'older numeric preferences adopt the graphical header');
  await fits();
  await page.waitForTimeout(500);
  const positions = () => page.locator('.board > .cell').evaluateAll((cells) => Object.fromEntries(cells.map((cell) => {
    const r = cell.getBoundingClientRect();
    return [cell.id, { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }];
  })));
  const viewing = await positions();
  await page.getByRole('button', { name: /^Arrange board/ }).click();
  await page.waitForTimeout(300);
  const editing = await positions();
  const outlines = await page.locator('.board > .cell').evaluateAll((cells) => cells.map((cell) => {
    const r = cell.getBoundingClientRect(); const s = getComputedStyle(cell, '::after');
    return { left: r.left + parseFloat(s.left), right: r.right - parseFloat(s.right), top: r.top + parseFloat(s.top), bottom: r.bottom - parseFloat(s.bottom) };
  }));
  for (let i = 0; i < outlines.length; i++) for (let j = i + 1; j < outlines.length; j++) {
    const a = outlines[i], b = outlines[j];
    assert(Math.min(a.right, b.right) <= Math.max(a.left, b.left) || Math.min(a.bottom, b.bottom) <= Math.max(a.top, b.top), 'editing outlines leave clear gutters');
  }
  assert.deepEqual(Object.keys(editing), Object.keys(viewing), 'Customize does not add placeholder widgets');
  for (const id of Object.keys(viewing)) for (const axis of ['x', 'y', 'width', 'height']) {
    assert(Math.abs(viewing[id][axis] - editing[id][axis]) < 4, `${id} keeps its ${axis} when Customize opens: ${viewing[id][axis]} vs ${editing[id][axis]}`);
  }
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: /^Arrange board/ }).click();
  await page.locator('#w-feeds').hover();
  const grip = await page.locator('#w-feeds [data-grip="cell"]').boundingBox();
  const grid = await page.locator('.board').boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grid.x + grid.width * 0.84, Math.max(140, grip.y - 100), { steps: 12 });
  await page.mouse.up();
  assert.equal(await page.locator('#w-feeds').evaluate((el) => getComputedStyle(el).gridColumnStart), '3', 'dragging places Reading in the selected column');
  await page.waitForTimeout(400);
  const arranged = await positions();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: /^Arrange board/ }).waitFor();
  assert.equal((await board()).board.widgets.find((w) => w.id === 'feeds').column, 3, 'the selected column is saved');
  await page.waitForTimeout(250);
  const afterSave = await positions();
  for (const id of Object.keys(arranged)) for (const axis of ['x', 'y', 'width', 'height']) {
    assert(Math.abs(arranged[id][axis] - afterSave[id][axis]) < 4, `${id} matches its arranged preview after Save: ${axis}`);
  }
  if (original.custom) await action('/api/boards/home', original.board);
  else await page.request.delete(base + '/api/boards/home', { headers: { 'X-Patchboard': 'action' } });
  await go();
  assert.equal(await page.locator('.nav-badge').innerText(), '1,006');
  assert.match(await page.locator('#w-feeds .section-count').innerText(), /1,006 unread/);
  await page.goto(base + '/settings?tab=home');
  await page.getByLabel('Show server details', { exact: true }).uncheck();
  await go();
  assert.equal(await page.locator('.header-board-vitals').count(), 0, 'header stats can be turned off');
  await page.getByRole('link', { name: 'Header settings', exact: true }).click();
  await page.getByLabel('Show server details', { exact: true }).check();
  await page.getByLabel('Show time and date', { exact: true }).uncheck();
  await page.getByLabel('Show weather', { exact: true }).uncheck();
  await go();
  assert.equal(await page.locator('.header-context').isVisible(), false, 'turning time and weather off leaves no empty column');
  await page.getByRole('link', { name: 'Header settings', exact: true }).click();
  for (const label of ['Show status', 'Show server details', 'Show time and date', 'Show weather']) await page.getByLabel(label, { exact: true }).uncheck();
  await go();
  assert.equal(await page.locator('.masthead').count(), 0, 'all header parts can be switched off');
  await page.getByRole('link', { name: 'Header settings', exact: true }).click();
  await page.getByRole('button', { name: 'Restore default header', exact: true }).click();
  await go();
  const headerCard = page.locator('.header-board-vitals');
  await headerCard.waitFor();
  assert.equal(await headerCard.locator('.vw').count(), 4, 'full card keeps CPU, memory, storage and uptime');
  assert.equal(await headerCard.getByRole('link', { name: 'Details', exact: true }).count(), 1);
  await headerCard.locator('.spark-wrap').waitFor();
  assert.equal(await headerCard.locator('.spark-wrap').count(), 1, 'CPU history remains visible');
  assert.equal(await headerCard.locator('.split').count(), 1, 'memory breakdown remains visible');
  assert.equal(await headerCard.locator('.meter').count(), 1, 'storage bar remains visible');
  assert.deepEqual(await board(), original, 'choosing a header card does not remove the board copy');
  await page.goto(base + '/settings?tab=home');
  await page.getByRole('button', { name: 'Restore default header', exact: true }).click();
  await go();
  await fits();
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
  await page.getByRole('button', { name: /^Arrange board/ }).click();
  await page.getByRole('button', { name: 'Reading settings', exact: true }).focus();
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
  await page.setViewportSize({ width: 1920, height: 700 });
  await action('/api/boards/home', { version: 1, columns: 3, widgets: [
    { id: 'feeds', type: 'feeds', size: 'm', span: 1, config: { limit: '3' } },
    { id: 'upcoming', type: 'upcoming', size: 'm', span: 1, config: { limit: '4' } },
    { id: 'recent', type: 'recent', size: 'xl', span: 3, config: { limit: '12' } },
  ] });
  await go();
  await page.waitForTimeout(300);
  const readingRows = await page.locator('#w-feeds .feedlist a').evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  assert(Math.max(...readingRows) - Math.min(...readingRows) < 1, 'Reading rows use a consistent height');
  const ages = await page.locator('#w-feeds .feed-meta time').evaluateAll((times) => times.map((time) => time.getBoundingClientRect().right));
  assert(Math.max(...ages) - Math.min(...ages) < 1, 'Reading ages line up in one column');
  const edges = await page.locator('#w-feeds .cell-body, #w-upcoming .cell-body').evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().bottom));
  assert(Math.abs(edges[0] - edges[1]) < 2, 'Reading and This week align when their content is close in height');
  const shelfTop = await page.locator('#w-recent').evaluate((card) => card.getBoundingClientRect().top);
  assert(Math.max(...edges) < shelfTop, 'aligning card edges preserves the full-width row below');
  assert.deepEqual(errors, []);
  console.log('Compact header, clear failure states, settings toggles, aligned lists, editing gutters, saved placement, poster rows and keyboard paths passed.');
} finally {
  await browser?.close();
  await new Promise((resolve) => server.exitCode !== null ? resolve() : (server.once('exit', resolve), server.kill()));
  rmSync(dir, { recursive: true, force: true });
}
