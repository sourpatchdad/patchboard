// Security middleware: response headers, optional sign-in, read-only mode.
//
// Sign-in (AUTH):
// - none (default): the network is the gate (Tailscale, a firewalled LAN).
// - forward: a reverse proxy (Authelia, Authentik, Cloudflare Access...)
//   authenticates and passes the user in a header (TRUSTED_USER_HEADER,
//   default Remote-User). Only safe when Patchboard is reachable solely
//   through that proxy; SECURITY.md says how.
// - password: one shared password (PATCHBOARD_PASSWORD). Sessions are random
//   tokens in an HttpOnly, SameSite=Strict cookie, stored hashed. Attempts
//   are rate-limited per address with backoff.
//
// READ_ONLY=1 refuses every change to the server (actions, updates, board
// edits, sign-ins to integrations) no matter who asks.
//
// Household devices (household.ts) are signed in by a link and limited to
// viewing, in every mode.

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { config } from './config.ts';
import { kvGet, kvSet, recordAudit } from './db.ts';
import { householdOf } from './household.ts';

const COOKIE = 'pb_session';
const SESSION_DAYS = 30;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** A connection from this machine or the home network: where a reverse proxy or tunnel sits. */
export function privatePeer(ip: string): boolean {
  const v = ip.replace(/^::ffff:/, '');
  return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|169\.254\.)/.test(v) || v === '::1' || /^f[cd][0-9a-f]{2}:/i.test(v);
}

/**
 * Who is asking, for counting sign-in attempts. Behind a proxy or tunnel on
 * the home network (cloudflared, Traefik, nginx), every visitor arrives from
 * the proxy's address, so one stranger's wrong guesses would lock everyone
 * out: there the address the proxy passes along counts instead.
 */
export function clientIp(c: Context): string {
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  const peer = env?.incoming?.socket?.remoteAddress ?? 'unknown';
  if (!privatePeer(peer)) return peer;
  const passed = c.req.header('cf-connecting-ip') ?? c.req.header('x-real-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0];
  return passed?.trim() || peer;
}

// With sign-in off, a visitor from the internet means Patchboard is open to
// anyone: a tunnel or a forwarded port nobody meant to leave unguarded.
let openSince = 0;

/** Note a visitor; with sign-in off, one from a public address raises an alert. */
export function noteVisitor(c: Context): void {
  if (config.auth.mode !== 'none' || config.demo) return;
  // Signed in at the door already: Cloudflare Access, or Authelia and its kind passing the user along.
  if (c.req.header('cf-access-jwt-assertion') || c.req.header(config.auth.userHeader)) return;
  if (!privatePeer(clientIp(c))) openSince = Date.now();
}

/** When someone last reached Patchboard from the internet with sign-in off, or 0. */
export const openToInternetAt = (): number => openSince;

/** The bucket an address counts in: one per IPv4 address, one per IPv6 network (/64). */
export function attemptKey(ip: string): string {
  const v = ip.replace(/^::ffff:/, '');
  if (!v.includes(':')) return v;
  const [head, tail = ''] = v.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const full = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right];
  return `${full.slice(0, 4).map((g) => g.padStart(4, '0')).join(':')}::/64`;
}

// ---------- Security headers ----------

/**
 * A strict Content-Security-Policy. The page's one inline script (the theme
 * painter in index.html) is allowed by its hash, computed at startup from the
 * built file, so no 'unsafe-inline' for scripts.
 */
export function securityHeaders(indexHtml: string | null): MiddlewareHandler {
  const inline = indexHtml ? [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`) : [];
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${inline.join(' ')}`.trim(),
    // React writes some style attributes; nothing executes from them.
    "style-src 'self' 'unsafe-inline'",
    // Named app icons come from Patchboard; an icon given as a full address loads from there.
    // blob: is the page's own copy of a camera frame it already fetched from
    // Patchboard, swapped in whole so the picture never flickers.
    "img-src 'self' data: blob: https: http:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  return async (c, next) => {
    await next();
    // A route may set a stricter policy of its own (uploaded icons do).
    if (!c.res.headers.has('Content-Security-Policy')) c.header('Content-Security-Policy', csp);
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    // Links out to your apps shouldn't carry Patchboard's address with them.
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    // Browsers honor this only on a secure origin; over plain http on a LAN
    // address it does nothing but print a warning in every console.
    const host = (c.req.header('host') ?? '').replace(/:\d+$/, '');
    if (c.req.url.startsWith('https:') || c.req.header('x-forwarded-proto') === 'https' || host === 'localhost' || host === '127.0.0.1') {
      c.header('Cross-Origin-Opener-Policy', 'same-origin');
    }
  };
}

// ---------- Sessions (password mode) ----------

interface Session {
  user: string;
  expires: number;
}

function sessions(): Record<string, Session> {
  const all = kvGet<Record<string, Session>>('sessions') ?? {};
  const now = Date.now();
  let changed = false;
  for (const [k, s] of Object.entries(all)) {
    if (s.expires < now) {
      delete all[k];
      changed = true;
    }
  }
  if (changed) kvSet('sessions', all);
  return all;
}

/** A password set in Settings is kept as scrypt$salt$hash. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 32).toString('base64url')}`;
}

export function passwordMatches(given: string): boolean {
  const plain = config.auth.password;
  if (plain) return timingSafeEqual(Buffer.from(sha(given)), Buffer.from(sha(plain)));
  const [kind, salt, hash] = (config.auth.passwordHash ?? '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64url');
  const got = scryptSync(given, Buffer.from(salt, 'base64url'), want.length);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Sign everyone out, for a new password. */
