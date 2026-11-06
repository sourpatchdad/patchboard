import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fromAudiobookshelf, fromSubsonic } from '../adapters/listening.ts';

test('Audiobookshelf: recent sessions with names and progress; stale ones drop', () => {
  const now = 1_800_000_000_000;
  const s = fromAudiobookshelf(
    {
      usersOnline: [{ id: 'u1', username: 'sam' }],
      openSessions: [
        { userId: 'u1', displayTitle: 'Dune', displayAuthor: 'Frank Herbert', currentTime: 3600, duration: 14400, updatedAt: now - 60_000 },
        { userId: 'u1', displayTitle: 'Old', updatedAt: now - 3_600_000 },
      ],
    },
    now,
  );
  assert.deepEqual(s.map((x) => [x.user, x.title, x.subtitle, x.progress]), [['sam', 'Dune', 'Frank Herbert', 25]]);
});

test('Navidrome: now playing within ten minutes, no progress; a refused login is an error', () => {
  const s = fromSubsonic({ 'subsonic-response': { status: 'ok', nowPlaying: { entry: [{ username: 'jo', title: 'Song', artist: 'Band', album: 'LP', minutesAgo: 1 }, { username: 'jo', title: 'Old', minutesAgo: 30 }] } } });
  assert.deepEqual(s.map((x) => [x.user, x.title, x.subtitle, x.progress]), [['jo', 'Song', 'Band, LP', -1]]);
  assert.throws(() => fromSubsonic({ 'subsonic-response': { status: 'failed', error: { message: 'Wrong username or password' } } }), /Wrong username/);
});
