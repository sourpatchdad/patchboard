import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { validateBoard } from '../../shared/board.ts';
import { engineField, feedsField, reposField, searchUrl, searchUrlField, zonesField } from '../../shared/fields.ts';
import { latestReleases, parseFeed, readFeeds } from '../outside.ts';

const RSS = `<?xml version="1.0"?><rss><channel><title>Small Servers</title>
<item><title>Older &amp; wiser</title><link>https://example.com/old</link><pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate></item>
<item><title><![CDATA[Newer <b>post</b>]]></title><link>https://example.com/new</link><pubDate>Sat, 07 Nov 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;
const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Disk Pressure</title>
<entry><title>ZFS 2.4</title><link rel="alternate" href="https://example.org/zfs"/><updated>2026-11-08T08:00:00Z</updated></entry></feed>`;

let base = '';
const server = createServer((req, res) => {
  if (req.url === '/moved') return void res.writeHead(301, { location: '/feed' }).end();
  if (req.url === '/feed') return void res.writeHead(200, { 'content-type': 'application/rss+xml' }).end(RSS);
  if (req.url === '/atom') return void res.end(ATOM);
  res.writeHead(500).end();
});
before(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test('RSS and Atom: title, link and date, newest first, markup and entities cleaned', () => {
  const rss = parseFeed(RSS, 'x');
  assert.deepEqual(rss.map((i) => i.title), ['Newer post', 'Older & wiser']);
  assert.equal(rss[0].link, 'https://example.com/new');
  assert.equal(rss[0].source, 'Small Servers');
  const atom = parseFeed(ATOM, 'x');
  assert.deepEqual(atom[0], { title: 'ZFS 2.4', link: 'https://example.org/zfs', at: Date.parse('2026-11-08T08:00:00Z'), source: 'Disk Pressure' });
});

test('feeds follow a redirect, keep going when one fails, and never reach cloud metadata', async () => {
  const r = await readFeeds([`${base}/moved`, `${base}/atom`, `${base}/broken`]);
  assert.deepEqual(r.items.map((i) => i.title), ['ZFS 2.4', 'Newer post', 'Older & wiser']);
  assert.deepEqual(r.failed, ['127.0.0.1'], 'the broken feed is named, the others still show');
  const blocked = await readFeeds(['http://169.254.169.254/latest/meta-data']);
  assert.deepEqual(blocked.items, []);
  assert.equal(blocked.failed.length, 1);
});

test('text settings keep only what is usable', () => {
  assert.equal(feedsField.check('https://a.example/feed\nftp://nope\n  https://b.example/rss  '), 'https://a.example/feed\nhttps://b.example/rss');
  assert.equal(feedsField.check('not a url'), null);
  assert.equal(zonesField.check('Mum=Europe/London\nAsia/Tokyo\nMars/Olympus'), 'Mum=Europe/London\nAsia/Tokyo');
  assert.equal(reposField.check('https://github.com/immich-app/immich\nimmich-app/immich\nbad repo'), 'immich-app/immich');
  assert.equal(engineField.check('kagi'), 'kagi');
  assert.equal(engineField.check('altavista'), null);
  assert.equal(searchUrlField.check('http://plain.example/?q=%s'), null, 'https only');
  assert.equal(searchUrlField.check('https://s.example/?q=%s'), 'https://s.example/?q=%s');
  assert.equal(searchUrl({ engine: 'custom', url: 'https://s.example/?q=%s' }, 'nas fans'), 'https://s.example/?q=nas%20fans');
  assert.equal(searchUrl(undefined, 'x'), 'https://duckduckgo.com/?q=x');
});

test('a saved board keeps a widget’s cleaned text settings and drops junk', () => {
  const v = validateBoard({ widgets: [{ id: 'rss-1', type: 'rss', size: 'm', config: { feeds: 'https://a.example/feed\njunk', limit: '6', evil: 'x' } }, { id: 'clocks-1', type: 'clocks', size: 's', config: { zones: 'Nowhere/Land' } }] });
  assert.ok('board' in v);
  assert.deepEqual(v.board.widgets.find((w) => w.id === 'rss-1')?.config, { feeds: 'https://a.example/feed', limit: '6' });
  assert.equal(v.board.widgets.find((w) => w.id === 'clocks-1')?.config, undefined);
});

test('releases: the newest per project from GitHub, newest first; a project without releases says so', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes('/repos/a/one/')) return new Response(JSON.stringify([{ tag_name: 'v1.2.0', published_at: '2026-11-01T00:00:00Z', html_url: 'https://github.com/a/one/releases/tag/v1.2.0' }]));
    if (u.includes('/repos/b/two/')) return new Response(JSON.stringify([{ tag_name: 'v3.0.0', published_at: '2026-11-07T00:00:00Z', html_url: 'https://github.com/b/two/releases/tag/v3.0.0', prerelease: true }]));
    if (u.includes('/repos/c/none/')) return new Response('[]');
    return new Response('', { status: 404 });
  }) as typeof fetch;
  try {
    const r = await latestReleases(['a/one', 'b/two', 'c/none']);
    assert.deepEqual(r.map((x) => [x.repo, x.version]), [['b/two', 'v3.0.0'], ['a/one', 'v1.2.0'], ['c/none', '']]);
    assert.equal(r[0].prerelease, true);
    assert.equal(r[2].none, true);
  } finally {
    globalThis.fetch = real;
  }
});
