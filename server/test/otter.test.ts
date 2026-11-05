import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { moodFor, otterDataUrl, otterSvg } from '../../shared/otter.ts';

test('the otter follows the server: worried when down, alert when something needs you, asleep on quiet nights', () => {
  assert.equal(moodFor('critical'), 'worried');
  assert.equal(moodFor('warn', true), 'alert', 'trouble wakes it');
  assert.equal(moodFor(null), 'calm');
  assert.equal(moodFor(null, true), 'asleep');
});

test('every variant is a single SVG; tiles clip, the plain otter sits in a pool', () => {
  for (const o of [{}, { bg: 'light' as const }, { small: true, bg: 'none' as const }, { safe: true }, { square: true }, { badge: 'crit' as const, mood: 'worried' as const }]) {
    const svg = otterSvg(o);
    assert.equal(svg.match(/<svg/g)?.length, 1);
    assert.ok(svg.trim().endsWith('</svg>'));
  }
  assert.match(otterSvg({}), /otter-tile/);
  assert.match(otterSvg({ bg: 'none' }), /otter-pool/);
  assert.doesNotMatch(otterSvg({ bg: 'none' }), /otter-tile/);
  assert.match(otterSvg({ badge: 'warn' }), /#f0a43a/);
  assert.ok(otterDataUrl({ small: true }).startsWith('data:image/svg+xml,'));
});

test('the small drawing drops whiskers and the mouth so it reads at 16 pixels', () => {
  // Whiskers are the stroked group; the calm mouth is the "w" path.
  assert.match(otterSvg({}), /stroke-width="2.1"/);
  assert.doesNotMatch(otterSvg({ small: true }), /stroke-width="2.1"/);
  assert.match(otterSvg({ mood: 'hello' }), /q4.25 5.5 8.5 0/);
  assert.doesNotMatch(otterSvg({ mood: 'hello', small: true }), /q4.25 5.5 8.5 0/);
});
