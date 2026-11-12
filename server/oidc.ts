// OpenID Connect sign-in: the authorization-code flow with PKCE, state and
// nonce. Works with Authentik, Authelia, Keycloak, Pocket ID, Zitadel,
// Google and other standard providers.
//
// 1. start(): remember a state, nonce and PKCE verifier on the server for ten
//    minutes, and send the browser to the provider.
// 2. finish(): trade the code for tokens, then check the ID token: its
//    signature against the provider's published keys (RS256 or ES256), the
//    issuer, the audience, the expiry and the nonce. Nothing in the token is
//    trusted before that.

import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';

export interface OidcSettings {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  scopes: string;
  /** Who may sign in: email:, group:, user: or sub: entries (see allowedIn); empty lets in anyone the provider signs in. */
  allowed: string[];
}

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

const b64url = (b: Buffer) => b.toString('base64url');
const trim = (s: string) => s.replace(/\/+$/, '');

let discovered: { issuer: string; at: number; d: Discovery } | null = null;
let keys: { uri: string; at: number; keys: JsonWebKey[] } | null = null;

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(8000) });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(`${new URL(url).host} answered HTTP ${res.status}`);
  return body as T;
}

async function discover(o: OidcSettings): Promise<Discovery> {
  if (discovered && discovered.issuer === o.issuer && Date.now() - discovered.at < 3_600_000) return discovered.d;
  const d = await getJson<Discovery>(`${trim(o.issuer)}/.well-known/openid-configuration`);
  if (trim(d.issuer) !== trim(o.issuer)) throw new Error("The provider's issuer doesn't match OIDC_ISSUER");
  discovered = { issuer: o.issuer, at: Date.now(), d };
  return d;
}

async function jwks(uri: string, refresh = false): Promise<JsonWebKey[]> {
  if (!refresh && keys && keys.uri === uri && Date.now() - keys.at < 3_600_000) return keys.keys;
  const r = await getJson<{ keys: JsonWebKey[] }>(uri);
  keys = { uri, at: Date.now(), keys: r.keys ?? [] };
  return keys.keys;
}

// Sign-ins in progress, by state. Ten minutes each, at most 200 at once.
const pending = new Map<string, { verifier: string; nonce: string; redirectUri: string; at: number }>();

export async function start(o: OidcSettings, redirectUri: string): Promise<string> {
  const d = await discover(o);
  const now = Date.now();
  for (const [k, v] of pending) if (now - v.at > 600_000) pending.delete(k);
  if (pending.size >= 200) pending.delete(pending.keys().next().value!);
  const state = b64url(randomBytes(24));
  const nonce = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(32));
  pending.set(state, { verifier, nonce, redirectUri, at: now });
  const u = new URL(d.authorization_endpoint);
  u.search = new URLSearchParams({
    response_type: 'code',
    client_id: o.clientId,
    redirect_uri: redirectUri,
    scope: o.scopes,
    state,
    nonce,
    code_challenge: b64url(createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256',
  }).toString();
  return u.toString();
}

export async function finish(o: OidcSettings, code: string, state: string): Promise<{ user: string }> {
  const p = pending.get(state);
  pending.delete(state);
  if (!p || Date.now() - p.at > 600_000) throw new Error('That sign-in expired. Try again.');
  const d = await discover(o);
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: p.redirectUri, code_verifier: p.verifier, client_id: o.clientId });
  if (o.clientSecret) headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(o.clientId)}:${encodeURIComponent(o.clientSecret)}`).toString('base64')}`;
  const tokens = await getJson<{ id_token?: string }>(d.token_endpoint, { method: 'POST', headers, body: form });
  if (!tokens.id_token) throw new Error('The provider sent no ID token');
  let claims: Claims;
  try {
    claims = verifyIdToken(tokens.id_token, await jwks(d.jwks_uri), { issuer: d.issuer, audience: o.clientId, nonce: p.nonce });
  } catch (e) {
    // The provider may have rotated its keys since we fetched them.
    if (!/key/.test((e as Error).message)) throw e;
    claims = verifyIdToken(tokens.id_token, await jwks(d.jwks_uri, true), { issuer: d.issuer, audience: o.clientId, nonce: p.nonce });
  }
  const user = claims.email ?? claims.preferred_username ?? claims.sub;
  if (!allowedIn(o, claims)) throw new Error(`${user} isn't on Patchboard's OIDC_ALLOWED list`);
  return { user: String(user).slice(0, 200) };
}

export interface Claims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat?: number;
  nonce?: string;
  email?: string;
  preferred_username?: string;
  /** True only when the provider has checked the address belongs to them. */
  email_verified?: boolean;
  groups?: string[];
}

/**
 * Whether OIDC_ALLOWED lets these claims in. Each entry names one kind of
 * claim, so a username can't stand in for a group: email:me@x.org (or a bare
 * address) matches a verified email only; group:admins (or a bare name)
 * matches a group or the provider's own id; user:name matches the username,
 * which some providers let people pick, so use it only where they can't;
 * sub:id matches the provider's id.
 */
export function allowedIn(o: OidcSettings, c: Claims): boolean {
  if (!o.allowed.length) return true;
  const low = (x: unknown) => String(x ?? '').toLowerCase();
  const email = c.email && c.email_verified === true ? low(c.email) : '';
  const groups = Array.isArray(c.groups) ? c.groups.map(low) : [];
  const sub = low(c.sub);
  const user = low(c.preferred_username);
  return o.allowed.some((raw) => {
    const entry = raw.trim().toLowerCase();
    const m = /^(email|group|user|sub):(.+)$/.exec(entry);
    const [kind, value] = m ? [m[1], m[2].trim()] : [entry.includes('@') ? 'email' : 'name', entry];
    if (!value) return false;
    if (kind === 'email') return !!email && email === value;
    if (kind === 'group') return groups.includes(value);
    if (kind === 'user') return !!user && user === value;
    if (kind === 'sub') return sub === value;
    return groups.includes(value) || sub === value;
  });
}

/** Check an ID token's signature and claims. Throws with a plain reason. */
export function verifyIdToken(token: string, set: JsonWebKey[], want: { issuer: string; audience: string; nonce: string; now?: number }): Claims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed ID token');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString()) as { alg?: string; kid?: string };
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as Claims;
  const sig = Buffer.from(parts[2], 'base64url');
  const data = Buffer.from(`${parts[0]}.${parts[1]}`);
  if (header.alg !== 'RS256' && header.alg !== 'ES256') throw new Error(`Unsupported signing algorithm ${header.alg}`);
  const jwk = set.find((k) => (header.kid ? (k as { kid?: string }).kid === header.kid : true) && (k.kty === (header.alg === 'RS256' ? 'RSA' : 'EC')));
  if (!jwk) throw new Error('No matching signing key from the provider');
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const ok = header.alg === 'RS256' ? verify('RSA-SHA256', data, key, sig) : verify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, sig);
  if (!ok) throw new Error('ID token signature is wrong');
  const now = (want.now ?? Date.now()) / 1000;
  if (trim(claims.iss) !== trim(want.issuer)) throw new Error('ID token issuer is wrong');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(want.audience)) throw new Error('ID token is for another app');
  if (typeof claims.exp !== 'number' || claims.exp < now - 60) throw new Error('ID token has expired');
  if (claims.nonce !== want.nonce) throw new Error('ID token nonce is wrong');
  return claims;
}
