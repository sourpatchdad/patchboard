// Posters for the calendar. Sonarr and Radarr guard their /MediaCover/ files
// behind the web login, so Patchboard asks their API instead
// (/api/v3/mediacover, which takes the API key). If that fails it falls back
// to the public poster URL they report (TheTVDB or TMDB). Trakt items have
// no art of their own, so their shows are looked up on TVmaze by TVDB id.
// Overseerr requests use the TMDB poster its API names.
// Everything is fetched by the server, cached for a day, and failures for an
// hour, so a missing poster never turns into a stream of requests.

import { config } from './config.ts';

const PUBLIC = /^https:\/\/(image\.tmdb\.org|artworks\.thetvdb\.com|thetvdb\.com|assets\.fanart\.tv|static\.tvmaze\.com)\//;
const remote = new Map<string, string>();

/** Adapters tell us each item's public poster URL as they read the calendar. */
export function rememberArt(key: string, url: string | undefined): void {
  if (url && PUBLIC.test(url)) remote.set(key, url.replace('/t/p/original/', '/t/p/w342/'));
}

type Hit = { at: number; type: string; body: Uint8Array<ArrayBuffer> } | { at: number; miss: true };
const cache = new Map<string, Hit>();

async function image(url: string, headers: Record<string, string> = {}, follow = false): Promise<{ type: string; body: Uint8Array<ArrayBuffer> } | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Patchboard/1', ...headers }, redirect: follow ? 'follow' : 'manual', signal: AbortSignal.timeout(8000) });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) return null;
    const body = new Uint8Array(await res.arrayBuffer());
    return body.length && body.length <= 2_000_000 ? { type, body } : null;
  } catch {
    return null;
  }
}

async function tvmaze(tvdb: string): Promise<{ type: string; body: Uint8Array<ArrayBuffer> } | null> {
  try {
    const res = await fetch(`https://api.tvmaze.com/lookup/shows?thetvdb=${tvdb}`, { headers: { 'User-Agent': 'Patchboard/1' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const show = (await res.json()) as { image?: { medium?: string } };
    const url = show.image?.medium;
    return url && PUBLIC.test(url) ? image(url, {}, true) : null;
  } catch {
    return null;
  }
}

/** A poster for sonarr/<seriesId>, radarr/<movieId> or tvmaze/<tvdbId>, or null. */
export async function poster(src: string, id: string): Promise<{ type: string; body: Uint8Array<ArrayBuffer> } | null> {
  if (!/^\d{1,9}$/.test(id) || !['sonarr', 'radarr', 'tvmaze', 'seerr'].includes(src)) return null;
  const key = `${src}:${id}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ('miss' in hit ? 3_600_000 : 86_400_000)) return 'miss' in hit ? null : hit;
  let got: { type: string; body: Uint8Array<ArrayBuffer> } | null = null;
  if (src === 'tvmaze') got = await tvmaze(id);
  else if (src === 'seerr') {
    const url = remote.get(key);
    if (url) got = await image(url, {}, true);
  }
  else {
    const svc = src === 'sonarr' ? config.sonarr : config.radarr;
    if (svc) got = await image(`${svc.url}/api/v3/mediacover/${id}/poster-250.jpg`, { 'X-Api-Key': svc.key });
    const fallback = remote.get(key);
    if (!got && fallback) got = await image(fallback, {}, true);
  }
  if (cache.size > 600) cache.delete(cache.keys().next().value!);
  cache.set(key, got ? { at: Date.now(), ...got } : { at: Date.now(), miss: true });
  return got;
}
