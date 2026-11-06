import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DEFAULT_BOARD, EMPTY_BOARD, noteKey } from '../../shared/board.ts';
import type { Catalog, SourceId, SourceState } from '../../shared/types.ts';
import { computeAlerts } from '../alerts.ts';
import { putBoard, removeBoard } from '../boards.ts';
import { visitorHost } from '../catalog-audit.ts';
import { kvGet, kvSet } from '../db.ts';

const sources = (s: Partial<Record<SourceId, unknown>>): Partial<Record<SourceId, SourceState>> =>
  Object.fromEntries(Object.entries(s).map(([id, data]) => [id, { id: id as SourceId, label: id, ok: true, updatedAt: Date.now(), data }]));
const catalog: Catalog = { groups: [], dock: [] };

test("discovered apps link to the address the browser used, not the visitor's own machine", () => {
  assert.equal(visitorHost('192.168.1.10:3200'), '192.168.1.10');
  assert.equal(visitorHost('nas.local'), 'nas.local');
  assert.equal(visitorHost('[fd00::5]:3200'), '[fd00::5]');
  assert.equal(visitorHost(undefined), 'localhost');
  assert.equal(visitorHost('evil host"<'), 'localhost');
});

test("Home's notes keep their keys; another board's are its own, and go with it", () => {
  assert.equal(noteKey('home', 'notes-1'), 'notes-1');
  assert.equal(noteKey('kitchen', 'notes-1'), 'kitchen.notes-1');
  kvSet('boards', null);
  putBoard('kitchen', { ...EMPTY_BOARD, name: 'Kitchen' });
  kvSet('board-notes', { 'notes-1': { text: 'home', at: 1 }, 'kitchen.notes-1': { text: 'kitchen', at: 1 } });
  removeBoard('kitchen');
  assert.deepEqual(Object.keys(kvGet<Record<string, unknown>>('board-notes') ?? {}), ['notes-1']);
  kvSet('board-notes', null);
});

test('the default Home fits one screen and starts with what a fresh install can show', () => {
  assert.equal(DEFAULT_BOARD.fit, true);
  assert.ok(DEFAULT_BOARD.widgets.some((w) => w.type === 'apps' && w.config?.style === 'patchbay'), 'apps as icons');
  assert.ok(!DEFAULT_BOARD.widgets.some((w) => w.type === 'inbox' || w.type === 'recent'), 'nothing that needs Fastmail or a poster row');
});

test('ad blocking off leads to the widget that turns it back on, not back to Home', () => {
  kvSet('board', null);
  kvSet('boards', null);
  putBoard('net', { ...EMPTY_BOARD, name: 'Network', widgets: [...EMPTY_BOARD.widgets, { id: 'dns', type: 'dns', size: 's' }] });
  const a = computeAlerts(sources({ pihole: { protecting: false, resumesAt: null, queries: 0, blocked: 0, pct: 0 } }), catalog).find((x) => x.id === 'dns-off-pihole');
  assert.equal(a?.href, '/b/net#w-dns');
  kvSet('boards', null);
});
