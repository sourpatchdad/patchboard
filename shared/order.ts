// The order apps appear in, when someone rearranges them in the UI. Stored on
// the server and applied to the catalog there, so the Apps page, Home and the
// command palette all agree. Names that aren't in the order keep their catalog
// position after the ordered ones, so new apps never disappear.

import type { Catalog } from './types.ts';

export interface AppOrder {
  groups: string[];
  /** Group name -> app names in that group, in order. */
  apps: Record<string, string[]>;
}

const NAME_MAX = 120;
const isName = (s: unknown): s is string => typeof s === 'string' && s.length > 0 && s.length <= NAME_MAX;

/** A clean order from untrusted input, or an error message. */
export function validateOrder(input: unknown): { order: AppOrder } | { error: string } {
  const raw = input as { groups?: unknown; apps?: unknown } | null;
  if (!raw || !Array.isArray(raw.groups) || typeof raw.apps !== 'object' || raw.apps === null || Array.isArray(raw.apps)) {
    return { error: 'Expected { groups: [...], apps: { group: [...] } }' };
  }
  if (raw.groups.length > 100 || !raw.groups.every(isName)) return { error: 'Bad group list' };
  const entries = Object.entries(raw.apps as Record<string, unknown>);
  if (entries.length > 100) return { error: 'Too many groups' };
  const apps: Record<string, string[]> = {};
  for (const [g, list] of entries) {
    if (!isName(g) || !Array.isArray(list) || list.length > 300 || !list.every(isName)) return { error: `Bad app list for ${g.slice(0, 40)}` };
    apps[g] = [...new Set(list)];
  }
  return { order: { groups: [...new Set(raw.groups)], apps } };
}

const LAST = 1e9;
const rankIn = (list: string[] | undefined, name: string) => {
  const i = list ? list.indexOf(name) : -1;
  return i < 0 ? LAST : i;
};

/** The catalog with groups and apps in the saved order. Stable for anything unlisted. */
export function applyOrder(cat: Catalog, order: AppOrder | null | undefined): Catalog {
  if (!order) return cat;
  const groups = cat.groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => rankIn(order.groups, a.g.name) - rankIn(order.groups, b.g.name) || a.i - b.i)
    .map(({ g }) => {
      const o = order.apps[g.name];
      if (!o) return g;
      const services = g.services
        .map((s, i) => ({ s, i }))
        .sort((a, b) => rankIn(o, a.s.name) - rankIn(o, b.s.name) || a.i - b.i)
        .map(({ s }) => s);
      return { ...g, services };
    });
  return { ...cat, groups, ordered: true };
}

/** The order a catalog is currently in, for saving after a rearrange. */
export function orderOf(groups: Catalog['groups']): AppOrder {
  return { groups: groups.map((g) => g.name), apps: Object.fromEntries(groups.map((g) => [g.name, g.services.map((s) => s.name)])) };
}
