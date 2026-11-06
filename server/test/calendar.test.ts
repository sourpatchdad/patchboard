import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseIcs, parseTime } from '../adapters/calendar.ts';

const DAY = 86_400_000;

test('iCal times: UTC, a named zone, and all-day dates at local midnight', () => {
  assert.equal(parseTime('20261106T150000Z')!.at, Date.UTC(2026, 10, 6, 15));
  // 9 AM in New York on Nov 6, 2026 (EST, UTC-5) is 14:00 UTC.
  assert.equal(parseTime('20261106T090000', 'America/New_York')!.at, Date.UTC(2026, 10, 6, 14));
  // In July (EDT, UTC-4) it is 13:00 UTC.
  assert.equal(parseTime('20260706T090000', 'America/New_York')!.at, Date.UTC(2026, 6, 6, 13));
  assert.deepEqual(parseTime('20261106'), { at: new Date(2026, 10, 6).getTime(), allDay: true });
});

test('iCal events: folded lines, escapes, all-day, weekly repeats with exceptions, moved and cancelled occurrences', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'X-WR-CALNAME:Family',
    'BEGIN:VEVENT',
    'UID:a',
    'SUMMARY:Dinner\\, then a movie',
    'DTSTART:20261106T230000Z',
    'DTEND:20261107T010000Z',
    'LOCATION:Home',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:b',
    'SUMMARY:Trash ',
    ' day',
    'DTSTART;VALUE=DATE:20261109',
    'DTEND;VALUE=DATE:20261110',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:c',
    'SUMMARY:Practice',
    'DTSTART:20261102T230000Z',
    'DTEND:20261103T003000Z',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6',
    'EXDATE:20261104T230000Z',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:c',
    'RECURRENCE-ID:20261109T230000Z',
    'SUMMARY:Practice (moved)',
    'DTSTART:20261110T230000Z',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:d',
    'SUMMARY:Cancelled thing',
    'STATUS:CANCELLED',
    'DTSTART:20261107T100000Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const from = Date.UTC(2026, 10, 5);
  const ev = parseIcs(ics, from, from + 14 * DAY);
  const titles = ev.map((e) => e.title);
  assert.ok(titles.includes('Dinner, then a movie'));
  assert.ok(titles.includes('Trash day'));
  assert.ok(!titles.includes('Cancelled thing'));
  // Weekly Mon and Wed from Nov 2, six times: Nov 2, 4 (excluded), 9 (moved to the 10th), 11, 16, 18. From Nov 5 on: 11, 16, 18, plus the moved one.
  const practice = ev.filter((e) => e.title.startsWith('Practice')).map((e) => new Date(e.start).toISOString().slice(0, 10));
  assert.deepEqual(practice, ['2026-11-10', '2026-11-11', '2026-11-16', '2026-11-18']);
  assert.equal(ev[0].calendar, 'Family');
  assert.equal(ev.find((e) => e.title === 'Trash day')!.allDay, true);
});

test('iCal repeats: monthly on the 31st skips short months; UNTIL ends a series', () => {
  const ics = 'BEGIN:VEVENT\nUID:m\nSUMMARY:Rent\nDTSTART:20260131T120000Z\nRRULE:FREQ=MONTHLY\nEND:VEVENT\nBEGIN:VEVENT\nUID:u\nSUMMARY:Daily\nDTSTART:20261101T120000Z\nRRULE:FREQ=DAILY;UNTIL=20261103T120000Z\nEND:VEVENT';
  const ev = parseIcs(ics, Date.UTC(2026, 0, 1), Date.UTC(2026, 6, 1));
  assert.deepEqual(ev.filter((e) => e.title === 'Rent').map((e) => new Date(e.start).getUTCMonth() + 1), [1, 3, 5]);
  assert.equal(parseIcs(ics, Date.UTC(2026, 10, 1), Date.UTC(2026, 10, 30)).filter((e) => e.title === 'Daily').length, 3);
});
