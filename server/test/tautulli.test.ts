import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { plexItemPath, tautulliAdapter, toTautulliStream } from '../adapters/tautulli.ts';
import { withConfig } from '../config.ts';

test('Plex posters open their own title once Tautulli names the server', async () => {
  assert.equal(plexItemPath('abc123'), '#!/server/abc123/details?key=%2Flibrary%2Fmetadata%2F');
  const data: Record<string, unknown> = {
    get_activity: { sessions: [] },
    get_recently_added: { recently_added: [{ rating_key: '4242', media_type: 'movie', title: 'Sinners', year: '2025', added_at: '1730000000' }] },
    get_server_identity: { machine_identifier: 'abc123', version: '1.41' },
  };
  const server = createServer((req, res) => {
    const cmd = new URL(req.url!, 'http://x').searchParams.get('cmd')!;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ response: { result: 'success', data: data[cmd] } }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const out = await withConfig({ TAUTULLI_URL: url, TAUTULLI_KEY: 'k' }, () => tautulliAdapter().fetch());
    assert.equal(out.itemPath, plexItemPath('abc123'));
    assert.equal(out.recent[0].id, '4242');
  } finally {
    server.close();
  }
});

const session = { rating_key: '123', friendly_name: 'Sam', media_type: 'episode', title: 'Pilot', grandparent_title: 'Show', full_title: 'Show - Pilot', progress_percent: '25', state: 'paused', parent_media_index: '1', media_index: '1', grandparent_thumb: '/library/metadata/123/thumb/1' };

test('Tautulli converts native millisecond timing and keeps the safe series poster proxy', () => {
  const stream = toTautulliStream({ ...session, view_offset: '900000', duration: '3600000' });
  assert.equal(stream.itemId, '123');
  assert.equal(stream.positionSec, 900);
  assert.equal(stream.durationSec, 3600);
  assert.equal(stream.progress, 25);
  assert.equal(stream.title, 'Show');
  assert.equal(stream.subtitle, 'S01E01 Pilot');
  assert.equal(stream.state, 'paused');
  assert.equal(stream.thumb, '/api/img/tautulli?path=%2Flibrary%2Fmetadata%2F123%2Fthumb%2F1');
});

test('Tautulli keeps unknown timing absent and preserves an explicit zero offset', () => {
  assert.equal(toTautulliStream({ ...session, view_offset: 0 }).positionSec, 0);
  for (const value of [undefined, '', 'unknown', -1, Infinity]) {
    const stream = toTautulliStream({ ...session, view_offset: value, duration: value });
    assert.equal(stream.positionSec, undefined);
    assert.equal(stream.durationSec, undefined);
  }
  assert.equal(toTautulliStream({ ...session, duration: 0 }).durationSec, undefined);
  for (const progress_percent of [undefined, '', ' ', 'unknown', '-1', 'Infinity']) {
    assert.equal(toTautulliStream({ ...session, progress_percent }).progress, -1);
  }
  assert.equal(toTautulliStream({ ...session, progress_percent: '0' }).progress, 0);
});
