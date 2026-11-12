import { strict as assert } from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'pb-hub-'));
const { Hub } = await import('../hub.ts');

test('a poll that found nothing new is not sent again; a change is, at once', async () => {
  let reading = { cpuPct: 5 };
  const adapter = { id: 'system', label: 'System', intervalMs: 60_000, fetch: async () => reading } as unknown as ConstructorParameters<typeof Hub>[0][number];
  const hub = new Hub([adapter]);
  const sent: unknown[] = [];
  hub.subscribe((e) => {
    if (e.type === 'source') sent.push(e.state.data);
  });
  await hub.pollNow('system');
  await hub.pollNow('system');
  await hub.pollNow('system');
  assert.equal(sent.length, 1, 'the same reading three times goes out once');
  reading = { cpuPct: 9 };
  await hub.pollNow('system');
  assert.deepEqual(sent.at(-1), { cpuPct: 9 });
  assert.equal(sent.length, 2);
});
