// Download controls against stand-in qBittorrent, Sonarr and Radarr that
// record every request: one torrent paused, resumed or removed (files kept),
// the alternative speed limits, a stuck download blocklisted and searched
// again, and searches for what's missing.

import { strict as assert } from 'node:assert';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, test } from 'node:test';
import { arrControl, toQueue } from '../adapters/arr.ts';
import { qbitClient, unfinished } from '../adapters/qbit.ts';
import { withConfig } from '../config.ts';

const calls: { method: string; path: string; body: string }[] = [];
let qbit5 = true;
let turtle = false;
const body = (req: IncomingMessage) => new Promise<string>((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });

const torrents = [
  { hash: 'aaa', name: 'Downloading.Fast', state: 'downloading', progress: 0.4, dlspeed: 9e6, eta: 60 },
  { hash: 'bbb', name: 'Downloading.Slow', state: 'downloading', progress: 0.1, dlspeed: 1e6, eta: 900 },
  { hash: 'ccc', name: 'Stuck', state: 'stalledDL', progress: 0.6, dlspeed: 0, eta: 8640000 },
  { hash: 'ddd', name: 'Broken', state: 'missingFiles', progress: 1, dlspeed: 0, eta: 0 },
  { hash: 'eee', name: 'Paused', state: 'stoppedDL', progress: 0.2, dlspeed: 0, eta: 8640000 },
  { hash: 'fff', name: 'Seeding.Done', state: 'uploading', progress: 1, dlspeed: 0, eta: 0 },
];

const server = createServer(async (req, res) => {
  const b = await body(req);
  const path = req.url!;
  calls.push({ method: req.method!, path, body: b });
  if (path === '/api/v2/auth/login') return void res.writeHead(200, { 'set-cookie': 'SID=x; path=/' }).end('Ok.');
  if (path === '/api/v2/transfer/info') return void res.end(JSON.stringify({ dl_info_speed: 10e6, up_info_speed: 1e6 }));
  if (path === '/api/v2/torrents/info') return void res.end(JSON.stringify(torrents));
  if (path === '/api/v2/transfer/speedLimitsMode') return void res.end(turtle ? '1' : '0');
  if (path === '/api/v2/transfer/toggleSpeedLimitsMode') return void ((turtle = !turtle), res.end());
  // qBittorrent 4 has pause and resume; 5 renamed them stop and start.
  if (/^\/api\/v2\/torrents\/(stop|start)$/.test(path) && !qbit5) return void res.writeHead(404).end();
  if (/^\/api\/v2\/torrents\/(stop|start|pause|resume|delete)$/.test(path)) return void res.end();
  if (path.startsWith('/arr/api/v3/queue/') && req.method === 'DELETE') return void res.end();
  if (path === '/arr/api/v3/command' && req.method === 'POST') return void res.writeHead(201).end('{}');
  res.writeHead(404).end();
});

let base = '';
before(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());
beforeEach(() => {
  calls.length = 0;
  qbit5 = true;
  turtle = false;
});

const qbit = <T>(fn: (c: ReturnType<typeof qbitClient>) => Promise<T>) => withConfig({ QBIT_URL: base, QBIT_USERNAME: 'u', QBIT_PASSWORD: 'p' }, () => fn(qbitClient()));
const posted = (verb: string) => calls.filter((c) => c.path === `/api/v2/${verb}`).map((c) => c.body);

test('unfinished torrents: errored first, then the fastest; finished seeds left out', () => {
  assert.deepEqual(
    unfinished(torrents).map((i) => [i.id, i.state]),
    [['ddd', 'errored'], ['aaa', 'downloading'], ['bbb', 'downloading'], ['ccc', 'stalled'], ['eee', 'paused']],
  );
});

test('qBittorrent reports each unfinished torrent with its hash, and whether the alternative limits are on', async () => {
  turtle = true;
  const d = await qbit((c) => c.adapter.fetch());
  assert.equal(d.items?.length, 5);
  assert.equal(d.items?.[0].id, 'ddd');
  assert.equal(d.altSpeed, true);
});

test('one torrent pauses, resumes and is removed with its files kept; qBittorrent 4 falls back to pause and resume', async () => {
  await qbit(async (c) => {
    await c.item('aaa', 'pause');
    await c.item('aaa', 'resume');
    await c.item('ccc', 'remove');
  });
  assert.deepEqual(posted('torrents/stop'), ['hashes=aaa']);
  assert.deepEqual(posted('torrents/start'), ['hashes=aaa']);
  assert.deepEqual(posted('torrents/delete'), ['hashes=ccc&deleteFiles=false'], 'never deletes files');

  calls.length = 0;
  qbit5 = false;
  await qbit((c) => c.item('bbb', 'pause'));
  assert.deepEqual(posted('torrents/pause'), ['hashes=bbb']);
});

test('the alternative speed limits toggle', async () => {
  await qbit((c) => c.altSpeed());
  assert.equal(turtle, true);
});

test('queue rows: failed and warning first with why, then importing, downloading, queued and paused', () => {
  const rows = toQueue([
    { id: 1, title: 'Downloading', status: 'downloading', size: 100, sizeleft: 25 },
    { id: 2, title: 'Paused', status: 'paused', size: 100, sizeleft: 100 },
    { id: 3, title: 'Stuck', status: 'completed', trackedDownloadStatus: 'warning', trackedDownloadState: 'importPending', statusMessages: [{ title: 'x', messages: ['No files found are eligible for import'] }], size: 100, sizeleft: 0 },
    { id: 4, title: 'Importing', status: 'completed', trackedDownloadStatus: 'ok', trackedDownloadState: 'importing', size: 100, sizeleft: 0 },
    { id: 5, title: 'Failed', status: 'failed', errorMessage: 'Download client is unavailable' },
    { id: 6, title: 'Waiting', status: 'delay' },
  ]);
  assert.deepEqual(rows.map((r) => [r.id, r.state]), [[5, 'failed'], [3, 'warning'], [4, 'importing'], [1, 'downloading'], [6, 'queued'], [2, 'paused']]);
  assert.equal(rows[0].message, 'Download client is unavailable');
  assert.equal(rows[1].message, 'No files found are eligible for import');
  assert.equal(rows.find((r) => r.id === 1)?.progress, 0.75);
  assert.equal(rows.find((r) => r.id === 1)?.message, undefined, 'only stuck items carry a message');
});

test('Sonarr and Radarr: try another release, search for what is missing, search for one', async () => {
  const env = (kind: 'SONARR' | 'RADARR') => ({ [`${kind}_URL`]: `${base}/arr`, [`${kind}_KEY`]: 'k' });
  await withConfig(env('SONARR'), async () => {
    const s = arrControl('sonarr');
    await s.retry(42);
    await s.searchMissing();
    await s.search(7);
  });
  await withConfig(env('RADARR'), async () => {
    const r = arrControl('radarr');
    await r.searchMissing();
    await r.search(9);
  });
  const del = calls.find((c) => c.method === 'DELETE')!;
  assert.equal(del.path, '/arr/api/v3/queue/42?removeFromClient=true&blocklist=true&skipRedownload=false');
  assert.deepEqual(
    calls.filter((c) => c.path === '/arr/api/v3/command').map((c) => JSON.parse(c.body)),
    [{ name: 'MissingEpisodeSearch' }, { name: 'EpisodeSearch', episodeIds: [7] }, { name: 'MissingMoviesSearch' }, { name: 'MoviesSearch', movieIds: [9] }],
  );
});
