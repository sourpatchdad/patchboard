// Patchboard's own release notes, from its GitHub Releases, so Home can say
// what an update brings before you take it. At most one call an hour (GitHub
// allows 60 anonymous calls an hour per address); if GitHub can't be reached,
// the last answer stands.

import type { SelfRelease } from '../shared/types.ts';
import { compareVersions } from '../shared/version.ts';

const REPO = 'sourpatchdad/patchboard';
const HOUR = 60 * 60_000;

let cache: { at: number; list: SelfRelease[] } | null = null;

/** Published releases, newest first, without drafts or pre-releases. */
export async function selfReleases(now = Date.now(), fetcher: typeof fetch = fetch): Promise<SelfRelease[]> {
  if (cache && now - cache.at < HOUR) return cache.list;
  try {
    const res = await fetcher(`https://api.github.com/repos/${REPO}/releases?per_page=20`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Patchboard (release notes)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = (await res.json()) as { tag_name?: string; body?: string; published_at?: string; html_url?: string; draft?: boolean; prerelease?: boolean }[];
    const list = raw
      .filter((r) => r.tag_name && !r.draft && !r.prerelease && /^v?\d+\.\d+\.\d+$/.test(r.tag_name))
      .map((r) => ({ version: r.tag_name!.replace(/^v/, ''), at: Date.parse(r.published_at ?? '') || 0, notes: (r.body ?? '').slice(0, 20_000), url: r.html_url ?? `https://github.com/${REPO}/releases` }))
      .sort((a, b) => compareVersions(b.version, a.version));
    cache = { at: now, list };
    return list;
  } catch {
    // Try again in ten minutes rather than an hour.
    cache = { at: now - HOUR + 10 * 60_000, list: cache?.list ?? [] };
    return cache.list;
  }
}

/** Demo mode makes no outside calls: one release, the running one. */
export function demoSelfReleases(version: string): SelfRelease[] {
  return [
    {
      version,
      at: Date.now() - 2 * 24 * HOUR,
      url: `https://github.com/${REPO}/releases`,
      notes: '- **Home answers before you ask.** What needs you, the server, your apps, what is playing and what changed, fitted to one screen.\n- **Live without weight.** Playback shows as it happens; cameras open live with a tap.\n- **Set up in the browser.** Connect integrations from Settings, keys encrypted on the server.',
    },
  ];
}
