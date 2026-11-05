import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

// A fake Jellyfin. It answers only with the right token in the MediaBrowser
// Authorization header, and only on the 10.9+ /Items/Latest route, so the
// adapter must send the key as a header and fall back correctly on Emby.
const KEY = 'jf-key';
const UID = 'u1abc';
let lastAuth = '';
const server = createServer((req, res) => {
  lastAuth = String(req.headers.authorization ?? req.headers['x-emby-token'] ?? '');
  const json = (v: unknown) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(v));
  if (!lastAuth.includes(KEY)) return void res.writeHead(401).end();
  const url = new URL(req.url!, 'http://x');
  switch (url.pathname) {
    case '/Users':
      return json([
        { Id: 'u0', Name: 'kid', Policy: { IsAdministrator: false } },
        { Id: UID, Name: 'Nathan', Policy: { IsAdministrator: true } },
      ]);
    case '/Sessions':
      return json([
        { UserName: 'Sam', NowPlayingItem: { Id: 'e1', Name: 'Cold Open', Type: 'Episode', SeriesName: 'Severance', SeriesId: 's1', ParentIndexNumber: 2, IndexNumber: 5, RunTimeTicks: 1000 }, PlayState: { PositionTicks: 250, IsPaused: true, PlayMethod: 'Transcode' } },
        { UserName: 'Idle phone' },
      ]);
    case '/Items/Latest':
      assert.equal(url.searchParams.get('userId'), UID);
      return json([
        { Id: 'm1', Name: 'Dune: Part Two', Type: 'Movie', ProductionYear: 2024, DateCreated: '2026-11-01T10:00:00Z' },
        { Id: 's2', Name: 'Fallout', Type: 'Series', ChildCount: 8, DateCreated: '2026-11-03T10:00:00Z' },
      ]);
    case '/Shows/NextUp':
      return json({ Items: [{ Id: 'e9', Name: 'Ep', Type: 'Episode', SeriesName: 'Andor', SeriesId: 's9', ParentIndexNumber: 2, IndexNumber: 7 }] });
    case '/Items/m1/Images/Primary':
      return res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end('JPEG');
  }
  res.writeHead(404).end();
});

let adapter: typeof import('../adapters/mediaserver.ts');

before(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.JELLYFIN_URL = `${base}/`;
  process.env.JELLYFIN_KEY = KEY;
  process.env.EMBY_URL = base;
  process.env.EMBY_KEY = KEY;
  adapter = await import('../adapters/mediaserver.ts');
});
after(() => server.close());

test('Jellyfin: streams, newest additions first, Next up, for the first admin', async () => {
  const d = await adapter.mediaServerAdapter('jellyfin').fetch();
  assert.match(lastAuth, /^MediaBrowser .*Token="jf-key"/);
  assert.deepEqual(d.streams, [
    { user: 'Sam', title: 'Severance', subtitle: 'S02E05 Cold Open', progress: 25, state: 'paused', transcode: true, thumb: '/api/img/jellyfin?id=s1' },
  ]);
  assert.deepEqual(d.recent.map((r) => [r.title, r.subtitle]), [['Fallout', '8 new'], ['Dune: Part Two', '2024']]);
  assert.equal(d.nextUp[0].title, 'Andor');
  assert.equal(d.nextUp[0].subtitle, 'S02E07 Ep');
  assert.equal(d.nextUp[0].thumb, '/api/img/jellyfin?id=s9');
  assert.equal(d.itemPath, '/web/#/details?id=');
});

test('Emby sends X-Emby-Token and uses the per-user Latest route', async () => {
  // The fake only serves /Items/Latest, so Emby's per-user route 404s: the error must surface, not be swallowed.
  await assert.rejects(adapter.mediaServerAdapter('emby').fetch(), /404/);
  assert.equal(lastAuth, KEY);
});

test('posters proxy by id only, with the key in a header', async () => {
  const res = await adapter.mediaImage('jellyfin', 'm1');
  assert.equal(await res.text(), 'JPEG');
  await assert.rejects(adapter.mediaImage('jellyfin', '../../System/Info'), /Bad image id/);
  await assert.rejects(adapter.mediaImage('jellyfin', 'a?api_key=x'), /Bad image id/);
});
