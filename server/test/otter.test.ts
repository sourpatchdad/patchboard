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
  assert.ok(otterSvg({ small: true }).length < otterSvg({}).length * 0.75);
});
