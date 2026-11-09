import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

// A fake Speedtest Tracker (/st) and Overseerr (/os). Shapes follow the
// Speedtest Tracker v1 API docs and the Overseerr OpenAPI spec.
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const result = (id: number, min: number, extra: Record<string, unknown> = {}) => ({
  id,
  ping: 12.3,
  download: 117_500_000,
  upload: 5_000_000,
  healthy: true,
  status: 'completed',
  created_at: ago(min),
  data: { isp: 'Spectrum', packetLoss: 0, ping: { latency: 11.84, jitter: 1.06 }, download: { bandwidth: 117_500_000 }, upload: { bandwidth: 5_000_000 }, server: { name: 'Frontier', location: 'Dallas, TX' } },
  ...extra,
});
let stResults: unknown[] = [];
const decided: string[] = [];

const server = createServer((req, res) => {
  const json = (v: unknown, status = 200) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(v));
  const url = new URL(req.url!, 'http://x');
  if (url.pathname.startsWith('/st/')) {
    if (req.headers.authorization !== 'Bearer st-token') return json({ message: 'Unauthenticated.' }, 401);
    if (req.headers.accept !== 'application/json') return json({}, 406);
    if (url.pathname === '/st/api/v1/results') {
      assert.equal(url.searchParams.get('sort'), '-created_at');
      return json({ data: stResults });
    }
  }
  if (url.pathname.startsWith('/os/')) {
    if (req.headers['x-api-key'] !== 'os-key') return json({ message: 'Unauthorized' }, 403);
    if (url.pathname === '/os/api/v1/request' && url.searchParams.get('filter') === 'processing') {
      return json({ pageInfo: { page: 1, pages: 1, results: 1 }, results: [{ id: 5, status: 2, type: 'movie', is4k: false, createdAt: ago(60 * 24 * 3), media: { tmdbId: 200, mediaType: 'movie' }, requestedBy: { username: 'jo' } }] });
    }
    if (url.pathname === '/os/api/v1/request') {
      assert.equal(url.searchParams.get('filter'), 'pending');
      return json({
        pageInfo: { page: 1, pages: 1, results: 2 },
        results: [
          { id: 7, status: 1, type: 'tv', is4k: false, createdAt: ago(90), media: { tmdbId: 100, mediaType: 'tv' }, seasons: [{ seasonNumber: 1 }, { seasonNumber: 2 }], requestedBy: { username: 'kit', email: 'kit@example.org' } },
          { id: 8, status: 1, is4k: true, createdAt: ago(10), media: { tmdbId: 200 }, requestedBy: { displayName: 'Sam R', plexUsername: 'samr' } },
        ],
      });
    }
    if (url.pathname === '/os/api/v1/request/count') return json({ total: 9, movie: 5, tv: 4, pending: 2, approved: 6, declined: 1, processing: 3, available: 2 });
    if (url.pathname === '/os/api/v1/tv/100') return json({ name: 'The Studio', firstAirDate: '2025-03-26', posterPath: '/studio.jpg' });
    if (url.pathname === '/os/api/v1/movie/200') return json({ title: 'Sinners', releaseDate: '2025-04-18', posterPath: '/sinners.jpg' });
    const m = /^\/os\/api\/v1\/request\/(\d+)\/(approve|decline)$/.exec(url.pathname);
    if (m && req.method === 'POST') return decided.push(`${m[1]}:${m[2]}`), json({ id: Number(m[1]), status: m[2] === 'approve' ? 2 : 3 });
  }
  res.writeHead(404).end();
});

let st: typeof import('../adapters/speedtest.ts');
let os: typeof import('../adapters/seerr.ts');

before(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  Object.assign(process.env, { SPEEDTEST_URL: `${base}/st`, SPEEDTEST_TOKEN: 'st-token', OVERSEERR_URL: `${base}/os`, OVERSEERR_KEY: 'os-key' });
  st = await import('../adapters/speedtest.ts');
  os = await import('../adapters/seerr.ts');
});
after(() => server.close());

test('Speedtest Tracker: Ookla bandwidth in bytes per second becomes Mbps, newest last', async () => {
  stResults = [result(3, 5), result(2, 65, { data: { download: { bandwidth: 50_000_000 }, upload: { bandwidth: 2_500_000 } } }), result(1, 60 * 30)];
  const d = await st.speedtestAdapter().fetch();
  assert.ok(d.latest);
  assert.deepEqual([d.latest.down, d.latest.up, d.latest.ping, d.latest.jitter, d.latest.loss], [940, 40, 11.8, 1.1, 0]);
  assert.equal(d.latest.server, 'Frontier, Dallas, TX');
  assert.deepEqual(d.runs.map((r) => r.down), [400, 940], 'the last 24 hours, oldest first');
  assert.equal(d.lastFailed, undefined);
});

test('Speedtest Tracker: a failed newest test is a failure, not a zero', async () => {
  stResults = [{ id: 9, status: 'failed', created_at: ago(1), data: null, download: null, upload: null }, result(8, 61)];
  const d = await st.speedtestAdapter().fetch();
  assert.equal(d.latest?.down, 940);
  assert.ok(d.lastFailed && d.lastFailed > d.latest!.at);
});

test('Speedtest Tracker: falls back to top-level speeds without the raw result', () => {
  const r = st.toRun({ id: 1, download: 12_500_000, upload: 1_250_000, ping: 20, created_at: ago(1) });
  assert.deepEqual([r?.down, r?.up, r?.ping], [100, 10, 20]);
});

test('Overseerr: pending requests with titles, years, seasons, requesters and proxied posters', async () => {
  const { adapter, act } = os.seerrClient();
  const d = await adapter.fetch();
  assert.equal(d.pending, 2);
  assert.equal(d.processing, 3);
  const [studio, sinners] = d.requests;
  assert.deepEqual([studio.title, studio.year, studio.kind, studio.by, studio.seasons], ['The Studio', 2025, 'tv', 'kit', [1, 2]]);
  assert.deepEqual([sinners.title, sinners.kind, sinners.by, sinners.is4k], ['Sinners', 'movie', 'Sam R', true]);
  assert.equal(sinners.art, '/api/art/seerr/8');
  assert.deepEqual([...os.pendingIds].sort(), [7, 8], 'only pending requests can be approved or declined');
  assert.deepEqual(d.coming?.map((r) => [r.title, r.by, r.href]), [['Sinners', 'jo', `${process.env.OVERSEERR_URL}/movie/200`]], 'approved and on the way, linked to its page');
  await act(7, 'approve');
  await act(8, 'decline');
  assert.deepEqual(decided, ['7:approve', '8:decline']);
});
