import { strict as assert } from 'node:assert';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { Alert } from '../../shared/types.ts';

// A fake ntfy (JSON publish at the root) and Gotify (/message), recording
// what arrives, so the test sees exactly what a phone would get.
const got: { to: string; auth?: string; body: Record<string, unknown> }[] = [];
const body = (req: IncomingMessage) => new Promise<string>((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });
const server = createServer(async (req, res) => {
  const b = JSON.parse(await body(req));
  if (req.url === '/' && req.method === 'POST') got.push({ to: 'ntfy', auth: req.headers.authorization, body: b });
  else if (req.url === '/gotify/message') got.push({ to: 'gotify', auth: req.headers['x-gotify-key'] as string, body: b });
  else return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
});

let n: typeof import('../notify.ts');
before(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  Object.assign(process.env, { NTFY_URL: `${base}/patchboard-x7`, NTFY_TOKEN: 'tk', GOTIFY_URL: `${base}/gotify`, GOTIFY_TOKEN: 'gk', PATCHBOARD_URL: 'https://pb.home' });
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
