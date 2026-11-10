// Encryption at rest for keys and passwords saved from the UI. Values are
// sealed with AES-256-GCM before they reach SQLite. The key lives apart from
// the database: PATCHBOARD_SECRET_KEY if you set one, otherwise a random key
// Patchboard writes once to DATA_DIR/secret.key (owner-only). A copy of
// patchboard.db on its own, in a backup or a bug report, reveals nothing.
//
// This guards the database file. Anyone who can read both files, or the
// process memory, can read the keys: the same protection your .env file
// has.
//
// Setting PATCHBOARD_SECRET_KEY later is safe: while secret.key is still
// there, values sealed with it still open, and setup.ts seals them again
// with the new key on the next start.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.ts';

const PREFIX = 'enc1:';
let key: Buffer | null = null;
let fileKey: Buffer | null | undefined;

const digest = (s: string) => createHash('sha256').update(s).digest();

/** The generated key in DATA_DIR, if there is one. Never created here. */
function existingFileKey(): Buffer | null {
  if (fileKey === undefined) {
    const file = join(config.dataDir, 'secret.key');
    fileKey = existsSync(file) ? digest(readFileSync(file, 'utf8').trim()) : null;
  }
  return fileKey;
}

function vaultKey(): Buffer {
  if (key) return key;
  const fromEnv = process.env.PATCHBOARD_SECRET_KEY?.trim();
  if (fromEnv) {
    key = digest(fromEnv);
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
  key = digest(readFileSync(file, 'utf8').trim());
  return key;
}

function open(stored: string, k: Buffer): string {
  const [iv, tag, body] = stored.slice(PREFIX.length).split('.').map((s) => Buffer.from(s, 'base64'));
  const d = createDecipheriv('aes-256-gcm', k, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString('utf8');
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', vaultKey(), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return PREFIX + [iv, c.getAuthTag(), body].map((b) => b.toString('base64')).join('.');
}

/**
 * Open a stored value. Plain values from before encryption pass through.
 * `stale` means it opened only with the old secret.key and wants sealing
 * again; null means no key opens it.
 */
export function unsealOr(stored: string): { value: string; stale: boolean } | null {
  if (!stored.startsWith(PREFIX)) return { value: stored, stale: true };
  try {
    return { value: open(stored, vaultKey()), stale: false };
  } catch {
    const old = existingFileKey();
    if (old && !old.equals(vaultKey())) {
      try {
        return { value: open(stored, old), stale: true };
      } catch {
        // falls through
      }
    }
    return null;
  }
}

export function unseal(stored: string): string {
  const r = unsealOr(stored);
  if (!r) throw new Error('No key opens this value');
  return r.value;
}

/** For tests: forget the cached keys. */
export function resetVaultForTests(): void {
  key = null;
  fileKey = undefined;
}

export const isSealed = (stored: string): boolean => stored.startsWith(PREFIX);
