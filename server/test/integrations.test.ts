import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { INTEGRATIONS } from '../../shared/integrations.ts';

// The integrations list drives Settings and docs/INTEGRATIONS.md. Every
// variable it names must be one the server reads.
test('every integration variable is read by the server', () => {
  const config = readFileSync('server/config.ts', 'utf8');
  const missing = INTEGRATIONS.flatMap((i) => [...i.env, ...(i.optional ?? [])]).filter((v) => !config.includes(`'${v}'`) && !config.includes(`env.${v}`));
  assert.deepEqual(missing, []);
});

test('integration ids are unique', () => {
  const ids = INTEGRATIONS.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every integration sits in exactly one Settings category', async () => {
  const { CATEGORIES, INTEGRATIONS } = await import('../../shared/integrations.ts');
  const placed = CATEGORIES.flatMap(([, ids]) => ids);
  assert.deepEqual(placed.filter((id, i) => placed.indexOf(id) !== i), [], 'listed twice');
  assert.deepEqual(INTEGRATIONS.map((i) => i.id).filter((id) => !placed.includes(id)), [], 'missing a category');
  assert.deepEqual(placed.filter((id) => !INTEGRATIONS.some((i) => i.id === id)), [], 'no such integration');
});
