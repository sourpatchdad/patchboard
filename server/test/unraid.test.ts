import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { toUnraid } from '../adapters/unraid.ts';

test('Unraid: the array and cache pools become volumes; empty slots drop; a disabled disk is a failure', () => {
  const n = toUnraid(
    {
      info: { os: { hostname: 'tower' } },
      array: {
        state: 'STARTED',
        capacity: { kilobytes: { free: '1000', used: '3000', total: '4000' } },
        parities: [{ name: 'parity', status: 'DISK_OK', temp: 33 }],
        disks: [
          { name: 'disk1', status: 'DISK_OK', temp: 35 },
          { name: 'disk2', status: 'DISK_DSBL', temp: null },
          { name: 'disk3', status: 'DISK_NP' },
        ],
        caches: [{ name: 'cache', status: 'DISK_OK', temp: 41, fsSize: 500, fsUsed: 100 }],
      },
    },
    'http://tower.local',
  );
  assert.equal(n.name, 'tower');
  assert.equal(n.state, undefined);
  assert.deepEqual(n.volumes.map((v) => [v.name, v.used, v.total]), [['Array', 3000 * 1024, 4000 * 1024], ['cache', 100 * 1024, 500 * 1024]]);
  assert.deepEqual(n.disks.map((d) => [d.name, d.role, d.status]), [['parity', 'parity', 'ok'], ['disk1', 'data', 'ok'], ['disk2', 'data', 'failed'], ['cache', 'cache', 'ok']]);
  assert.equal(n.disks[2].detail, 'disabled');
});

test('Unraid: a stopped array is a whole-system state', () => {
  assert.equal(toUnraid({ array: { state: 'STOPPED' } }, 'http://tower.local').state, 'The array is stopped');
});
