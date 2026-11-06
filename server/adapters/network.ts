// UniFi and Tailscale: the network around the server.
// UniFi: the official Network API on a UniFi OS console (UniFi Network 9.0
// and newer), with an API key from Control Plane, Integrations. Clients and
// every device, online or not, across every site.
// Tailscale: the tailnet's machines, which are online, and keys about to
// expire. An API access token from the admin console.

import type { TailnetData, TailnetDevice, UnifiData, UnifiDevice } from '../../shared/types.ts';
import { config } from '../config.ts';
import { fetchText, getJson } from '../http.ts';
import { type Adapter, MINUTE } from './adapter.ts';

type Page<T> = { data?: T[]; totalCount?: number };

export function toUnifiDevices(rows: { id?: string; name?: string; model?: string; state?: string; macAddress?: string }[], site: string): UnifiDevice[] {
  return rows.map((d) => ({ id: d.id ?? d.macAddress ?? d.name ?? '?', name: d.name || d.model || 'device', model: d.model, online: (d.state ?? 'ONLINE').toUpperCase() === 'ONLINE', site }));
}

export function unifiAdapter(): Adapter<UnifiData> {
  const { url, key, verifyTls } = config.unifi!;
  const api = async <T>(path: string): Promise<T> => JSON.parse(await fetchText(`${url}/proxy/network/integration/v1${path}`, { verifyTls, headers: { 'X-API-KEY': key, Accept: 'application/json' } })) as T;
  return {
    id: 'unifi',
    label: 'UniFi',
    intervalMs: MINUTE,
    async fetch() {
      const sites = (await api<Page<{ id: string; name?: string }>>('/sites')).data ?? [];
      let clients = 0;
      const devices: UnifiDevice[] = [];
      for (const s of sites.slice(0, 20)) {
        const [d, c] = await Promise.all([api<Page<Parameters<typeof toUnifiDevices>[0][number]>>(`/sites/${s.id}/devices?limit=200`), api<Page<unknown>>(`/sites/${s.id}/clients?limit=1`)]);
        devices.push(...toUnifiDevices(d.data ?? [], s.name ?? 'Default'));
        clients += c.totalCount ?? 0;
      }
      return { clients, devices, sites: sites.length, webUrl: url };
    },
  };
}

type RawTsDevice = { id?: string; name?: string; hostname?: string; os?: string; lastSeen?: string; connectedToControl?: boolean; expires?: string; keyExpiryDisabled?: boolean; updateAvailable?: boolean };

/** Online when connected to control, or seen in the last five minutes on older API answers. */
export function toTailnet(rows: RawTsDevice[], now = Date.now()): TailnetDevice[] {
  return rows
    .map((d) => {
      const expires = d.keyExpiryDisabled || !d.expires || d.expires.startsWith('0001') ? undefined : Date.parse(d.expires);
      return {
        id: d.id ?? d.name ?? '?',
        name: (d.name ?? d.hostname ?? '?').split('.')[0],
        os: d.os,
        online: d.connectedToControl ?? (d.lastSeen ? now - Date.parse(d.lastSeen) < 5 * MINUTE : false),
        lastSeen: d.lastSeen ? Date.parse(d.lastSeen) : undefined,
        keyExpires: expires,
        update: !!d.updateAvailable,
      };
    })
    .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
}

export function tailscaleAdapter(): Adapter<TailnetData> {
  const { key, tailnet } = config.tailscale!;
  return {
    id: 'tailscale',
    label: 'Tailscale',
    intervalMs: 2 * MINUTE,
    async fetch() {
      const r = await getJson<{ devices?: RawTsDevice[] }>(`https://api.tailscale.com/api/v2/tailnet/${encodeURIComponent(tailnet)}/devices?fields=all`, { headers: { Authorization: `Bearer ${key}` } });
      return { devices: toTailnet(r.devices ?? []) };
    },
  };
}
