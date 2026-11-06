import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { toDisks, toHost } from '../adapters/glances.ts';

const base = {
  system: { hostname: 'beelink', hr_name: 'Ubuntu 24.04 64bit' },
  quicklook: { cpu: 12.5 },
  mem: { percent: 58, used: 9e9, total: 16e9 },
  load: { min5: 1.2, cpucore: 8 },
  sensors: [
    { label: 'Package id 0', value: 54, unit: 'C', type: 'temperature_core' },
    { label: 'fan1', value: 1200, unit: 'R', type: 'fan_speed' },
  ],
  uptime: '18 days, 4:12:09',
};

test('Glances: real disks only, each device once, fullest first', () => {
  const disks = toDisks([
    { mnt_point: '/', device_name: '/dev/sda1', fs_type: 'ext4', size: 500, used: 300, percent: 60 },
    { mnt_point: '/etc/hosts', device_name: '/dev/sda1', fs_type: 'ext4', size: 500, used: 300, percent: 60 },
    { mnt_point: '/mnt/data', device_name: '/dev/sdb1', fs_type: 'xfs', size: 4000, used: 3600, percent: 90 },
    { mnt_point: '/boot/efi', device_name: '/dev/sda2', fs_type: 'vfat', size: 1, used: 0.1, percent: 10 },
    { mnt_point: '/snap/core', device_name: '/dev/loop0', fs_type: 'squashfs', size: 1, used: 1, percent: 100 },
  ]);
  assert.deepEqual(disks.map((d) => d.mount), ['/mnt/data', '/']);
});

test('Glances 4: network rates per second from physical interfaces; the hottest sensor wins', () => {
  const h = toHost('http://b:61208', 4, {
    ...base,
    fs: [],
    network: [
      { interface_name: 'eth0', bytes_recv_rate_per_sec: 2000, bytes_sent_rate_per_sec: 500 },
      { interface_name: 'docker0', bytes_recv_rate_per_sec: 99999, bytes_sent_rate_per_sec: 99999 },
    ],
  });
  assert.equal(h.name, 'beelink');
  assert.equal(h.cores, 8);
  assert.equal(h.rx, 2000);
  assert.equal(h.tx, 500);
  assert.equal(h.tempC, 54);
});

test('Glances 3: counters per refresh become rates', () => {
  const h = toHost('http://b:61208', 3, { ...base, fs: [], network: [{ interface_name: 'enp3s0', rx: 6000, tx: 3000, time_since_update: 3 }] });
  assert.equal(h.rx, 2000);
  assert.equal(h.tx, 1000);
});
