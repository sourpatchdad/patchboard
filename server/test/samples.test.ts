import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { MAX_SAMPLES, samples } from '../samples.ts';

test('the widget gallery gets made-up data for the apps it asks about, and nothing for names it makes up', async () => {
  const got = await samples(['weather', 'tautulli', 'homeassistant', 'not-a-source', 'weather']);
  assert.deepEqual(Object.keys(got).sort(), ['homeassistant', 'tautulli', 'weather']);
  for (const s of Object.values(got)) {
    assert.equal(s.ok, true, `${s.id} reads as answering, so the widget draws`);
    assert.ok(s.data, `${s.id} has data to draw`);
  }
});

test('one request asks for at most every widget the gallery holds', async () => {
  const many = Array.from({ length: MAX_SAMPLES + 20 }, (_, i) => `made-up-${i}`).concat('weather');
  assert.deepEqual(await samples(many), {}, 'names past the limit are not read, even real ones');
});
