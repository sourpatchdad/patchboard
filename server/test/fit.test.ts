import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { canTrimHeight } from '../../web/board/fit.ts';

test('fit preserves a full horizontal poster shelf while trimming vertical lists', () => {
  const shelf = Array.from({ length: 12 }, () => 900);
  const list = Array.from({ length: 12 }, (_, i) => 900 + i * 36);
  assert.equal(canTrimHeight(shelf), false);
  assert.equal(canTrimHeight(list), true);
  // Small layout rounding differences do not turn a shelf into a list.
  assert.equal(canTrimHeight([900, 900.5, 900]), false);
  // Wrapping into a second row can genuinely recover vertical space.
  assert.equal(canTrimHeight([900, 900, 1100, 1100]), true);
  assert.equal(canTrimHeight([]), true);
});
