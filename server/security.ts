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

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { config } from './config.ts';
import { kvGet, kvSet, recordAudit } from './db.ts';

const COOKIE = 'pb_session';
const SESSION_DAYS = 30;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export function clientIp(c: Context): string {
  // Behind a proxy the socket address is the proxy's; that's fine for rate limiting per proxy.
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return env?.incoming?.socket?.remoteAddress ?? 'unknown';
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
    // Service icons come from the dashboard-icons CDN or wherever the catalog points.
    "img-src 'self' data: https: http:",
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
    c.header('Cross-Origin-Opener-Policy', 'same-origin');
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

function passwordMatches(given: string): boolean {
  const want = config.auth.password ?? '';
  const a = Buffer.from(sha(given));
  const b = Buffer.from(sha(want));
  return want.length > 0 && timingSafeEqual(a, b);
}

// Attempts per address: 5 free, then a doubling wait up to 15 minutes.
const attempts = new Map<string, { fails: number; until: number }>();

export function login(c: Context, password: string): { ok: true } | { ok: false; error: string; status: 401 | 429 } {
  const ip = clientIp(c);
  const a = attempts.get(ip) ?? { fails: 0, until: 0 };
  if (Date.now() < a.until) {
    return { ok: false, status: 429, error: `Too many attempts. Try again in ${Math.ceil((a.until - Date.now()) / 1000)} s.` };
  }
  if (!passwordMatches(password)) {
    a.fails++;
    if (a.fails >= 5) a.until = Date.now() + Math.min(15 * 60_000, 2 ** (a.fails - 5) * 30_000);
    attempts.set(ip, a);
    recordAudit('?', 'auth.failed', '', ip);
    return { ok: false, status: 401, error: 'Wrong password.' };
  }
  attempts.delete(ip);
  startSession(c, 'admin');
  return { ok: true };
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

/** The signed-in user, or null. In 'none' mode everyone is "local". */
export function currentUser(c: Context): string | null {
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
