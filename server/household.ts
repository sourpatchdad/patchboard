// Household devices. A link opened once on a family phone or a kitchen
// tablet turns that browser into a viewer: it sees the boards, cameras, the
// Server and Monitor pages (with the Monitor's masked problem lines), reading
// and calendar, can switch the lights and scenes pinned to a board, and
// nothing else. The server refuses every other change from it and every read
// meant for whoever runs the server (logs, settings, keys, activity).
//
// The link is the credential. Patchboard keeps only its hash, and removing a
// device ends it on the next request. A removed device is then treated like
// any other visitor: a sign-in page when sign-in is on, full access when the
// network is the only gate.

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { kvGet, kvSet, recordAudit } from './db.ts';

const COOKIE = 'pb_household';
// Browsers cap cookie lifetimes at 400 days; a family phone shouldn't have to come back for a new link.
const COOKIE_DAYS = 400;
// Last seen is written at most this often, so a board left open doesn't write the database all day.
const SEEN_EVERY = 10 * 60_000;

/** What a device shows, set from Settings: where it opens, and the Monitor's color. */
export interface DeviceView {
  /** A path: /, /b/<board>, /server, /monitor, /upcoming, /reading or /weather. */
  opens?: string;
  tint?: 'gray' | 'blue';
  /** Changes with every save, so the device knows to follow. */
  rev?: number;
}

interface Device extends DeviceView {
  name: string;
  hash: string;
  created: number;
  seen?: number;
}

export interface HouseholdDevice extends DeviceView {
  id: string;
  name: string;
  created: number;
  seen?: number;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const devices = (): Record<string, Device> => kvGet<Record<string, Device>>('household') ?? {};

/** The devices, newest first, without their hashes. */
export function householdDevices(): HouseholdDevice[] {
  return Object.entries(devices())
    .map(([id, d]) => ({ id, name: d.name, created: d.created, seen: d.seen, opens: d.opens, tint: d.tint, rev: d.rev }))
    .sort((a, b) => b.created - a.created);
}

/** A new device. The token comes back once, inside the link; only its hash is kept. */
export function addHouseholdDevice(name: string): { id: string; token: string } | { error: string } {
  const clean = name.replace(/\s+/g, ' ').trim();
  if (!clean) return { error: 'Give the device a name, like "Kitchen tablet".' };
  if (clean.length > 40) return { error: 'Keep the name to 40 characters.' };
  const all = devices();
  if (Object.keys(all).length >= 20) return { error: 'Twenty household devices is the limit. Remove one first.' };
  const id = randomUUID();
  const token = randomBytes(32).toString('base64url');
  all[id] = { name: clean, hash: sha(token), created: Date.now() };
  kvSet('household', all);
  return { id, token };
}

/** Set what a device shows. `opens` is checked by the caller, which knows the boards. */
export function setHouseholdView(id: string, view: { opens?: string | null; tint?: string | null }): DeviceView | null {
  const all = devices();
  const d = all[id];
  if (!d) return null;
  if (view.opens !== undefined) d.opens = view.opens || undefined;
  if (view.tint !== undefined) d.tint = view.tint === 'blue' ? 'blue' : undefined;
  d.rev = Date.now();
  kvSet('household', all);
  return { opens: d.opens, tint: d.tint, rev: d.rev };
}

export function removeHouseholdDevice(id: string): boolean {
  const all = devices();
  if (!all[id]) return false;
  delete all[id];
  kvSet('household', all);
  return true;
}

const found = new WeakMap<Request, ({ id: string; name: string } & DeviceView) | null>();

/** The household device this request comes from, or null. Looked up once per request. */
export function householdOf(c: Context): ({ id: string; name: string } & DeviceView) | null {
  const cached = found.get(c.req.raw);
  if (cached !== undefined) return cached;
  const token = getCookie(c, COOKIE);
  let hit: ({ id: string; name: string } & DeviceView) | null = null;
  if (token) {
    const hash = sha(token);
    const all = devices();
    const entry = Object.entries(all).find(([, d]) => d.hash === hash);
    if (entry) {
      const [id, d] = entry;
      hit = { id, name: d.name, opens: d.opens, tint: d.tint, rev: d.rev };
      if (!d.seen || Date.now() - d.seen > SEEN_EVERY) {
        d.seen = Date.now();
        kvSet('household', all);
      }
    }
  }
  found.set(c.req.raw, hit);
  return hit;
}

/** Opening a household link: the browser keeps the token as an HttpOnly cookie. */
export function joinHousehold(c: Context, token: string): string | null {
  const hash = sha(token);
  const entry = Object.entries(devices()).find(([, d]) => d.hash === hash);
  if (!entry) return null;
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    // Lax, so the cookie goes along when the link is opened from a message or a QR code.
    sameSite: 'Lax',
    secure: c.req.url.startsWith('https:') || c.req.header('x-forwarded-proto') === 'https',
    path: '/',
    maxAge: COOKIE_DAYS * 86_400,
  });
  recordAudit(`household: ${entry[1].name}`, 'household.join', entry[0], '');
  return entry[1].name;
}

// What a household device may read: the live picture, boards and what's on
// them, pictures, and the reading and calendar pages. Anything not listed is
// refused, so a route added later stays closed until it's added here.
const READS = new Set([
  '/api/session',
  '/api/snapshot',
  '/api/events',
  '/api/feeds',
  '/api/ha/entities',
  '/api/self/releases',
  '/api/appearance',
  '/api/boards',
  '/api/app-order',
  '/api/notes',
  '/api/appstats',
  '/api/uptime',
  '/api/history',
  // Warning and error lines only, masked: the Monitor page's feed.
  '/api/monitor/feed',
]);
const READ_PREFIXES = ['/api/rss/', '/api/releases/', '/api/widgets/', '/api/feed-img/', '/api/boards/', '/api/art/', '/api/icons/', '/api/icon/', '/api/img/', '/api/live/'];
// The one change: switching a light, switch or scene pinned to a board.
const HA_ACTION = /^\/api\/ha\/[^/]+\/(?:toggle|run)$/;

export function householdAllows(method: string, path: string): boolean {
  if (method === 'GET' || method === 'HEAD') return READS.has(path) || READ_PREFIXES.some((p) => path.startsWith(p));
  return method === 'POST' && HA_ACTION.test(path);
}

/** Refuses what a household device may not do. A cookie for a removed device is cleared. */
export function householdGuard(): MiddlewareHandler {
  return async (c, next) => {
    const device = householdOf(c);
    if (!device) {
      if (getCookie(c, COOKIE)) deleteCookie(c, COOKIE, { path: '/' });
      return next();
    }
    if (householdAllows(c.req.method, c.req.path)) return next();
    return c.json({ error: 'This is a household device: it can look, and switch lights and scenes, but not change the server.' }, 403);
  };
}
