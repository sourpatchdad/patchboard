// Encryption at rest for keys and passwords saved from the UI. Values are
// sealed with AES-256-GCM before they reach SQLite. The key lives apart from
// the database: PATCHBOARD_SECRET_KEY if you set one, otherwise a random key
// Patchboard writes once to DATA_DIR/secret.key (owner-only). A copy of
// patchboard.db on its own, in a backup or a bug report, reveals nothing.
//
// This guards the database file, not the running box: anyone who can read
// both files, or the process memory, can read the keys. That's the same line
// your .env sits behind.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.ts';

const PREFIX = 'enc1:';
let key: Buffer | null = null;

function vaultKey(): Buffer {
  if (key) return key;
  const fromEnv = process.env.PATCHBOARD_SECRET_KEY?.trim();
  if (fromEnv) {
    key = createHash('sha256').update(fromEnv).digest();
    return key;
  }
  const file = join(config.dataDir, 'secret.key');
  if (!existsSync(file)) {
    mkdirSync(config.dataDir, { recursive: true });
    writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600, flag: 'wx' });
  }
  try {
    chmodSync(file, 0o600);
  } catch {
    // Windows and some mounts ignore modes; the file is still apart from the database.
  }
  key = createHash('sha256').update(readFileSync(file, 'utf8').trim()).digest();
  return key;
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', vaultKey(), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return PREFIX + [iv, c.getAuthTag(), body].map((b) => b.toString('base64')).join('.');
}

/** Plain values from before encryption pass through, and get sealed on the next save. */
export function unseal(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const [iv, tag, body] = stored.slice(PREFIX.length).split('.').map((s) => Buffer.from(s, 'base64'));
  const d = createDecipheriv('aes-256-gcm', vaultKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString('utf8');
}

export const isSealed = (stored: string): boolean => stored.startsWith(PREFIX);
