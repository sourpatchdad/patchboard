// Trakt "my calendar": shows and movies from your watchlist and history, which
// covers things Sonarr/Radarr aren't tracking. The token comes from the device
// sign-in (trakt-auth.ts), refreshed as needed.

import type { ReleaseItem, TraktData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { getJson } from '../http.ts';
import { type Adapter, MINUTE } from './adapter.ts';
import { episodeKey } from './arr.ts';
import { traktToken } from '../trakt-auth.ts';

interface ShowEntry {
  first_aired: string;
  episode: { season: number; number: number; title?: string };
  show: { title: string; ids: { slug: string } };
}

interface MovieEntry {
  released: string;
  movie: { title: string; year: number; ids: { slug: string; tmdb?: number } };
}

export function traktAdapter(): Adapter<TraktData> {
  const { clientId } = config.trakt!;
  return {
    id: 'trakt',
    label: 'Trakt',
    intervalMs: 30 * MINUTE,
    async fetch() {
      const headers = {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': clientId,
        Authorization: `Bearer ${await traktToken()}`,
      };
      const start = new Date().toISOString().slice(0, 10);
      const days = config.upcomingDays;
      const [shows, movies] = await Promise.all([
        getJson<ShowEntry[]>(`https://api.trakt.tv/calendars/my/shows/${start}/${days}`, { headers }),
        getJson<MovieEntry[]>(`https://api.trakt.tv/calendars/my/movies/${start}/${days}`, { headers }),
      ]);
      const upcoming: ReleaseItem[] = [
        ...shows.map((s): ReleaseItem => ({
          id: `trakt-${s.show.ids.slug}-${s.episode.season}-${s.episode.number}`,
          source: 'trakt',
          kind: 'episode',
          title: s.show.title,
          subtitle: `S${String(s.episode.season).padStart(2, '0')}E${String(s.episode.number).padStart(2, '0')} ${s.episode.title ?? ''}`.trim(),
          when: s.first_aired,
          url: `https://trakt.tv/shows/${s.show.ids.slug}`,
          key: episodeKey(s.show.title, s.episode.season, s.episode.number),
        })),
        ...movies.map((m): ReleaseItem => ({
          id: `trakt-${m.movie.ids.slug}`,
          source: 'trakt',
          kind: 'movie',
          title: m.movie.title,
          subtitle: 'Release',
          // Date-only; pin to local noon so it lands on the right day.
          when: `${m.released}T12:00:00`,
          url: `https://trakt.tv/movies/${m.movie.ids.slug}`,
          key: `mv:${m.movie.ids.tmdb ?? m.movie.ids.slug}:Digital release`,
        })),
      ];
      return { upcoming };
    },
  };
}
