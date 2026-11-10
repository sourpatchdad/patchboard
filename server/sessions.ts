// Sign-in sessions for APIs that trade a password for a session id instead
// of taking a key on every request. Pi-hole 6 is the first: POST the password
// to /api/auth, then send the session id as X-FTL-SID.
//
// Pi-hole caps how many sessions it keeps, so Patchboard reuses one session
// per server until it expires, signs in again at most once after a 401, and
// waits five minutes after a failed sign-in instead of retrying.

import { getSecret } from './secrets.ts';

interface Session {
  sid: string;
  until: number;
}

const sessions = new Map<string, Session>();
const failedUntil = new Map<string, number>();
const inflight = new Map<string, Promise<string>>();
const BACKOFF = 5 * 60_000;

async function signIn(origin: string, secret: string): Promise<string> {
  const key = `${origin}|${secret}`;
  const blocked = failedUntil.get(key);
  if (blocked && Date.now() < blocked) throw new Error('The last sign-in failed. Patchboard tries again in 5 minutes.');
  const password = getSecret(secret);
  if (!password) throw new Error(`No key saved as ${secret}`);
  const res = await fetch(`${origin}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Patchboard/1' },
    body: JSON.stringify({ password }),
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
  });
  const body = (await res.json().catch(() => null)) as { session?: { valid?: boolean; sid?: string; validity?: number } } | null;
  const s = body?.session;
  if (!res.ok || !s?.valid || !s.sid) {
    failedUntil.set(key, Date.now() + BACKOFF);
    throw new Error(res.status === 401 || s?.valid === false ? 'Pi-hole refused the password' : `Sign-in failed (HTTP ${res.status})`);
  }
  failedUntil.delete(key);
  // Renew a minute early so a request never rides on an expiring session.
  sessions.set(key, { sid: s.sid, until: Date.now() + Math.max(60, (s.validity ?? 1800) - 60) * 1000 });
  return s.sid;
}

/** A current Pi-hole 6 session id for this server, signing in only when needed. */
export async function piholeSid(origin: string, secret: string, fresh = false): Promise<string> {
  const key = `${origin}|${secret}`;
  const s = sessions.get(key);
  if (!fresh && s && Date.now() < s.until) return s.sid;
  if (fresh) sessions.delete(key);
  // One sign-in at a time per server, however many widgets ask at once.
  let p = inflight.get(key);
  if (!p) {
    p = signIn(origin, secret).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}
