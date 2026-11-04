// Keys pasted in the UI (an app's API key for its live number, a token for an
// API numbers widget). Write-only from the browser's side: the API lists
// names and when each was set, never values. Values are resolved only when
// the server makes a request, and never appear in a response or an error.
//
// Stored in Patchboard's SQLite database in DATA_DIR, which deserves the same
// care as your .env: same owner, not world-readable, kept out of backups you
// share.

import { kvGet, kvSet } from './db.ts';

const KEY = 'secrets';
export const SECRET_NAME = /^[A-Z0-9_]{1,40}$/;

type Store = Record<string, { value: string; at: number }>;

const read = (): Store => kvGet<Store>(KEY) ?? {};

export function getSecret(name: string): string | undefined {
  return read()[name]?.value;
}

export function listSecrets(): { name: string; at: number }[] {
  return Object.entries(read())
    .map(([name, s]) => ({ name, at: s.at }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function setSecret(name: string, value: string): void {
  const s = read();
  s[name] = { value, at: Date.now() };
  kvSet(KEY, s);
}

export function deleteSecret(name: string): boolean {
  const s = read();
  if (!(name in s)) return false;
  delete s[name];
  kvSet(KEY, s);
  return true;
}
