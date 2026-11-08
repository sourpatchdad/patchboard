// Patchboard watches its own image, so a new release shows up without Diun.
// It asks the registry what digest its tag (edge, latest, 1) points at now and
// compares that with the image it runs. Public images need no login on GitHub's
// registry or Docker Hub; for a private one it says it can't check.

import { request } from './http.ts';

/** "ghcr.io/owner/name:tag" -> where to ask, and for what. Docker Hub when there's no registry host. */
export function parseRef(ref: string): { registry: string; repo: string; tag: string } | null {
  const at = ref.split('@')[0];
  const slash = at.indexOf('/');
  const first = slash > 0 ? at.slice(0, slash) : '';
  const hasHost = /[.:]/.test(first) || first === 'localhost';
  const registry = hasHost ? first : 'registry-1.docker.io';
  let rest = hasHost ? at.slice(slash + 1) : at;
  const colon = rest.lastIndexOf(':');
  const tag = colon > rest.lastIndexOf('/') ? rest.slice(colon + 1) : 'latest';
  if (colon > rest.lastIndexOf('/')) rest = rest.slice(0, colon);
  if (registry === 'registry-1.docker.io' && !rest.includes('/')) rest = `library/${rest}`;
  if (registry !== 'ghcr.io' && registry !== 'registry-1.docker.io') return null;
  return { registry, repo: rest, tag };
}

const TOKEN_URL: Record<string, (repo: string) => string> = {
  'ghcr.io': (repo) => `https://ghcr.io/token?scope=repository:${repo}:pull`,
  'registry-1.docker.io': (repo) => `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull`,
};

const ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

const PRIVATE = 'The registry wants a sign-in for this image, so Patchboard can\'t see new versions. Public images need none.';

/** The digest the registry serves for this tag now, or why it can't say. */
export async function remoteDigest(ref: string): Promise<{ digest: string } | { reason: string }> {
  const r = parseRef(ref);
  if (!r) return { reason: 'Patchboard checks images on GitHub\'s registry and Docker Hub only.' };
  let token: string | undefined;
  try {
    token = ((await (await request(TOKEN_URL[r.registry](r.repo))).json()) as { token?: string }).token;
  } catch (err) {
    const status = (err as { status?: number }).status;
    return { reason: status === 401 || status === 403 ? PRIVATE : 'Couldn\'t reach the registry.' };
  }
  if (!token) return { reason: PRIVATE };
  try {
    const res = await request(`https://${r.registry}/v2/${r.repo}/manifests/${r.tag}`, {
      method: 'HEAD',
      headers: { Authorization: `Bearer ${token}`, Accept: ACCEPT },
    });
    const digest = res.headers.get('docker-content-digest');
    return digest ? { digest } : { reason: 'The registry didn\'t say which image the tag points at.' };
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) return { reason: PRIVATE };
    if (status === 404) return { reason: `The registry has no ${r.tag} tag for this image.` };
    return { reason: 'Couldn\'t reach the registry.' };
  }
}

/** The running image's digests, as Docker recorded them when it was pulled. */
export function localDigests(repoDigests: string[] | undefined): string[] {
  return (repoDigests ?? []).map((d) => d.split('@')[1]).filter((d): d is string => !!d);
}

/**
 * Where to read what changed: a version tag's release notes, or the commits
 * behind edge (main) and dev. GitHub's registry only.
 */
export function changesLink(ref: string): string | undefined {
  const r = parseRef(ref);
  if (r?.registry !== 'ghcr.io') return undefined;
  const repo = `https://github.com/${r.repo.split('/').slice(0, 2).join('/')}`;
  return r.tag === 'edge' ? `${repo}/commits/main` : r.tag === 'dev' ? `${repo}/commits/dev` : `${repo}/releases`;
}

/** A newer image is out when the registry's digest is none of ours. */
export function isNewer(remote: string | null, local: string[]): boolean {
  return !!remote && local.length > 0 && !local.includes(remote);
}

/** What one check found, given the registry's answer and the running image's digests. */
export function verdict(remote: { digest: string } | { reason: string }, local: string[], at = Date.now()): import('../shared/types.ts').SelfCheck {
  if ('reason' in remote) return { at, state: 'unknown', reason: remote.reason };
  if (!local.length) return { at, state: 'unknown', reason: 'This image was built here, so there is nothing to compare.' };
  return { at, state: isNewer(remote.digest, local) ? 'newer' : 'current' };
}
