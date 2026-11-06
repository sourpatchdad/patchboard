import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { proxmoxControl, toProxmox } from '../adapters/proxmox.ts';
import { withConfig } from '../config.ts';

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

test('Proxmox guest actions POST to the right guest, and a missing permission says which one', async () => {
  const seen: string[] = [];
  const server = createServer((req, res) => {
    seen.push(`${req.method} ${req.url} ${req.headers.authorization}`);
    if (req.url?.includes('/200/')) return res.writeHead(403).end();
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"data":"UPID:pve1:0001"}');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await withConfig({ PROXMOX_URL: url, PROXMOX_TOKEN_ID: 'pb@pve!dash', PROXMOX_SECRET: 's3cret' }, async () => {
      await proxmoxControl('pve1', 'vm', 101, 'shutdown');
      await proxmoxControl('pve 2', 'lxc', 105, 'start');
      await assert.rejects(proxmoxControl('pve1', 'lxc', 200, 'reboot'), /VM\.PowerMgmt/);
    });
  } finally {
    server.close();
  }
  assert.deepEqual(seen, [
    'POST /api2/json/nodes/pve1/qemu/101/status/shutdown PVEAPIToken=pb@pve!dash=s3cret',
    'POST /api2/json/nodes/pve%202/lxc/105/status/start PVEAPIToken=pb@pve!dash=s3cret',
    'POST /api2/json/nodes/pve1/lxc/200/status/reboot PVEAPIToken=pb@pve!dash=s3cret',
  ]);
});
