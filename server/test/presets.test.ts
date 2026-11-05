import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { validateJsonConfig } from '../../shared/jsonwidget.ts';
import { PRESETS, presetFor, presetRequest, secretName } from '../../shared/presets.ts';

test('secretName is a safe, stable key name', () => {
  assert.equal(secretName('Home Assistant'), 'APP_HOME_ASSISTANT');
  assert.equal(secretName('qBittorrent'), 'APP_QBITTORRENT');
  assert.match(secretName('!!!'), /^APP_[A-Z0-9_]+$/);
});

test('presets are found by name, container or icon', () => {
  assert.equal(presetFor({ name: 'Jellyfin' })?.id, 'jellyfin');
  assert.equal(presetFor({ name: 'Photos', container: 'immich-server' })?.id, 'immich');
  assert.equal(presetFor({ name: 'Requests', icon: 'jellyseerr.svg' })?.id, 'seerr');
  assert.equal(presetFor({ name: 'Mystery app' }), undefined);
});

test('every preset builds a config the validator accepts, with the key as a reference', () => {
  for (const p of PRESETS) {
    const req = presetRequest(p, 'http://10.0.0.5:8080/', 'APP_X');
    const v = validateJsonConfig({ title: p.id, ...req, interval: 60, fields: [{ ...p.values[0] }] });
    assert.ok('config' in v, `${p.id}: ${'error' in v ? v.error : ''}`);
    assert.ok(req.url.startsWith('http://10.0.0.5:8080/'), p.id);
    const all = req.url + JSON.stringify(req.headers) + JSON.stringify(req.login ?? {});
    if (p.auth) assert.match(all, /\$\{secret(64)?:APP_X\}|"secret":"APP_X"/, p.id);
  }
});

test('query keys append correctly; basic auth uses the base64 reference', () => {
  const t = presetRequest(PRESETS.find((p) => p.id === 'tautulli')!, 'http://h', 'K');
  assert.equal(t.url, 'http://h/api/v2?cmd=get_activity&apikey=${secret:K}');
  const a = presetRequest(PRESETS.find((p) => p.id === 'adguard')!, 'http://h', 'K');
  assert.equal(a.headers.Authorization, 'Basic ${secret64:K}');
});

test('unknown reference kinds are refused', () => {
  const v = validateJsonConfig({ title: 'x', url: 'http://h/${file:/etc/passwd}', headers: {}, interval: 60, fields: [{ label: 'a', path: 'b' }] });
  assert.ok('error' in v);
  const w = validateJsonConfig({ title: 'x', url: 'http://h/', headers: { A: '${secret:lower}' }, interval: 60, fields: [{ label: 'a', path: 'b' }] });
  assert.ok('config' in w); // lowercase doesn't match a reference, so it's sent literally
});

test('Pi-hole 6 signs in with a saved password and refuses odd sign-in settings', () => {
  const p = PRESETS.find((x) => x.id === 'pihole6')!;
  const req = presetRequest(p, 'http://pi.hole', 'APP_PIHOLE');
  assert.deepEqual(req.login, { kind: 'pihole6', secret: 'APP_PIHOLE' });
  assert.deepEqual(req.headers, {});
  const ok = validateJsonConfig({ title: 'pihole6', ...req, interval: 60, fields: [{ label: 'blocked', path: 'queries.blocked' }] });
  assert.ok('config' in ok && ok.config.login?.secret === 'APP_PIHOLE');
  const bad = validateJsonConfig({ title: 'x', url: 'http://pi.hole/api', headers: {}, interval: 60, fields: [{ label: 'a', path: 'b' }], login: { kind: 'other', secret: 'X' } });
  assert.ok('error' in bad);
});
