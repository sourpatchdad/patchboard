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

/** A whole show or a season: what a server puts on the shelf for new episodes. */
const SHOWISH = /^(show|series|season)$/i;

/**
 * What tells two releases of a title apart: the episode code, the year, or
 * neither, for a batch ("13 new", "Season 1") that a server groups its own
 * way. A show's year is a batch too: Plex labels new episodes grouped under
 * their show with the show's first year ("Victorious, 2010"), where Jellyfin
 * says "38 new"; only a film's year tells two releases apart.
 */
function marker(r: RecentItem): { kind: 'ep' | 'year' | 'batch'; key: string } {
  const sub = r.subtitle ?? '';
  const ep = /S(\d+)E(\d+)/i.exec(sub);
  if (ep) return { kind: 'ep', key: `${Number(ep[1])}x${Number(ep[2])}` };
  const year = /\b(19|20)\d{2}\b/.exec(sub);
  return year && !SHOWISH.test(r.type) ? { kind: 'year', key: year[0] } : { kind: 'batch', key: '' };
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

/** "S01E06" from an episode's subtitle, as season and episode numbers. */
function episodeOf(subtitle: string | undefined): [number, number] | null {
  const m = /S(\d+)E(\d+)/i.exec(subtitle ?? '');
  return m ? [Number(m[1]), Number(m[2])] : null;
}

const code = ([s, e]: [number, number]) => `S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}`;

/**
 * A binge as one line: plays of the same show by the same person, one after
 * another, fold into the newest, with the episode range and how many. Plays
 * come newest first; anything in between (another show, another person)
 * starts a new line.
 */
export function foldBinges<T extends { user: string; title: string; subtitle?: string; at: number }>(plays: T[], sameSource: (a: T, b: T) => boolean = () => true): (T & { episodes?: number })[] {
  const out: (T & { episodes?: number; _from?: [number, number]; _to?: [number, number] })[] = [];
  for (const p of plays) {
    const ep = episodeOf(p.subtitle);
    const last = out.at(-1);
    if (ep && last && last._from && last.title === p.title && last.user === p.user && sameSource(last, p)) {
      last.episodes = (last.episodes ?? 1) + 1;
      if (ep[0] < last._from[0] || (ep[0] === last._from[0] && ep[1] < last._from[1])) last._from = ep;
      if (ep[0] > last._to![0] || (ep[0] === last._to![0] && ep[1] > last._to![1])) last._to = ep;
      last.subtitle = `${code(last._from)} to ${code(last._to!)}`;
      continue;
    }
    out.push({ ...p, ...(ep ? { _from: ep, _to: ep } : {}) });
  }
  return out.map(({ _from: _f, _to: _t, ...p }) => p as T & { episodes?: number });
}
