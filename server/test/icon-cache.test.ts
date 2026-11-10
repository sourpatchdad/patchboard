import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { iconCache } from '../icon-cache.ts';

// A fake dashboard-icons CDN that counts what it's asked for.
const asked: string[] = [];
const cdn = createServer((req, res) => {
  asked.push(req.url!);
  if (req.url === '/svg/sonarr.svg') return void setTimeout(() => res.writeHead(200, { 'Content-Type': 'image/svg+xml' }).end('<svg/>'), 30);
  if (req.url === '/png/plex.png') return void res.writeHead(200, { 'Content-Type': 'image/png' }).end('PNG');
  if (req.url === '/svg/page.svg') return void res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html>');
  res.writeHead(404).end();
});
let base = '';
const dir = mkdtempSync(join(tmpdir(), 'pb-icons-'));
before(async () => {
  await new Promise<void>((r) => cdn.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(cdn.address() as AddressInfo).port}`;
});
after(() => {
  cdn.close();
  rmSync(dir, { recursive: true, force: true });
});

test('an icon is fetched once, then served from the data folder', async () => {
  const icons = iconCache(dir, base);
  // Twenty tiles asking at once make one request.
  const all = await Promise.all(Array.from({ length: 20 }, () => icons.get('svg', 'sonarr.svg')));
  assert(all.every((g) => g?.body.toString() === '<svg/>' && g.type === 'image/svg+xml'));
  assert.equal(asked.filter((u) => u === '/svg/sonarr.svg').length, 1);
  // A restart (a new cache over the same folder) needs no network.
  const again = await iconCache(dir, 'http://127.0.0.1:1').get('svg', 'sonarr.svg');
  assert.equal(again?.body.toString(), '<svg/>');
  assert.equal((await icons.get('png', 'plex.png'))?.type, 'image/png');
});

test('a missing icon is asked for once an hour, and only icons come back', async () => {
  const icons = iconCache(dir, base);
  assert.equal(await icons.get('svg', 'nothing.svg'), null);
  assert.equal(await icons.get('svg', 'nothing.svg'), null);
  assert.equal(asked.filter((u) => u === '/svg/nothing.svg').length, 1);
  assert.equal(await icons.get('svg', 'page.svg'), null, 'not an image');
});

test('names never become paths or other files', async () => {
  const icons = iconCache(dir, base);
  const before = asked.length;
  for (const [kind, file] of [['svg', '..%2Fsecret.svg'], ['svg', '../x.svg'], ['svg', 'x.png'], ['exe', 'x.exe'], ['svg', '.svg'], ['svg', 'UPPER.svg']]) {
    assert.equal(await icons.get(kind, file), null, `${kind}/${file}`);
  }
  assert.equal(asked.length, before, 'nothing reached the CDN');
});

test('a month-old copy still shows and is refreshed behind it', async () => {
  const icons = iconCache(dir, base);
  const old = new Date(Date.now() - 40 * 24 * 3600_000);
  utimesSync(join(dir, 'png', 'plex.png'), old, old);
  const n = asked.length;
  assert.equal((await icons.get('png', 'plex.png'))?.body.toString(), 'PNG');
  for (let i = 0; i < 50 && asked.length === n; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(asked.at(-1), '/png/plex.png');
});
