import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { cleanBrand } from '../../shared/brand.ts';

test('The dashboard name: one tidy line, 40 characters at most, empty means Patchboard', () => {
  assert.deepEqual(cleanBrand({ name: '  The   Smith\nHouse ', otter: true }), { name: 'The Smith House' });
  assert.deepEqual(cleanBrand({ name: '', otter: false }), { otter: false });
  assert.deepEqual(cleanBrand({}), {});
  assert.ok('error' in cleanBrand({ name: 'x'.repeat(41) }));
  assert.ok('error' in cleanBrand({ name: 42 }));
  assert.ok('error' in cleanBrand(null));
});
