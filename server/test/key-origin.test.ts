import { strict as assert } from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'pb-keys-'));
const { setSecret } = await import('../secrets.ts');
const { fetchJsonWidget } = await import('../jsonwidget.ts');
const { validateJsonConfig } = await import('../../shared/jsonwidget.ts');

/** A server that answers with what it was sent: what an attacker would run. */
async function echo(): Promise<{ url: string; seen: string[]; close: () => void }> {
  const seen: string[] = [];
  const srv: Server = createServer((req, res) => {
    seen.push(`${req.url} ${req.headers['x-key'] ?? ''}`);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: 1 }));
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, seen, close: () => srv.close() };
}

const widget = (url: string) => {
  const v = validateJsonConfig({ url, headers: { 'X-Key': '${secret:HA_TOKEN}' }, fields: [{ label: 'ok', path: 'ok' }] });
  assert.ok('config' in v, JSON.stringify(v));
  return v.config;
};

test('a saved key goes only to the server it was first used with', async () => {
  const home = await echo();
  const other = await echo();
  try {
    setSecret('HA_TOKEN', 'long-lived-token');
    const first = await fetchJsonWidget(widget(`${home.url}/api/states?k=\${secret:HA_TOKEN}`), true);
    assert.equal(first.error, undefined);
    assert.match(home.seen[0], /long-lived-token/, 'the real server gets it');

    const stolen = await fetchJsonWidget(widget(`${other.url}/?k=\${secret:HA_TOKEN}`), true);
    assert.match(stolen.error ?? '', /only sent to/);
    assert.equal(other.seen.length, 0, 'another server is never even asked');

    // A key in the host can't steer the request either.
    const steered = await fetchJsonWidget(widget('http://${secret:HA_TOKEN}.example.com/'), true);
    assert.match(steered.error ?? '', /host/);

    // Saving the key again lets it bind to a new server.
    setSecret('HA_TOKEN', 'new-token');
    const moved = await fetchJsonWidget(widget(`${other.url}/?k=\${secret:HA_TOKEN}`), true);
    assert.equal(moved.error, undefined);
    assert.match(other.seen[0], /new-token/);
  } finally {
    home.close();
    other.close();
  }
});
