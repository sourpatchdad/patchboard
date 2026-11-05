// Regenerates docs/screenshots from demo mode: builds the UI, starts two
// demo servers on spare ports (one set up, one a fresh install), drives a
// browser through each page, and writes the PNGs the README shows.
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

console.log('Building the UI...');
execSync('npx vite build', { stdio: 'ignore' });
mkdirSync(OUT, { recursive: true });

const demo = await server(3290);
const fresh = await server(3291, { DEMO_EMPTY: '1' });
const browser = await launch();

try {
  const dark = await browser.newContext({ viewport: DESKTOP, colorScheme: 'dark' });
  const page = await dark.newPage();
  const go = async (path) => {
    await page.goto(demo.base + path);
    await settle(page);
  };

  console.log('Desktop, dark');
  await go('/');
  await shoot(page, 'home', { fullPage: true });
  await go('/server');
  await shoot(page, 'server', { fullPage: true });
  await go('/c/unpackerr');
  await shoot(page, 'container');
  await go('/upcoming');
  await shoot(page, 'upcoming');
  await go('/weather');
  await shoot(page, 'weather');
  await go('/settings?tab=connections');
  await shoot(page, 'integrations', { fullPage: true });

  await go('/apps');
  await page.getByRole('button', { name: 'Edit apps' }).first().click();
  await settle(page, 600);
  await shoot(page, 'edit-apps');
  await page.getByLabel('Immich: edit, hide or move').selectOption('edit');
  await page.getByRole('dialog').locator('.live-number select').first().selectOption('immich');
  await settle(page, 300);
  await shoot(page, 'live-number');

  await go('/');
  await page.getByRole('button', { name: /Customize/ }).click();
  await settle(page, 600);
  await shoot(page, 'customize');

  console.log('Desktop, light');
  const light = await browser.newContext({ viewport: DESKTOP, colorScheme: 'light' });
  const lp = await light.newPage();
  await lp.goto(demo.base + '/');
  await settle(lp);
  await shoot(lp, 'home-light');

  console.log('First run');
  const fp = await dark.newPage();
  await fp.goto(fresh.base + '/');
  await settle(fp, 2500);
  await shoot(fp, 'first-run');

  console.log('Phone');
  const phone = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const pp = await phone.newPage();
  await pp.goto(demo.base + '/');
  await settle(pp);
  await shoot(pp, 'phone-home');
  await pp.goto(demo.base + '/c/unpackerr');
  await settle(pp);
  await shoot(pp, 'phone-container');
} finally {
  await browser.close();
  await Promise.all([demo.stop(), fresh.stop()]);
}
console.log(`Done: ${OUT}`);
