// Nightly backups, read from the logs the backup scripts already write
// (LOGS_PATH/ops/db-backup.log and file-backup.log). Each run looks like:
//
//   [11-04-2026 01:00 AM CST] Starting database backups...
//   Backing up Immich...
//   Immich backup complete            (or "Immich backup failed")
//   ...
//   Backup complete. Total backups stored: 372
//   Total backup size: 16G
//   [11-04-2026 01:01 AM CST] Database backup finished
//
// The scripts keep the last 500 lines, which is roughly two weeks of runs.

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { BackupRun, BackupsData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { type Adapter, MINUTE } from './adapter.ts';

const STAMP = /^\[(\d\d)-(\d\d)-(\d{4}) (\d\d):(\d\d) ([AP])M[^\]]*\]\s*(.*)$/;

function stampTime(m: RegExpExecArray): number {
  const hour = (Number(m[4]) % 12) + (m[6] === 'P' ? 12 : 0);
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]), hour, Number(m[5])).getTime();
}

export function parseBackupLog(text: string): BackupRun[] {
  const runs: BackupRun[] = [];
  let run: BackupRun | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const m = STAMP.exec(line);
    if (m && /^Starting\b/i.test(m[7])) {
      run = { startedAt: stampTime(m), finishedAt: null, items: [] };
      runs.push(run);
      continue;
    }
    if (!run) continue;
    if (m && /finished/i.test(m[7])) {
      run.finishedAt = stampTime(m);
      continue;
    }
    const item = /^(.+?) backup (complete|failed)\b/i.exec(line);
    if (item && !/^Backup$/i.test(item[1])) {
      const label = item[1].replace(/\s*\(.*\)$/, '');
      // "Ledger backup complete (via compose)" after a retry replaces the failure.
      const existing = run.items.find((i) => i.label === label);
      if (existing) existing.ok = item[2].toLowerCase() === 'complete';
      else run.items.push({ label, ok: item[2].toLowerCase() === 'complete' });
      continue;
    }
    const stored = /Total backups stored:\s*(\d+)/i.exec(line);
    if (stored) run.stored = Number(stored[1]);
    const size = /Total backup size:\s*(\S+)/i.exec(line);
    if (size) run.size = size[1];
  }
  return runs.slice(-21);
}

const cache = new Map<string, { mtime: number; runs: BackupRun[] }>();

async function readRuns(file: string): Promise<BackupRun[]> {
  const path = join(config.logsPath!, 'ops', file);
  const { mtimeMs } = await stat(path);
  const hit = cache.get(path);
  if (hit?.mtime === mtimeMs) return hit.runs;
  const runs = parseBackupLog(await readFile(path, 'utf8'));
  cache.set(path, { mtime: mtimeMs, runs });
  return runs;
}

export function backupsAdapter(): Adapter<BackupsData> {
  return {
    id: 'backups',
    label: 'Backups',
    intervalMs: 5 * MINUTE,
    async fetch() {
      const [db, files] = await Promise.all([
        readRuns('db-backup.log').catch(() => []),
        readRuns('file-backup.log').catch(() => []),
      ]);
      if (!db.length && !files.length) throw new Error('No backup logs found under LOGS_PATH/ops');
      return { db, files };
    },
  };
}
