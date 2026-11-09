import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { every } from '../adapters/every.ts';
import { absInProgress, fromAlbumList } from '../adapters/listening.ts';
import { toCounts, toPlays } from '../adapters/mediaserver.ts';
import { fromHistory, libraryCounts } from '../adapters/tautulli.ts';

test('Tautulli history: the show for an episode, its number and name, when it stopped, who', () => {
  const plays = fromHistory([
    { friendly_name: 'Sam', media_type: 'episode', title: 'Bears', grandparent_title: 'The Bear', parent_media_index: 4, media_index: 3, date: 100, stopped: 200, rating_key: 42, grandparent_thumb: '/library/metadata/9/thumb' },
    { friendly_name: 'Kit', media_type: 'movie', title: 'Dune: Part Two', date: 50, rating_key: '7' },
  ]);
  assert.deepEqual(plays[0], { user: 'Sam', title: 'The Bear', subtitle: 'S04E03 Bears', at: 200_000, itemId: '42', thumb: '/api/img/tautulli?path=%2Flibrary%2Fmetadata%2F9%2Fthumb' });
  assert.equal(plays[1].title, 'Dune: Part Two');
  assert.equal(plays[1].subtitle, undefined);
  assert.equal(plays[1].at, 50_000, 'a play still going has no stop time yet');
});

test('Tautulli libraries: films, shows and episodes, and tracks only when there is music', () => {
  assert.deepEqual(
    libraryCounts([
      { section_type: 'movie', count: '1200' },
      { section_type: 'movie', count: '4' },
      { section_type: 'show', count: '212', child_count: '9387' },
      { section_type: 'photo', count: '900' },
    ]),
    { movies: 1204, shows: 212, episodes: 9387 },
  );
  assert.equal(libraryCounts([{ section_type: 'artist', count: '300', child_count: '18420' }]).songs, 18420);
});

test("Jellyfin and Emby: the user's finished items with when they were played, and library counts", () => {
  const plays = toPlays(
    'jellyfin',
    [
      { Id: 'a', Name: 'Bad Actors', Type: 'Episode', SeriesName: 'Slow Horses', ParentIndexNumber: 5, IndexNumber: 1, UserData: { LastPlayedDate: '2026-11-08T20:00:00Z' } },
      { Id: 'b', Name: 'Never played', Type: 'Movie' },
    ] as never,
    'Jo',
  );
  assert.equal(plays.length, 1, 'only items with a play date');
  assert.equal(plays[0].title, 'Slow Horses');
  assert.equal(plays[0].subtitle, 'S05E01 Bad Actors');
  assert.equal(plays[0].user, 'Jo');
  assert.equal(plays[0].at, Date.parse('2026-11-08T20:00:00Z'));
  assert.deepEqual(toCounts({ MovieCount: 842, SeriesCount: 160, EpisodeCount: 6120, SongCount: 0 }), { movies: 842, shows: 160, episodes: 6120 });
});

test('Audiobookshelf: books started and not finished, newest first, named from the in-progress list', () => {
  const books = absInProgress(
    {
      mediaProgress: [
        { libraryItemId: 'b1', progress: 0.62, lastUpdate: 300, mediaItemType: 'book' },
        { libraryItemId: 'b2', progress: 0.31, lastUpdate: 500, mediaItemType: 'book' },
        { libraryItemId: 'b3', progress: 1, isFinished: true, lastUpdate: 900 },
        { libraryItemId: 'p1', progress: 0.5, lastUpdate: 800, episodeId: 'ep1' },
        { libraryItemId: 'b4', progress: 0, lastUpdate: 950 },
      ],
    },
    { libraryItems: [{ id: 'b1', media: { metadata: { title: 'Project Hail Mary', authorName: 'Andy Weir' } } }, { id: 'b2', media: { metadata: { title: 'Piranesi' } } }, { id: 'p1' }, { id: 'b3' }, { id: 'b4' }] },
  );
  assert.deepEqual(books.map((b) => b.id), ['b2', 'b1'], 'finished, unstarted and podcast episodes left out');
  assert.deepEqual(books[1], { id: 'b1', title: 'Project Hail Mary', author: 'Andy Weir', progress: 0.62, at: 300 });
});

test('Navidrome: recent albums with when they were played', () => {
  assert.deepEqual(fromAlbumList({ 'subsonic-response': { albumList2: { album: [{ name: 'Blonde', artist: 'Frank Ocean', played: '2026-11-08T19:00:00Z' }, { name: 'Untitled' }] } } }), [
    { title: 'Blonde', artist: 'Frank Ocean', at: Date.parse('2026-11-08T19:00:00Z') },
    { title: 'Untitled' },
  ]);
});

test('slow data is fetched once per interval, and a failure keeps the last good answer', async () => {
  let calls = 0;
  let fail = false;
  const get = every(60_000, async () => {
    calls++;
    if (fail) throw new Error('down');
    return calls;
  });
  assert.equal(await get(), 1);
  assert.equal(await get(), 1, 'within the interval: no second call');
  assert.equal(calls, 1);

  // An interval of zero asks every time; a failed ask answers with the last good result.
  let n = 0;
  const flaky = every(0, async () => {
    n++;
    if (fail) throw new Error('down');
    return n;
  });
  assert.equal(await flaky(), 1);
  fail = true;
  assert.equal(await flaky(), 1, 'the server went down: the last answer stays');
  fail = false;
  assert.equal(await flaky(), 3, 'back up: a fresh answer');
});
