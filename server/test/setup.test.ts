import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

// The environment sets Radarr's address, so the UI must treat it as locked.
process.env.RADARR_URL = 'http://radarr.env:7878';
process.env.UPCOMING_DAYS = '21';

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

test('a menu field takes only its listed values', () => {
  const ntfy = setup.setupIntegration('ntfy')!;
  assert.deepEqual(setup.checkValues(ntfy, { NTFY_URL: 'https://ntfy.sh/x', NOTIFY_LEVEL: 'critical' }), { values: { NTFY_URL: 'https://ntfy.sh/x', NOTIFY_LEVEL: 'critical' } });
  assert.match((setup.checkValues(ntfy, { NOTIFY_LEVEL: 'loud' }) as { error: string }).error, /warn, critical/);
});

test('moving the environment in: values are copied sealed, marked safe to remove, and the environment still wins until it goes', () => {
  const copied = setup.adoptEnvironment();
  assert.ok(copied.includes('RADARR_URL'));
  assert.ok(!JSON.stringify(kvGet('integration-settings')).includes('7878'), 'sealed at rest');
  const field = setup.describeSetup().find((i) => i.id === 'radarr')!.fields.find((f) => f.name === 'RADARR_URL')!;
  assert.equal(field.locked, true);
  assert.equal(field.savedToo, true);
  assert.deepEqual(setup.adoptEnvironment(), [], 'a second run copies nothing new');
});

test('alert thresholds: defaults until saved, checked ranges, the alarm above the warning, and the environment wins', () => {
  const val = (n: string) => setup.describeThresholds().find((t) => t.name === n)!;
  assert.equal(val('POOL_WARN_PCT').value, '85');
  assert.equal(config.poolCritPct, 95);

  assert.deepEqual(setup.saveThresholds({ POOL_WARN_PCT: '80', DISK_WARN_C: '45' }), { ok: true });
  assert.equal(config.poolWarnPct, 80);
  assert.equal(config.diskWarnC, 45);
  assert.equal(val('POOL_WARN_PCT').saved, true);

  assert.match((setup.saveThresholds({ POOL_WARN_PCT: '120' }) as { error: string }).error, /between/);
  assert.match((setup.saveThresholds({ POOL_CRIT_PCT: '70' }) as { error: string }).error, /higher than the warning/);
  // The test run sets CHECK_DOMAINS in the environment, so it is locked here.
  assert.equal(val('CHECK_DOMAINS').locked, true);
  assert.match((setup.saveThresholds({ CHECK_DOMAINS: 'home.lan' }) as { error: string }).error, /environment/);
  assert.match((setup.saveThresholds({ UPCOMING_DAYS: '30' }) as { error: string }).error, /environment/);
  assert.equal(val('UPCOMING_DAYS').locked, true);
  assert.equal(val('UPCOMING_DAYS').value, '21');

  // Empty goes back to the default.
  assert.deepEqual(setup.saveThresholds({ POOL_WARN_PCT: '' }), { ok: true });
  assert.equal(config.poolWarnPct, 85);
  assert.equal(val('POOL_WARN_PCT').saved, false);
});
