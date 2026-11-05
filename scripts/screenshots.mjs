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
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const OUT = 'docs/screenshots';
const DESKTOP = { width: 1600, height: 1000 };
const PHONE = { width: 390, height: 844 };

async function launch() {
  for (const channel of ['chrome', 'msedge', undefined]) {
    try {
      return await chromium.launch(channel ? { channel } : {});
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

async function shoot(page, name, opts = {}) {
  await page.screenshot({ path: join(OUT, `${name}.png`), ...opts });
  console.log(`  ${name}.png`);
}

/** One element instead of the page. */
async function shootEl(locator, name) {
  await locator.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`  ${name}.png`);
}

/** A browser context with a theme saved, as Settings would save it. */
async function context(browser, opts, appearance) {
  const ctx = await browser.newContext(opts);
  if (appearance) await ctx.addInitScript((a) => localStorage.setItem('pb-appearance', JSON.stringify(a)), appearance);
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
  await go('/');
  await shoot(page, 'home', { fullPage: true });
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
  await shoot(page, 'feeds-edition');
  await go('/feeds?e=1');
  await shoot(page, 'feeds');

  // The house: a board of Home Assistant, the car, Wake, Uptime and ad blocking, then back to the default.
  const board = (method, body) =>
    page.evaluate(
      ([m, b]) => fetch('/api/board', { method: m, headers: { 'Content-Type': 'application/json', 'X-Patchboard': 'action' }, body: b && JSON.stringify(b) }),
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
      { id: 'uptime', type: 'uptime', size: 'm', span: 1 },
      { id: 'dns', type: 'dns', size: 's', span: 1 },
    ],
  });
  await go('/', 1500);
  await shoot(page, 'house');
  await board('DELETE');
  await go('/logs/plex', 2500);
  await shoot(page, 'logs');
  await go('/');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('plex');
  await settle(page, 500);
  await shoot(page, 'jump-to');
  await page.keyboard.press('Escape');

  console.log('Making it yours');
  await go('/');
  await page.getByRole('button', { name: /Customize/ }).click();
  await settle(page, 600);
  await shoot(page, 'customize');
  await page.getByRole('button', { name: 'Feeds settings' }).click();
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
  await go('/settings?tab=connections');
  await shoot(page, 'integrations', { fullPage: true });
  const emby = page.locator('.integration', { hasText: 'Emby' }).first();
  await emby.getByRole('button', { name: 'Set up' }).click();
  await emby.getByLabel('Address').fill('http://192.168.1.10:8096');
  await emby.getByLabel('API key').fill('a-key-you-paste');
  await emby.getByRole('button', { name: 'Test connection' }).click();
  await settle(page, 800);
  await shootEl(emby, 'integration-setup');

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
} finally {
  await browser.close();
  await Promise.all([demo.stop(), fresh.stop()]);
}
console.log(`Done: ${OUT}`);
