import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { config, withConfig } from '../config.ts';
import { hashPassword, passwordMatches } from '../security.ts';
import { composeMounted } from '../updater.ts';

test('A password set in Settings is stored as a salted scrypt hash and checks out', async () => {
  const h = hashPassword('correct horse battery');
  assert.match(h, /^scrypt\$[\w-]+\$[\w-]+$/);
  assert.notEqual(h, hashPassword('correct horse battery'), 'each hash gets its own salt');
  assert.equal(h.includes('correct'), false);
  await withConfig({ AUTH: 'password', PATCHBOARD_PASSWORD_HASH: h }, async () => {
    assert.equal(config.auth.mode, 'password');
    assert.equal(passwordMatches('correct horse battery'), true);
    assert.equal(passwordMatches('correct horse batter'), false);
    assert.equal(passwordMatches(''), false);
  });
});

test('No password or a malformed hash never matches', async () => {
  await withConfig({ AUTH: 'password' }, async () => assert.equal(passwordMatches(''), false));
  await withConfig({ AUTH: 'password', PATCHBOARD_PASSWORD_HASH: 'plain-text' }, async () => assert.equal(passwordMatches('plain-text'), false));
});

test('Updates turn on when a compose folder is mounted where Docker says it is', () => {
  const at = (workingDir: string) => ({ id: 'x', name: 'x', image: 'x', state: 'running', status: '', health: null, workingDir });
  assert.equal(composeMounted([at(process.cwd())]), true);
  assert.equal(composeMounted([at('/nowhere/compose/app')]), false);
  assert.equal(composeMounted([at('relative/dir')]), false);
  assert.equal(composeMounted([]), false);
});
