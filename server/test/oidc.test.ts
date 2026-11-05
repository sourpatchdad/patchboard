import { strict as assert } from 'node:assert';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { finish, type OidcSettings, start, verifyIdToken } from '../oidc.ts';

// A fake provider: discovery, keys, and a token endpoint that checks PKCE
// and the client secret, then signs an ID token with the nonce it was given.
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const rsaJwk = { ...rsa.publicKey.export({ format: 'jwk' }), kid: 'r1', alg: 'RS256', use: 'sig' };
const ecJwk = { ...ec.publicKey.export({ format: 'jwk' }), kid: 'e1', alg: 'ES256', use: 'sig' };

let issuer = '';
const challenges = new Map<string, { challenge: string; nonce: string }>();
let tokenClaims: Record<string, unknown> = {};

function jwt(claims: Record<string, unknown>, alg: 'RS256' | 'ES256' = 'RS256'): string {
  const h = Buffer.from(JSON.stringify({ alg, kid: alg === 'RS256' ? 'r1' : 'e1', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const data = Buffer.from(`${h}.${p}`);
  const s = alg === 'RS256' ? sign('RSA-SHA256', data, rsa.privateKey) : sign('sha256', data, { key: ec.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${h}.${p}.${s.toString('base64url')}`;
}

const idp = createServer((req, res) => {
  const url = new URL(req.url ?? '/', issuer);
  const json = (code: number, body: unknown) => res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  if (url.pathname === '/.well-known/openid-configuration') {
    return json(200, { issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks` });
  }
  if (url.pathname === '/jwks') return json(200, { keys: [rsaJwk, ecJwk] });
  if (url.pathname === '/token') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const f = new URLSearchParams(body);
      const basic = Buffer.from((req.headers.authorization ?? '').replace('Basic ', ''), 'base64').toString();
      if (basic !== 'patchboard:s3cret') return json(401, { error: 'invalid_client' });
      const c = challenges.get(f.get('code') ?? '');
      const computed = createHash('sha256').update(f.get('code_verifier') ?? '').digest('base64url');
      if (!c || computed !== c.challenge) return json(400, { error: 'invalid_grant' });
      const now = Math.floor(Date.now() / 1000);
      json(200, { id_token: jwt({ iss: issuer, aud: 'patchboard', sub: 'u1', email: 'sam@example.com', groups: ['family'], iat: now, exp: now + 300, nonce: c.nonce, ...tokenClaims }) });
    });
    return;
  }
  res.writeHead(404).end();
});

before(async () => {
  await new Promise<void>((r) => idp.listen(0, '127.0.0.1', r));
  issuer = `http://127.0.0.1:${(idp.address() as AddressInfo).port}`;
});
after(() => idp.close());

const settings = (allowed: string[] = []): OidcSettings => ({ issuer, clientId: 'patchboard', clientSecret: 's3cret', scopes: 'openid email', allowed });

/** Run the browser's part: start, "approve" at the provider, return code and state. */
async function approve(o: OidcSettings): Promise<{ code: string; state: string }> {
  const u = new URL(await start(o, 'https://dash.example.com/api/oidc/callback'));
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  const code = `code-${Math.random()}`;
  challenges.set(code, { challenge: u.searchParams.get('code_challenge')!, nonce: u.searchParams.get('nonce')! });
  return { code, state: u.searchParams.get('state')! };
}

test('a full sign-in returns the email, and a state works once', async () => {
  tokenClaims = {};
  const { code, state } = await approve(settings());
  assert.deepEqual(await finish(settings(), code, state), { user: 'sam@example.com' });
  await assert.rejects(finish(settings(), code, state), /expired/);
});

test('OIDC_ALLOWED lets in a listed group and keeps out everyone else', async () => {
  tokenClaims = {};
  let r = await approve(settings(['family']));
  assert.equal((await finish(settings(['family']), r.code, r.state)).user, 'sam@example.com');
  r = await approve(settings(['admins@example.com']));
  await assert.rejects(finish(settings(['admins@example.com']), r.code, r.state), /OIDC_ALLOWED/);
});

test('tokens for another app, with a wrong nonce or expired are refused', async () => {
  for (const [claims, reason] of [
    [{ aud: 'other-app' }, /another app/],
    [{ nonce: 'not-it' }, /nonce/],
    [{ exp: Math.floor(Date.now() / 1000) - 3600 }, /expired/],
    [{ iss: 'https://evil.example' }, /issuer/],
  ] as const) {
    tokenClaims = claims;
    const r = await approve(settings());
    await assert.rejects(finish(settings(), r.code, r.state), reason);
  }
  tokenClaims = {};
});

test('a tampered signature fails; ES256 keys work', () => {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: 'https://idp', aud: 'pb', sub: 'x', exp: now + 60, nonce: 'n' };
  const want = { issuer: 'https://idp', audience: 'pb', nonce: 'n' };
  const good = jwt(claims);
  const [h, p] = good.split('.');
  const forged = `${h}.${Buffer.from(JSON.stringify({ ...claims, sub: 'admin' })).toString('base64url')}.${good.split('.')[2]}`;
  assert.throws(() => verifyIdToken(forged, [rsaJwk], want), /signature/);
  assert.equal(verifyIdToken(jwt(claims, 'ES256'), [rsaJwk, ecJwk], want).sub, 'x');
  assert.ok(h && p);
});

test('an unknown state is refused', async () => {
  await assert.rejects(finish(settings(), 'code', 'made-up-state'), /expired/);
});
