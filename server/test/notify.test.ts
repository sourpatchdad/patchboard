import { strict as assert } from 'node:assert';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { Alert } from '../../shared/types.ts';

// A fake ntfy (JSON publish at the root) and Gotify (/message), recording
// what arrives, so the test sees exactly what a phone would get.
const got: { to: string; auth?: string; body: Record<string, unknown> }[] = [];
let hookDown = false;
const body = (req: IncomingMessage) => new Promise<string>((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });
const server = createServer(async (req, res) => {
  const b = JSON.parse(await body(req));
  if (req.url === '/' && req.method === 'POST') got.push({ to: 'ntfy', auth: req.headers.authorization, body: b });
  else if (req.url === '/gotify/message') got.push({ to: 'gotify', auth: req.headers['x-gotify-key'] as string, body: b });
  else if (req.url === '/hook') {
    if (hookDown) return void res.writeHead(502).end();
    got.push({ to: 'webhook', auth: req.headers.authorization, body: b });
  }
  else return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
});

let n: typeof import('../notify.ts');
before(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  Object.assign(process.env, { NTFY_URL: `${base}/patchboard-x7`, NTFY_TOKEN: 'tk', GOTIFY_URL: `${base}/gotify`, GOTIFY_TOKEN: 'gk', PATCHBOARD_URL: 'https://pb.home', WEBHOOK_URL: `${base}/hook`, WEBHOOK_TOKEN: 'wh' });
  n = await import('../notify.ts');
});
after(() => server.close());

const alert = (id: string, level: Alert['level'], title = id): Alert => ({ id, level, title, detail: `${title} detail`, href: `/c/${id}`, source: 'docker' });

test('a problem waits two minutes, goes out once, and clears once', () => {
  const s = { seen: new Map<string, number>(), sent: {} as Record<string, string> };
  const a = [alert('plex', 'critical', 'plex is not running'), alert('info', 'info')];
  assert.equal(n.plan(a, 0, s, 'warn').length, 0, 'too new');
  const due = n.plan(a, n.SETTLE_MS, s, 'warn');
  assert.deepEqual(due.map((m) => [m.id, m.level]), [['plex', 'critical']], 'info alerts never notify');
  n.delivered(due[0], s);
  assert.equal(n.plan(a, n.SETTLE_MS * 3, s, 'warn').length, 0, 'sent once');
  const fixed = n.plan([], n.SETTLE_MS * 4, s, 'warn');
  assert.deepEqual(fixed.map((m) => [m.title, m.level]), [['Fixed: plex is not running', 'resolved']]);
  n.delivered(fixed[0], s);
  assert.deepEqual(s.sent, {});
});

test('a blip that clears inside two minutes never notifies', () => {
  const s = { seen: new Map<string, number>(), sent: {} as Record<string, string> };
  n.plan([alert('sonarr', 'warn')], 0, s, 'warn');
  assert.equal(n.plan([], 60_000, s, 'warn').length, 0);
  assert.equal(n.plan([alert('sonarr', 'warn')], 90_000, s, 'warn').length, 0, 'the clock starts over');
});

test('NOTIFY_LEVEL=critical skips warnings', () => {
  const s = { seen: new Map<string, number>(), sent: {} as Record<string, string> };
  n.plan([alert('w', 'warn'), alert('c', 'critical')], 0, s, 'critical');
  assert.deepEqual(n.plan([alert('w', 'warn'), alert('c', 'critical')], n.SETTLE_MS, s, 'critical').map((m) => m.id), ['c']);
});

