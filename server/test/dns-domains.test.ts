import { strict as assert } from 'node:assert';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { cleanDomain, fromAgQueries, fromPiQueries, putRule, readRules } from '../adapters/dns.ts';

test('a domain is cleaned to plain ASCII, and anything else is refused', () => {
  assert.equal(cleanDomain(' Ads.Example.COM. '), 'ads.example.com');
  assert.equal(cleanDomain('bücher.de'), 'xn--bcher-kva.de');
  for (const bad of ['', 'localhost', 'http://x.com', '||x.com^', 'a b.com', '*.x.com', 'x.com/path']) assert.equal(cleanDomain(bad), null, bad);
});

test('the Pi-hole and AdGuard logs read the same, with what blocked each query', () => {
  const pi = fromPiQueries([
    { id: 7, time: 1_700_000_000.5, domain: 'ads.x.com', status: 'GRAVITY', client: { ip: '10.0.0.4', name: 'tv' } },
    { id: 8, time: 1_700_000_001, domain: 'mine.x.com', status: 'DENYLIST', client: { ip: '10.0.0.5', name: null } },
    { id: 9, time: 1_700_000_002, domain: 'ok.x.com', status: 'FORWARDED', client: { ip: '10.0.0.5' } },
  ]);
  assert.deepEqual(pi.map((q) => [q.domain, q.client, q.blocked, q.by]), [['ads.x.com', 'tv', true, 'list'], ['mine.x.com', '10.0.0.5', true, 'yours'], ['ok.x.com', '10.0.0.5', false, undefined]]);
  assert.equal(pi[0].at, 1_700_000_000_500);
  const ag = fromAgQueries([
    { time: '2026-11-16T10:00:00Z', question: { name: 'ads.x.com.' }, client: '10.0.0.4', client_info: { name: 'tv' }, reason: 'FilteredBlackList', rules: [{ filter_list_id: 3 }] },
    { time: '2026-11-16T10:00:01Z', question: { name: 'mine.x.com' }, client: '10.0.0.5', reason: 'FilteredBlackList', rules: [{ filter_list_id: 0 }] },
    { time: '2026-11-16T10:00:02Z', question: { name: 'tiktok.com' }, client: '10.0.0.5', reason: 'FilteredBlockedService' },
    { time: '2026-11-16T10:00:03Z', question: { name: 'ok.x.com' }, client: '10.0.0.5', reason: 'NotFilteredNotFound' },
  ]);
  assert.deepEqual(ag.map((q) => [q.domain, q.client, q.by]), [['ads.x.com', 'tv', 'list'], ['mine.x.com', '10.0.0.5', 'yours'], ['tiktok.com', '10.0.0.5', 'service'], ['ok.x.com', '10.0.0.5', undefined]]);
});

test('AdGuard: your lists are its exact Block and Unblock rules, and other rules stay put', () => {
  const rules = ['! my notes', '||ads.x.com^', '@@||ok.x.com^', '/track[0-9]+/', '||*.cdn.com^$important', ''];
  assert.deepEqual(readRules(rules), { allow: ['ok.x.com'], deny: ['ads.x.com'], other: 2 });
  assert.deepEqual(putRule(rules, 'ads.x.com', 'allow'), ['! my notes', '@@||ok.x.com^', '/track[0-9]+/', '||*.cdn.com^$important', '', '@@||ads.x.com^']);
  assert.deepEqual(putRule(rules, 'ok.x.com', null), ['! my notes', '||ads.x.com^', '/track[0-9]+/', '||*.cdn.com^$important', '']);
});

test('Pi-hole: allowing a domain you blocked takes it off your block list first', async () => {
  const asked: string[] = [];
  const lists: { allow: string[]; deny: string[]; readOnly?: boolean } = { allow: [], deny: ['ads.x.com'] };
  const server = http.createServer((req, res) => {
    asked.push(`${req.method} ${req.url}`);
    const json = (v: unknown) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(v));
    const m = /^\/api\/domains\/(allow|deny)\/exact(?:\/(.+))?$/.exec(req.url ?? '');
    if (!m) return res.writeHead(404).end();
    const list = m[1] === 'allow' ? 'allow' : 'deny';
    if (req.method !== 'GET' && lists.readOnly) return res.writeHead(403).end();
    if (req.method === 'GET') return json({ domains: lists[list].map((domain) => ({ domain })) });
    if (req.method === 'DELETE') {
      lists[list] = lists[list].filter((d) => d !== decodeURIComponent(m[2]));
      return res.writeHead(204).end();
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      lists[list].push(JSON.parse(body).domain);
      json({ processed: { success: [{ item: 'x' }], errors: [] } });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { withConfig } = await import('../config.ts');
  const { piholeClient } = await import('../adapters/dns.ts');
  try {
    await withConfig({ PIHOLE_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }, async () => {
      const { domains } = piholeClient();
      await domains.put('ads.x.com', 'allow');
      assert.deepEqual(await domains.lists(), { allow: ['ads.x.com'], deny: [] });
      await domains.put('ads.x.com', null);
      assert.deepEqual(await domains.lists(), { allow: [], deny: [] });
      lists.readOnly = true;
      await assert.rejects(domains.put('ads.x.com', 'deny'), /app_sudo/);
    });
    assert.ok(asked.includes('DELETE /api/domains/deny/exact/ads.x.com'));
    assert.ok(asked.includes('POST /api/domains/allow/exact'));
  } finally {
    server.close();
  }
});

test('AdGuard: two changes at once both stick, because they take turns', async () => {
  let rules: string[] = ['||old.com^'];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      // Answer slowly, so two changes would overlap if nothing kept them apart.
      setTimeout(() => {
        if (req.url === '/control/filtering/status') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ user_rules: rules }));
        if (req.url === '/control/filtering/set_rules') rules = JSON.parse(body).rules;
        res.writeHead(200).end('OK');
      }, 30);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { withConfig } = await import('../config.ts');
  const { adguardClient } = await import('../adapters/dns.ts');
  try {
    await withConfig({ ADGUARD_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }, async () => {
      const { domains } = adguardClient();
      await Promise.all([domains.put('a.com', 'deny'), domains.put('b.com', 'allow')]);
    });
    assert.deepEqual(rules, ['||old.com^', '||a.com^', '@@||b.com^']);
  } finally {
    server.close();
  }
});
