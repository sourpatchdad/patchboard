// Trakt sign-in with the OAuth device flow: Patchboard asks Trakt for a short
// code, you type it at trakt.tv/activate, and Patchboard polls until Trakt
// hands over tokens. They're kept in SQLite (the data volume, never the
// browser) and refreshed before they expire, so nothing has to be pasted or
// renewed by hand. A TRAKT_ACCESS_TOKEN in the environment still works as a
// fallback for setups without a client secret.

import { config } from './config.ts';
import { kvGet, kvSet } from './db.ts';

const API = 'https://api.trakt.tv';

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
  /** Device flow possible (client secret present). */
  canConnect: boolean;
  connected: boolean;
  user?: string;
  expiresAt?: number;
  pending?: Pending;
  error?: string;
}

const KEY = 'trakt-tokens';
let pending: (Pending & { deviceCode: string; interval: number }) | null = null;
let lastError: string | undefined;

function headers(token?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': config.trakt!.clientId,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function post<T>(path: string, body: unknown): Promise<{ status: number; data: T | null }> {
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
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
  if (!t?.clientSecret) throw new Error('Set TRAKT_CLIENT_SECRET to connect from here');
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
        client_secret: t.clientSecret,
      });
      if (status === 200 && data) {
        save(data, await whoAmI(data.access_token));
        pending = null;
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

/** A valid access token, refreshed first if it expires within a day. */
export async function traktToken(): Promise<string> {
  const t = config.trakt!;
  const saved = kvGet<Tokens>(KEY);
  if (!saved) {
    if (t.staticToken) return t.staticToken;
    throw new Error('Not connected. Connect Trakt in Settings.');
  }
  if (saved.expiresAt - Date.now() > 24 * 3_600_000 || !t.clientSecret) return saved.access;
  const { status, data } = await post<TokenResponse>('/oauth/token', {
    refresh_token: saved.refresh,
    client_id: t.clientId,
    client_secret: t.clientSecret,
    redirect_uri: t.redirectUri,
    grant_type: 'refresh_token',
  });
  if (status === 200 && data) {
    save(data, saved.user);
    return data.access_token;
  }
  // Refresh refused (revoked, or the app changed): the old token may still work for a while.
  if (saved.expiresAt > Date.now()) return saved.access;
  throw new Error(`Trakt sign-in expired and couldn't be renewed (HTTP ${status}). Reconnect in Settings.`);
}

export function traktStatus(): TraktStatus {
  const t = config.trakt;
  if (!t) return { configured: false, canConnect: false, connected: false };
  const saved = kvGet<Tokens>(KEY);
  return {
    configured: true,
    canConnect: !!t.clientSecret,
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
