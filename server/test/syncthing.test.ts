import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Catalog, SourceId, SourceState } from '../../shared/types.ts';
import { computeAlerts } from '../alerts.ts';
import { toDevices, toFolder } from '../adapters/syncthing.ts';

const sources = (s: Partial<Record<SourceId, unknown>>): Partial<Record<SourceId, SourceState>> =>
  Object.fromEntries(Object.entries(s).map(([id, data]) => [id, { id: id as SourceId, label: id, ok: true, updatedAt: Date.now(), data }]));
const catalog: Catalog = { groups: [], dock: [] };
const DAY = 86_400_000;

test('Syncthing folders: paused, stopped, failing files, syncing and idle', () => {
  assert.equal(toFolder({ id: 'a', paused: true }, { state: 'error' }).state, 'paused');
  assert.equal(toFolder({ id: 'a' }, { state: 'error', error: 'folder marker missing' }).state, 'error');
  const f = toFolder({ id: 'photos', label: 'Photos' }, { state: 'idle', pullErrors: 3, globalBytes: 100, needBytes: 0 });
  assert.deepEqual([f.label, f.state, f.failing, f.pct], ['Photos', 'failing', 3, 100]);
  const s = toFolder({ id: 'docs' }, { state: 'syncing', globalBytes: 200, needBytes: 50 });
  assert.deepEqual([s.label, s.state, s.pct], ['docs', 'syncing', 75]);
  assert.equal(toFolder({ id: 'x' }, { state: 'idle', globalBytes: 10, needBytes: 0 }).state, 'idle');
});

test('Syncthing devices: this one left out; 1970 means never seen', () => {
  const d = toDevices(
    [
      { deviceID: 'ME', name: 'nas' },
      { deviceID: 'PHONE-123456', name: 'phone' },
      { deviceID: 'LAPTOPXYZ' },
    ],
    'ME',
    { 'PHONE-123456': { connected: true } },
    { 'PHONE-123456': { lastSeen: '2026-11-06T10:00:00Z' }, LAPTOPXYZ: { lastSeen: '1970-01-01T00:00:00Z' } },
  );
  assert.deepEqual(
    d.map((x) => [x.name, x.connected, x.lastSeen]),
    [
      ['phone', true, Date.parse('2026-11-06T10:00:00Z')],
      ['LAPTOPX', false, undefined],
    ],
  );
});

test('Syncthing alerts: failing folders and devices quiet for a day; syncing and paused stay quiet', () => {
  const now = Date.now();
  const alerts = computeAlerts(
    sources({
      syncthing: {
        webUrl: 'http://st:8384',
        folders: [
          { id: 'p', label: 'Photos', state: 'failing', failing: 2, bytes: 1, pct: 100 },
          { id: 'd', label: 'Docs', state: 'syncing', failing: 0, bytes: 1, pct: 40 },
          { id: 'o', label: 'Old', state: 'paused', failing: 0, bytes: 1, pct: 100 },
        ],
        devices: [
          { id: '1', name: 'laptop', connected: false, paused: false, lastSeen: now - 3 * DAY },
          { id: '2', name: 'phone', connected: false, paused: false, lastSeen: now - 2 * 3600_000 },
          { id: '3', name: 'spare', connected: false, paused: true, lastSeen: now - 30 * DAY },
        ],
      },
    }),
    catalog,
    {},
    now,
  );
  assert.deepEqual(alerts.map((a) => a.title).sort(), ["Photos has 2 files it can't sync", "laptop hasn't synced in 3 days"]);
});
