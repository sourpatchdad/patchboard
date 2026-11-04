// Image updates, as reported by Diun's webhook notifier. Diun checks registries
// on its own schedule and POSTs one notice per image with a new digest. Each
// notice is matched to the containers running that image and remembered with
// the image id they ran at the time; once a container runs a different image
// id, the update was applied and the flag clears by itself.

import type { Container, ImageUpdate } from '../shared/types.ts';
import { kvGet, kvSet } from './db.ts';

interface Stored extends ImageUpdate {
  /** Image id the container had when the notice arrived. */
  imageIdAtNotice?: string;
}

const KEY = 'image-updates';

/** "docker.io/library/postgres:16" and "postgres:16" are the same image. */
export function normalizeImage(ref: string): string {
  let r = ref.trim().toLowerCase().replace(/@sha256:[a-f0-9]+$/, '');
  r = r.replace(/^(docker\.io|index\.docker\.io|registry-1\.docker\.io)\//, '').replace(/^library\//, '');
  if (!/:[^/]+$/.test(r)) r += ':latest';
  return r;
}

export interface DiunNotice {
  status?: string;
  image?: string;
  hub_link?: string;
  created?: string;
  metadata?: Record<string, string>;
}

/** Record a Diun notice against matching containers. Returns the names flagged. */
export function recordDiunNotice(n: DiunNotice, containers: Container[]): string[] {
  if (!n.image || (n.status && !['new', 'update'].includes(n.status))) return [];
  const want = normalizeImage(n.image);
  const named = (n.metadata?.ctn_names ?? '').split(/[,\s]+/).filter(Boolean);
  const matches = containers.filter((c) => named.includes(c.name) || normalizeImage(c.image) === want);
  // A "new" notice for an image Diun has just started watching isn't news.
  if (n.status === 'new') return [];
  const all = kvGet<Record<string, Stored>>(KEY) ?? {};
  for (const c of matches) {
    all[c.name] = { image: c.image, at: Date.now(), link: n.hub_link || undefined, imageIdAtNotice: c.imageId };
  }
  kvSet(KEY, all);
  return matches.map((c) => c.name);
}

/** Drop flags whose container now runs a different image, or no longer exists. Returns true if anything changed. */
export function settleUpdates(containers: Container[]): boolean {
  const all = kvGet<Record<string, Stored>>(KEY) ?? {};
  const byName = new Map(containers.map((c) => [c.name, c]));
  let changed = false;
  for (const [name, u] of Object.entries(all)) {
    const c = byName.get(name);
    if (!c || (u.imageIdAtNotice && c.imageId && c.imageId !== u.imageIdAtNotice)) {
      delete all[name];
      changed = true;
    }
  }
  if (changed) kvSet(KEY, all);
  return changed;
}

export function pendingUpdates(): Record<string, ImageUpdate> {
  const all = kvGet<Record<string, Stored>>(KEY) ?? {};
  return Object.fromEntries(Object.entries(all).map(([k, { imageIdAtNotice: _drop, ...u }]) => [k, u]));
}
