import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cached, every } from '../adapters/every.ts';

test('cached keeps a good answer and lets a failure through', async () => {
  let calls = 0;
  const ok = cached(60_000, async () => ++calls);
  assert.equal(await ok(), 1);
  assert.equal(await ok(), 1, 'the second call inside the window reuses the answer');
  const bad = cached(60_000, async () => {
    throw new Error('404');
  });
  await assert.rejects(bad(), /404/);
});

test('every keeps the last good answer through a failure', async () => {
  let fail = false;
  const slow = every(0, async () => {
    if (fail) throw new Error('down');
    return 'fine';
  });
  assert.equal(await slow(), 'fine');
  fail = true;
  assert.equal(await slow(), 'fine');
});
