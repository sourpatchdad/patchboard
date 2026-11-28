// A stranger's first five minutes on a fresh install with real-looking containers.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
const OUT = process.argv[2];
const dir = mkdtempSync(join(tmpdir(), 'pb-walk-'));
const proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.ts'], { env: { ...process.env, DEMO: '1', DEMO_EMPTY: '1', DATA_DIR: dir, PORT: '3397' }, stdio: 'ignore' });
const base = 'http://localhost:3397';
for (let i = 0; i < 150; i++) {
  try {
    if ((await fetch(base + '/api/session')).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}
const browser = await chromium.launch({ channel: 'chrome' });
const errors = [];
const t0 = Date.now();
const step = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`);
for (const [tag, vp] of [['desk', { width: 1440, height: 900 }], ['phone', { width: 402, height: 874 }]]) {
  const page = await browser.newPage({ viewport: vp });
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${tag} ${r.status()} ${r.url().replace(base, '')}`));
  await page.goto(base + '/?setup=1');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT, `${tag}-1-first-run.png`) });
  step(`${tag}: first run shown`);
  if (tag === 'desk') {
    await page.getByPlaceholder('Town or city').fill('Austin');
    await page.waitForTimeout(1500);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    const open = page.getByRole('button', { name: 'Open Patchboard' });
    if (await open.isVisible()) await open.click();
    await page.waitForTimeout(3000);
    step('desk: opened');
  } else {
    await page.goto(base + '/');
    await page.waitForTimeout(2500);
  }
  await page.screenshot({ path: join(OUT, `${tag}-2-home.png`), fullPage: true });
  await page.goto(base + '/settings?tab=connections');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT, `${tag}-3-connections.png`) });
  await page.goto(base + '/apps');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, `${tag}-4-apps.png`) });
  await page.close();
}
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
proc.kill();
