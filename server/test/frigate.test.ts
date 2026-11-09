import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { validateBoard } from '../../shared/board.ts';
import { camerasField } from '../../shared/fields.ts';
import { toEvents } from '../adapters/frigate.ts';

test('Frigate events: newest first, in milliseconds, with a recognised name and the score as a percentage', () => {
  const e = toEvents([
    { id: 'a', camera: 'driveway', label: 'car', start_time: 1_794_000_000.5, top_score: 0.81, zones: [] },
    { id: 'b', camera: 'front_door', label: 'person', sub_label: ['Sam', 0.9], start_time: 1_794_000_600, data: { top_score: 0.93 }, zones: ['porch'] },
    { id: 'c', camera: 'gate', label: 'person', start_time: 'soon' as unknown as number },
  ]);
  assert.deepEqual(e.map((x) => x.id), ['b', 'a'], 'the malformed one is dropped');
  assert.deepEqual(e[0], { id: 'b', camera: 'front_door', label: 'person', name: 'Sam', at: 1_794_000_600_000, score: 93, zones: ['porch'] });
  assert.equal(e[1].at, 1_794_000_000_500);
  assert.equal(e[1].score, 81);
});

test('the cameras setting keeps names Frigate could have and drops the rest', () => {
  assert.equal(camerasField.check('front_door\nback door\n../etc\ngarage-2'), 'front_door\ngarage-2');
  assert.equal(camerasField.check('  '), null);
  const v = validateBoard({ widgets: [{ id: 'cameras-1', type: 'cameras', size: 'w', config: { cameras: 'front_door\nbad name', limit: '4' } }] });
  assert.ok('board' in v);
  assert.deepEqual(v.board.widgets.find((w) => w.type === 'cameras')?.config, { cameras: 'front_door', limit: '4' });
});
