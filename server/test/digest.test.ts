import { strict as assert } from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Alert, ChangeEvent } from '../../shared/types.ts';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'pb-digest-'));
const { composeDigest, digestDue, digestSettings, lastDue, saveDigest } = await import('../digest.ts');

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();

test('the summary is due once a week, after its hour, in the server time zone', () => {
  // Monday 2026-11-30, 08:00 local.
  const monday8 = local(2026, 11, 30, 8);
  assert.equal(lastDue(local(2026, 11, 30, 9), 1, 8), monday8, 'an hour after: this Monday');
  assert.equal(lastDue(local(2026, 11, 30, 7, 59), 1, 8), monday8 - 7 * 86_400_000, 'a minute before: last Monday');
  assert.equal(lastDue(local(2026, 12, 3, 12), 1, 8), monday8, 'Thursday: still this Monday');
  const s = { on: true, day: 1, hour: 8, lastSent: monday8 - 6 * 86_400_000 };
  assert.equal(digestDue(s, local(2026, 11, 30, 9)), true);
  assert.equal(digestDue({ ...s, lastSent: local(2026, 11, 30, 8, 1) }, local(2026, 11, 30, 9)), false, 'sent already this week');
  assert.equal(digestDue({ ...s, on: false }, local(2026, 11, 30, 9)), false, 'off is off');
});

test('turning it on waits for the next one instead of sending at once, and bad input is refused', () => {
  const now = local(2026, 11, 30, 9);
  const on = saveDigest({ on: true, day: 1, hour: 8 }, now);
  assert.ok(!('error' in on));
  assert.equal(digestDue(digestSettings(), now), false, 'not due the moment it is turned on');
  assert.equal(digestDue(digestSettings(), now + 7 * 86_400_000), true, 'due a week on');
  assert.deepEqual(saveDigest({ day: 9 }), { error: 'Pick a day of the week.' });
  assert.deepEqual(saveDigest({ hour: 24 }), { error: 'Pick an hour from 0 to 23.' });
});

test('the week in a few plain lines: trouble first, then updates, outages, what waits, storage', () => {
  const e = (at: number, kind: ChangeEvent['kind'], subject: string, detail?: string): ChangeEvent => ({ id: at, at, kind, subject, detail });
  const quiet = composeDigest({ name: 'nas', running: 34, alerts: [], events: [], pendingUpdates: [] });
  assert.equal(quiet.title, 'Your week on nas');
  assert.equal(quiet.body, 'All quiet: 34 containers running.');
  assert.equal(quiet.level, 'digest');
  const busy = composeDigest({
    name: 'nas',
    running: 30,
    alerts: [{ id: 'a', level: 'warn', title: 'Storage is 91% full' } as Alert, { id: 'b', level: 'info', title: 'A note' } as Alert],
    events: [
      e(1, 'container.restarted', 'sonarr', 'updated'),
      e(2, 'container.restarted', 'sonarr', 'updated'),
      e(3, 'container.stopped', 'unpackerr'),
      e(4, 'container.stopped', 'unpackerr'),
      e(5_000, 'container.action', 'plex'),
      e(5_500, 'container.stopped', 'plex'),
    ],
    pendingUpdates: ['frigate'],
    pool: { now: 91.2, weekAgo: 88.1 },
  });
  assert.deepEqual(busy.body.split('\n'), ['One thing needs you: Storage is 91% full.', 'Updated: sonarr.', 'Went down: unpackerr (2 times).', 'Updates waiting: frigate.', 'Storage: 91% full, up 3.1 points this week.']);
});
