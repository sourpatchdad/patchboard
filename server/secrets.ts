// Keys pasted in the UI (an app's API key for its live number, a token for an
// API numbers widget). Write-only from the browser's side: the API lists
// names and when each was set, never values. Values are resolved only when
// the server makes a request, and never appear in a response or an error.
//
// Sealed with AES-256-GCM before they reach SQLite (server/vault.ts), with the
// key kept apart from the database. Keys saved before encryption existed are
// sealed the next time the store is written.

import { kvGet, kvSet } from './db.ts';
import { seal, unsealOr } from './vault.ts';

const KEY = 'secrets';
export const SECRET_NAME = /^[A-Z0-9_]{1,40}$/;

type Store = Record<string, { value: string; at: number }>;

const read = (): Store => kvGet<Store>(KEY) ?? {};

export function getSecret(name: string): string | undefined {
  const v = read()[name]?.value;
  // A key no secret opens counts as unset: the request goes out without it.
  return v === undefined ? undefined : unsealOr(v)?.value;
}

export function listSecrets(): { name: string; at: number }[] {
  return Object.entries(read())
    .map(([name, s]) => ({ name, at: s.at }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function setSecret(name: string, value: string): void {
  const s = read();
  s[name] = { value: seal(value), at: Date.now() };
  // A new value may be for another server: it binds again on first use.
  forgetOrigin(`secret:${name}`);
  // Everything else is sealed again with the current key; one no key opens stays as it was.
  for (const k of Object.keys(s)) {
    const r = unsealOr(s[k].value);
    if (r) s[k].value = seal(r.value);
  }
  kvSet(KEY, s);
}

export function deleteSecret(name: string): boolean {
  const s = read();
  if (!(name in s)) return false;
  delete s[name];
  kvSet(KEY, s);
  forgetOrigin(`secret:${name}`);
  return true;
}

// Each key, and each WIDGET_ environment value a widget names, goes only to
// the server it was first sent to. Without this, anyone who could edit a
// board could point a widget at a server of their own with ${secret:NAME}
// in the address and read the key off the request.
const ORIGINS = 'key-origins';

/** Where a key may go: its server, bound on first use. Throws for anywhere else. */
export function checkOrigin(ref: string, origin: string): void {
  const all = kvGet<Record<string, string>>(ORIGINS) ?? {};
  if (!all[ref]) {
    all[ref] = origin;
    kvSet(ORIGINS, all);
    return;
  }
  if (all[ref] !== origin) throw new Error(`${ref.replace(/^\w+:/, '')} is only sent to ${all[ref]}. Save the key again to use it with another server.`);
}

function forgetOrigin(ref: string): void {
  const all = kvGet<Record<string, string>>(ORIGINS) ?? {};
  if (!(ref in all)) return;
  delete all[ref];
  kvSet(ORIGINS, all);
}
