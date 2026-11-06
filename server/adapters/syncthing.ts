// Syncthing: each folder's state and each device's last contact, from its REST
// API with the key from Actions, Settings. Most run plain http on the LAN; a
// GUI with its own certificate works with SYNCTHING_VERIFY_TLS left off.
// https://docs.syncthing.net/dev/rest.html

import type { SyncDevice, SyncFolder, SyncthingData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { fetchText } from '../http.ts';
import { type Adapter, SECOND } from './adapter.ts';

export interface StFolderConfig {
  id: string;
  label?: string;
  paused?: boolean;
}
export interface StFolderStatus {
  state?: string;
  globalBytes?: number;
  needBytes?: number;
  errors?: number;
  pullErrors?: number;
  error?: string;
}
export interface StDeviceConfig {
  deviceID: string;
  name?: string;
  paused?: boolean;
}

/** A folder in words Patchboard can sort and alert on. */
export function toFolder(cfg: StFolderConfig, st: StFolderStatus): SyncFolder {
  const failing = (st.pullErrors ?? 0) + (st.errors ?? 0);
  const total = st.globalBytes ?? 0;
  const need = st.needBytes ?? 0;
  const state: SyncFolder['state'] = cfg.paused
    ? 'paused'
    : st.state === 'error' || st.error
      ? 'error'
      : failing > 0
        ? 'failing'
        : need > 0 || /sync|scan/.test(st.state ?? '')
          ? 'syncing'
          : 'idle';
  return {
    id: cfg.id,
    label: cfg.label || cfg.id,
    state,
    bytes: total,
    pct: total ? Math.round(((total - need) / total) * 100) : 100,
    failing,
    error: st.error || undefined,
  };
}

/** Every device but this one. Last seen comes from Syncthing's own stats. */
export function toDevices(cfgs: StDeviceConfig[], myId: string, connections: Record<string, { connected?: boolean }>, stats: Record<string, { lastSeen?: string }>): SyncDevice[] {
  return cfgs
    .filter((d) => d.deviceID !== myId)
    .map((d) => {
      const seen = Date.parse(stats[d.deviceID]?.lastSeen ?? '');
      return {
        id: d.deviceID,
        name: d.name || d.deviceID.slice(0, 7),
        connected: !!connections[d.deviceID]?.connected,
        paused: !!d.paused,
        // Syncthing writes 1970 for a device it has never met.
        lastSeen: seen > 86_400_000 ? seen : undefined,
      };
    });
}

export function syncthingAdapter(): Adapter<SyncthingData> {
  const { url, key, verifyTls } = config.syncthing!;
  const get = async <T>(path: string): Promise<T> => JSON.parse(await fetchText(`${url}${path}`, { verifyTls, headers: { 'X-API-Key': key } })) as T;
  return {
    id: 'syncthing',
    label: 'Syncthing',
    intervalMs: 60 * SECOND,
    async fetch() {
      const [status, folders, devices, conns, stats] = await Promise.all([
        get<{ myID: string }>('/rest/system/status'),
        get<StFolderConfig[]>('/rest/config/folders'),
        get<StDeviceConfig[]>('/rest/config/devices'),
        get<{ connections: Record<string, { connected?: boolean }> }>('/rest/system/connections'),
        get<Record<string, { lastSeen?: string }>>('/rest/stats/device'),
      ]);
      const states = await Promise.all(folders.slice(0, 60).map((f) => get<StFolderStatus>(`/rest/db/status?folder=${encodeURIComponent(f.id)}`).catch(() => ({ state: 'error', error: 'No status' }))));
      return {
        webUrl: url,
        folders: folders.slice(0, 60).map((f, i) => toFolder(f, states[i])),
        devices: toDevices(devices, status.myID, conns.connections ?? {}, stats),
      };
    },
  };
}
