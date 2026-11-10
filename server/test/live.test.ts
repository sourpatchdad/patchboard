import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { WebSocketServer } from 'ws';
import type { Stream } from '../../shared/types.ts';
import { streamsChanged } from '../adapters/live.ts';

// Fakes of the two push lines: Jellyfin's /socket (JSON messages) and
// Audiobookshelf's Socket.IO, plus just enough HTTP for a first poll.
const KEY = 'live-key';
const session = (paused: boolean, ticks = 9_000_000_000) => ({
  UserName: 'Sam',
  NowPlayingItem: { Id: 'e1', Name: 'Cold Open', Type: 'Episode', SeriesName: 'Severance', SeriesId: 's1', ParentIndexNumber: 2, IndexNumber: 5, RunTimeTicks: 36_000_000_000 },
  PlayState: { PositionTicks: ticks, IsPaused: paused, PlayMethod: 'DirectPlay' },
});
const http = createServer((req, res) => {
  const json = (v: unknown) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(v));
  const path = new URL(req.url!, 'http://x').pathname;
  if (path === '/Users') return json([{ Id: 'u1', Name: 'Nathan', Policy: { IsAdministrator: true } }]);
  if (path === '/Sessions') return json([]);
  if (path === '/Items/Latest') return json([]);
  if (path === '/Shows/NextUp') return json({ Items: [] });
  if (path === '/Items/Counts') return json({});
  if (path.startsWith('/Users/u1/Items')) return json({ Items: [] });
  res.writeHead(404).end();
});
const wss = new WebSocketServer({ server: http });
/** What each fake line received, and a way to talk back. */
const lines: { path: string; got: string[]; send: (t: string) => void }[] = [];
wss.on('connection', (ws, req) => {
  const line = { path: req.url ?? '', got: [] as string[], send: (t: string) => ws.send(t) };
  lines.push(line);
  ws.on('message', (m) => line.got.push(String(m)));
  // Socket.IO says hello first.
  if (line.path.startsWith('/socket.io/')) ws.send('0{"sid":"a","pingInterval":25000,"pingTimeout":20000}');
});

let media: typeof import('../adapters/mediaserver.ts');
let listening: typeof import('../adapters/listening.ts');
const until = async (ok: () => boolean) => {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 20));
  assert(ok(), `timed out: ${JSON.stringify(lines.map((l) => [l.path, l.got]))}`);
};

before(async () => {
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  process.env.JELLYFIN_URL = base;
  process.env.JELLYFIN_KEY = KEY;
  process.env.AUDIOBOOKSHELF_URL = base;
  process.env.AUDIOBOOKSHELF_TOKEN = KEY;
  media = await import('../adapters/mediaserver.ts');
  listening = await import('../adapters/listening.ts');
});
after(() => {
  for (const c of wss.clients) c.terminate();
  wss.close();
  http.closeAllConnections();
  http.close();
});

test('playing time is not news; a pause, a stop or a seek is', () => {
  const s = (over: Partial<Stream> = {}): Stream => ({ user: 'Sam', title: 'Severance', progress: 10, positionSec: 100, durationSec: 1000, state: 'playing', transcode: false, ...over });
  const prev = { streams: [s()], at: 0 };
  assert.equal(streamsChanged(prev, [s({ positionSec: 104 })], 4000), false, '4 seconds of playing');
  assert.equal(streamsChanged(prev, [s({ positionSec: 104, state: 'paused' })], 4000), true, 'paused');
  assert.equal(streamsChanged(prev, [s({ positionSec: 400 })], 4000), true, 'a seek');
  assert.equal(streamsChanged(prev, [], 4000), true, 'stopped');
  assert.equal(streamsChanged(null, [], 0), true, 'first answer');
});

test('Jellyfin: subscribes, keeps the line alive, and passes on only changes', async () => {
  const a = media.mediaServerAdapter('jellyfin');
  await a.fetch();
  assert.equal(a.intervalMs, 15_000, 'polling, nobody watching');
  const updates: { streams: Stream[] }[] = [];
  const stop = a.live!({ update: (d) => updates.push(d as { streams: Stream[] }), refresh: () => {} });
  await until(() => lines.some((l) => l.path.startsWith('/socket')));
  const line = lines.find((l) => l.path.startsWith('/socket'))!;
  assert.match(line.path, /api_key=live-key/);
  await until(() => line.got.length > 0);
  assert.deepEqual(JSON.parse(line.got[0]), { MessageType: 'SessionsStart', Data: '0,2000' });

  line.send(JSON.stringify({ MessageType: 'Sessions', Data: [session(true)] }));
  await until(() => updates.length === 1);
  assert.equal(updates[0].streams[0].state, 'paused');
  assert.equal(a.intervalMs, 60_000, 'sessions arrive by push, so polling slows');

  // The same again is not news.
  line.send(JSON.stringify({ MessageType: 'Sessions', Data: [session(true)] }));
  line.send(JSON.stringify({ MessageType: 'Sessions', Data: [session(false)] }));
  await until(() => updates.length === 2);
  assert.equal(updates[1].streams[0].state, 'playing');

  // The shortest timeout Patchboard honours: a keep-alive goes out within 2.5 seconds.
  line.send(JSON.stringify({ MessageType: 'ForceKeepAlive', Data: 5 }));
  await until(() => line.got.some((m) => m.includes('KeepAlive')));
  stop();
});

test('Audiobookshelf: signs in over Socket.IO and asks for a poll on listening news', async () => {
  const a = listening.audiobookshelfAdapter();
  let refreshed = 0;
  const stop = a.live!({ update: () => {}, refresh: () => refreshed++ });
  await until(() => lines.some((l) => l.path.startsWith('/socket.io/')));
  const line = lines.find((l) => l.path.startsWith('/socket.io/'))!;
  await until(() => line.got.includes('40'));
  line.send('40{"sid":"b"}');
  await until(() => line.got.some((m) => m.startsWith('42')));
  assert.deepEqual(JSON.parse(line.got.find((m) => m.startsWith('42'))!.slice(2)), ['auth', KEY]);

  // News before a good sign-in doesn't count.
  line.send('42["user_stream_update",{}]');
  line.send('42["init",{}]');
  line.send('42["user_stream_update",{}]');
  await until(() => refreshed === 1);
  assert.equal(a.intervalMs, 60_000);
  line.send('2');
  await until(() => line.got.includes('3'));
  stop();
});
