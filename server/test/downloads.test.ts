import { strict as assert } from 'node:assert';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

// One fake server playing Transmission, Deluge, SABnzbd and NZBGet, each on
// its own path, recording the calls that change state.
const calls: string[] = [];
const state = { trStopped: false, delugePaused: false, sabPaused: false, nzbPaused: false };
const body = (req: IncomingMessage) => new Promise<string>((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });

const server = createServer(async (req, res) => {
  const json = (v: unknown, headers: Record<string, string> = {}) => res.writeHead(200, { 'Content-Type': 'application/json', ...headers }).end(JSON.stringify(v));
  const url = new URL(req.url!, 'http://x');

  if (url.pathname === '/transmission/rpc') {
    // Transmission's CSRF guard: no valid session id, 409 with one to use.
    if (req.headers['x-transmission-session-id'] !== 'sess-1') return void res.writeHead(409, { 'X-Transmission-Session-Id': 'sess-1' }).end();
    assert.equal(req.headers.authorization, `Basic ${Buffer.from('tr:pw').toString('base64')}`);
    const { method } = JSON.parse(await body(req));
    if (method === 'session-stats') return json({ result: 'success', arguments: { downloadSpeed: 5_000_000, uploadSpeed: 100_000 } });
    if (method === 'torrent-get')
      return json({ result: 'success', arguments: { torrents: [
        { name: 'A', status: state.trStopped ? 0 : 4, percentDone: 0.5, rateDownload: state.trStopped ? 0 : 4_000_000, eta: 60, error: 0 },
        { name: 'B', status: state.trStopped ? 0 : 6, percentDone: 1, rateDownload: 0, eta: -1, error: 0 },
        { name: 'C', status: state.trStopped ? 0 : 4, percentDone: 0.1, rateDownload: 0, eta: -1, error: 3 },
      ] } });
    calls.push(`transmission:${method}`);
    state.trStopped = method === 'torrent-stop';
    return json({ result: 'success', arguments: {} });
  }

  if (url.pathname === '/json') {
    const { method, params, id } = JSON.parse(await body(req));
    const ok = (result: unknown, headers?: Record<string, string>) => json({ result, error: null, id }, headers);
    if (method === 'auth.login') return ok(params[0] === 'deluge-pw', { 'Set-Cookie': '_session_id=abc; Path=/' });
    if (req.headers.cookie !== '_session_id=abc') return json({ result: null, error: { message: 'Not authenticated', code: 1 }, id });
    if (method === 'web.connected') return ok(false);
    if (method === 'web.get_hosts') return ok([['host1', '127.0.0.1', 58846, 'Online']]);
    if (method === 'web.connect') return calls.push('deluge:connect'), ok(null);
    if (method === 'core.is_session_paused') return ok(state.delugePaused);
    if (method === 'web.update_ui')
      return ok({ torrents: { h1: { name: 'Linux.iso', state: 'Downloading', progress: 42, download_payload_rate: 2_000_000, eta: 30 } }, stats: { download_rate: 2_000_000, upload_rate: 0 } });
    calls.push(`deluge:${method}`);
    state.delugePaused = method === 'core.pause_session';
    return ok(null);
  }

  if (url.pathname === '/api') {
    if (url.searchParams.get('apikey') !== 'sab-key') return void res.writeHead(403).end();
    const mode = url.searchParams.get('mode');
    if (mode === 'queue')
      return json({ queue: { paused: state.sabPaused, kbpersec: '1000', slots: [{ filename: 'Show.S01E01', percentage: '40', timeleft: '0:01:30', status: 'Downloading' }, { filename: 'Next', percentage: '0', timeleft: '0:00:00', status: 'Queued' }] } });
    if (mode === 'history') return json({ history: { slots: [{ name: 'Broken.nzb', status: 'Failed', completed: Date.now() / 1000 - 60 }, { name: 'Old.nzb', status: 'Failed', completed: 1 }] } });
    calls.push(`sabnzbd:${mode}`);
    state.sabPaused = mode === 'pause';
    return json({ status: true });
  }

  if (url.pathname === '/jsonrpc') {
    const { method } = JSON.parse(await body(req));
    if (method === 'status') return json({ result: { DownloadRate: 1_048_576, DownloadPaused: state.nzbPaused } });
    if (method === 'listgroups') return json({ result: [{ NZBName: 'Film', FileSizeMB: 100, RemainingSizeMB: 25, Status: 'DOWNLOADING' }] });
    if (method === 'history') return json({ result: [] });
    calls.push(`nzbget:${method}`);
    state.nzbPaused = method === 'pausedownload';
    return json({ result: true });
  }
  res.writeHead(404).end();
});

let dl: typeof import('../adapters/downloads.ts');

before(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  Object.assign(process.env, {
    TRANSMISSION_URL: base, TRANSMISSION_USERNAME: 'tr', TRANSMISSION_PASSWORD: 'pw',
    DELUGE_URL: base, DELUGE_PASSWORD: 'deluge-pw',
    SABNZBD_URL: base, SABNZBD_KEY: 'sab-key',
    NZBGET_URL: base,
  });
  dl = await import('../adapters/downloads.ts');
});
after(() => server.close());

test('Transmission: fetches a session id on 409, counts states, pauses everything', async () => {
  const { adapter, control } = dl.transmissionClient();
  const d = await adapter.fetch();
  assert.equal(d.down, 5_000_000);
  assert.equal(d.downloading, 2);
  assert.equal(d.seeding, 1);
  assert.equal(d.stalled, 1);
  assert.deepEqual(d.errored, ['C']);
  assert.equal(d.paused, false);
  await control('pause');
  assert.equal((await adapter.fetch()).paused, true);
  await control('resume');
  assert.deepEqual(calls.filter((c) => c.startsWith('transmission')), ['transmission:torrent-stop', 'transmission:torrent-start']);
});

test('Deluge: signs in, connects to the daemon, pauses the session', async () => {
  const { adapter, control } = dl.delugeClient();
  const d = await adapter.fetch();
  assert.ok(calls.includes('deluge:connect'));
  assert.deepEqual(d.active, [{ name: 'Linux.iso', progress: 0.42, speed: 2_000_000, etaSec: 30 }]);
  await control('pause');
  assert.equal((await adapter.fetch()).paused, true);
  await control('resume');
  assert.equal((await adapter.fetch()).paused, false);
});

test('SABnzbd: queue speed on the first job, failures from the last day only, pause and resume', async () => {
  const { adapter, control } = dl.sabnzbdClient();
  const d = await adapter.fetch();
  assert.equal(d.kind, 'usenet');
  assert.equal(d.down, 1000 * 1024);
  assert.deepEqual(d.active.map((a) => [a.name, a.speed > 0, a.etaSec]), [['Show.S01E01', true, 90], ['Next', false, 0]]);
  assert.deepEqual(d.errored, ['Broken.nzb']);
  await control('pause');
  assert.equal((await adapter.fetch()).paused, true);
});

test('NZBGet: progress and ETA from remaining size, pause and resume', async () => {
  const { adapter, control } = dl.nzbgetClient();
  const d = await adapter.fetch();
  assert.equal(d.active[0].progress, 0.75);
  assert.equal(d.active[0].etaSec, 25);
  await control('pause');
  assert.equal((await adapter.fetch()).paused, true);
  await control('resume');
  assert.ok(calls.includes('nzbget:resumedownload'));
});
