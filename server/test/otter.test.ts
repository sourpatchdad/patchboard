import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { moodFor, OTTER_MOODS, otterSrc } from '../../shared/otter.ts';

test('the otter follows the server: worried when down, alert when something needs you, asleep on quiet nights', () => {
  assert.equal(moodFor('critical'), 'worried');
  assert.equal(moodFor('warn', true), 'alert', 'trouble wakes it');
  assert.equal(moodFor(null), 'calm');
  assert.equal(moodFor(null, true), 'asleep');
  assert.equal(moodFor(null, false, 15), 'hello', 'image updates wake it, eyes open');
  assert.equal(moodFor(null, true, 15), 'asleep', 'but they can wait until morning');
  assert.equal(moodFor('warn', false, 15), 'alert');
});

test('every mood has its art and its built images', () => {
  for (const mood of OTTER_MOODS) {
    assert.ok(existsSync(`scripts/otter/${mood}.webp`), `scripts/otter/${mood}.webp`);
    for (const o of [{ tile: true }, {}, { mark: true }]) {
      const src = otterSrc(mood, o);
      assert.ok(existsSync(`web/public${src}`), `${src}: run npm run icons`);
    }
  }
  assert.equal(otterSrc('calm'), '/otter/calm-clear.png');
  assert.equal(otterSrc('alert', { tile: true }), '/otter/alert.png');
});

test('the app icons the manifests and index.html name exist', () => {
  for (const f of ['icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'icon-light-180.png', 'icon-light-192.png', 'icon-light-512.png', 'icon-light-maskable-512.png', 'favicon.png', 'favicon.ico'])
    assert.ok(existsSync(`web/public/${f}`), f);
});
