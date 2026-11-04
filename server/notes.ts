// The server's own notes, read from read-only mounts:
//
// - RUNBOOK.md (DOCS_PATH): split into its "## " sections so a container page
//   can show the procedure that applies to it, e.g. "Immich Unresponsive".
// - The audit reports (LOGS_PATH/audit): each records the pool's used and
//   available space, which seeds the storage history so the growth forecast
//   works from the first day instead of after weeks of sampling.
//
// Nothing here writes to either mount.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunbookSection } from '../shared/types.ts';
import { config } from './config.ts';
import { recordSamples } from './db.ts';

let cache: { mtime: number; sections: RunbookSection[] } | null = null;

async function runbookSections(): Promise<RunbookSection[]> {
  if (!config.docsPath) return [];
  const path = join(config.docsPath, 'RUNBOOK.md');
  try {
    const { mtimeMs } = await stat(path);
    if (cache?.mtime === mtimeMs) return cache.sections;
    const text = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');
    const sections: RunbookSection[] = [];
    // Split on level-2 headings, ignoring "## " inside fenced code blocks.
    let inFence = false;
    let current: { title: string; lines: string[] } | null = null;
    for (const line of text.split('\n')) {
      if (/^```/.test(line)) inFence = !inFence;
      const m = !inFence && /^## (.+)$/.exec(line);
      if (m) {
        if (current) sections.push({ title: current.title, markdown: current.lines.join('\n').trim() });
        current = { title: m[1].trim(), lines: [] };
      } else if (current) {
        current.lines.push(line);
      }
    }
    if (current) sections.push({ title: current.title, markdown: current.lines.join('\n').trim() });
    cache = { mtime: mtimeMs, sections };
    return sections;
  } catch {
    return [];
  }
}

// Words that say what a container is, not which app it belongs to.
const GENERIC = new Set(['server', 'web', 'api', 'app', 'db', 'database', 'redis', 'postgres', 'postgresql', 'backend', 'frontend', 'worker', 'scheduler', 'machine', 'learning', 'ml', 'bridge', 'ix', 'cloudflared', '1']);

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** "immich-server" -> "immich"; "office-bets" -> "office bets"; "notes-api" -> "notes". */
function appPhrase(name: string): string {
  const parts = words(name).split(' ');
  while (parts.length > 1 && GENERIC.has(parts[parts.length - 1])) parts.pop();
  while (parts.length > 1 && GENERIC.has(parts[0])) parts.shift();
  return parts.join(' ');
}

/** Runbook sections whose heading names this container's app or stack. */
export async function runbookFor(names: (string | undefined)[]): Promise<RunbookSection[]> {
  const phrases = [...new Set(names.filter((n): n is string => !!n).map(appPhrase))].filter((p) => p.length >= 3);
  if (!phrases.length) return [];
  const sections = await runbookSections();
  return sections.filter((s) => {
    const h = ` ${words(s.title)} `;
    return phrases.some((p) => h.includes(` ${p} `));
  });
}

const UNITS: Record<string, number> = { K: 2 ** 10, M: 2 ** 20, G: 2 ** 30, T: 2 ** 40, P: 2 ** 50 };
const bytes = (s: string) => {
  const m = /^([\d.]+)([KMGTP])?$/.exec(s);
  return m ? Number(m[1]) * (m[2] ? UNITS[m[2]] : 1) : NaN;
};

/**
 * Pool used/size from each audit report. The report's ZFS DATASET USAGE table
 * starts with the pool's root dataset: "SourPatchNAS  4.00T  3.14T  240G  ...".
 */
export async function seedPoolHistoryFromAudits(): Promise<number> {
  if (!config.logsPath) return 0;
  const dir = join(config.logsPath, 'audit');
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => /^audit_\d{8}_\d{4}[AP]M\.txt$/.test(f));
  } catch {
    return 0;
  }
  let n = 0;
  for (const f of files) {
    const m = /^audit_(\d\d)(\d\d)(\d{4})_(\d\d)(\d\d)([AP])M/.exec(f)!;
    const hour = (Number(m[4]) % 12) + (m[6] === 'P' ? 12 : 0);
    const at = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]), hour, Number(m[5])).getTime();
    try {
      const text = await readFile(join(dir, f), 'utf8');
      const table = text.split(/ZFS DATASET USAGE/)[1];
      const row = table?.split('\n').find((l) => /^\S+\s+[\d.]+[KMGTP]\s+[\d.]+[KMGTP]\s/.test(l) && !l.startsWith('NAME'));
      if (!row) continue;
      const [, used, avail] = row.trim().split(/\s+/);
      const u = bytes(used);
      const a = bytes(avail);
      if (!Number.isFinite(u) || !Number.isFinite(a)) continue;
      recordSamples(at, [
        ['pool.used', u],
        ['pool.size', u + a],
      ]);
      n++;
    } catch {
      // A report being written right now, or unreadable: skip it.
    }
  }
  return n;
}
