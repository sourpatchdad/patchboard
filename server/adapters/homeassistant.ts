// Home Assistant: the states of the entities pinned on the boards, and one tap
// to toggle a light or run a scene. A long-lived access token reads
// everything the token's user can; Patchboard only shows and changes what you
// pinned, and only the domains in shared/ha.ts.

import { savedBoards } from '../boards.ts';
import { type HaAction, haService, pinnedEntities } from '../../shared/ha.ts';
import type { HaEntity, HomeAssistantData } from '../../shared/types.ts';
import { config } from '../config.ts';

import { getJson, request } from '../http.ts';
import { type Adapter, SECOND } from './adapter.ts';

interface State {
  entity_id: string;
  state: string;
  last_changed: string;
  attributes: { friendly_name?: string; unit_of_measurement?: string; device_class?: string };
}

const headers = () => ({ Authorization: `Bearer ${config.homeassistant!.token}`, 'Content-Type': 'application/json' });
const states = () => getJson<State[]>(`${config.homeassistant!.url}/api/states`, { headers: headers() });

/** Entities pinned to a Home Assistant widget on any board: the only ones fetched or changed. */
export function pinnedAnywhere(): Set<string> {
  const out = new Set<string>();
  for (const { board } of savedBoards()) for (const id of pinnedEntities(board)) out.add(id);
  return out;
}

export function toEntity(s: State): HaEntity {
  return {
    id: s.entity_id,
    name: s.attributes.friendly_name ?? s.entity_id,
    state: s.state,
    unit: s.attributes.unit_of_measurement,
    deviceClass: s.attributes.device_class,
    changedAt: Date.parse(s.last_changed) || 0,
  };
}

export function homeAssistantAdapter(): Adapter<HomeAssistantData> {
  return {
    id: 'homeassistant',
    label: 'Home Assistant',
    intervalMs: 15 * SECOND,
    async fetch() {
      const pinned = pinnedAnywhere();
      const all = await states();
      return { total: all.length, entities: all.filter((s) => pinned.has(s.entity_id)).map(toEntity) };
    },
  };
}

/** Everything, for the widget's entity picker. Names and states only. */
export async function haEntityList(): Promise<HaEntity[]> {
  return (await states()).map(toEntity).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 5000);
}

/** Toggle or run one entity. The caller has already checked it's pinned. */
export async function haCall(entityId: string, action: HaAction): Promise<void> {
  const svc = haService(entityId, action);
  if (!svc) throw new Error('That entity has no such action');
  await request(`${config.homeassistant!.url}/api/services/${svc[0]}/${svc[1]}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ entity_id: entityId }),
  });
}
