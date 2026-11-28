import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { dedupeRecent, foldBinges, sameRelease, titleWords } from '../../shared/media.ts';

// Pairs taken from a real Plex and Jellyfin library holding the same files.
const r = (title: string, subtitle: string, addedAt = 0, type = 'movie') => ({ id: title, title, subtitle, type, addedAt });

test('titles normalize past tags, punctuation and articles', () => {
  assert.equal(titleWords('99 to Beat (US)'), '99 to beat');
  assert.equal(titleWords("The Lord of the Rings: The Two Towers"), 'lord of the rings the two towers');
  assert.equal(titleWords('Amélie'), 'amelie');
});

test('the same release on Plex and Jellyfin matches', () => {
  assert.ok(sameRelease(r('99 to Beat (US)', 'S02E06 Teams and Teacups'), r('99 to Beat', 'S02E06 Teams and Teacups')));
  assert.ok(sameRelease(r('Christmas Vacation', '1989'), r("National Lampoon's Christmas Vacation", '1989')));
  assert.ok(sameRelease(r('The Amazing Race', 'S39E07 The Amazing Nightmare'), r('Amazing Race', 's39e7')));
});

test('different releases stay apart', () => {
  assert.ok(!sameRelease(r('The Grinch', '2018'), r('How the Grinch Stole Christmas', '2000')));
  assert.ok(!sameRelease(r('Abbott Elementary', 'S06E05 Courtney'), r('Abbott Elementary', 'S06E04 Other')));
  assert.ok(!sameRelease(r('It', '2017'), r('It Follows', '2017')));
  assert.ok(!sameRelease(r('Dune', '2021'), r('Dune', '1984')));
});

test('dedupe keeps the newest copy and lists the rest', () => {
  const out = dedupeRecent([r('Home Alone', '1990', 1), r('99 to Beat', 'S02E06 x', 5), r('99 to Beat (US)', 'S02E06 x', 9)]);
  assert.equal(out.length, 2);
  assert.equal(out[0].item.title, '99 to Beat (US)');
  assert.equal(out[0].also[0].title, '99 to Beat');
});

const H = 3_600_000;
const show = (title: string, subtitle: string, addedAt: number) => r(title, subtitle, addedAt, 'show');

test('a show one server groups as "13 new" and the other as "Season 1" shows once', () => {
  assert.ok(sameRelease(show('Camp Snoopy', '13 new', 12 * H), show('Camp Snoopy', 'Season 1', 13 * H)));
  assert.ok(sameRelease(show('Camp Snoopy', '13 new', 12 * H), show('Camp Snoopy', 'S01E04 Blueberry Birds', 10 * H)), 'a batch covers one of its episodes');
  const out = dedupeRecent([show('Camp Snoopy', 'Season 1', 13 * H), show('Camp Snoopy', '13 new', 12 * H), r('Musk', '2026', 14 * H)]);
  assert.deepEqual(out.map((o) => [o.item.title, o.also.length]), [['Musk', 0], ['Camp Snoopy', 1]]);
});

test('batches stay apart from movies, other years and a different week', () => {
  assert.ok(!sameRelease(show('Dune', '3 new', 0), r('Dune', '2021', 0)));
  assert.ok(!sameRelease(show('Camp Snoopy', 'Season 1', 0), show('Camp Snoopy', 'Season 2', 8 * 24 * H)));
  assert.ok(!sameRelease(show('Bluey', '4 new', 0), show('Bluey Minisodes', '2 new', 0)), 'a short title never swallows another show');
});

test("a show Plex labels with its year and Jellyfin as \"38 new\" shows once, and a film of that year doesn't join it", () => {
  assert.ok(sameRelease(show('Victorious', '2010', 12 * H), show('Victorious', '38 new', 12 * H)));
  assert.ok(sameRelease(show('Full House', '1987', 13 * H), show('Full House', '71 new', 13 * H)));
  assert.ok(!sameRelease(r('Victorious', '2010', 12 * H), show('Victorious', '38 new', 12 * H)), 'a film is still told apart by its year');
  const out = dedupeRecent([show('Victorious', '2010', 12 * H), show('Victorious', '38 new', 12 * H), show('Full House', '1987', 13 * H), show('Full House', '71 new', 13 * H)]);
  assert.deepEqual(out.map((o) => [o.item.title, o.also.length]), [['Full House', 1], ['Victorious', 1]]);
});

test('a binge reads as one line with its episode range, and anything in between starts a new one', () => {
  const p = (title: string, subtitle: string, user: string, at: number) => ({ title, subtitle, user, at });
  const plays = [p('Victorious', 'S01E12 Cat', 'Hadden', 9), p('Victorious', 'S01E11 Ping', 'Hadden', 8), p('Victorious', 'S01E10 Beck', 'Hadden', 7), p('Industry', 'S02E01 Daddy', 'Nathan', 6), p('Victorious', 'S01E09 Wi-Fi', 'Hadden', 5), p('Dune', '2021', 'Nathan', 4), p('Dune', '2021', 'Nathan', 3)];
  const out = foldBinges(plays);
  assert.deepEqual(out.map((o) => [o.title, o.subtitle, o.episodes ?? 1, o.at]), [
    ['Victorious', 'S01E10 to S01E12', 3, 9],
    ['Industry', 'S02E01 Daddy', 1, 6],
    ['Victorious', 'S01E09 Wi-Fi', 1, 5],
    ['Dune', '2021', 1, 4],
    ['Dune', '2021', 1, 3],
  ]);
  assert.equal(foldBinges([p('Victorious', 'S01E02 x', 'Hadden', 2), p('Victorious', 'S01E01 y', 'Sam', 1)]).length, 2, 'two people are two lines');
});
