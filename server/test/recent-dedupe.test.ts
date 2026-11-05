import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { dedupeRecent, sameRelease, titleWords } from '../../shared/media.ts';

// Pairs taken from a real Plex and Jellyfin library holding the same files.
const r = (title: string, subtitle: string, addedAt = 0) => ({ id: title, title, subtitle, type: 'movie', addedAt });

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
