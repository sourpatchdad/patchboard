import { strict as assert } from 'node:assert';
import { inflateSync } from 'node:zlib';
import { test } from 'node:test';
import type { Snapshot } from '../../shared/types.ts';
import { Bitmap, bmp, drawPanel, png } from '../panel.ts';

test('a one-bit PNG: the right size, ink where it was drawn, white elsewhere', () => {
  const b = new Bitmap(10, 3);
  b.set(0, 0);
  b.rect(8, 2, 2, 1);
  const out = png(b);
  assert.deepEqual([...out.subarray(1, 4)], [...Buffer.from('PNG')]);
  assert.equal(out.readUInt32BE(16), 10);
  assert.equal(out.readUInt32BE(20), 3);
  assert.equal(out[24], 1, 'one bit');
  const at = out.indexOf('IDAT');
  const rows = inflateSync(out.subarray(at + 4, at + 4 + out.readUInt32BE(at - 4)));
  // Two bytes a row plus the filter byte; a 0 bit is ink.
  assert.equal(rows.length, 9);
  assert.equal(rows[1] & 0x80, 0, 'ink at 0,0');
  assert.equal(rows[2] & 0x40, 0x40, 'paper at 9,0');
  assert.equal(rows[8] & 0xc0, 0, 'ink at 8 and 9 on the last row');
});

test('a one-bit BMP: bottom row first, rows padded to four bytes', () => {
  const b = new Bitmap(5, 2);
  b.set(0, 1);
  const out = bmp(b);
  assert.equal(out.toString('ascii', 0, 2), 'BM');
  assert.equal(out.length, 62 + 4 * 2);
  assert.equal(out.readUInt16LE(28), 1);
  assert.equal(out[62] & 0x80, 0, 'the bottom row comes first, with its ink');
  assert.equal(out[66] & 0x80, 0x80, 'the top row is paper');
});

test('text is drawn and too long a line ends in an ellipsis inside its width', () => {
  const b = new Bitmap(200, 40);
  const w = b.text(0, 0, 'Hello', 16);
  assert.equal(w, 40);
  assert.ok(b.px.some((p) => p === 1));
  const c = new Bitmap(100, 20);
  c.text(0, 0, 'A line far too long for its box', 16, 1, 80);
  for (let y = 0; y < 20; y++) for (let x = 80; x < 100; x++) assert.equal(c.px[y * 100 + x], 0, `nothing past the width at ${x},${y}`);
});

test('the panel draws with no data at all, and at any size asked', () => {
  const snap = { sources: {}, alerts: [], brand: { name: 'Home' } } as unknown as Snapshot;
  for (const [w, h] of [
    [800, 480],
    [296, 128],
    [1872, 1404],
  ]) {
    const b = drawPanel(snap, { w, h, f: false, clock24: true, invert: false, now: Date.UTC(2026, 10, 12, 9) });
    assert.equal(b.px.length, w * h);
    assert.ok(b.px.some((p) => p === 1));
  }
});

test('one widget on a panel: the number fills the middle, the line runs along the bottom, English words fill their blanks', async () => {
  const { drawNumberPanel, PANEL_FORMAT } = await import('../panel.ts');
  assert.equal(PANEL_FORMAT.t('{pool} used', { pool: 'tank' }), 'tank used');
  assert.equal(PANEL_FORMAT.t('Memory in use, of {total}'), 'Memory in use, of {total}', 'a blank with no value stays visible');
  assert.equal(PANEL_FORMAT.pct(9.84), '9.8%');
  const o = { w: 800, h: 480, f: true, clock24: false, invert: false, now: Date.UTC(2026, 10, 12, 20, 0) };
  const ink = (b: Bitmap, y0: number, y1: number) => b.px.subarray(y0 * b.w, y1 * b.w).reduce((n, v) => n + v, 0);
  const b = drawNumberPanel({ value: '$71,880', sub: 'Bitcoin', line: { data: [[0, 1], [1, 3], [2, 2]], label: 'BTC' } }, 'Markets', o);
  assert.ok(ink(b, 120, 260) > 5000, 'a big number in the middle');
  assert.ok(ink(b, 380, 470) > 200, 'its line near the bottom');
  // Nothing yet still draws a frame and says so, rather than failing.
  assert.ok(ink(drawNumberPanel(null, 'Server', o), 100, 300) > 500);
});
