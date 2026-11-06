import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Catalog, SourceId, SourceState } from '../../shared/types.ts';
import { computeAlerts } from '../alerts.ts';
import { toBeszelHosts } from '../adapters/beszel.ts';
import { fromGatus, fromHealthchecks } from '../adapters/monitors.ts';

const sources = (s: Partial<Record<SourceId, unknown>>): Partial<Record<SourceId, SourceState>> =>
  Object.fromEntries(Object.entries(s).map(([id, data]) => [id, { id: id as SourceId, label: id, ok: true, updatedAt: Date.now(), data }]));
const catalog: Catalog = { groups: [], dock: [] };

test('Gatus: the last result decides, the streak sets since, a failed condition explains', () => {
  const [web, dns] = fromGatus([
    {
      name: 'website',
      group: 'public',
      key: 'public_website',
      results: [
        { success: true, timestamp: '2026-11-06T10:00:00Z', duration: 120e6 },
        { success: false, timestamp: '2026-11-06T10:01:00Z', duration: 5000e6, conditionResults: [{ condition: '[STATUS] == 200', success: false }] },
        { success: false, timestamp: '2026-11-06T10:02:00Z', duration: 5000e6, errors: ['context deadline exceeded'] },
      ],
    },
    { name: 'dns', key: 'dns', results: [{ success: true, timestamp: '2026-11-06T10:02:00Z', duration: 3e6 }] },
  ]);
  assert.equal(web.status, 'down');
  assert.equal(web.since, Date.parse('2026-11-06T10:01:00Z'));
  assert.equal(web.msg, 'context deadline exceeded');
  assert.deepEqual(web.beats, ['up', 'down', 'down']);
  assert.equal(web.uptime24, 33.3);
  assert.equal(dns.status, 'up');
  assert.equal(dns.ping, 3);
  assert.equal(fromGatus([{ name: 'new' }])[0].status, 'unknown');
});

test('Healthchecks: late is pending, paused is maintenance, down is down', () => {
  const m = fromHealthchecks([
    { name: 'Backups', slug: 'backups', status: 'down', last_ping: '2026-11-05T03:00:00Z', unique_key: 'a1' },
    { name: 'Certbot', status: 'grace', unique_key: 'b2' },
    { name: 'Old', status: 'paused', unique_key: 'c3' },
    { name: 'Sync', status: 'up', unique_key: 'd4' },
  ]);
  assert.deepEqual(m.map((x) => x.status), ['down', 'pending', 'maintenance', 'up']);
  assert.equal(m[0].since, Date.parse('2026-11-05T03:00:00Z'));
  assert.equal(m[0].id, 'hc-a1');
});

test('Monitors from Gatus and Healthchecks raise their own alerts; late jobs stay quiet', () => {
  const alerts = computeAlerts(
    sources({
      gatus: { link: 'http://gatus', monitors: fromGatus([{ name: 'website', key: 'w', results: [{ success: false, timestamp: '2026-11-06T10:00:00Z' }] }]) },
      healthchecks: { link: 'https://healthchecks.io', monitors: fromHealthchecks([{ name: 'Backups', status: 'down', unique_key: 'a' }, { name: 'Certbot', status: 'grace', unique_key: 'b' }]) },
    }),
    catalog,
  );
  assert.deepEqual(
    alerts.map((a) => [a.title, a.source]),
    [
      ['website is down', 'gatus'],
      ['Backups missed its check-in', 'healthchecks'],
    ],
  );
});

test('Beszel: systems become hosts; paused ones drop out; a down agent and a full disk raise alerts', () => {
  const hosts = toBeszelHosts(
    [
      { name: 'nas', status: 'up', info: { cpu: 12.4, mp: 61, dp: 91, b: 1.5, dt: 47, u: 90_000, c: 8, la: [0.5, 0.7, 0.9], os: 'Linux' } },
      { name: 'pi', status: 'down', info: {} },
      { name: 'spare', status: 'paused', info: {} },
    ],
    'http://beszel:8090',
  );
  assert.deepEqual(hosts.map((h) => [h.name, h.ok]), [['nas', true], ['pi', false]]);
  const nas = hosts[0];
  assert.equal(nas.url, 'http://beszel:8090/system/nas');
  assert.equal(nas.rx, 1.5e6);
  assert.equal(nas.load, 0.7);
  assert.equal(nas.uptime, '1d 1h');
  assert.equal(nas.disks[0].pct, 91);
  const alerts = computeAlerts(sources({ beszel: { hosts } }), catalog);
  assert.deepEqual(alerts.map((a) => a.title).sort(), ["The disk on nas is 91% full", "pi isn't answering"]);
});
