import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { artFor, artViews, CAR_ART, CAR_OUTLINE } from '../../shared/car-art.ts';
import { labelSpots } from '../../shared/car-pictures.ts';
import { CHOICES } from '../../shared/setup.ts';

test('car drawings: every view in the catalog ships as a transparent WebP, spots inside it', () => {
  for (const art of CAR_ART) {
    assert.match(art.id, /^[a-z0-9-]+$/);
    for (const v of art.views) {
      const file = new URL(`../car-art/${art.id}/${v.view}.webp`, import.meta.url);
      assert.ok(existsSync(file), `${art.id}/${v.view}.webp`);
      const head = readFileSync(file).subarray(0, 30);
      assert.equal(head.toString('latin1', 8, 12), 'WEBP');
      // Lossless with an alpha channel: the VP8L header's alpha bit, so no paper shows on a card.
      assert.equal(head.toString('latin1', 12, 16), 'VP8L', `${v.view} is lossless`);
      assert.ok(head[24] & 0x10, `${v.view} has alpha`);
      assert.ok(v.aspect && v.aspect > 0.5 && v.aspect < 5);
      for (const xy of [...Object.values(v.at), v.port]) if (xy) assert.ok(xy.every((n) => n >= 0 && n <= 100), `${v.view} spot inside`);
    }
  }
});

test('car drawings: the one picked wins, else the model, else the outline', () => {
  assert.equal(artFor(undefined, 'Model 3'), 'model3-2017');
  assert.equal(artFor('auto', 'Model 3'), 'model3-2017');
  assert.equal(artFor('model3-2017', 'Model Y'), 'model3-2017', 'a pick overrides what Tessie reports');
  assert.equal(artFor(CAR_OUTLINE, 'Model 3'), undefined);
  assert.equal(artFor(undefined, 'Cybertruck'), undefined, 'no drawing yet: the outline');
  assert.equal(artFor('model9', 'Model 3'), undefined, 'an unknown pick draws the outline');
  assert.equal(artViews('model3-2017')[0].src, '/api/car-art/model3-2017/side.webp');
  assert.deepEqual(artViews(undefined), []);
});

test('car drawings: Settings lists each one under TESSIE_CAR, matching first', () => {
  const values = CHOICES.TESSIE_CAR.map(([v]) => v);
  assert.equal(values[0], 'auto');
  assert.ok(values.includes(CAR_OUTLINE));
  for (const a of CAR_ART) assert.ok(values.includes(a.id));
});

test('each pressure sits beside its tire, on its nearer side, clear of the next', () => {
  const h = 75;
  const l = labelSpots({ fl: [25, 60], fr: [43, 57], rl: null, rr: [73, 55] }, h);
  assert.equal(l.fl.left, true);
  assert.equal(l.fr.left, true);
  assert.equal(l.rr.left, false);
  assert.equal(l.rl.left, false, 'the hidden tire takes the emptier side');
  assert.ok(Math.abs(l.fl.y - l.fr.y) >= 11, 'two on one side clear each other');
  assert.ok(Math.abs(l.rr.y - (55 * h) / 100) < 1, 'a lone label sits at its tire');
  for (const s of Object.values(l)) assert.ok(s.y >= 8 && s.y <= h - 4);
});

test('car commands: only the ones Tessie takes, and a charge limit Tesla accepts', async () => {
  const { CAR_COMMANDS, checkLimit, isCarCommand } = await import('../../shared/car-commands.ts');
  assert.equal(isCarCommand('unlock'), true);
  assert.equal(isCarCommand('frunk'), true);
  assert.equal(isCarCommand('toString'), false, 'not an inherited name');
  assert.equal(isCarCommand('boost'), false);
  assert.equal(CAR_COMMANDS.trunk, 'activate_rear_trunk');
  assert.equal(checkLimit(90), 90);
  assert.equal(checkLimit('80'), 80);
  assert.equal(checkLimit(49), null);
  assert.equal(checkLimit(101), null);
  assert.equal(checkLimit('lots'), null);
});

test('car commands: unlocking and opening are the ones that need sign-in', async () => {
  const { OPENS_CAR } = await import('../../shared/car-commands.ts');
  assert.deepEqual([...OPENS_CAR].sort(), ['frunk', 'trunk', 'unlock']);
});

test('the demo car: a Model 3 with its built-in drawings, and a Car board seeded once', async () => {
  const { seedDemoCar } = await import('../demo-car.ts');
  const { removeBoard, savedBoards } = await import('../boards.ts');
  seedDemoCar();
  assert.ok(savedBoards().some((b) => b.id === 'car'));
  removeBoard('car');
  seedDemoCar();
  assert.ok(!savedBoards().some((b) => b.id === 'car'), 'a deleted Car board stays deleted');
});
