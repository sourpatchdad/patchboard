// Turning running containers into apps in one go: the first-run "Add all"
// and anything else that adopts discovered containers. Groups come from the
// compose project ("media" becomes "Media"), so the board starts organized.

import type { AddedApp, AppOrder } from '../../shared/order.ts';
import type { DiscoveredService } from '../../shared/types.ts';

const pretty = (project?: string) =>
  project
    ? project
        .replace(/[-_]+/g, ' ')
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Apps';

/** A layout that adds every discovered container as an app, grouped by stack. */
export function adoptAll(found: DiscoveredService[], existing: AppOrder | null): AppOrder {
  const taken = new Set([...(existing?.added ?? []).map((a) => a.name)]);
  // A stack with one app doesn't need a group of its own: those share "Apps".
  const perStack = new Map<string, number>();
  for (const d of found) perStack.set(d.project ?? '', (perStack.get(d.project ?? '') ?? 0) + 1);
  const groupOf = (d: DiscoveredService) => ((perStack.get(d.project ?? '') ?? 0) > 1 ? pretty(d.project) : 'Apps');
  const added: AddedApp[] = [...(existing?.added ?? [])];
  const adopted = new Set((existing?.added ?? []).map((a) => a.container).filter(Boolean));
  for (const d of found) {
    if (adopted.has(d.container)) continue;
    adopted.add(d.container);
    const name = taken.has(d.name) ? d.container : d.name;
    if (taken.has(name)) continue;
    taken.add(name);
    added.push({ name, group: groupOf(d), container: d.container, ...(d.icon ? { icon: d.icon } : {}), ...(d.href ? { href: d.href } : {}) });
  }
  const groups = [...new Set([...(existing?.groups ?? []), ...added.map((a) => a.group)])];
  const apps: Record<string, string[]> = { ...(existing?.apps ?? {}) };
  for (const a of added) apps[a.group] = [...new Set([...(apps[a.group] ?? []), a.name])];
  return { ...(existing ?? {}), groups, apps, added };
}

export async function saveLayout(layout: AppOrder): Promise<string | null> {
  const res = await fetch('/api/app-order', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Patchboard': 'action' }, body: JSON.stringify(layout) });
  return res.ok ? null : (((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
}
