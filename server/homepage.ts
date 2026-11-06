// Read a Homepage (gethomepage.dev) services.yaml and bookmarks.yaml into a
// Patchboard catalog. Names, links, icons, descriptions and container names
// come along. Widget blocks hold API keys, so they stay behind: only their
// types are kept, to say which integrations are worth connecting.

import { parse } from 'yaml';
import { INTEGRATIONS } from '../shared/integrations.ts';
import type { Bookmark, Catalog, Service } from '../shared/types.ts';

type Entry = Record<string, unknown>;

/** Homepage widget types whose Patchboard integration has another id. */
const ALIAS: Record<string, string> = {
  plex: 'tautulli',
  qbittorrent: 'qbit',
  paperlessngx: 'paperless',
  diskstation: 'synology',
  jellyseerr: 'overseerr',
  forgejo: 'gitea',
  ical: 'calendar',
};

export interface HomepageImport {
  catalog: Catalog;
  /** Integrations the widget blocks point at, by Patchboard id. */
  integrations: string[];
}

function read(text: string, file: string): unknown {
  try {
    return parse(text) ?? [];
  } catch (e) {
    throw new Error(`${file} isn't valid YAML: ${(e as Error).message.split('\n')[0]}`);
  }
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export function fromHomepage(servicesYaml: string, bookmarksYaml = ''): HomepageImport {
  const services = read(servicesYaml, 'services.yaml');
  if (!Array.isArray(services)) throw new Error('services.yaml should be a list of groups, the way Homepage writes it.');
  const catalog: Catalog = { groups: [], dock: [] };
  const types = new Set<string>();

  // A group holds services, and Homepage lets a group nest further groups.
  const walk = (name: string, entries: unknown) => {
    const list: Service[] = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!entry || typeof entry !== 'object') continue;
      for (const [key, value] of Object.entries(entry as Entry)) {
        if (Array.isArray(value)) {
          walk(key, value);
          continue;
        }
        const svc = (value ?? {}) as Entry;
        const s: Service = { name: key };
        if (str(svc.href)) s.href = str(svc.href);
        if (str(svc.icon)) s.icon = str(svc.icon);
        if (str(svc.description)) s.description = str(svc.description);
        if (str(svc.container)) s.container = str(svc.container);
        const widgets = [svc.widget, ...(Array.isArray(svc.widgets) ? svc.widgets : [])];
        for (const w of widgets) if (w && typeof w === 'object' && str((w as Entry).type)) types.add(str((w as Entry).type)!.toLowerCase());
        list.push(s);
      }
    }
    if (list.length) catalog.groups.push({ name, services: list });
  };
  for (const group of services) if (group && typeof group === 'object') for (const [name, entries] of Object.entries(group as Entry)) walk(name, entries);

  // Every bookmark group becomes links; Patchboard keeps one list of them.
  const bookmarks = bookmarksYaml.trim() ? read(bookmarksYaml, 'bookmarks.yaml') : [];
  for (const group of Array.isArray(bookmarks) ? bookmarks : []) {
    if (!group || typeof group !== 'object') continue;
    for (const entries of Object.values(group as Entry)) {
      for (const entry of Array.isArray(entries) ? entries : []) {
        if (!entry || typeof entry !== 'object') continue;
        for (const [name, value] of Object.entries(entry as Entry)) {
          const bm = (Array.isArray(value) ? value[0] : value) as Entry | undefined;
          const href = str(bm?.href);
          if (!href || catalog.dock.some((b) => b.name === name)) continue;
          const b: Bookmark = { name, href };
          if (str(bm?.icon)) b.icon = str(bm?.icon);
          catalog.dock.push(b);
        }
      }
    }
  }

  const known = new Set(INTEGRATIONS.map((i) => i.id));
  const integrations = [...new Set([...types].map((t) => ALIAS[t] ?? t).filter((id) => known.has(id)))];
  return { catalog, integrations };
}
