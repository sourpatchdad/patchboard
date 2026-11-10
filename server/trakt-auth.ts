// Trakt sign-in with the OAuth device flow: Patchboard asks Trakt for a short
// code, you type it at trakt.tv/activate, and Patchboard polls until Trakt
// hands over tokens. Only a Client ID is needed: Trakt deprecated client
// secrets in 2026 and no longer issues them to new apps (it's still sent if
// configured). Tokens live 7 days and are kept in SQLite (the data volume,
// never the browser); Patchboard refreshes them a day early.
//
// Trakt's rules this follows (developer.trakt.tv, trakt/trakt-api contracts):
// - Every OAuth call goes to auth.trakt.tv, never the API host (required
//   from February 2027).
// - Refresh tokens are single-use. A refresh is never run twice at once, and
//   the new pair is saved before anything else uses it.
//
// TRAKT_ACCESS_TOKEN in the environment still works as a manual fallback.

import { config } from './config.ts';
import { kvGet, kvSet } from './db.ts';

const API = 'https://api.trakt.tv';
const AUTH = 'https://auth.trakt.tv';

interface Tokens {
  access: string;
  refresh: string;
  /** Unix ms. */
  expiresAt: number;
  user?: string;
}

interface Pending {
  userCode: string;
  verifyUrl: string;
  expiresAt: number;
}

export interface TraktStatus {
  configured: boolean;
  /** Device flow possible (a Client ID is set). */
  canConnect: boolean;
  connected: boolean;
  user?: string;
  expiresAt?: number;
  pending?: Pending;
  error?: string;
}

const KEY = 'trakt-tokens';
let pending: (Pending & { deviceCode: string; interval: number }) | null = null;
let onConnected: () => void = () => {};

/** Called when a sign-in completes, so the calendar loads now rather than on the next poll. */
export function whenTraktConnects(fn: () => void): void {
  onConnected = fn;
}
let lastError: string | undefined;

function headers(token?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': config.trakt!.clientId,
    'User-Agent': 'Patchboard/1 (self-hosted)',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function post<T>(path: string, body: unknown): Promise<{ status: number; data: T | null }> {
  // OAuth requests belong on the auth host.
  const res = await fetch(`${AUTH}${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  const text = await res.text();
  let data: T | null = null;
  try {
    data = text ? (JSON.parse(text) as T) : null;
  } catch {
    // Trakt answers some states with an empty body; the status says enough.
  }
  return { status: res.status, data };
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  created_at: number;
}

function save(t: TokenResponse, user?: string): void {
  kvSet(KEY, {
    access: t.access_token,
    refresh: t.refresh_token,
    expiresAt: (t.created_at ? t.created_at * 1000 : Date.now()) + t.expires_in * 1000,
    user,
  } satisfies Tokens);
}

async function whoAmI(token: string): Promise<string | undefined> {
  try {
    const res = await fetch(`${API}/users/settings`, { headers: headers(token), signal: AbortSignal.timeout(10_000) });
    const body = (await res.json()) as { user?: { username?: string } };
    return body.user?.username;
  } catch {
    return undefined;
  }
}

/** Start the device flow. Returns the code to show the user. */
export async function startDeviceFlow(): Promise<Pending> {
  const t = config.trakt;
  if (!t) throw new Error('Set TRAKT_CLIENT_ID to connect');
  const { status, data } = await post<{ device_code: string; user_code: string; verification_url: string; expires_in: number; interval: number }>(
    '/oauth/device/code',
    { client_id: t.clientId },
  );
  if (status !== 200 || !data) throw new Error(`Trakt refused the request (HTTP ${status})`);
  pending = {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verifyUrl: data.verification_url,
    expiresAt: Date.now() + data.expires_in * 1000,
    interval: Math.max(5, data.interval) * 1000,
  };
  lastError = undefined;
  void pollDevice(pending.deviceCode);
  return { userCode: pending.userCode, verifyUrl: pending.verifyUrl, expiresAt: pending.expiresAt };
}

async function pollDevice(deviceCode: string): Promise<void> {
  const t = config.trakt!;
  while (pending?.deviceCode === deviceCode && Date.now() < pending.expiresAt) {
    await new Promise((r) => setTimeout(r, pending!.interval));
    if (pending?.deviceCode !== deviceCode) return;
    try {
      const { status, data } = await post<TokenResponse>('/oauth/device/token', {
        code: deviceCode,
        client_id: t.clientId,
        ...(t.clientSecret ? { client_secret: t.clientSecret } : {}),
      });
      if (status === 200 && data) {
        save(data, await whoAmI(data.access_token));
        pending = null;
        onConnected();
        return;
      }
      // 400: not entered yet. 429: polling too fast. Anything else ends the attempt.
      if (status === 429) pending.interval += 1000;
      else if (status !== 400) {
        lastError = status === 418 ? 'You declined the request on Trakt.' : status === 410 || status === 404 ? 'The code expired. Start again.' : `Trakt answered HTTP ${status}.`;
        pending = null;
        return;
      }
    } catch {
      // Network blip: keep trying until the code expires.
    }
  }
  if (pending?.deviceCode === deviceCode) {
    lastError = 'The code expired before it was entered. Start again.';
    pending = null;
  }
}

let refreshing: Promise<string> | null = null;

/** A valid access token, refreshed first if it expires within a day. */
export async function traktToken(): Promise<string> {
  const t = config.trakt!;
  const saved = kvGet<Tokens>(KEY);
  if (!saved) {
    if (t.staticToken) return t.staticToken;
    throw new Error('Not connected. Connect Trakt in Settings.');
  }
  if (saved.expiresAt - Date.now() > 24 * 3_600_000) return saved.access;
  // Single-use refresh tokens: a second concurrent refresh would invalidate
  // the first one's result, so everyone waits on the same request.
  refreshing ??= (async () => {
    try {
      const { status, data } = await post<TokenResponse>('/oauth/token', {
        refresh_token: saved.refresh,
        client_id: t.clientId,
        redirect_uri: t.redirectUri,
        grant_type: 'refresh_token',
        ...(t.clientSecret ? { client_secret: t.clientSecret } : {}),
      });
      if (status === 200 && data) {
        save(data, saved.user);
        return data.access_token;
      }
      // Refused (revoked, or a token from before Trakt's auth migration).
      // The old access token may still have a little life left.
      if (saved.expiresAt > Date.now()) return saved.access;
      throw new Error(`Trakt sign-in expired and couldn't be renewed (HTTP ${status}). Reconnect in Settings.`);
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export function traktStatus(): TraktStatus {
  const t = config.trakt;
  if (!t) return { configured: false, canConnect: false, connected: false };
  const saved = kvGet<Tokens>(KEY);
  return {
    configured: true,
    canConnect: true,
    connected: !!saved || !!t.staticToken,
    user: saved?.user,
    expiresAt: saved?.expiresAt,
    pending: pending ? { userCode: pending.userCode, verifyUrl: pending.verifyUrl, expiresAt: pending.expiresAt } : undefined,
    error: lastError,
  };
}

export function traktDisconnect(): void {
  kvSet(KEY, null);
  pending = null;
}
