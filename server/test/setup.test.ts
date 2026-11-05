import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

// The environment sets Radarr's address, so the UI must treat it as locked.
process.env.RADARR_URL = 'http://radarr.env:7878';

const { config, withConfig } = await import('../config.ts');
const setup = await import('../setup.ts');
const { seal, unseal } = await import('../vault.ts');
const { setSecret, getSecret } = await import('../secrets.ts');
const { kvGet } = await import('../db.ts');

const sonarr = setup.setupIntegration('sonarr')!;
const radarr = setup.setupIntegration('radarr')!;

test('only app connections are set up from the UI; folders, Docker and the webhook token stay in the environment', () => {
  assert.ok(setup.setupIntegration('sonarr'));
  for (const id of ['docker', 'runbook', 'backups', 'updates', 'diun']) assert.equal(setup.setupIntegration(id), undefined, id);
});

test('values are checked: known fields only, http(s) addresses, no control characters, env-set fields locked', () => {
  assert.deepEqual(setup.checkValues(sonarr, { SONARR_URL: 'http://10.0.0.5:8989', SONARR_KEY: 'abc' }), { values: { SONARR_URL: 'http://10.0.0.5:8989', SONARR_KEY: 'abc' } });
  assert.match((setup.checkValues(sonarr, { RADARR_KEY: 'x' }) as { error: string }).error, /isn't a setting/);
  assert.match((setup.checkValues(sonarr, { SONARR_URL: 'file:///etc/passwd' }) as { error: string }).error, /http/);
  assert.match((setup.checkValues(sonarr, { SONARR_KEY: 'a\nb' }) as { error: string }).error, /control/);
  assert.match((setup.checkValues(radarr, { RADARR_URL: 'http://other' }) as { error: string }).error, /environment/);
  // A blank secret means "keep the saved one", not "clear it".
  assert.deepEqual(setup.checkValues(sonarr, { SONARR_KEY: '' }), { values: {} });
});

test('saving turns the integration on; secrets are encrypted at rest and never described back', () => {
  assert.equal(config.sonarr, undefined);
  setup.saveValues({ SONARR_URL: 'http://10.0.0.5:8989/', SONARR_KEY: 'super-secret-key' });
  assert.deepEqual(config.sonarr, { url: 'http://10.0.0.5:8989', key: 'super-secret-key' });

  const stored = JSON.stringify(kvGet('integration-settings'));
  assert.ok(!stored.includes('super-secret-key'), 'the key is not in the database in plain text');
  assert.ok(!stored.includes('10.0.0.5'), 'addresses are sealed too');

  const view = setup.describeSetup().find((i) => i.id === 'sonarr')!;
  const key = view.fields.find((f) => f.name === 'SONARR_KEY')!;
  assert.equal(key.set, true);
  assert.equal(key.value, undefined, 'a secret never goes back to the browser');
  assert.equal(view.fields.find((f) => f.name === 'SONARR_URL')!.value, 'http://10.0.0.5:8989/');
  const locked = setup.describeSetup().find((i) => i.id === 'radarr')!.fields.find((f) => f.name === 'RADARR_URL')!;
  assert.equal(locked.locked, true);
  assert.equal(locked.value, undefined);
});

test('a connection test sees candidate values; live settings never do', async () => {
  const seen = await withConfig(setup.candidate({ SONARR_URL: 'http://candidate:8989' }), async () => {
    await new Promise((r) => setTimeout(r, 5));
    return config.sonarr;
  });
  assert.deepEqual(seen, { url: 'http://candidate:8989', key: 'super-secret-key' });
  assert.equal(config.sonarr!.url, 'http://10.0.0.5:8989', 'outside the test, nothing changed');
});

test('forgetting an integration turns it off again', () => {
  setup.clearIntegration(sonarr);
  assert.equal(config.sonarr, undefined);
  assert.deepEqual(setup.missing(sonarr, {}), ['SONARR_URL', 'SONARR_KEY']);
});

test('the vault round-trips, uses a fresh IV each time, rejects tampering, and keeps the key out of the database', () => {
  const a = seal('hello');
  const b = seal('hello');
  assert.notEqual(a, b);
  assert.equal(unseal(a), 'hello');
  assert.equal(unseal('legacy-plain'), 'legacy-plain');
  const tampered = a.slice(0, -4) + (a.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  assert.throws(() => unseal(tampered));
  setSecret('APP_TEST', 'live-number-key');
  assert.equal(getSecret('APP_TEST'), 'live-number-key');
  assert.ok(!JSON.stringify(kvGet('secrets')).includes('live-number-key'));
  const keyFile = readFileSync(join(config.dataDir, 'secret.key'), 'utf8');
  assert.ok(keyFile.length >= 40, 'a random key file sits next to the database');
});
