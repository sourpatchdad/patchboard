import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { kumaTime, toMonitors } from '../adapters/uptimekuma.ts';

// Shapes from Uptime Kuma 1.23 and 2.0's public status page API.
const page = { publicGroupList: [{ name: 'Media', monitorList: [{ id: 1, name: 'Plex' }, { id: 2, name: 'Sonarr' }, { id: 3, name: 'New one' }] }] };
const beats = {
  heartbeatList: {
    '1': [
      { status: 1, time: '2026-11-05 07:40:00.000', ping: 31 },
      { status: 1, time: '2026-11-05 07:41:00.000', ping: 29 },
    ],
    '2': [
      { status: 1, time: '2026-11-05 07:39:00.000' },
      { status: 0, time: '2026-11-05 07:40:00.000', msg: 'connect ECONNREFUSED' },
      { status: 0, time: '2026-11-05 07:41:00.000', msg: 'connect ECONNREFUSED' },
    ],
  },
  uptimeList: { '1_24': 0.99871, '2_24': 0.95 },
};

test('Kuma times are UTC without a zone', () => {
  assert.equal(kumaTime('2026-11-05 07:40:00.000'), Date.UTC(2026, 10, 5, 7, 40));
  assert.equal(kumaTime('2026-11-05T07:40:00Z'), Date.UTC(2026, 10, 5, 7, 40));
  assert.equal(kumaTime('nonsense'), 0);
});

test('monitors carry state, uptime, ping and when trouble began', () => {
  const [plex, sonarr, fresh] = toMonitors(page, beats);
  assert.deepEqual([plex.status, plex.uptime24, plex.ping, plex.msg], ['up', 99.87, 29, undefined]);
  assert.equal(sonarr.status, 'down');
  assert.equal(sonarr.since, Date.UTC(2026, 10, 5, 7, 40));
  assert.equal(sonarr.msg, 'connect ECONNREFUSED');
  assert.deepEqual(sonarr.beats, ['up', 'down', 'down']);
  assert.equal(fresh.status, 'unknown');
  assert.deepEqual(fresh.beats, []);
});
