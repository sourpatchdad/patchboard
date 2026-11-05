// Parsers for the server's own files: backup logs, audit reports, runbook.
// Fixtures in ./fixtures mirror the formats of a real TrueNAS audit script.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseBackupLog } from '../adapters/backups.ts';
import { series } from '../db.ts';
import { runbookFor, seedPoolHistoryFromAudits } from '../notes.ts';

const fixture = (p: string) => readFileSync(new URL(`./fixtures/${p}`, import.meta.url), 'utf8');

test('backup log: runs, items, totals', () => {
  const runs = parseBackupLog(fixture('ops/db-backup.log'));
  assert.equal(runs.length, 2);
  const [done, partial] = runs;
  assert.deepEqual(
    done.items.map((i) => [i.label, i.ok]),
    [
      ['Immich', true],
      ['Ledger', true], // "(via compose)" is a retry note, not part of the label
      ['Tracearr', false],
    ],
  );
  assert.equal(done.stored, 371);
  assert.equal(done.size, '16G');
  assert.equal(new Date(done.startedAt).getHours(), 1);
  assert.ok(done.finishedAt && done.finishedAt > done.startedAt);
  // A run still in progress has no finish time.
  assert.equal(partial.finishedAt, null);
  assert.equal(partial.items.length, 1);
});

test('backup log: noise lines are ignored', () => {
  const runs = parseBackupLog(fixture('ops/db-backup.log'));
  assert.ok(!runs[0].items.some((i) => /pg_dump|Backup$/i.test(i.label)));
});

test('runbook: sections match containers by app name', async () => {
  const titles = async (...names: string[]) => (await runbookFor(names)).map((s) => s.title);
  assert.deepEqual(await titles('immich-server', 'immich'), ['Immich Unresponsive']);
  assert.deepEqual(await titles('immich-machine-learning'), ['Immich Unresponsive']);
  assert.deepEqual(await titles('game-night'), ['Game Night Unresponsive']);
  assert.deepEqual(await titles('notes-api'), ['Notes-API Unresponsive']);
  assert.deepEqual(await titles('sonarr', 'media'), []);
});

test('runbook: a "## " line inside a code fence is not a heading', async () => {
  const [immich] = await runbookFor(['immich-server']);
  assert.match(immich.markdown, /Not a heading: inside a code fence/);
});

test('audit reports seed pool history in binary units', async () => {
  assert.equal(await seedPoolHistoryFromAudits(), 1);
  const used = series('pool.used', 3650 * 86_400_000);
  const size = series('pool.size', 3650 * 86_400_000);
  assert.equal(used.length, 1);
  assert.equal(used[0][1], 4 * 2 ** 40);
  assert.equal(size[0][1], (4 + 3.14) * 2 ** 40);
});

test('show titles match across Sonarr and Trakt naming', async () => {
  const { showSlug, episodeKey } = await import('../adapters/arr.ts');
  assert.equal(showSlug('The Traitors (US)'), showSlug('The Traitors'));
  assert.equal(showSlug('99 to Beat (US)'), showSlug('99 to Beat'));
  assert.equal(showSlug("JoJo's Bizarre Adventure (2012)"), showSlug('JoJo’s Bizarre Adventure'));
  assert.equal(episodeKey('The Traitors (US)', 5, 9), episodeKey('Traitors', 5, 9));
});
