import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { carriesCredential, request } from '../http.ts';
import { addressesFor, type Reach } from '../keyfind.ts';

const sonarr = (extra: Partial<Reach> = {}): Reach => ({
  Name: '/sonarr',
  NetworkSettings: { Networks: { media: { IPAddress: '172.20.0.5', Gateway: '172.20.0.1' } }, Ports: { '8989/tcp': [{ HostIp: '0.0.0.0', HostPort: '8989' }] } },
  ...extra,
});
const patchboard = (networks: Record<string, { Gateway?: string }>, mode?: string): Reach => ({ Name: '/patchboard', HostConfig: { NetworkMode: mode }, NetworkSettings: { Networks: networks } });

test("the key goes only to the app's own addresses, as Docker reports them", () => {
  assert.deepEqual(addressesFor('sonarr', sonarr(), patchboard({ media: { Gateway: '172.20.0.1' } })), ['http://sonarr:8989', 'http://172.20.0.1:8989'], 'by name on a shared network first, then its published port through the gateway');
  assert.deepEqual(addressesFor('sonarr', sonarr(), patchboard({ tools: { Gateway: '172.30.0.1' } })), ['http://172.30.0.1:8989'], 'no shared network: only through the host');
  assert.deepEqual(addressesFor('sonarr', sonarr(), null), ['http://127.0.0.1:8989'], 'Patchboard outside Docker: loopback');
  assert.deepEqual(addressesFor('sonarr', sonarr(), patchboard({}, 'host')), ['http://127.0.0.1:8989'], "on the host's network: loopback");
  assert.deepEqual(
    addressesFor('sonarr', sonarr({ NetworkSettings: { Ports: { '8989/tcp': [{ HostIp: '192.168.1.10', HostPort: '18989' }] } } }), patchboard({ tools: { Gateway: '172.30.0.1' } })),
    ['http://192.168.1.10:18989'],
    'a port bound to one of the host addresses uses that address',
  );
  assert.deepEqual(addressesFor('sonarr', sonarr(), null, '192.168.1.20'), ['http://192.168.1.20:8989'], 'on another Docker host: its configured address');
  assert.deepEqual(addressesFor('sonarr', sonarr({ NetworkSettings: { Networks: { other: {} }, Ports: {} } }), patchboard({ tools: {} })), [], 'unreachable: nothing to try, so nothing is sent');
  assert.deepEqual(addressesFor('plex', sonarr(), null), [], 'only the apps it knows');
});

test('a request with a key never follows a redirect to another host, and still follows one on the same host', async () => {
  assert.equal(carriesCredential({ 'X-Api-Key': 'k' }), true);
  assert.equal(carriesCredential({ Authorization: 'Bearer k' }), true);
  assert.equal(carriesCredential({ 'Content-Type': 'application/json' }), false);
  const seen: string[] = [];
  const server = createServer((req, res) => {
    seen.push(`${req.headers.host} ${req.url} ${req.headers['x-api-key'] ?? '-'}`);
    const port = (server.address() as AddressInfo).port;
    if (req.url === '/away') return res.writeHead(302, { location: `http://localhost:${port}/stolen` }).end();
    if (req.url === '/near') return res.writeHead(302, { location: '/api' }).end();
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await assert.rejects(request(`${base}/away`, { headers: { 'X-Api-Key': 'secret' } }), /another address/);
    assert.ok(!seen.some((s) => s.includes('/stolen')), 'the other host never sees the request, let alone the key');
    const ok = await request(`${base}/near`, { headers: { 'X-Api-Key': 'secret' } });
    assert.equal(ok.status, 200, 'a redirect on the same host is followed');
    const plain = await request(`${base}/away`);
    assert.equal(plain.status, 200, 'without a key, redirects work as before');
  } finally {
    server.close();
  }
});