test('ntfy gets a JSON publish with the topic, priority and a tap link; Gotify its key and extras', async () => {
  await n.send({ title: 'Disk at 61°C', body: 'sda, WDC', level: 'critical', href: '/server' });
  const ntfy = got.find((g) => g.to === 'ntfy')!;
  assert.equal(ntfy.auth, 'Bearer tk');
  assert.deepEqual(
    [ntfy.body.topic, ntfy.body.title, ntfy.body.priority, ntfy.body.click, ntfy.body.tags],
    ['patchboard-x7', 'Disk at 61°C', 5, 'https://pb.home/server', ['rotating_light']],
  );
  const gotify = got.find((g) => g.to === 'gotify')!;
  assert.equal(gotify.auth, 'gk');
  assert.equal(gotify.body.priority, 8);
  assert.deepEqual(gotify.body.extras, { 'client::notification': { click: { url: 'https://pb.home/server' } } });
  got.length = 0;
  await n.send({ title: 'Test', body: 'x', level: 'test' }, 'gotify');
  assert.deepEqual(got.map((g) => g.to), ['gotify'], 'a test reaches only the one being tested');
});

test('a webhook gets plain JSON with the level, a link and the token', async () => {
  got.length = 0;
  await n.send({ title: 'plex is not running', body: 'Exited (137)', level: 'critical', href: '/c/plex' }, 'webhook');
  const w = got.find((g) => g.to === 'webhook')!;
  assert.equal(w.auth, 'Bearer wh');
  assert.deepEqual([w.body.source, w.body.level, w.body.title, w.body.url], ['patchboard', 'critical', 'plex is not running', 'https://pb.home/c/plex']);
});

test('Discord takes only its own webhook addresses', async () => {
  const { withConfig, config } = await import('../config.ts');
  await withConfig({ DISCORD_WEBHOOK: 'https://discord.com/api/webhooks/1/abc' }, async () => assert.ok(config.notify.discord));
  await withConfig({ DISCORD_WEBHOOK: 'https://evil.example/api/webhooks/1/abc' }, async () => assert.equal(config.notify.discord, undefined));
});

test('a broken channel retries on its own; the working ones never repeat a message', async () => {
  n.resetNotifyForTests();
  got.length = 0;
  hookDown = true;
  const down = [alert('unpackerr', 'critical')];
  const t0 = Date.now();
  await n.notifyAlerts(down, t0);
  await n.notifyAlerts(down, t0 + n.SETTLE_MS + 1);
  await n.notifyAlerts(down, t0 + n.SETTLE_MS + 30_000);
  await n.notifyAlerts(down, t0 + n.SETTLE_MS + 60_000);
  assert.equal(got.filter((g) => g.to === 'ntfy').length, 1, 'ntfy once, though the webhook kept failing');
  assert.equal(got.filter((g) => g.to === 'webhook').length, 0);

  hookDown = false;
  await n.notifyAlerts(down, t0 + n.SETTLE_MS + 90_000);
  assert.equal(got.filter((g) => g.to === 'webhook').length, 1, 'the webhook catches up once it is back');
  assert.equal(got.filter((g) => g.to === 'ntfy').length, 1);

  await n.notifyAlerts([], t0 + n.SETTLE_MS + 120_000);
  assert.deepEqual(got.slice(-3).map((g) => g.to).sort(), ['gotify', 'ntfy', 'webhook'], 'each sends Fixed once');
  assert.ok(got.slice(-3).every((g) => String(g.body.title ?? '').startsWith('Fixed:')));
});

test('an upgrade from the old shared record sends nothing twice', async () => {
  n.resetNotifyForTests();
  got.length = 0;
  const { kvSet } = await import('../db.ts');
  kvSet('notify-sent', { unpackerr: 'unpackerr is not running' });
  // The module reads the record when it loads; a fresh copy plays a restart after the upgrade.
  const fresh = (await import(`../notify.ts?restart=${Date.now()}`)) as typeof import('../notify.ts');
  const t0 = Date.now();
  await fresh.notifyAlerts([alert('unpackerr', 'critical')], t0);
  await fresh.notifyAlerts([alert('unpackerr', 'critical')], t0 + n.SETTLE_MS + 1);
  assert.equal(got.length, 0, 'already sent before the upgrade');
  await fresh.notifyAlerts([], t0 + n.SETTLE_MS + 2);
  assert.equal(got.length, 3, 'and each channel says Fixed once when it clears');
});
