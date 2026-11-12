import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { classify, ProblemFeed, type ProblemLine } from '../problems.ts';

test('only lines that say something went wrong count, and "no errors" is not one', () => {
  assert.equal(classify('[ERR] Jellyfin.Api: Token is required'), 'error');
  assert.equal(classify('level=error msg="dial tcp: connection refused"'), 'error');
  assert.equal(classify('FATAL open /downloads/complete: permission denied'), 'error');
  assert.equal(classify('Request failed with status 502'), 'error');
  assert.equal(classify('[Warn] RssSync: Indexer is unavailable'), 'warn');
  assert.equal(classify('2026-11-11 WRN slow query'), 'warn');
  for (const fine of ['Scrub finished, no errors', 'errors: 0, warnings: 0', 'Completed with 0 failures', 'GET /health 200 2ms', 'Terror in the Aisles']) {
    assert.equal(classify(fine), null, fine);
  }
  assert.equal(classify('panic: runtime error, 0 errors before this'), 'error', 'a panic still counts');
  // A Python traceback counts once: its frames name files, its last line names the error.
  assert.equal(classify('Traceback (most recent call last):'), null);
  assert.equal(classify('  File "/app/.venv/lib/python3.12/site-packages/errors.py", line 41, in raise_for_error'), null);
  assert.equal(classify('requests.exceptions.ConnectionError: Max retries exceeded'), 'error');
});

test('the feed follows running containers, masks keys, keeps a backlog, and holds a flood back', async () => {
  const emitters = new Map<string, (text: string) => void>();
  const follow = (name: string, _tail: number, onLine: (l: { stream: 'out' | 'err'; text: string; at?: number }) => void, signal: AbortSignal) =>
    new Promise<void>((resolve) => {
      emitters.set(name, (text) => onLine({ stream: 'out', text, at: 1 }));
      signal.addEventListener('abort', () => resolve());
    });
  const feed = new ProblemFeed(() => ['sonarr', 'immich'], follow, () => 60_000);
  const seen: ProblemLine[] = [];
  const sub = feed.subscribe((l) => seen.push(l));
  assert.deepEqual([...emitters.keys()], ['sonarr', 'immich']);

  emitters.get('sonarr')!('[Info] RSS sync done');
  emitters.get('sonarr')!('[Error] Grab failed https://tracker.example/dl?torrent_pass=abc123');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].container, 'sonarr');
  assert.match(seen[0].text, /torrent_pass=••••/);

  for (let i = 0; i < 40; i++) emitters.get('immich')!(`WARN retry ${i}`);
  assert.equal(seen.filter((l) => l.container === 'immich').length, 12, 'twelve a minute from one container');

  const late = feed.subscribe(() => undefined);
  assert.equal(late.backlog.length, 13, 'a new screen gets what was already seen');
  sub.unsubscribe();
  late.unsubscribe();
  feed.stop();
});
