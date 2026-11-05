// The catalog as the UI shows it, written as a services.yaml: for people who
// keep their catalog in git and want what they arranged in the UI there too.
// Hidden apps and live numbers stay out; services.yaml has no place for them.

import { stringify } from 'yaml';
import type { Catalog, Service } from './types.ts';

const KEEP: (keyof Service)[] = ['name', 'label', 'href', 'icon', 'container', 'description', 'expectStopped', 'check'];

export function catalogYaml(cat: Catalog): string {
  const doc = {
    groups: cat.groups.map((g) => ({
      name: g.name,
      services: g.services.map((s) => Object.fromEntries(KEEP.filter((k) => s[k] !== undefined && s[k] !== '').map((k) => [k, s[k]]))),
    })),
    ...(cat.dock.length ? { dock: cat.dock.map((b) => ({ name: b.name, href: b.href, ...(b.icon ? { icon: b.icon } : {}) })) } : {}),
  };
  return `# Written by Patchboard from the apps as arranged in its UI.\n${stringify(doc, { lineWidth: 0 })}`;
}
