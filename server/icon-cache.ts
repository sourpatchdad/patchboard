// App icons by name ("plex.png", "sonarr") come from the dashboard-icons
// set. Patchboard fetches each one once, keeps it in the data folder and
// serves it itself, so the browser never calls a CDN and a known icon
// still shows when the internet is down.

import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CDN = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons';
const MIME = { png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp' } as const;
export type IconKind = keyof typeof MIME;
/** A dashboard-icons file name: lowercase words joined by - . or _, never a path. */
const NAME = /^[a-z0-9]+([._-][a-z0-9]+)*$/;
const MAX_BYTES = 512 * 1024;
/** Re-fetched after a month, in case the set redrew it; the old copy serves meanwhile. */
const FRESH_MS = 30 * 24 * 3600_000;
/** A name the set doesn't have isn't asked for again for an hour. */
const MISS_MS = 3600_000;

export interface IconFile {
  body: Buffer<ArrayBuffer>;
  type: string;
}

export function iconCache(dir: string, cdn = CDN, timeoutMs = 10_000) {
  const misses = new Map<string, number>();
  const pending = new Map<string, Promise<Buffer<ArrayBuffer> | null>>();

  async function download(kind: IconKind, file: string): Promise<Buffer<ArrayBuffer> | null> {
    try {
      const res = await fetch(`${cdn}/${kind}/${file}`, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return null;
      const body = Buffer.from(await res.arrayBuffer());
      if (!body.length || body.length > MAX_BYTES) return null;
      try {
        mkdirSync(join(dir, kind), { recursive: true });
        const tmp = join(dir, kind, `.${file}.${process.pid}.tmp`);
        writeFileSync(tmp, body);
        renameSync(tmp, join(dir, kind, file));
      } catch {
        // A read-only data folder still gets the icon, just not a saved copy.
      }
      return body;
    } catch {
      return null;
    }
  }

  /** One download per icon at a time, however many tiles ask at once. */
  function fetchOnce(kind: IconKind, file: string): Promise<Buffer<ArrayBuffer> | null> {
    const key = `${kind}/${file}`;
    let p = pending.get(key);
    if (!p) {
      p = download(kind, file).finally(() => pending.delete(key));
      pending.set(key, p);
    }
    return p;
  }

  return {
    async get(kind: string, file: string, now = Date.now()): Promise<IconFile | null> {
      if (!(kind in MIME)) return null;
      const k = kind as IconKind;
      const base = file.endsWith(`.${k}`) ? file.slice(0, -(k.length + 1)) : '';
      if (!NAME.test(base) || base.length > 100) return null;
      const key = `${k}/${file}`;
      const type = MIME[k];
      try {
        const path = join(dir, k, file);
        const age = now - statSync(path).mtimeMs;
        const body = readFileSync(path);
        if (age > FRESH_MS) void fetchOnce(k, file);
        return { body, type };
      } catch {
        // Not saved yet.
      }
      if ((misses.get(key) ?? 0) > now) return null;
      const body = await fetchOnce(k, file);
      if (!body) {
        misses.set(key, now + MISS_MS);
        return null;
      }
      return { body, type };
    },
  };
}
