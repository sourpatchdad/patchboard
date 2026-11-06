// Proxmox VE: each node, and every VM and LXC container with its state, CPU
// and memory, from one call to /cluster/resources. An API token with the
// PVEAuditor role is enough to read; starting and stopping guests needs
// PVEVMUser (VM.PowerMgmt) too. Most installs use a self-signed certificate, so
// verification is off unless PROXMOX_VERIFY_TLS=1.
// https://pve.proxmox.com/pve-docs/api-viewer/

import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { ProxmoxData, ProxmoxGuest, ProxmoxNode } from '../../shared/types.ts';
import { config } from '../config.ts';
import { type Adapter, SECOND } from './adapter.ts';

export interface PveResource {
  type: string;
  id?: string;
  node?: string;
  status?: string;
  name?: string;
  vmid?: number;
  cpu?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  uptime?: number;
  template?: number;
}

/** Nodes and guests from /cluster/resources. Templates are left out. */
export function toProxmox(rows: PveResource[]): Omit<ProxmoxData, 'webUrl'> {
  const nodes: ProxmoxNode[] = rows
    .filter((r) => r.type === 'node')
    .map((r) => ({
      name: r.node ?? r.id ?? 'node',
      online: r.status === 'online',
      cpu: r.cpu ?? 0,
      cores: r.maxcpu ?? 0,
      mem: r.mem ?? 0,
      maxmem: r.maxmem ?? 0,
      uptime: r.uptime ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const guests: ProxmoxGuest[] = rows
    .filter((r) => (r.type === 'qemu' || r.type === 'lxc') && !r.template)
    .map((r) => ({
      vmid: r.vmid ?? 0,
      name: r.name ?? `${r.type === 'lxc' ? 'CT' : 'VM'} ${r.vmid}`,
      kind: r.type === 'lxc' ? ('lxc' as const) : ('vm' as const),
      node: r.node ?? '',
      running: r.status === 'running',
      cpu: r.cpu ?? 0,
      mem: r.mem ?? 0,
      maxmem: r.maxmem ?? 0,
      uptime: r.uptime ?? 0,
    }))
    .sort((a, b) => a.vmid - b.vmid);
  return { nodes, guests };
}

/** Call a Proxmox API path, honoring the certificate setting. */
function pve<T>(path: string, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  const { url, tokenId, secret, verifyTls } = config.proxmox!;
  const target = new URL(`/api2/json${path}`, url);
  // https is the norm; http covers Proxmox behind a plain reverse proxy.
  const request = target.protocol === 'http:' ? httpRequest : httpsRequest;
  return new Promise((resolve, reject) => {
    const req = request(
      target,
      { method, headers: { Authorization: `PVEAPIToken=${tokenId}=${secret}`, Accept: 'application/json' }, rejectUnauthorized: verifyTls, timeout: 8000 },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode === 403) return reject(new Error('Proxmox refused: the token needs the VM.PowerMgmt permission for this (PVEVMUser role)'));
          if ((res.statusCode ?? 0) >= 400) return reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage ?? ''}`.trim()));
          try {
            resolve((JSON.parse(body) as { data: T }).data);
          } catch {
            reject(new Error('Proxmox sent something that is not JSON'));
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('Timed out after 8s')));
    // The message never carries the address or the token.
    req.on('error', (e) => reject(new Error((e as NodeJS.ErrnoException).code ? `Unreachable (${(e as NodeJS.ErrnoException).code})` : e.message)));
    req.end();
  });
}

export function proxmoxAdapter(): Adapter<ProxmoxData> {
  return {
    id: 'proxmox',
    label: 'Proxmox',
    intervalMs: 30 * SECOND,
    async fetch() {
      const rows = await pve<PveResource[]>('/cluster/resources');
      return { ...toProxmox(rows), webUrl: config.proxmox!.url };
    },
  };
}

export type GuestAction = 'start' | 'shutdown' | 'reboot';

/** Start, shut down (cleanly, through the guest) or reboot one VM or container. */
export async function proxmoxControl(node: string, kind: 'vm' | 'lxc', vmid: number, action: GuestAction): Promise<void> {
  await pve(`/nodes/${encodeURIComponent(node)}/${kind === 'lxc' ? 'lxc' : 'qemu'}/${vmid}/status/${action}`, 'POST');
}
