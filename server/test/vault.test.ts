import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// A data folder of its own, so the generated secret.key is this test's.
const dir = mkdtempSync(join(tmpdir(), 'pb-vault-'));
process.env.DATA_DIR = dir;
delete process.env.PATCHBOARD_SECRET_KEY;
const v = await import('../vault.ts');

test('setting PATCHBOARD_SECRET_KEY later keeps saved keys readable, then seals them with the new one', () => {
  v.resetVaultForTests();
  const old = v.seal('sonarr-key');
  assert.deepEqual(v.unsealOr(old), { value: 'sonarr-key', stale: false });

  process.env.PATCHBOARD_SECRET_KEY = 'a long phrase from the environment';
  v.resetVaultForTests();
  assert.deepEqual(v.unsealOr(old), { value: 'sonarr-key', stale: true }, 'opens with secret.key, wants sealing again');
  const fresh = v.seal('sonarr-key');
  assert.deepEqual(v.unsealOr(fresh), { value: 'sonarr-key', stale: false });

  // secret.key gone and a value only it could open: skipped, not a crash.
  rmSync(join(dir, 'secret.key'));
  v.resetVaultForTests();
  assert.equal(v.unsealOr(old), null);
  assert.throws(() => v.unseal(old));
  assert.equal(v.unsealOr(fresh)?.value, 'sonarr-key');
  delete process.env.PATCHBOARD_SECRET_KEY;
  rmSync(dir, { recursive: true, force: true });
});

test('values saved before encryption pass through and ask to be sealed', () => {
  assert.deepEqual(v.unsealOr('plain-old-value'), { value: 'plain-old-value', stale: true });
});
