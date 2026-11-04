// How apps are arranged when someone rearranges them in the UI: group order,
// group names, and which app sits in which group. Stored on the server and
// applied to the catalog there, so the Apps page, Home and the command palette
// all agree. Anything the arrangement doesn't mention (an app added to
// services.yaml later) lands in its catalog group, after the arranged ones,
// so nothing ever disappears.

import type { Catalog } from './types.ts';

export interface AppOrder {
  /** Group names, in order. May include groups the catalog doesn't have. */
  groups: string[];
  /** Group name -> app names in it, in order. An app listed here moves here. */
  apps: Record<string, string[]>;
  /** Catalog group name -> the name it was given, for apps not listed above. */
  renamed?: Record<string, string>;
}

const NAME_MAX = 120;
const isName = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= NAME_MAX;

/** A clean order from untrusted input, or an error message. */
export function validateOrder(input: unknown): { order: AppOrder } | { error: string } {
  const raw = input as { groups?: unknown; apps?: unknown; renamed?: unknown } | null;
  const isMap = (x: unknown) => typeof x === 'object' && x !== null && !Array.isArray(x);
  if (!raw || !Array.isArray(raw.groups) || !isMap(raw.apps)) return { error: 'Expected { groups: [...], apps: { group: [...] } }' };
  if (raw.groups.length > 100 || !raw.groups.every(isName)) return { error: 'Bad group list' };
  const entries = Object.entries(raw.apps as Record<string, unknown>);
  if (entries.length > 100) return { error: 'Too many groups' };
  const apps: Record<string, string[]> = {};
  for (const [g, list] of entries) {
    if (!isName(g) || !Array.isArray(list) || list.length > 300 || !list.every(isName)) return { error: `Bad app list for ${g.slice(0, 40)}` };
    apps[g] = [...new Set(list)];
  }
  let renamed: Record<string, string> | undefined;
  if (raw.renamed !== undefined) {
    if (!isMap(raw.renamed)) return { error: 'Bad renamed map' };
    const r = Object.entries(raw.renamed as Record<string, unknown>);
    if (r.length > 100 || !r.every(([k, v]) => isName(k) && isName(v))) return { error: 'Bad renamed map' };
    if (r.length) renamed = Object.fromEntries(r as [string, string][]);
  }
  return { order: { groups: [...new Set(raw.groups.map((g) => g.trim()))], apps, ...(renamed ? { renamed } : {}) } };
}

/** The catalog arranged: groups in order, renamed, apps placed where they were put. */
export function applyOrder(cat: Catalog, order: AppOrder | null | undefined): Catalog {
  if (!order) return cat;
  const byName = new Map(cat.groups.flatMap((g) => g.services.map((s) => [s.name, s] as const)));
  const placed = new Set<string>();
  const out = new Map<string, Catalog['groups'][number]['services']>();
  // Listed groups first, then any group that only has an app list.
  const named = [...order.groups, ...Object.keys(order.apps).filter((g) => !order.groups.includes(g))];
  for (const g of named) {
    const list = (order.apps[g] ?? []).filter((n) => byName.has(n) && !placed.has(n));
    list.forEach((n) => placed.add(n));
    out.set(
      g,
      list.map((n) => byName.get(n)!),
    );
  }
  // Everything not placed stays in its catalog group (under its new name).
  for (const g of cat.groups) {
    const target = order.renamed?.[g.name] ?? g.name;
    for (const s of g.services) {
      if (placed.has(s.name)) continue;
      placed.add(s.name);
      if (!out.has(target)) out.set(target, []);
      out.get(target)!.push(s);
    }
  }
  const groups = [...out].filter(([, services]) => services.length > 0).map(([name, services]) => ({ name, services }));
  return { ...cat, groups, ordered: true, renamed: order.renamed };
}

/**
 * The order to save after a rearrange. Groups carry the name they had when
 * arranging began (from); a changed name is recorded so apps added to that
 * catalog group later follow it. Earlier renames carry forward.
 */
export function orderOf(groups: (Catalog['groups'][number] & { from?: string })[], prev?: Record<string, string>): AppOrder {
  const renamed: Record<string, string> = {};
  const now = new Map(groups.filter((g) => g.from && g.from !== g.name).map((g) => [g.from!, g.name]));
  // Earlier renames: catalog name -> what it was called when arranging began -> maybe renamed again.
  for (const [orig, was] of Object.entries(prev ?? {})) renamed[orig] = now.get(was) ?? was;
  for (const [from, to] of now) if (!Object.values(prev ?? {}).includes(from)) renamed[from] = to;
  for (const [k, v] of Object.entries(renamed)) if (k === v) delete renamed[k];
  return {
    groups: groups.map((g) => g.name),
    apps: Object.fromEntries(groups.map((g) => [g.name, g.services.map((s) => s.name)])),
    ...(Object.keys(renamed).length ? { renamed } : {}),
  };
}
