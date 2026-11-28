import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { releaseNotes, repoOf, since } from '../release-notes.ts';
import type { ReleaseNote } from '../../shared/types.ts';

test("an image's source label becomes a GitHub owner/name, and nothing else becomes a request", () => {
  assert.equal(repoOf('https://github.com/linuxserver/docker-sonarr'), 'linuxserver/docker-sonarr');
  assert.equal(repoOf('https://github.com/jellyfin/jellyfin.git'), 'jellyfin/jellyfin');
  assert.equal(repoOf('git@github.com:immich-app/immich.git'), 'immich-app/immich');
  assert.equal(repoOf('https://github.com/home-assistant/core/'), 'home-assistant/core');
  assert.equal(repoOf('https://gitlab.com/owner/repo'), null, 'GitHub only');
  assert.equal(repoOf('https://github.com.evil.example/owner/repo'), null, 'a look-alike host');
  assert.equal(repoOf('https://github.com/owner/repo/../../../users'), null, 'no path tricks');
  assert.equal(repoOf('https://github.com/owner'), null);
  assert.equal(repoOf(undefined), null);
});

test('release notes come from GitHub once an hour, drafts left out and links kept to the repository', async () => {
  let calls = 0;
  const asked: string[] = [];
  const get = (async (url: string) => {
    calls++;
    asked.push(url);
    return new Response(
      JSON.stringify([
        { tag_name: 'v2.1.0', name: 'v2.1.0', published_at: '2026-11-20T10:00:00Z', html_url: 'https://github.com/acme/app/releases/tag/v2.1.0', body: '### Security\n- Fixed CVE-2026-1234', prerelease: false },
        { tag_name: 'v2.2.0-rc1', draft: true, body: 'unreleased' },
        { tag_name: 'v2.0.0', published_at: '2026-11-01T10:00:00Z', html_url: 'https://evil.example/phish', body: 'x'.repeat(20_000) },
      ]),
      { headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;
  const now = Date.parse('2026-11-28T00:00:00Z');
  const notes = (await releaseNotes('acme/app', now, get))!;
  assert.deepEqual(asked, ['https://api.github.com/repos/acme/app/releases?per_page=5']);
  assert.deepEqual(notes.map((n) => n.version), ['v2.1.0', 'v2.0.0'], 'no drafts');
  assert.equal(notes[0].name, undefined, 'a name that only repeats the tag is dropped');
  assert.equal(notes[1].url, 'https://github.com/acme/app/releases', 'a link off the repository is replaced');
  assert.equal(notes[1].body.length, 8000, 'each note is capped');
  await releaseNotes('acme/app', now + 30 * 60_000, get);
  assert.equal(calls, 1, 'cached for an hour');
  assert.equal(await releaseNotes('../../users', now, get), null, 'a bad name never reaches fetch');
  assert.equal(calls, 1);
});

test("only the releases newer than the one running, or all when it isn't listed", () => {
  const n = (version: string) => ({ version, at: 0, url: '', body: '', prerelease: false }) as ReleaseNote;
  const list = [n('v4.0.12'), n('v4.0.11'), n('v4.0.10'), n('v4.0.9')];
  assert.deepEqual(since(list, '4.0.10').map((x) => x.version), ['v4.0.12', 'v4.0.11']);
  assert.deepEqual(since(list, '4.0.10-ls255').map((x) => x.version), ['v4.0.12', 'v4.0.11'], 'a build suffix still matches');
  assert.equal(since(list, '3.9.0').length, 4);
  assert.equal(since(list, undefined).length, 4);
});
