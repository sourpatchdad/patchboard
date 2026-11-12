import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { attentionInHeader, DEFAULT_BOARD, STARTERS, validateBoard } from '../../shared/board.ts';

test('every starter layout is a board the server accepts as it is', () => {
  for (const st of STARTERS) {
    const v = validateBoard(st.board);
    assert.ok('board' in v, `${st.id}: ${'error' in v ? v.error : ''}`);
    if ('board' in v) assert.deepEqual(v.board, { ...st.board, widgets: st.board.widgets }, st.id);
  }
});

test('Needs attention sits in the header unless the board asks for a card, and the choice survives validation', () => {
  assert.equal(attentionInHeader(DEFAULT_BOARD), true);
  const card = { ...DEFAULT_BOARD, widgets: DEFAULT_BOARD.widgets.map((w) => (w.type === 'attention' ? { ...w, config: { style: 'card' } } : w)) };
  const v = validateBoard(card);
  assert.ok('board' in v);
  assert.equal(attentionInHeader(v.board), false);
  const bogus = validateBoard({ ...DEFAULT_BOARD, widgets: DEFAULT_BOARD.widgets.map((w) => (w.type === 'attention' ? { ...w, config: { style: 'sideways' } } : w)) });
  assert.ok('board' in bogus && attentionInHeader(bogus.board));
});

test('an apps widget can show only some groups, stored one per line', () => {
  const v = validateBoard({ widgets: [{ id: 'apps', type: 'apps', size: 'w', config: { style: 'patchbay', groups: 'Watch & Listen\n\nInfrastructure ' } }] });
  assert.ok(!('error' in v));
  const apps = (v as { board: { widgets: { type: string; config?: Record<string, string> }[] } }).board.widgets.find((w) => w.type === 'apps');
  assert.equal(apps?.config?.groups, 'Watch & Listen\nInfrastructure');
});

test('a widget shows compact or as one number only where it can, and the number must be one it has', async () => {
  const { NUMBERS, viewsOf } = await import('../../shared/board.ts');
  const v = validateBoard({
    widgets: [
      { id: 'attention', type: 'attention', size: 'm' },
      { id: 'vitals', type: 'vitals', size: 's', config: { view: 'number', number: 'memory' } },
      { id: 'speed', type: 'speed', size: 's', config: { view: 'number', number: 'nonsense' } },
      { id: 'upcoming', type: 'upcoming', size: 'm', config: { view: 'compact', number: 'cpu' } },
      { id: 'bookmarks', type: 'bookmarks', size: 'm', config: { view: 'number' } },
      { id: 'notes', type: 'notes', size: 's', config: { view: 'compact' } },
    ],
  });
  assert.ok('board' in v);
  const cfg = Object.fromEntries(v.board.widgets.map((w) => [w.id, w.config]));
  assert.deepEqual(cfg.vitals, { view: 'number', number: 'memory' });
  assert.deepEqual(cfg.speed, { view: 'number' }, 'an unknown number falls back to the default');
  assert.deepEqual(cfg.upcoming, { view: 'compact' }, 'which number only matters for one number');
  assert.equal(cfg.bookmarks, undefined, 'bookmarks has no number');
  assert.equal(cfg.notes, undefined, 'notes has no list to shorten');
  for (const type of Object.keys(NUMBERS)) assert.ok(viewsOf(type as never).some(([x]) => x === 'number'), type);
});
