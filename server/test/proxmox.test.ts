import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { toProxmox } from '../adapters/proxmox.ts';

test('Proxmox: nodes and guests from /cluster/resources, templates and storage left out', () => {
  const out = toProxmox([
    { type: 'node', node: 'pve1', status: 'online', cpu: 0.2, maxcpu: 16, mem: 4e9, maxmem: 8e9, uptime: 100 },
    { type: 'node', node: 'pve2', status: 'offline' },
    { type: 'qemu', vmid: 101, name: 'docker', node: 'pve1', status: 'running', cpu: 0.1, mem: 1e9, maxmem: 2e9, uptime: 50 },
    { type: 'lxc', vmid: 100, name: 'pihole', node: 'pve2', status: 'stopped' },
    { type: 'qemu', vmid: 900, name: 'debian-template', node: 'pve1', status: 'stopped', template: 1 },
    { type: 'storage', id: 'storage/pve1/local' },
  ]);
  assert.deepEqual(out.nodes.map((n) => [n.name, n.online, n.cores]), [['pve1', true, 16], ['pve2', false, 0]]);
  assert.deepEqual(out.guests.map((g) => [g.vmid, g.kind, g.running]), [[100, 'lxc', false], [101, 'vm', true]]);
});
