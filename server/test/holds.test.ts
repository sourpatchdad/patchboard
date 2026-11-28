import { strict as assert } from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Container } from '../../shared/types.ts';

// A database of its own, so these marks and holds are this test's.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'pb-holds-'));
const { heldContainers, pendingUpdates, recordDiunNotice, setHold } = await import('../updates.ts');

const sonarr = { name: 'sonarr', image: 'lscr.io/linuxserver/sonarr:latest', imageId: 'sha256:old', state: 'running' } as Container;

test("a container held at its version shows no update until it's released", () => {
  assert.deepEqual(recordDiunNotice({ status: 'update', image: 'lscr.io/linuxserver/sonarr:latest' }, [sonarr]), ['sonarr']);
  assert.ok(pendingUpdates().sonarr, 'Diun flagged it');
  assert.equal(setHold('sonarr', true), true);
  assert.equal(pendingUpdates().sonarr, undefined, 'held: the mark stays quiet everywhere the marks go');
  assert.ok(heldContainers().has('sonarr'));
  assert.equal(setHold('sonarr', true), false, 'holding twice changes nothing');
  assert.equal(setHold('sonarr', false), true);
  assert.ok(pendingUpdates().sonarr, 'released: the waiting update shows again');
  assert.equal(setHold('sonarr', false), false);
});
