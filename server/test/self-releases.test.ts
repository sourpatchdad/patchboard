import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { compareVersions } from '../../shared/version.ts';
import { selfReleases } from '../self-releases.ts';

test('versions compare by number, not as text', () => {
  assert.equal(compareVersions('1.10.0', '1.9.3'), 1);
  assert.equal(compareVersions('v1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('1.0.0', '1.0.1'), -1);
  assert.equal(compareVersions('2.0.0', '1.99.99'), 1);
});

test('release notes: published releases only, newest first, asked for at most once an hour', async () => {
  let calls = 0;
  const fake = (async () => {
    calls++;
    return new Response(
      JSON.stringify([
        { tag_name: 'v1.0.0', body: 'First', published_at: '2026-11-10T12:00:00Z', html_url: 'u0' },
        { tag_name: 'v1.10.0', body: 'Ten', published_at: '2026-12-10T12:00:00Z', html_url: 'u10' },
        { tag_name: 'v1.2.0', body: 'Two', published_at: '2026-11-20T12:00:00Z', html_url: 'u2' },
        { tag_name: 'v1.3.0-rc.1', body: 'Soon', prerelease: true },
        { tag_name: 'v1.4.0', body: 'Draft', draft: true },
      ]),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;
  const t = Date.parse('2026-12-11T00:00:00Z');
  const list = await selfReleases(t, fake);
  assert.deepEqual(list.map((r) => r.version), ['1.10.0', '1.2.0', '1.0.0']);
  assert.equal(list[0].notes, 'Ten');
  await selfReleases(t + 30 * 60_000, fake);
  assert.equal(calls, 1, 'cached for the hour');

  // GitHub down: the last answer stands.
  const down = (async () => {
    throw new Error('offline');
  }) as typeof fetch;
  const later = await selfReleases(t + 2 * 3600_000, down);
  assert.equal(later.length, 3);
});
