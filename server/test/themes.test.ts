import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { contrast, THEMES } from '../../web/lib/themes.ts';

test('theme text remains readable on every neutral surface in both modes', () => {
  for (const theme of THEMES) {
    for (const mode of ['dark', 'light'] as const) {
      for (const surface of ['bg', 'raised', 'surface'] as const) {
        for (const text of ['ink', 'ink2', 'ink3'] as const) {
          assert(contrast(theme[mode][text], theme[mode][surface]) >= 4.5,
            `${theme.name} ${mode}: ${text} on ${surface} must meet WCAG AA`);
        }
      }
    }
  }
});
