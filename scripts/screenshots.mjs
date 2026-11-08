// Regenerates docs/screenshots from demo mode: builds the UI, starts two
// demo servers on spare ports (one set up, one a fresh install), drives a
// browser through every page, theme and editor, and writes the PNGs that
// README.md and docs/TOUR.md show.
//
//   npm run screenshots
//
// It uses an installed Chrome or Edge. Without either, run
// `npx playwright install chromium` once.

import { execSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const OUT = 'docs/screenshots';
// 1920x1080 is the showcase size; the phone is an iPhone 17 Pro.
const DESKTOP = { width: 1920, height: 1080 };
const PHONE = { width: 402, height: 874 };

async function launch() {
  for (const channel of ['chrome', 'msedge', 'chromium', undefined]) {
    try {
      return await chromium.launch(channel === 'chromium' ? { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' } : channel ? { channel } : {});
    } catch {
      /* try the next one */
    }
  }
  throw new Error('No browser found. Install Chrome, or run: npx playwright install chromium');
}

async function server(port, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pb-shots-'));
  const proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.ts'], {
    env: { ...process.env, DEMO: '1', DATA_DIR: dir, PORT: String(port), ...extra },
    stdio: 'ignore',
  });
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/api/session`)).ok) {
        const stop = async () => {
          // Wait for the server to let go of its database before removing it.
          await new Promise((r) => (proc.exitCode !== null ? r() : (proc.once('exit', r), proc.kill())));
          try {
            rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
          } catch {
            /* a temp folder left behind is harmless */
          }
        };
        return { base, stop };
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  proc.kill();
  throw new Error(`Demo server on ${port} didn't start`);
}

const settle = (page, ms = 1600) => page.waitForTimeout(ms);

/** Saves a PNG capture as WebP, about a quarter of the size, via Chrome's canvas. */
let converter;
async function save(png, name) {
  converter ??= await browser.newPage();
  const url = await converter.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/webp', 0.9);
  }, png.toString('base64'));
  writeFileSync(join(OUT, `${name}.webp`), Buffer.from(url.split(',')[1], 'base64'));
  console.log(`  ${name}.webp`);
}

async function shoot(page, name, opts = {}) {
  await save(await page.screenshot(opts), name);
}

/** One element instead of the page. */
async function shootEl(locator, name) {
  await save(await locator.screenshot(), name);
}

/** A browser context with a look saved, as Settings would save it. Icons in color: they read better in a screenshot. */
async function context(browser, opts, appearance) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript((a) => localStorage.setItem('pb-appearance', JSON.stringify(a)), { icons: 'color', ...appearance });
  return ctx;
}

console.log('Building the UI...');
execSync('npx vite build', { stdio: 'ignore' });
mkdirSync(OUT, { recursive: true });

const demo = await server(3290);
const fresh = await server(3291, { DEMO_EMPTY: '1' });
const browser = await launch();

