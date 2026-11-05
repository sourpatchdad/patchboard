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
