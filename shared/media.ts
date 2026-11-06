// One title on two media servers: Plex and Jellyfin name things a little
// differently ("99 to Beat (US)" and "99 to Beat", "Christmas Vacation" and
// "National Lampoon's Christmas Vacation"), so a plain string match misses.

import type { RecentItem } from './types.ts';

/** Lowercase words only: no "(US)" or "(2019)" tag, no punctuation, no leading article. */
export function titleWords(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s*[([][^)\]]*[)\]]\s*/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}

/**
 * What tells two releases of a title apart: the episode code, the year, or
 * neither, for a batch ("13 new", "Season 1") that a server groups its own way.
 */
function marker(r: RecentItem): { kind: 'ep' | 'year' | 'batch'; key: string } {
  const sub = r.subtitle ?? '';
  const ep = /S(\d+)E(\d+)/i.exec(sub);
  if (ep) return { kind: 'ep', key: `${Number(ep[1])}x${Number(ep[2])}` };
  const year = /\b(19|20)\d{2}\b/.exec(sub);
  return year ? { kind: 'year', key: year[0] } : { kind: 'batch', key: '' };
}

/** A batch matches what lands from the same show within three days. */
const BATCH_WINDOW = 3 * 86_400_000;

/**
 * Two servers added the same thing: one title holds the other, and the same
 * episode, the same year, or a batch of that show close in time to the other
 * copy, whether that copy is a batch or a single episode.
 */
export function sameRelease(a: RecentItem, b: RecentItem): boolean {
  const ma = marker(a);
  const mb = marker(b);
  if (ma.kind === 'batch' || mb.kind === 'batch') {
    if (ma.kind === 'year' || mb.kind === 'year' || a.type === 'movie' || b.type === 'movie') return false;
    if (Math.abs(a.addedAt - b.addedAt) > BATCH_WINDOW) return false;
  } else if (ma.kind !== mb.kind || ma.key !== mb.key) return false;
  const x = titleWords(a.title);
  const y = titleWords(b.title);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  // Whole words only, and enough of them, so "It" never swallows "It Follows".
  return short.length >= 6 && ` ${long} `.includes(` ${short} `);
}

/** Newest first; each release once, with every server that has it. */
export function dedupeRecent<T extends RecentItem>(items: T[]): { item: T; also: T[] }[] {
  const out: { item: T; also: T[] }[] = [];
  for (const r of [...items].sort((a, b) => b.addedAt - a.addedAt)) {
    const hit = out.find((o) => sameRelease(o.item, r));
    if (hit) hit.also.push(r);
    else out.push({ item: r, also: [] });
  }
  return out;
}
