import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { dockerStamp } from '../adapters/docker.ts';

test("Docker's stamp comes off the front of a line as a time; a line without one stays whole", () => {
  assert.deepEqual(dockerStamp('2026-11-09T01:17:45.123456789Z [jellyfin] INFO Import complete'), {
    text: '[jellyfin] INFO Import complete',
    at: Date.parse('2026-11-09T01:17:45.123Z'),
  });
  assert.deepEqual(dockerStamp('2026-11-09T01:17:45Z '), { text: '', at: Date.parse('2026-11-09T01:17:45Z') });
  assert.deepEqual(dockerStamp('INFO no stamp here'), { text: 'INFO no stamp here' });
  assert.deepEqual(dockerStamp(''), { text: '' });
});
