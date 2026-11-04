// How apps are arranged when someone edits them in the UI: group order and
// names, which app sits where, what's hidden, icon overrides, and apps added
// without touching services.yaml. Stored on the server and applied to the
// catalog there, so the Apps page, Home and the command palette all agree.
// Anything the layout doesn't mention (an app added to services.yaml later)
// lands in its catalog group, after the arranged ones, so nothing disappears.

import { type JsonWidgetConfig, validateJsonConfig } from './jsonwidget.ts';
import type { Bookmark, Catalog, Service } from './types.ts';

/** An app created in the UI rather than in services.yaml or labels. */
export interface AddedApp {
  name: string;
  group: string;
  href?: string;
  icon?: string;
  container?: string;
  description?: string;
}

export interface AppOrder {
  /** Group names, in order. May include groups the catalog doesn't have. */
  groups: string[];
  /** Group name -> app names in it, in order. An app listed here moves here. */
  apps: Record<string, string[]>;
  /** Catalog group name -> the name it was given, for apps not listed above. */
  renamed?: Record<string, string>;
  /** App and bookmark names not shown anywhere. */
  hidden?: string[];
  /** App or bookmark name -> icon (a dashboard-icons name, a URL, or an uploaded /api/icons/ file). */
  icons?: Record<string, string>;
  /** Apps added in the UI. */
  added?: AddedApp[];
  /** App name -> where its live number comes from. */
  stats?: Record<string, JsonWidgetConfig>;
}

