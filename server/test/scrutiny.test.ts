import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { toDrives } from '../adapters/scrutiny.ts';

test('Scrutiny: device_status 1 is a failed SMART check, 2 a threshold warning, 0 healthy; names drop /dev/', () => {
  const drives = toDrives({
    data: {
      summary: {
        a: { device: { wwn: 'a', device_name: '/dev/sdb', model_name: 'WD Red', device_status: 2 }, smart: { temp: 38, power_on_hours: 20000, collector_date: '2026-11-05T10:00:00Z' } },
        b: { device: { wwn: 'b', device_name: '/dev/sda', model_name: 'WD Red', device_status: 0 }, smart: { temp: 36 } },
        c: { device: { wwn: 'c', device_name: 'sdc', device_status: 3 } },
      },
    },
  });
  assert.deepEqual(drives.map((d) => [d.name, d.status]), [['sda', 'ok'], ['sdb', 'warn'], ['sdc', 'failed']]);
  assert.equal(drives[1].hours, 20000);
});
