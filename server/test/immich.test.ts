import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { toQueues } from '../adapters/immich.ts';

test('Immich queues read from /api/jobs: waiting includes delayed, paused comes from queueStatus', () => {
  const q = toQueues({
    thumbnailGeneration: { jobCounts: { active: 2, waiting: 140, delayed: 8, failed: 0, paused: 0 }, queueStatus: { isPaused: false } },
    faceDetection: { jobCounts: { active: 0, waiting: 0, delayed: 0, failed: 3 }, queueStatus: { isPaused: true } },
  });
  assert.deepEqual(q, [
    { name: 'faceDetection', active: 0, waiting: 0, failed: 3, paused: true },
    { name: 'thumbnailGeneration', active: 2, waiting: 148, failed: 0, paused: false },
  ]);
});

test('Immich queues read from the newer /api/queues list, with missing counts as zero', () => {
  assert.deepEqual(toQueues([{ name: 'smartSearch', isPaused: false, statistics: { active: 1 } }, { name: 'library' }]), [
    { name: 'library', active: 0, waiting: 0, failed: 0, paused: false },
    { name: 'smartSearch', active: 1, waiting: 0, failed: 0, paused: false },
  ]);
});
