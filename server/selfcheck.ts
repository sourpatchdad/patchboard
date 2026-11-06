// Patchboard watches its own image, so a new release shows up without Diun.
// It asks the registry what digest its tag (edge, latest, 1) points at now and
// compares that with the image it runs. Public images need no login on GitHub's
// registry or Docker Hub; a private one simply never reports anything.

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

/** The digest the registry serves for this tag now, or null if it won't say. */
export async function remoteDigest(ref: string): Promise<string | null> {
  const r = parseRef(ref);
  if (!r) return null;
  try {
    const tok = (await (await request(TOKEN_URL[r.registry](r.repo))).json()) as { token?: string };
    if (!tok.token) return null;
    const res = await request(`https://${r.registry}/v2/${r.repo}/manifests/${r.tag}`, {
      method: 'HEAD',
      headers: { Authorization: `Bearer ${tok.token}`, Accept: ACCEPT },
    });
    return res.headers.get('docker-content-digest');
  } catch {
    return null;
  }
}

/** The running image's digests, as Docker recorded them when it was pulled. */
export function localDigests(repoDigests: string[] | undefined): string[] {
  return (repoDigests ?? []).map((d) => d.split('@')[1]).filter((d): d is string => !!d);
}

/** A newer image is out when the registry's digest is none of ours. */
export function isNewer(remote: string | null, local: string[]): boolean {
  return !!remote && local.length > 0 && !local.includes(remote);
}
