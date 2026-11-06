import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Catalog, SourceId, SourceState } from '../../shared/types.ts';
import { computeAlerts } from '../alerts.ts';
import { toTracearr } from '../adapters/tracearr.ts';

const sources = (s: Partial<Record<SourceId, unknown>>): Partial<Record<SourceId, SourceState>> =>
  Object.fromEntries(Object.entries(s).map(([id, data]) => [id, { id: id as SourceId, label: id, ok: true, updatedAt: Date.now(), data }]));
const catalog: Catalog = { groups: [], dock: [] };

test('Tracearr: live servers only; unhandled violations, low severity left out', () => {
  const d = toTracearr(
    [
      { server_id: 'a', server_name: 'Plex', status: 'up', server_type: 'plex', active_streams: 2 },
      { server_id: 'b', server_name: 'Jellyfin', status: 'down', reason: 'Connection refused', server_type: 'jellyfin' },
      { server_id: 'c', server_name: 'Old Emby', status: 'unknown', historical: true },
    ],
    [
      { id: 'v1', severity: 'high', created_at: '2026-11-06T09:00:00Z', rule: { name: 'Impossible travel' }, user: { username: 'sam' }, server: { name: 'Plex' } },
      { id: 'v2', severity: 'warning', created_at: '2026-11-06T08:00:00Z', rule: { name: 'Too many streams' }, user: { username: 'alex' } },
      { id: 'v3', severity: 'low', created_at: '2026-11-06T07:00:00Z', rule: { name: 'Paused too long' } },
      { id: 'v4', severity: 'high', created_at: '2026-11-06T06:00:00Z', acknowledged_at: '2026-11-06T06:30:00Z' },
    ],
    'http://tracearr:3000',
  );
  assert.deepEqual(d.servers.map((s) => [s.name, s.status, s.streams]), [['Plex', 'up', 2], ['Jellyfin', 'down', 0]]);
  assert.deepEqual(d.violations.map((v) => [v.id, v.severity]), [['v1', 'high'], ['v2', 'warning']]);
});

test('Tracearr alerts: a down server warns; a high violation warns and links to its own page; the rest are notes', () => {
  const tracearr = toTracearr(
    [{ server_id: 'b', server_name: 'Jellyfin', status: 'down', reason: 'Connection refused.' }],
    [
      { id: 'v1', severity: 'high', created_at: '2026-11-06T09:00:00Z', rule: { name: 'Impossible travel' }, user: { username: 'sam' }, server: { name: 'Plex' } },
      { id: 'v2', severity: 'warning', created_at: '2026-11-06T08:00:00Z', rule: { name: 'Too many streams' }, user: { username: 'alex' } },
    ],
    'http://tracearr:3000',
  );
  const alerts = computeAlerts(sources({ tracearr }), catalog);
  const by = Object.fromEntries(alerts.map((a) => [a.title, a]));
  assert.equal(by['Jellyfin is down'].level, 'warn');
  assert.equal(by['Jellyfin is down'].detail, 'Connection refused. Seen by Tracearr.');
  assert.equal(by['Impossible travel: sam'].level, 'warn');
  assert.equal(by['Impossible travel: sam'].href, 'http://tracearr:3000/violations/v1');
  assert.equal(by['Too many streams: alex'].level, 'info');
});
