import { strict as assert } from 'node:assert';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

// One fake server playing Pi-hole 6 (under /pi) and AdGuard Home (under /ag).
// Pi-hole hands out a session id and expires it once, to prove the client
// signs in again instead of failing.
const state = { piBlocking: true, piTimer: null as number | null, sids: 0, expireNext: false, agOn: true, agDuration: 0 };
const body = (req: IncomingMessage) => new Promise<string>((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });

const server = createServer(async (req, res) => {
  const json = (v: unknown, status = 200) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(v));
  const url = new URL(req.url!, 'http://x');

  if (url.pathname === '/pi/api/auth') {
    const { password } = JSON.parse(await body(req));
    if (password !== 'app-pw') return json({ session: { valid: false, sid: null } }, 401);
    state.sids++;
    return json({ session: { valid: true, sid: `sid-${state.sids}` } });
  }
  if (url.pathname.startsWith('/pi/')) {
    if (state.expireNext || req.headers['x-ftl-sid'] !== `sid-${state.sids}`) {
      state.expireNext = false;
      return json({ error: { key: 'unauthorized' } }, 401);
    }
    if (url.pathname === '/pi/api/stats/summary') return json({ queries: { total: 1000, blocked: 250, percent_blocked: 25.04 }, gravity: { domains_being_blocked: 120000 } });
    if (url.pathname === '/pi/api/dns/blocking' && req.method === 'GET') return json({ blocking: state.piBlocking ? 'enabled' : 'disabled', timer: state.piTimer });
    if (url.pathname === '/pi/api/dns/blocking' && req.method === 'POST') {
      const b = JSON.parse(await body(req));
      state.piBlocking = b.blocking;
      state.piTimer = b.timer;
      return json({ blocking: b.blocking ? 'enabled' : 'disabled', timer: b.timer });
    }
  }

  if (url.pathname.startsWith('/ag/')) {
    assert.equal(req.headers.authorization, `Basic ${Buffer.from('admin:ag-pw').toString('base64')}`);
    if (url.pathname === '/ag/control/stats') return json({ num_dns_queries: 2000, num_blocked_filtering: 300, num_replaced_safebrowsing: 20, num_replaced_parental: 0 });
    if (url.pathname === '/ag/control/status') return json({ protection_enabled: state.agOn, protection_disabled_duration: state.agDuration, running: true });
    if (url.pathname === '/ag/control/protection') {
      const b = JSON.parse(await body(req));
      state.agOn = b.enabled;
      state.agDuration = b.enabled ? 0 : b.duration;
      return res.writeHead(200).end('OK');
    }
  }
  res.writeHead(404).end();
});

let dns: typeof import('../adapters/dns.ts');

before(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  Object.assign(process.env, {
    PIHOLE_URL: `${base}/pi`,
    PIHOLE_PASSWORD: 'app-pw',
    ADGUARD_URL: `${base}/ag`,
    ADGUARD_USERNAME: 'admin',
    ADGUARD_PASSWORD: 'ag-pw',
  });
  dns = await import('../adapters/dns.ts');
});
after(() => server.close());

test('Pi-hole: signs in once, reads the summary, pauses with a timer, resumes', async () => {
  const { adapter, dns: control } = dns.piholeClient();
  const d = await adapter.fetch();
  assert.deepEqual([d.queries, d.blocked, d.pct, d.protecting, d.listSize], [1000, 250, 25, true, 120000]);
  await adapter.fetch();
  assert.equal(state.sids, 1, 'one session, reused');
  await control(5);
  assert.deepEqual([state.piBlocking, state.piTimer], [false, 300]);
  const paused = await adapter.fetch();
  assert.equal(paused.protecting, false);
  assert.ok(paused.resumesAt && paused.resumesAt > Date.now() + 290_000);
  await control(null);
  assert.equal(state.piBlocking, true);
});

test('Pi-hole: an expired session signs in again', async () => {
  const { adapter } = dns.piholeClient();
  await adapter.fetch();
  const before = state.sids;
  state.expireNext = true;
  assert.equal((await adapter.fetch()).queries, 1000);
  assert.equal(state.sids, before + 1);
});

test('AdGuard Home: counts every kind of block, pauses for milliseconds, resumes', async () => {
  const { adapter, dns: control } = dns.adguardClient();
  const d = await adapter.fetch();
  assert.deepEqual([d.queries, d.blocked, d.pct, d.protecting], [2000, 320, 16, true]);
  await control(30);
  assert.deepEqual([state.agOn, state.agDuration], [false, 1_800_000]);
  assert.equal((await adapter.fetch()).protecting, false);
  await control(null);
  assert.equal(state.agOn, true);
});

test('blocking off with no timer reads as off, not paused', () => {
  const d = dns.toAdguard({ num_dns_queries: 0, num_blocked_filtering: 0 }, { protection_enabled: false });
  assert.deepEqual([d.protecting, d.resumesAt, d.pct], [false, undefined, 0]);
});