try {
  const dark = await context(browser, { viewport: DESKTOP, colorScheme: 'dark' });
  const page = await dark.newPage();
  const go = async (path, ms) => {
    await page.goto(demo.base + path);
    await settle(page, ms);
  };

  console.log('Pages');
  // A second board, so the tabs over the board show.
  await go('/');
  await page.evaluate(() => fetch('/api/boards', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Patchboard': 'action' }, body: JSON.stringify({ version: 1, name: 'Movie night', widgets: [{ id: 'now', type: 'now', size: 'm' }, { id: 'recent', type: 'recent', size: 'xl' }] }) }));
  // The hero: Home as a fresh install arranges it, on one 1920 by 1080 screen.
  await go('/', 3000);
  await shoot(page, 'home');
  await page.getByRole('button', { name: /Plex: Severance/ }).first().hover();
  await settle(page, 400);
  await shoot(page, 'playback-preview');
  await page.keyboard.press('Escape');
  await page.mouse.move(0, 0);
  await go('/server');
  await shoot(page, 'server', { fullPage: true });
  await go('/stacks');
  await shoot(page, 'stacks');
  await go('/c/unpackerr');
  await shoot(page, 'container');
  await go('/upcoming');
  await shoot(page, 'upcoming');
  await go('/weather');
  await shoot(page, 'weather');
  await go('/feeds');
  await shoot(page, 'reading-edition');
  await go('/feeds?e=1');
  await shoot(page, 'reading');

  // The house, then the network, as boards of their own, then back to the default.
  const board = (method, body) =>
    page.evaluate(
      ([m, b]) => fetch('/api/boards/home', { method: m, headers: { 'Content-Type': 'application/json', 'X-Patchboard': 'action' }, body: b && JSON.stringify(b) }),
      [method, body],
    );
  await go('/');
  await board('PUT', {
    columns: 3,
    widgets: [
      { id: 'attention', type: 'attention', size: 'm', span: 1 },
      { id: 'ha-1', type: 'homeassistant', size: 'm', span: 2, config: { title: 'Downstairs', entities: 'light.living_room,light.kitchen,light.porch,scene.movie_night,switch.coffee_maker,sensor.living_room_temperature,binary_sensor.back_door,lock.front_door,cover.garage_door,sensor.house_power,person.sam,automation.night_lights' } },
      { id: 'car', type: 'car', size: 'm', span: 1 },
      { id: 'wake', type: 'wake', size: 's', span: 1 },
    ],
  });
  await go('/', 1500);
  await shoot(page, 'house');

  // The machines: hosts, storage, power, drives, Proxmox, Docker hosts, the network, sync.
  await board('PUT', {
    columns: 3,
    widgets: [
      { id: 'hosts', type: 'hosts', size: 'l', span: 2 },
      { id: 'power', type: 'power', size: 's', span: 1 },
      { id: 'storage', type: 'storage', size: 'm', span: 1 },
      { id: 'proxmox', type: 'proxmox', size: 'm', span: 1 },
      { id: 'drives', type: 'drives', size: 's', span: 1 },
      { id: 'dockerhosts', type: 'dockerhosts', size: 's', span: 1 },
      { id: 'network', type: 'network', size: 's', span: 1 },
      { id: 'photos', type: 'photos', size: 's', span: 1 },
      { id: 'sync', type: 'sync', size: 's', span: 1 },
    ],
  });
  await go('/', 1500);
  await shoot(page, 'machines', { fullPage: true });

  // The household: calendar, a shared note, books and the house itself.
  await page.evaluate(() =>
    fetch('/api/notes/notes-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Patchboard': 'action' },
      body: JSON.stringify({ text: 'Groceries\n- [ ] oat milk\n- [x] coffee\n- [ ] dog food\n\nGuest Wi-Fi: otterhouse / riverstones' }),
    }),
  );
  await board('PUT', {
    columns: 3,
    widgets: [
      { id: 'calendar', type: 'calendar', size: 'm', span: 1 },
      { id: 'notes-1', type: 'notes', size: 's', span: 1, config: { title: 'Kitchen' } },
      { id: 'books', type: 'books', size: 's', span: 1 },
      { id: 'upcoming', type: 'upcoming', size: 'm', span: 2 },
      { id: 'now', type: 'now', size: 'm', span: 1 },
    ],
  });
  await go('/', 1500);
  // Book covers come from Open Library: wait until every image has loaded.
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 15_000 }).catch(() => {});
  await shoot(page, 'household', { fullPage: true });

  // The network: requests, speed tests, monitors and ad blocking.
  await board('PUT', {
    columns: 3,
    widgets: [
      { id: 'requests', type: 'requests', size: 'm', span: 1 },
      { id: 'uptime', type: 'uptime', size: 'm', span: 1 },
      { id: 'speed', type: 'speed', size: 's', span: 1 },
      { id: 'dns', type: 'dns', size: 's', span: 1 },
    ],
  });
  await go('/', 1500);
  await shoot(page, 'network');
  await board('DELETE');
  await go('/logs/plex', 2500);
  await shoot(page, 'logs');
  await go('/');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('plex');
  await settle(page, 500);
  await shoot(page, 'jump-to');
  await page.keyboard.press('Escape');

  await page.locator('.wordmark').focus();
  await page.keyboard.press('?');
  await shootEl(page.getByRole('dialog', { name: 'Keyboard shortcuts' }), 'keyboard-shortcuts');
  await page.keyboard.press('Escape');

  console.log('Making it yours');
  await go('/');
  await page.getByRole('button', { name: /Arrange board/ }).click();
  // Arrange board keeps the preview in place and floats its bar at the bottom.
  await page.evaluate(() => scrollTo(0, 0));
  await settle(page, 600);
  await shoot(page, 'customize');
  await page.getByRole('button', { name: 'Reading settings' }).focus();
  await page.getByRole('button', { name: 'Reading settings' }).click();
  await settle(page, 400);
  await shoot(page, 'widget-settings');
  await go('/apps');
  await page.getByRole('button', { name: 'Edit apps' }).first().click();
  await settle(page, 600);
  await shoot(page, 'edit-apps');
  await page.getByLabel('Immich: edit, hide or move').selectOption('edit');
  await page.getByRole('dialog').locator('.live-number select').first().selectOption('immich');
  await settle(page, 300);
  await shoot(page, 'live-number');
  await go('/server');
  await page.getByRole('button', { name: 'Customize' }).click();
  await settle(page, 400);
  await shoot(page, 'page-customize');
  await go('/settings');
  await shoot(page, 'settings-look', { fullPage: true });
  await go('/settings?tab=home');
  await shoot(page, 'settings-home', { fullPage: true });
  await go('/settings?tab=alerts');
  await shoot(page, 'settings-alerts');
  await go('/settings?tab=connections');
  await shoot(page, 'integrations', { fullPage: true });
  const emby = page.locator('.integration', { hasText: 'Emby' }).first();
  await emby.getByRole('button', { name: 'Set up' }).click();
  await emby.getByLabel('Address').fill('http://192.168.1.10:8096');
  await emby.getByLabel('API key').fill('a-key-you-paste');
  await emby.getByRole('button', { name: 'Test connection' }).click();
  await settle(page, 800);
  await shootEl(emby, 'integration-setup');

  // Coming from Homepage: its services.yaml pasted in, previewed.
  await go('/settings?tab=connections&import=homepage');
  const homepage = page.getByRole('dialog', { name: 'Import from Homepage' });
  await homepage.locator('textarea').first().fill(
    ['- Media:', '    - Plex:', '        href: http://192.168.1.10:32400/web', '        icon: plex.png', '        widget:', '          type: plex', '    - Sonarr:', '        href: http://192.168.1.10:8989', '        icon: sonarr.png', '        widget:', '          type: sonarr', '- Home:', '    - Home Assistant:', '        href: http://192.168.1.30:8123', '        icon: home-assistant.png', '    - Immich:', '        href: http://192.168.1.10:2283', '        icon: immich.png', '        widget:', '          type: immich'].join('\n'),
  );
  await homepage.locator('textarea').nth(1).fill(['- Links:', '    - r/selfhosted:', '        - href: https://reddit.com/r/selfhosted'].join('\n'));
  await settle(page, 900);
  await shootEl(homepage, 'import-homepage');

  console.log('Themes');
  const themes = [
    ['graphite', 'light'],
    ['midnight', 'dark'],
    ['forest', 'dark'],
    ['dusk', 'dark'],
    ['paper', 'light'],
  ];
  for (const [theme, scheme] of themes) {
    const ctx = await context(browser, { viewport: DESKTOP, colorScheme: scheme }, { theme, scheme });
    const p = await ctx.newPage();
    await p.goto(demo.base + '/');
    await settle(p);
    await shoot(p, `theme-${theme}-${scheme}`);
    await ctx.close();
  }

  const cardContext = await context(browser, { viewport: DESKTOP, colorScheme: 'dark' }, { homeServer: 'card' });
  const cardPage = await cardContext.newPage();
  await cardPage.goto(demo.base + '/');
  await settle(cardPage);
  await shootEl(cardPage.locator('.masthead'), 'home-header-server');
  await cardPage.emulateMedia({ forcedColors: 'active' });
  await shootEl(cardPage.locator('.masthead'), 'home-header-contrast');
  await cardContext.close();

  console.log('The otter');
  // Each mood and what brings it on, from the images the app itself uses.
  const moods = [
    ['calm', 'All quiet', 'Nothing needs you.'],
    ['hello', 'Eyes open', 'Image updates or an app it can’t reach: worth a look, not a problem.'],
    ['alert', 'Alert', 'Something needs you: a warning in Needs attention, an amber dot on the tab.'],
    ['worried', 'Worried', 'Something is down: an alarm in Needs attention, a red dot on the tab.'],
    ['asleep', 'Asleep', 'All quiet between 11 PM and 6 AM.'],
    ['happy', 'Happy', 'Welcomes you on first run.'],
    ['lost', 'Lost', 'An address Patchboard doesn’t know.'],
  ];
  const sheet = await dark.newPage();
  await sheet.setViewportSize({ width: 1920, height: 440 });
  await sheet.setContent(`<body style="margin:0;padding:56px 64px;background:#0e1114;color:#e8eaed;font:15px/1.45 system-ui,sans-serif">
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:28px">
    ${moods
      .map(
        ([m, t, d]) => `<figure style="margin:0;text-align:center"><img src="${demo.base}/otter/${m}-clear.png" style="width:210px;height:210px">
        <figcaption><strong style="display:block;font-size:19px;margin:10px 0 6px">${t}</strong><span style="color:#9aa0a6">${d}</span></figcaption></figure>`,
      )
      .join('')}
    </div></body>`);
  await sheet.waitForLoadState('networkidle');
  await shoot(sheet, 'otter-moods');
  await sheet.close();

  console.log('First run');
  const fp = await dark.newPage();
  await fp.goto(fresh.base + '/');
  await settle(fp, 2500);
  await shoot(fp, 'first-run');

  console.log('Phone');
  const phone = await context(browser, { viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const pp = await phone.newPage();
  for (const [path, name] of [
    ['/', 'phone-home'],
    ['/c/unpackerr', 'phone-container'],
    ['/upcoming', 'phone-upcoming'],
    ['/weather', 'phone-weather'],
    ['/server', 'phone-server'],
  ]) {
    await pp.goto(demo.base + path);
    await settle(pp);
    await shoot(pp, name);
  }
  const basic = await context(browser, { viewport: DESKTOP, colorScheme: 'dark' }, {
    homeStatusSize: 'hidden', homeServer: 'hidden', homeWeather: 'hidden', homeClockSize: 'small',
  });
  const bp = await basic.newPage();
  await bp.goto(demo.base + '/');
  await settle(bp);
  await shoot(bp, 'home-basic', { fullPage: true });
} finally {
  await browser.close();
  await Promise.all([demo.stop(), fresh.stop()]);
}
console.log(`Done: ${OUT}`);