export function endAllSessions(): void {
  kvSet('sessions', {});
}

// Attempts per address: 5 free, then a doubling wait up to 15 minutes. And
// across every address, recent failures slow each new try a little, so
// guessing from many addresses at once stays slow without ever locking the
// owner out.
const attempts = new Map<string, { fails: number; until: number }>();
let recentFails: number[] = [];
const SLOW_WINDOW = 10 * 60_000;

/** A password check that counts: refused while this address waits, slowed while many have failed. */
export async function checkPassword(c: Context, password: string): Promise<{ ok: true } | { ok: false; error: string; status: 401 | 429 }> {
  const ip = clientIp(c);
  const key = attemptKey(ip);
  const a = attempts.get(key) ?? { fails: 0, until: 0 };
  if (Date.now() < a.until) {
    return { ok: false, status: 429, error: `Too many attempts. Try again in ${Math.ceil((a.until - Date.now()) / 1000)} s.` };
  }
  recentFails = recentFails.filter((t) => Date.now() - t < SLOW_WINDOW);
  if (recentFails.length) await new Promise((r) => setTimeout(r, Math.min(5000, recentFails.length * 250)));
  if (!passwordMatches(password)) {
    a.fails++;
    if (a.fails >= 5) a.until = Date.now() + Math.min(15 * 60_000, 2 ** (a.fails - 5) * 30_000);
    attempts.set(key, a);
    recentFails.push(Date.now());
    if (attempts.size > 10_000) attempts.clear();
    recordAudit('?', 'auth.failed', '', ip);
    return { ok: false, status: 401, error: 'Wrong password.' };
  }
  attempts.delete(key);
  return { ok: true };
}

export async function login(c: Context, password: string): Promise<{ ok: true } | { ok: false; error: string; status: 401 | 429 }> {
  const r = await checkPassword(c, password);
  if (r.ok) startSession(c, 'admin');
  return r;
}

/** Sign someone in: a random token in an HttpOnly cookie, stored hashed. */
export function startSession(c: Context, user: string): void {
  const token = randomBytes(32).toString('base64url');
  const all = sessions();
  all[sha(token)] = { user, expires: Date.now() + SESSION_DAYS * 86_400_000 };
  kvSet('sessions', all);
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    // Lax, so the cookie arrives on the redirect back from an OIDC provider.
    // Changes still need the X-Patchboard header, which no other site can send.
    sameSite: config.auth.mode === 'oidc' ? 'Lax' : 'Strict',
    secure: c.req.url.startsWith('https:') || c.req.header('x-forwarded-proto') === 'https',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
  recordAudit(user, 'auth.signin', '', clientIp(c));
}

export function logout(c: Context): void {
  const token = getCookie(c, COOKIE);
  if (token) {
    const all = sessions();
    delete all[sha(token)];
    kvSet('sessions', all);
  }
  deleteCookie(c, COOKIE, { path: '/' });
}

/**
 * The signed-in user, or null. A household device is signed in by its link,
 * in every mode; otherwise in 'none' mode everyone is "local".
 */
/** This browser holds a live sign-in session (password or OIDC). */
export function hasSession(c: Context): boolean {
  const token = getCookie(c, COOKIE);
  return !!token && !!sessions()[sha(token)];
}

export function currentUser(c: Context): string | null {
  const device = householdOf(c);
  if (device) return `household: ${device.name}`;
  if (config.auth.mode === 'none') return 'local';
  if (config.auth.mode === 'forward') {
    const v = c.req.header(config.auth.userHeader);
    return v && v.length <= 200 ? v : null;
  }
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  return sessions()[sha(token)]?.user ?? null;
}

/** Routes that work without signing in. */
const OPEN = new Set(['/api/session', '/api/login', '/api/logout', '/api/oidc/login', '/api/oidc/callback']);

export function requireAuth(): MiddlewareHandler {
  return async (c, next) => {
    if (config.auth.mode === 'none' || OPEN.has(c.req.path)) return next();
    // Webhooks (Diun) can't sign in; they carry HOOK_TOKEN instead.
    if (c.req.path.startsWith('/api/hooks/')) {
      const given = c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? c.req.query('token') ?? '';
      const want = config.auth.hookToken ?? '';
      if (want && given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want))) return next();
      return c.json({ error: 'Webhooks need HOOK_TOKEN when sign-in is on' }, 401);
    }
    if (!currentUser(c)) return c.json({ error: 'Sign in required', auth: config.auth.mode }, 401);
    await next();
  };
}

/** Changes that read-only mode still allows: marking articles read, signing in and out, inbound webhooks. */
const READ_ONLY_ALLOWED = new Set(['/api/feeds/read', '/api/login', '/api/logout']);

export function readOnlyGuard(): MiddlewareHandler {
  return async (c, next) => {
    if (!config.readOnly || c.req.method === 'GET' || c.req.method === 'HEAD') return next();
    if (READ_ONLY_ALLOWED.has(c.req.path) || c.req.path.startsWith('/api/hooks/')) return next();
    return c.json({ error: 'Patchboard is in read-only mode (READ_ONLY=1)' }, 403);
  };
}
