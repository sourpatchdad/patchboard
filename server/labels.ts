// Docker labels as a catalog source. A container can register itself by
// carrying labels in its own compose file, so the entry travels with the app:
//
//   labels:
//     patchboard.name: Sonarr
//     patchboard.group: Media
//     patchboard.href: http://192.168.1.10:8989
//     patchboard.icon: sonarr.png
//
// Homepage's labels (homepage.name, homepage.group, homepage.href,
// homepage.icon, homepage.description) are read too, so a stack already set
// up for Homepage shows up here unchanged. patchboard.* wins where both exist.
// Widget credentials in homepage.widget.* labels are never read.

import type { Catalog, Container, Service } from '../shared/types.ts';

/** Only these keys are kept from a container's labels; nothing else reaches the browser. */
export const LABEL_KEYS = ['name', 'group', 'href', 'icon', 'description', 'expect-stopped', 'check', 'order'];

export function pickLabels(all: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!all) return undefined;
  const out: Record<string, string> = {};
  for (const prefix of ['homepage', 'patchboard']) {
    for (const k of LABEL_KEYS) {
      const v = all[`${prefix}.${k}`];
      if (v !== undefined && v !== '') out[k] = v;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

const DEFAULT_GROUP = 'Discovered';

/** Services described by labels, for containers the YAML catalog doesn't already cover. */
export function servicesFromLabels(containers: Container[], covered: Set<string>): { group: string; order: number; service: Service }[] {
  const out: { group: string; order: number; service: Service }[] = [];
  for (const c of containers) {
    const l = c.labels;
    if (!l?.name || covered.has(c.name)) continue;
    const check = l.check === 'false' ? false : l.check === 'true' ? true : l.check || undefined;
    out.push({
      group: l.group || DEFAULT_GROUP,
      order: Number(l.order ?? 1000) || 1000,
      service: {
        name: l.name,
        href: l.href,
        icon: l.icon,
        description: l.description,
        container: c.name,
        expectStopped: l['expect-stopped'] === 'true' || undefined,
        check,
        source: 'labels',
      },
    });
  }
  return out;
}

/**
 * The YAML catalog plus label-registered services. Labelled services join a
 * YAML group of the same name (case-insensitive) or form new groups after
 * the YAML ones, ordered by patchboard.order and then name.
 */
export function mergeCatalog(yaml: Catalog, containers: Container[]): Catalog {
  const covered = new Set(yaml.groups.flatMap((g) => g.services.map((s) => s.container)).filter((x): x is string => !!x));
  const extra = servicesFromLabels(containers, covered);
  if (!extra.length) return yaml;
  const groups = yaml.groups.map((g) => ({ ...g, services: [...g.services] }));
  extra.sort((a, b) => a.order - b.order || a.service.name.localeCompare(b.service.name));
  for (const e of extra) {
    let g = groups.find((x) => x.name.toLowerCase() === e.group.toLowerCase());
    if (!g) {
      g = { name: e.group, services: [] };
      groups.push(g);
    }
    g.services.push(e.service);
  }
  return { ...yaml, groups };
}
