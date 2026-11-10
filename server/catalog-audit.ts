// Catalog audit: compare config/services.yaml with what Docker is running.
//
// - Problems: entries naming a container that doesn't exist.
// - Discovered: running containers no entry covers, minus the plumbing
//   (anything another container depends on, well-known database and cache
//   images, and one-off `docker compose run` jobs). For each, a drafted entry: a name and icon guessed from
//   the image, and a link from its published port.

import type { Catalog, CatalogAudit, Container, ContainerDetail, DiscoveredService } from '../shared/types.ts';

const PLUMBING = /(^|[/-])(postgres|postgis|timescaledb|mariadb|mysql|mongo|mongodb|redis|valkey|memcached|rabbitmq|minio)([-:@]|$)/i;
const PLUMBING_NAME = /-(db|redis|postgres|cache|worker|scheduler|machine-learning|ml)(-\d+)?$/i;

/** Pretty names for images whose repository name isn't the product name. */
const KNOWN: Record<string, [string, string]> = {
  'pms-docker': ['Plex', 'plex'],
  'immich-server': ['Immich', 'immich'],
  seerr: ['Seerr', 'jellyseerr'],
  'static-file-server': ['File server', 'docker'],
  server: ['Server', 'docker'],
  homepage: ['Homepage', 'homepage'],
  jellyfin: ['Jellyfin', 'jellyfin'],
  'home-assistant': ['Home Assistant', 'home-assistant'],
  cloudflared: ['Cloudflared', 'cloudflare'],
  adguardhome: ['AdGuard Home', 'adguard-home'],
  'portainer-ce': ['Portainer', 'portainer'],
  'paperless-ngx': ['Paperless-ngx', 'paperless-ngx'],
  sabnzbd: ['SABnzbd', 'sabnzbd'],
};

/** Patchboard itself: already open, so never offered as an app to add. */
const SELF = /(^|\/)sourpatchdad\/patchboard([:@]|$)/;

const ACRONYMS = new Set(['api', 'ui', 'ai', 'db', 'dns', 'vpn', 'nas', 'ha', 'mqtt', 'rss', 'ssh', 'ftp', 'smb', 'nfs', 'iot']);

function titleCase(s: string): string {
  return s
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** "lscr.io/linuxserver/sonarr:latest" -> ["Sonarr", "sonarr"]. */
export function guessFromImage(image: string, containerName: string): { name: string; icon: string } {
  const repo = image.replace(/@sha256:.*/, '').replace(/:[^/]+$/, '').split('/').pop() ?? image;
  // Locally built images are named project-service; the container name reads better.
  const base = /^[a-z0-9]+(-[a-z0-9]+)+$/.test(repo) && !image.includes('/') ? containerName : repo;
  const known = KNOWN[base] ?? KNOWN[repo];
  if (known) return { name: known[0], icon: `${known[1]}.png` };
  return { name: titleCase(base.replace(/-web$|-frontend$|-app$/, '')), icon: `${base.replace(/-web$|-frontend$/, '')}.png` };
}

export function auditCatalog(
  catalog: Catalog,
  containers: Container[],
  ports: (name: string) => ContainerDetail['ports'] | undefined,
  hostGuess: string,
): CatalogAudit {
  const services = catalog.groups.flatMap((g) => g.services);
  const named = new Set(services.map((s) => s.container).filter(Boolean));
  const byName = new Map(containers.map((c) => [c.name, c]));
  const dependedOn = new Set(containers.flatMap((c) => c.dependsOn ?? []));

  const missing = services
    .filter((s) => s.container && !byName.has(s.container))
    .map((s) => ({ service: s.name, container: s.container! }));

  const discovered: DiscoveredService[] = [];
  for (const c of containers) {
    if (named.has(c.name) || c.state !== 'running' || c.oneoff || SELF.test(c.image)) continue;
    if (dependedOn.has(c.name) || PLUMBING.test(c.image) || PLUMBING_NAME.test(c.name)) continue;
    const g = guessFromImage(c.image, c.name);
    const p = (ports(c.name) ?? []).find((x) => x.host && /\/tcp$/.test(x.container));
    let href: string | undefined;
    if (p?.host) {
      const first = p.host.split(',')[0].trim();
      const [ip, port] = first.includes(':') ? first.split(':') : [hostGuess, first];
      href = `http://${ip || hostGuess}:${port}`;
    }
    discovered.push({ container: c.name, project: c.project, name: g.name, icon: g.icon, href });
  }
  discovered.sort((a, b) => a.name.localeCompare(b.name));
  return { missing, discovered };
}

/**
 * The host from a request's Host header, without its port: what links to the
 * server's other apps should use. localhost when there's nothing better.
 */
export function visitorHost(header: string | undefined): string {
  const h = (header ?? '').trim().toLowerCase();
  const host = h.startsWith('[') ? h.slice(0, h.indexOf(']') + 1) : h.split(':')[0];
  return /^[a-z0-9.\-\[\]:]+$/.test(host) && host ? host : 'localhost';
}

/** A YAML snippet to paste under a group's `services:`. */
export function draftYaml(list: DiscoveredService[]): string {
  return list
    .map((d) =>
      [`      - name: ${d.name}`, d.href ? `        href: ${d.href}` : null, `        icon: ${d.icon}`, `        container: ${d.container}`].filter(Boolean).join('\n'),
    )
    .join('\n');
}
