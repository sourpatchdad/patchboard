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
import type { DeviceLook, DeviceView } from '../shared/types.ts';
import { DIM_HOURS, MAX_PAGES, ROTATE_SECONDS } from '../shared/wall.ts';

export type { DeviceView };

const COOKIE = 'pb_household';
// Browsers cap cookie lifetimes at 400 days; a family phone shouldn't have to come back for a new link.
const COOKIE_DAYS = 400;
// Last seen is written at most this often, so a board left open doesn't write the database all day.
const SEEN_EVERY = 10 * 60_000;

interface Device extends DeviceView {
  name: string;
  hash: string;
  /** The panel picture's own token, hashed: it opens the picture and nothing else. */
  panelHash?: string;
  created: number;
  seen?: number;
}

export interface HouseholdDevice extends DeviceView {
  id: string;
  name: string;
  created: number;
  seen?: number;
}

/** A device's view, field by field, so nothing else stored on it leaks out. */
const viewOf = (d: DeviceView): DeviceView => ({ opens: d.opens, pages: d.pages, rotate: d.rotate, tint: d.tint, dim: d.dim, screen: d.screen, look: d.look, rev: d.rev });

const one = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined => (allowed.includes(v as T) ? (v as T) : undefined);

/** A look as sent from Settings, keeping only fields with a value it knows. */
export function cleanLook(raw: unknown): DeviceLook | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const look: DeviceLook = {
    theme: typeof r.theme === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(r.theme) ? r.theme : undefined,
    scheme: one(r.scheme, ['auto', 'dark', 'light'] as const),
    density: one(r.density, ['compact', 'comfortable', 'large'] as const),
    clock24: typeof r.clock24 === 'boolean' ? r.clock24 : undefined,
    temp: one(r.temp, ['f', 'c', 'both'] as const),
    lang: typeof r.lang === 'string' && /^[a-z]{2}$/.test(r.lang) ? r.lang : undefined,
    locale: typeof r.locale === 'string' && /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2}|-\d{3})?$/.test(r.locale) ? r.locale : undefined,
    currency: typeof r.currency === 'string' && /^[A-Z]{3}$/.test(r.currency) ? r.currency : undefined,
  };
  for (const k of Object.keys(look) as (keyof DeviceLook)[]) if (look[k] === undefined) delete look[k];
  return Object.keys(look).length ? look : undefined;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const devices = (): Record<string, Device> => kvGet<Record<string, Device>>('household') ?? {};

/** The devices, newest first, without their hashes. */
export function householdDevices(): HouseholdDevice[] {
  return Object.entries(devices())
    .map(([id, d]) => ({ id, name: d.name, created: d.created, seen: d.seen, ...viewOf(d) }))
    .sort((a, b) => b.created - a.created);
}

/** A new panel token for a device, replacing the last one. It comes back once. */
export function newPanelToken(id: string): string | null {
  const all = devices();
  if (!all[id]) return null;
  const token = randomBytes(32).toString('base64url');
  all[id].panelHash = sha(token);
  kvSet('household', all);
  return token;
}

/** A new link for a device, replacing the last one, for a new tablet or one that lost it. It comes back once. */
export function newJoinToken(id: string): string | null {
  const all = devices();
  if (!all[id]) return null;
  const token = randomBytes(32).toString('base64url');
  all[id].hash = sha(token);
  kvSet('household', all);
  return token;
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

/** Set what a device shows. `opens` and `pages` are checked by the caller, which knows the boards. */
export function setHouseholdView(id: string, view: { name?: string; opens?: string | null; pages?: string[] | null; rotate?: number | null; tint?: string | null; dim?: string | null; screen?: string | null; look?: DeviceLook | null }): DeviceView | null {
  const all = devices();
  const d = all[id];
  if (!d) return null;
  if (view.name) d.name = view.name;
  if (view.look !== undefined) d.look = view.look ?? undefined;
  if (view.opens !== undefined) d.opens = view.opens || undefined;
  if (view.pages !== undefined) d.pages = view.pages?.length ? view.pages.slice(0, MAX_PAGES - 1) : undefined;
  if (view.rotate !== undefined) d.rotate = (ROTATE_SECONDS as readonly number[]).includes(view.rotate ?? 0) && view.rotate ? view.rotate : undefined;
  if (view.tint !== undefined) d.tint = view.tint === 'blue' || view.tint === 'color' ? view.tint : undefined;
  if (view.dim !== undefined) d.dim = (DIM_HOURS as readonly string[]).includes(view.dim ?? '') ? view.dim! : undefined;
  if (view.screen !== undefined) d.screen = view.screen === 'eink' ? 'eink' : undefined;
  d.rev = Date.now();
  kvSet('household', all);
  return viewOf(d);
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
      hit = { id, name: d.name, ...viewOf(d) };
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
/**
 * The device a panel token belongs to. A panel's address ends up in other
 * services and in proxy logs, so it has a token of its own that opens the
 * picture and can't join as a household device.
 */
export function deviceByPanelToken(token: string): { id: string; name: string } | null {
  const hash = sha(token);
  const entry = Object.entries(devices()).find(([, d]) => d.panelHash === hash);
  if (!entry) return null;
  const [id, d] = entry;
  const all = devices();
  if (!d.seen || Date.now() - d.seen > SEEN_EVERY) {
    all[id].seen = Date.now();
    kvSet('household', all);
  }
  return { id, name: d.name };
}

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
const READ_PREFIXES = ['/api/rss/', '/api/releases/', '/api/markets/', '/api/widgets/', '/api/feed-img/', '/api/boards/', '/api/art/', '/api/icons/', '/api/icon/', '/api/img/', '/api/live/'];
// The changes it may make, all to what's pinned on a board: switching a
// light or scene, setting a thermostat, moving a shade, a list's items, and
// marking a chore done.
// The server checks each against the entity's own kind (shared/ha.ts).
const HA_ACTION = /^\/api\/ha\/[^/]+\/(?:toggle|run|set|open|close|stop)$/;
const HA_TODO = /^\/api\/ha\/todo\/[^/]+$/;
const CHORE = /^\/api\/chores\/[^/]+\/[^/]+$/;

export function householdAllows(method: string, path: string): boolean {
  if (method === 'GET' || method === 'HEAD') return READS.has(path) || READ_PREFIXES.some((p) => path.startsWith(p)) || HA_TODO.test(path) || CHORE.test(path);
  return method === 'POST' && (HA_ACTION.test(path) || HA_TODO.test(path) || CHORE.test(path));
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
    return c.json({ error: 'This is a household device: it can look, switch what is pinned to a board and keep its lists, but not change the server.' }, 403);
  };
}
