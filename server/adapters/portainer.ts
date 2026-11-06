// Portainer: every Docker environment it manages, with running, stopped and
// unhealthy containers and stacks, from the snapshot Portainer keeps for
// each one. One call, however many hosts. An access token with read access
// is enough. https://docs.portainer.io/api/docs

import type { PortainerData, PortainerEnv } from '../../shared/types.ts';
import { config } from '../config.ts';
import { getJson } from '../http.ts';
import { type Adapter, MINUTE } from './adapter.ts';

export interface RawEndpoint {
  Id: number;
  Name?: string;
  Type?: number;
  Status?: number;
  Snapshots?: { RunningContainerCount?: number; StoppedContainerCount?: number; UnhealthyContainerCount?: number; StackCount?: number; DockerVersion?: string; Time?: number }[];
}

/** Status 1 is up, 2 is down. Kubernetes environments (types 5 to 7) are left out. */
export function toEnvs(raw: RawEndpoint[]): PortainerEnv[] {
  return raw
    .filter((e) => !e.Type || e.Type < 5)
    .map((e) => {
      const s = e.Snapshots?.[0] ?? {};
      return {
        id: e.Id,
        name: e.Name ?? `Environment ${e.Id}`,
        up: e.Status !== 2,
        running: s.RunningContainerCount ?? 0,
        stopped: s.StoppedContainerCount ?? 0,
        unhealthy: s.UnhealthyContainerCount ?? 0,
        stacks: s.StackCount ?? 0,
        docker: s.DockerVersion,
        snapshotAt: s.Time ? s.Time * 1000 : undefined,
      };
    })
    .sort((a, b) => Number(a.up) - Number(b.up) || b.unhealthy - a.unhealthy || a.name.localeCompare(b.name));
}

export function portainerAdapter(): Adapter<PortainerData> {
  const { url, key } = config.portainer!;
  return {
    id: 'portainer',
    label: 'Portainer',
    intervalMs: MINUTE,
    async fetch() {
      const envs = toEnvs(await getJson<RawEndpoint[]>(`${url}/api/endpoints`, { headers: { 'X-API-Key': key, Accept: 'application/json' } }));
      return { envs, webUrl: url };
    },
  };
}