const NAME_MAX = 120;
const isName = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= NAME_MAX;
const ICON = /^(https?:\/\/[^\s"'<>]{1,400}|\/api\/icons\/[a-f0-9]{16}\.(png|jpg|webp|svg|gif|ico)|[a-z0-9][a-z0-9._-]{0,80})$/i;
const CONTAINER = /^[\w.-]{1,128}$/;
const isUrl = (s: unknown) => {
  if (typeof s !== 'string' || s.length > 500) return false;
  try {
    return ['http:', 'https:'].includes(new URL(s).protocol);
  } catch {
    return false;
  }
};

/** A clean layout from untrusted input, or an error message. */
export function validateOrder(input: unknown): { order: AppOrder } | { error: string } {
  const raw = input as Record<string, unknown> | null;
  const isMap = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
  if (!raw || !Array.isArray(raw.groups) || !isMap(raw.apps)) return { error: 'Expected { groups: [...], apps: { group: [...] } }' };
  if (raw.groups.length > 100 || !raw.groups.every(isName)) return { error: 'Bad group list' };
  const entries = Object.entries(raw.apps);
  if (entries.length > 100) return { error: 'Too many groups' };
  const apps: Record<string, string[]> = {};
  for (const [g, list] of entries) {
    if (!isName(g) || !Array.isArray(list) || list.length > 300 || !list.every(isName)) return { error: `Bad app list for ${g.slice(0, 40)}` };
    apps[g] = [...new Set(list)];
  }
  const order: AppOrder = { groups: [...new Set((raw.groups as string[]).map((g) => g.trim()))], apps };

  if (raw.renamed !== undefined) {
    if (!isMap(raw.renamed)) return { error: 'Bad renamed map' };
    const r = Object.entries(raw.renamed);
    if (r.length > 100 || !r.every(([k, v]) => isName(k) && isName(v))) return { error: 'Bad renamed map' };
    if (r.length) order.renamed = Object.fromEntries(r as [string, string][]);
  }
  if (raw.hidden !== undefined) {
    if (!Array.isArray(raw.hidden) || raw.hidden.length > 500 || !raw.hidden.every(isName)) return { error: 'Bad hidden list' };
    if (raw.hidden.length) order.hidden = [...new Set(raw.hidden as string[])];
  }
  if (raw.icons !== undefined) {
    if (!isMap(raw.icons)) return { error: 'Bad icons map' };
    const r = Object.entries(raw.icons);
    if (r.length > 500 || !r.every(([k, v]) => isName(k) && typeof v === 'string' && ICON.test(v))) return { error: 'An icon must be a dashboard-icons name, an http(s) URL or an uploaded icon' };
    if (r.length) order.icons = Object.fromEntries(r as [string, string][]);
  }
  if (raw.added !== undefined) {
    if (!Array.isArray(raw.added) || raw.added.length > 300) return { error: 'Bad added apps' };
    const added: AddedApp[] = [];
    const seen = new Set<string>();
    for (const a of raw.added as Record<string, unknown>[]) {
      if (!isMap(a) || !isName(a.name) || !isName(a.group)) return { error: 'Each added app needs a name and a group' };
      if (seen.has(a.name)) return { error: `Two apps are called ${a.name}` };
      seen.add(a.name);
      if (a.href != null && a.href !== '' && !isUrl(a.href)) return { error: `${a.name}: the link must start with http:// or https://` };
      if (a.icon != null && a.icon !== '' && !(typeof a.icon === 'string' && ICON.test(a.icon))) return { error: `${a.name}: bad icon` };
      if (a.container != null && a.container !== '' && !(typeof a.container === 'string' && CONTAINER.test(a.container))) return { error: `${a.name}: bad container name` };
      if (a.description != null && (typeof a.description !== 'string' || a.description.length > 200)) return { error: `${a.name}: description too long` };
      added.push({
        name: a.name.trim(),
        group: a.group.trim(),
        ...(a.href ? { href: a.href as string } : {}),
        ...(a.icon ? { icon: a.icon as string } : {}),
        ...(a.container ? { container: a.container as string } : {}),
        ...(a.description ? { description: a.description as string } : {}),
      });
    }
    if (added.length) order.added = added;
  }
  if (raw.stats !== undefined) {
    if (!isMap(raw.stats) || Object.keys(raw.stats).length > 200) return { error: 'Bad live numbers' };
    const stats: Record<string, JsonWidgetConfig> = {};
    for (const [name, cfg] of Object.entries(raw.stats)) {
      if (!isName(name)) return { error: 'Bad live number' };
      const v = validateJsonConfig(cfg);
      if ('error' in v) return { error: `${name}: ${v.error}` };
      stats[name] = { ...v.config, fields: v.config.fields.slice(0, 1) };
    }
    if (Object.keys(stats).length) order.stats = stats;
  }
  return { order };
}

/** The catalog arranged: groups in order, renamed, apps placed, hidden ones set aside. */
export function applyOrder(cat: Catalog, order: AppOrder | null | undefined): Catalog {
  if (!order) return cat;
  const icon = <T extends { name: string; icon?: string }>(x: T): T => (order.icons?.[x.name] ? { ...x, icon: order.icons[x.name] } : x);
  const hidden = new Set(order.hidden ?? []);

  // The catalog plus apps added in the UI (names already in the catalog win).
  const known = new Set(cat.groups.flatMap((g) => g.services.map((s) => s.name)));
  const base: Catalog['groups'] = cat.groups.map((g) => ({ ...g, services: [...g.services] }));
  for (const a of order.added ?? []) {
    if (known.has(a.name)) continue;
    known.add(a.name);
    const { group, ...rest } = a;
    const svc: Service = { ...rest, source: 'ui' };
    let g = base.find((x) => x.name === group);
    if (!g) base.push((g = { name: group, services: [] }));
    g.services.push(svc);
  }

  const hiddenApps: { group: string; service: Service }[] = [];
  const byName = new Map<string, Service>();
  for (const g of base) {
    for (const s of g.services) {
      if (hidden.has(s.name)) hiddenApps.push({ group: order.renamed?.[g.name] ?? g.name, service: icon(s) });
      else byName.set(s.name, icon(s));
    }
  }

  const placed = new Set<string>();
  const out = new Map<string, Service[]>();
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
  for (const g of base) {
    const target = order.renamed?.[g.name] ?? g.name;
    for (const s of g.services) {
      if (placed.has(s.name) || !byName.has(s.name)) continue;
      placed.add(s.name);
      if (!out.has(target)) out.set(target, []);
      out.get(target)!.push(byName.get(s.name)!);
    }
  }
  const groups = [...out].filter(([, services]) => services.length > 0).map(([name, services]) => ({ name, services }));
  const dock: Bookmark[] = cat.dock.filter((b) => !hidden.has(b.name)).map(icon);
  const hiddenDock = cat.dock.filter((b) => hidden.has(b.name)).map(icon);
  return {
    ...cat,
    groups,
    dock,
    ordered: true,
    renamed: order.renamed,
    hiddenApps,
    hiddenDock,
    iconOverrides: order.icons,
    statApps: order.stats ? Object.keys(order.stats) : undefined,
  };
}

/**
 * The group part of a layout, from the groups being edited. Groups carry the
 * name they had when editing began (from); a changed name is recorded so apps
 * added to that catalog group later follow it. Earlier renames carry forward.
 */
export function orderOf(groups: (Catalog['groups'][number] & { from?: string })[], prev?: Record<string, string>): AppOrder {
  const renamed: Record<string, string> = {};
  const now = new Map(groups.filter((g) => g.from && g.from !== g.name).map((g) => [g.from!, g.name]));
  for (const [orig, was] of Object.entries(prev ?? {})) renamed[orig] = now.get(was) ?? was;
  for (const [from, to] of now) if (!Object.values(prev ?? {}).includes(from)) renamed[from] = to;
  for (const [k, v] of Object.entries(renamed)) if (k === v) delete renamed[k];
  return {
    groups: groups.map((g) => g.name),
    apps: Object.fromEntries(groups.map((g) => [g.name, g.services.map((s) => s.name)])),
    ...(Object.keys(renamed).length ? { renamed } : {}),
  };
}
