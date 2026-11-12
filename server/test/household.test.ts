import { strict as assert } from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Hono } from 'hono';

// A database of its own, so the devices made here are this test's.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'pb-household-'));
const h = await import('../household.ts');

/** The guard in front of stand-in routes, the way index.ts mounts it. */
function server() {
  const app = new Hono();
  app.use('/api/*', h.householdGuard());
  app.all('/api/*', (c) => c.json({ reached: c.req.path }));
  app.get('/join/:token', (c) => (h.joinHousehold(c, c.req.param('token')) ? c.redirect('/') : c.text('no', 404)));
  return app;
}

test('a household device reads boards, cameras and pictures, switches pinned lights, and nothing else', async () => {
  const made = h.addHouseholdDevice('Kitchen tablet');
  assert.ok('token' in made);
  const app = server();
  const joined = await app.request(`/join/${made.token}`);
  assert.equal(joined.status, 302);
  const cookie = (joined.headers.get('set-cookie') ?? '').split(';')[0];
  assert.match(cookie, /^pb_household=/);
  const as = (path: string, method = 'GET') => app.request(path, { method, headers: { cookie } });

  for (const path of ['/api/snapshot', '/api/events', '/api/boards/house', '/api/img/frigate?camera=front', '/api/live/frigate?camera=front', '/api/feeds', '/api/icon/png/sonarr.png', '/api/markets/wall/markets']) {
    assert.equal((await as(path)).status, 200, path);
  }
  assert.equal((await as('/api/ha/light.kitchen/toggle', 'POST')).status, 200, 'pinned lights');
  assert.equal((await as('/api/ha/scene.movie/run', 'POST')).status, 200, 'scenes');

  // Admin reads and every other change are refused.
  for (const path of ['/api/logs/sonarr', '/api/setup', '/api/secrets', '/api/audit', '/api/household', '/api/containers/sonarr', '/api/auth/settings', '/api/catalog/yaml']) {
    assert.equal((await as(path)).status, 403, path);
  }
  for (const [path, method] of [['/api/containers/sonarr/action', 'POST'], ['/api/containers/sonarr/update', 'POST'], ['/api/boards/home', 'PUT'], ['/api/feeds/read', 'POST'], ['/api/household', 'POST'], ['/api/login', 'POST'], ['/api/ha/light.kitchen/turn_on', 'POST']] as const) {
    assert.equal((await as(path, method)).status, 403, `${method} ${path}`);
  }
});

test('removing a device ends its link: the cookie is cleared and the guard steps aside', async () => {
  const made = h.addHouseholdDevice('Hall phone');
  assert.ok('token' in made);
  const app = server();
  const cookie = `pb_household=${made.token}`;
  assert.equal((await app.request('/api/logs/sonarr', { headers: { cookie } })).status, 403);
  assert.ok(h.removeHouseholdDevice(made.id));
  const after = await app.request('/api/logs/sonarr', { headers: { cookie } });
  // Past the guard: sign-in, when it's on, decides from here.
  assert.equal(after.status, 200);
  assert.match(after.headers.get('set-cookie') ?? '', /pb_household=;/);
  assert.equal((await app.request(`/join/${made.token}`)).status, 404, 'the link no longer joins');
});

test('names are short and plain, the list never carries a hash, and twenty is the limit', () => {
  assert.deepEqual(h.addHouseholdDevice('   '), { error: 'Give the device a name, like "Kitchen tablet".' });
  assert.ok('error' in h.addHouseholdDevice('x'.repeat(41)));
  const listed = h.householdDevices();
  assert.ok(listed.every((d) => !('hash' in d) && d.name));
  while (h.householdDevices().length < 20) h.addHouseholdDevice(`Device ${h.householdDevices().length}`);
  assert.ok('error' in h.addHouseholdDevice('One more'));
});

test('a device remembers where it opens and its Monitor color; each change bumps its revision', () => {
  // The test above filled all twenty places.
  for (const d of h.householdDevices()) h.removeHouseholdDevice(d.id);
  const made = h.addHouseholdDevice('Wall');
  assert.ok('token' in made);
  const first = h.setHouseholdView(made.id, { opens: '/monitor', tint: 'blue' });
  assert.deepEqual({ opens: first?.opens, tint: first?.tint }, { opens: '/monitor', tint: 'blue' });
  assert.equal(h.setHouseholdView(made.id, { tint: 'color' })?.tint, 'color', 'full color');
  const second = h.setHouseholdView(made.id, { tint: 'pink' });
  assert.equal(second?.opens, '/monitor', 'a change to the color keeps the page');
  assert.equal(second?.tint, undefined, 'an unknown color goes back to gray');
  assert.ok((second?.rev ?? 0) >= (first?.rev ?? 0));
  assert.equal(h.setHouseholdView(made.id, { opens: null })?.opens, undefined, 'cleared: wherever it is');
  assert.equal(h.setHouseholdView(made.id, { dim: '22-7' })?.dim, '22-7', 'night hours');
  assert.equal(h.setHouseholdView(made.id, { dim: '3-4' })?.dim, undefined, 'only the offered hours');
  const paged = h.setHouseholdView(made.id, { opens: '/monitor', pages: ['/server', '/b/house'], rotate: 60 });
  assert.deepEqual([paged?.opens, paged?.pages, paged?.rotate], ['/monitor', ['/server', '/b/house'], 60], 'pages to swipe through, turned every minute');
  assert.equal(h.setHouseholdView(made.id, { rotate: 7 })?.rotate, undefined, 'only the offered timings');
  assert.equal(h.setHouseholdView(made.id, { pages: [] })?.pages, undefined, 'no pages: no swiping');
  assert.equal(h.setHouseholdView(made.id, { tint: 'color' })?.opens, '/monitor', 'every save keeps the rest of the view');
  assert.equal(h.setHouseholdView(made.id, { screen: 'eink' })?.screen, 'eink', 'an e-ink screen');
  assert.equal(h.setHouseholdView(made.id, { screen: 'plasma' })?.screen, undefined, 'anything else is a color screen');
  assert.equal(h.setHouseholdView('nope', { opens: '/' }), null);
  const listed = h.householdDevices().find((d) => d.id === made.id);
  assert.ok(listed && !('hash' in listed));
});
