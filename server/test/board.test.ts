import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { STARTERS, validateBoard } from '../../shared/board.ts';

test('every starter layout is a board the server accepts as it is', () => {
  for (const st of STARTERS) {
    const v = validateBoard(st.board);
    assert.ok('board' in v, `${st.id}: ${'error' in v ? v.error : ''}`);
    if ('board' in v) assert.deepEqual(v.board, { ...st.board, widgets: st.board.widgets }, st.id);
  }
});
