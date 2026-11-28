// What an update brings: the release notes of the project an image says it
// was built from. Images name their source in the standard
// org.opencontainers.image.source label; when that's a GitHub repository,
// Patchboard reads its recent releases so the Update button comes with the
// changes beside it.
//
// Only a github.com owner/name ever becomes a request, to GitHub's API and
// nowhere else, so a label can't point the server at an address of its
// choosing. Answers are cached for an hour (GitHub allows 60 anonymous calls
// an hour), a failure is retried after 15 minutes, and each note is capped.

import type { ReleaseNote } from '../shared/types.ts';

/** owner/name, the way GitHub spells them; nothing that could leave the path. */
export const GITHUB_REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;

/** The GitHub repository an image's source label points at, or null. */
export function repoOf(source: string | undefined): string | null {
  if (!source) return null;
  const m = /^(?:https?:\/\/|git@)?(?:www\.)?github\.com[/:]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?(?:[#?].*)?$/i.exec(source.trim());
  if (!m) return null;
  const repo = `${m[1]}/${m[2]}`;
  return GITHUB_REPO.test(repo) && !repo.includes('..') ? repo : null;
}

const HOUR = 60 * 60_000;
const NOTE_MAX = 8000;
const CACHE_MAX = 200;
const cache = new Map<string, { at: number; notes: ReleaseNote[] | null }>();

/** The five newest releases of a repository, newest first; null when GitHub can't say. */
export async function releaseNotes(repo: string, now = Date.now(), get: typeof fetch = fetch): Promise<ReleaseNote[] | null> {
  if (!GITHUB_REPO.test(repo) || repo.includes('..')) return null;
  const hit = cache.get(repo);
  if (hit && now - hit.at < HOUR) return hit.notes;
  try {
    const res = await get(`https://api.github.com/repos/${repo}/releases?per_page=5`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Patchboard/1 (update notes)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = (await res.json()) as { tag_name?: string; name?: string; published_at?: string; html_url?: string; body?: string; prerelease?: boolean; draft?: boolean }[];
    const notes = (Array.isArray(list) ? list : [])
      .filter((r) => r.tag_name && !r.draft)
      .map((r) => ({
        version: r.tag_name!,
        name: r.name && r.name !== r.tag_name ? r.name : undefined,
        at: Date.parse(r.published_at ?? '') || 0,
        url: r.html_url?.startsWith(`https://github.com/${repo}/`) ? r.html_url : `https://github.com/${repo}/releases`,
        body: (r.body ?? '').slice(0, NOTE_MAX),
        prerelease: !!r.prerelease,
      }));
    remember(repo, now, notes);
    return notes;
  } catch {
    // Keep what was known and ask again in 15 minutes.
    remember(repo, now - 45 * 60_000, hit?.notes ?? null);
    return hit?.notes ?? null;
  }
}

function remember(repo: string, at: number, notes: ReleaseNote[] | null): void {
  if (cache.size >= CACHE_MAX && !cache.has(repo)) cache.delete(cache.keys().next().value!);
  cache.set(repo, { at, notes });
}

/** The releases newer than the one running: all of them when the running version isn't among them. */
export function since(notes: ReleaseNote[], running: string | undefined): ReleaseNote[] {
  const norm = (v: string) => v.replace(/^v/i, '').toLowerCase();
  const at = running ? notes.findIndex((n) => norm(n.version) === norm(running) || norm(running).startsWith(`${norm(n.version)}-`)) : -1;
  return at === -1 ? notes : notes.slice(0, at);
}
