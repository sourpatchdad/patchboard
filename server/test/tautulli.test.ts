import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { plexItemPath, tautulliAdapter } from '../adapters/tautulli.ts';
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
