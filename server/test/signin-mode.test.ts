import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { authMode } from '../config.ts';
import { allowedIn, type Claims, type OidcSettings } from '../oidc.ts';

test('sign-in never falls open: any case, a password alone, and a mode it does not know', () => {
  assert.equal(authMode('Password', undefined, undefined), 'password');
  assert.equal(authMode(' OIDC ', undefined, undefined), 'oidc');
  assert.equal(authMode(undefined, 'hunter2', undefined), 'password', 'a password without AUTH turns sign-in on');
  assert.equal(authMode(undefined, undefined, 'scrypt$...'), 'password');
  assert.equal(authMode('pasword', undefined, undefined), 'password', 'a typo locks, it never opens');
  assert.equal(authMode('none', 'hunter2', undefined), 'none', 'AUTH=none is still a choice');
  assert.equal(authMode(undefined, undefined, undefined), 'none');
});

const o = (allowed: string[]): OidcSettings => ({ issuer: 'https://id.example.com', clientId: 'pb', scopes: 'openid', allowed });
const who = (c: Partial<Claims>): Claims => ({ iss: 'https://id.example.com', sub: 'u-123', aud: 'pb', exp: 0, ...c });

test('OIDC_ALLOWED: an email counts only once the provider verified it', () => {
  assert.ok(allowedIn(o(['me@home.arpa']), who({ email: 'Me@home.arpa', email_verified: true })));
  assert.ok(!allowedIn(o(['me@home.arpa']), who({ email: 'me@home.arpa' })), 'unverified');
  assert.ok(!allowedIn(o(['me@home.arpa']), who({ email: 'me@home.arpa', email_verified: false })));
  assert.ok(allowedIn(o(['email:me@home.arpa']), who({ email: 'me@home.arpa', email_verified: true })));
});

test('OIDC_ALLOWED: a name matches a group or the provider id, never a username someone picked', () => {
  assert.ok(allowedIn(o(['admins']), who({ groups: ['Admins'] })));
  assert.ok(allowedIn(o(['u-123']), who({})), 'the provider id');
  assert.ok(!allowedIn(o(['admin']), who({ preferred_username: 'admin' })), 'a chosen username is not a group');
  assert.ok(allowedIn(o(['user:admin']), who({ preferred_username: 'admin' })), 'unless named as one');
  assert.ok(!allowedIn(o(['group:admin']), who({ sub: 'admin' })), 'a typed entry matches its own kind only');
  assert.ok(allowedIn(o(['sub:u-123']), who({})));
  assert.ok(allowedIn(o([]), who({})), 'an empty list lets the provider decide (and Patchboard warns)');
});

test('sign-in attempts count per visitor behind a proxy, and per IPv6 network', async () => {
  const { attemptKey, clientIp, privatePeer } = await import('../security.ts');
  const ctx = (peer: string, headers: Record<string, string> = {}) =>
    ({ env: { incoming: { socket: { remoteAddress: peer } } }, req: { header: (n: string) => headers[n.toLowerCase()] } }) as never;
  // cloudflared on the same machine: each visitor has their own count.
  assert.equal(clientIp(ctx('127.0.0.1', { 'cf-connecting-ip': '203.0.113.9' })), '203.0.113.9');
  assert.equal(clientIp(ctx('172.18.0.4', { 'x-forwarded-for': '198.51.100.7, 172.18.0.1' })), '198.51.100.7');
  // Straight from the internet, a header can't pick the count.
  assert.equal(clientIp(ctx('203.0.113.50', { 'x-forwarded-for': '1.2.3.4' })), '203.0.113.50');
  assert.ok(privatePeer('::ffff:192.168.1.20') && privatePeer('fd12:3456::1') && !privatePeer('8.8.8.8'));
  // Every address in one IPv6 network shares a count; IPv4 counts alone.
  assert.equal(attemptKey('2001:db8:1:2::abcd'), attemptKey('2001:db8:1:2:ffff::1'));
  assert.notEqual(attemptKey('2001:db8:1:2::1'), attemptKey('2001:db8:1:3::1'));
  assert.equal(attemptKey('::ffff:203.0.113.9'), '203.0.113.9');
});
