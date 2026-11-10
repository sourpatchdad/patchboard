import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { fetchJsonWidget } from '../jsonwidget.ts';
import { setSecret } from '../secrets.ts';

// A fake Pi-hole 6: POST /api/auth trades the password for a session id;
// GET /api/stats/summary wants it in X-FTL-SID.
let signIns = 0;
let valid = new Set<string>();
const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/auth') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      signIns++;
      const ok = JSON.parse(body).password === 'right-password';
      const sid = `sid-${signIns}`;
      if (ok) valid.add(sid);
      res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ session: ok ? { valid: true, sid, validity: 1800 } : { valid: false } }));
    });
    return;
  }
  if (req.url === '/api/stats/summary') {
    if (!valid.has(String(req.headers['x-ftl-sid']))) {
      res.writeHead(401).end('{}');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ queries: { total: 48213, blocked: 6120, percent_blocked: 12.7 }, clients: { active: 23 } }));
    return;
  }
  res.writeHead(404).end();
});
let base = '';

before(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const cfg = (secret: string) => ({
  title: 'pihole6',
  url: `${base}/api/stats/summary`,
  headers: {},
  interval: 60,
  fields: [{ label: 'blocked', path: 'queries.blocked', format: 'number' as const }],
  login: { kind: 'pihole6' as const, secret },
});

test('one sign-in serves repeated requests', async () => {
  setSecret('APP_PH_GOOD', 'right-password');
  signIns = 0;
  const a = await fetchJsonWidget(cfg('APP_PH_GOOD'));
  const b = await fetchJsonWidget(cfg('APP_PH_GOOD'));
  assert.equal(a.values[0].value, 6120);
  assert.equal(b.values[0].value, 6120);
  assert.equal(signIns, 1);
});

test('an expired session signs in once more, then the number comes back', async () => {
  valid = new Set(); // Pi-hole dropped every session
  signIns = 0;
  const r = await fetchJsonWidget(cfg('APP_PH_GOOD'));
  assert.equal(r.values[0].value, 6120);
  assert.equal(signIns, 1);
});

test('a wrong password backs off instead of retrying', async () => {
  setSecret('APP_PH_BAD', 'wrong-password');
  signIns = 0;
  const a = await fetchJsonWidget(cfg('APP_PH_BAD'));
  const b = await fetchJsonWidget(cfg('APP_PH_BAD'));
  assert.match(a.error ?? '', /refused the password/);
  assert.match(b.error ?? '', /tries again in 5 minutes/);
  assert.equal(signIns, 1);
});
