// Convert a Homepage (gethomepage.dev) config into a Patchboard catalog.
//
//   node scripts/import-homepage.ts <homepage-config-dir> [out=config/services.yaml]
//
// Only names, links, icons, descriptions and container names are copied.
// Widget blocks (where Homepage keeps API keys and passwords) are dropped on
// purpose: Patchboard reads credentials from the environment instead.
// The first bookmark group becomes the dock; the rest are ignored.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import type { Bookmark, Catalog, Service } from '../shared/types.ts';

type HpEntry = Record<string, Record<string, unknown>>;
type HpGroup = Record<string, HpEntry[]>;

const [dir, out = 'config/services.yaml'] = process.argv.slice(2);
if (!dir) {
  console.error('usage: node scripts/import-homepage.ts <homepage-config-dir> [out]');
  process.exit(1);
}

const services = (parse(readFileSync(join(dir, 'services.yaml'), 'utf8')) ?? []) as HpGroup[];
let bookmarks: HpGroup[] = [];
try {
  bookmarks = (parse(readFileSync(join(dir, 'bookmarks.yaml'), 'utf8')) ?? []) as HpGroup[];
} catch {
  /* optional */
}

const catalog: Catalog = { groups: [], dock: [] };

for (const group of services) {
  for (const [name, entries] of Object.entries(group)) {
    const list: Service[] = [];
    for (const entry of entries ?? []) {
      for (const [svcName, svc] of Object.entries(entry)) {
        const s: Service = { name: svcName };
        if (typeof svc.href === 'string') s.href = svc.href;
        if (typeof svc.icon === 'string') s.icon = svc.icon;
        if (typeof svc.description === 'string') s.description = svc.description;
        if (typeof svc.container === 'string') s.container = svc.container;
        list.push(s);
      }
    }
    if (list.length) catalog.groups.push({ name, services: list });
  }
}

const dockGroup = bookmarks[0];
if (dockGroup) {
  for (const entries of Object.values(dockGroup)) {
    for (const entry of entries ?? []) {
      for (const [bmName, value] of Object.entries(entry)) {
        const bm = (Array.isArray(value) ? value[0] : value) as Record<string, unknown>;
        if (typeof bm?.href !== 'string') continue;
        const b: Bookmark = { name: bmName, href: bm.href };
        if (typeof bm.icon === 'string') b.icon = bm.icon;
        catalog.dock.push(b);
      }
    }
  }
}

const header = `# Patchboard service catalog, imported from Homepage on ${new Date().toISOString().slice(0, 10)}.
# No secrets belong here; credentials come from the environment (.env).
# Per service: name, href, icon, container, description, expectStopped.
# Set expectStopped: true on one-shot containers so their exit isn't an alert.
`;
writeFileSync(out, header + stringify(catalog, { lineWidth: 0 }));
const n = catalog.groups.reduce((sum, g) => sum + g.services.length, 0);
console.log(`wrote ${out}: ${catalog.groups.length} groups, ${n} services, ${catalog.dock.length} dock bookmarks`);
