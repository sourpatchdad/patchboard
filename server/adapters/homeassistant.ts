// Home Assistant: the states of the entities pinned on the boards, and one tap
// to toggle a light or run a scene. A long-lived access token reads
// everything the token's user can; Patchboard only shows and changes what you
// pinned, and only the domains in shared/ha.ts.

import { savedBoards } from '../boards.ts';
import { type HaAction, haService, pinnedEntities } from '../../shared/ha.ts';
import type { HaEntity, HomeAssistantData, TodoItem } from '../../shared/types.ts';
import { config } from '../config.ts';

import { getJson, request } from '../http.ts';
import { type Adapter, SECOND } from './adapter.ts';

interface State {
  entity_id: string;
  state: string;
  last_changed: string;
  attributes: {
    friendly_name?: string;
    unit_of_measurement?: string;
    device_class?: string;
    current_temperature?: number;
    temperature?: number;
    min_temp?: number;
    max_temp?: number;
    target_temp_step?: number;
    hvac_action?: string;
    current_position?: number;
  };
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

const headers = () => ({ Authorization: `Bearer ${config.homeassistant!.token}`, 'Content-Type': 'application/json' });
const states = () => getJson<State[]>(`${config.homeassistant!.url}/api/states`, { headers: headers() });

/** Entities pinned to a Home Assistant widget on any board: the only ones fetched or changed. */
export function pinnedAnywhere(): Set<string> {
  const out = new Set<string>();
  for (const { board } of savedBoards()) for (const id of pinnedEntities(board)) out.add(id);
  return out;
}

export function toEntity(s: State): HaEntity {
  const a = s.attributes;
  const domain = s.entity_id.split('.')[0];
  return {
    id: s.entity_id,
    name: a.friendly_name ?? s.entity_id,
    state: s.state,
    unit: a.unit_of_measurement,
    deviceClass: a.device_class,
    changedAt: Date.parse(s.last_changed) || 0,
    ...(domain === 'climate'
      ? { attrs: { current: num(a.current_temperature), target: num(a.temperature), min: num(a.min_temp), max: num(a.max_temp), step: num(a.target_temp_step), action: a.hvac_action } }
      : domain === 'cover'
        ? { attrs: { position: num(a.current_position) } }
        : {}),
  };
}

/** One entity's state, for checking its class or range before an action. */
export async function haEntity(id: string): Promise<HaEntity> {
  return toEntity(await getJson<State>(`${config.homeassistant!.url}/api/states/${encodeURIComponent(id)}`, { headers: headers() }));
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

/** Toggle, run, set or move one entity. The caller has already checked it's pinned and allowed. */
export async function haCall(entityId: string, action: HaAction, extra: Record<string, number> = {}): Promise<void> {
  const svc = haService(entityId, action);
  if (!svc) throw new Error('That entity has no such action');
  await request(`${config.homeassistant!.url}/api/services/${svc[0]}/${svc[1]}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ entity_id: entityId, ...extra }),
  });
}

/** A to-do list's items, open first. Needs Home Assistant 2024.1 or later, for services that answer. */
export async function haTodoItems(entityId: string): Promise<TodoItem[]> {
  const r = await getJson<{ service_response?: Record<string, { items?: { uid?: string; summary?: string; status?: string; due?: string }[] }> }>(
    `${config.homeassistant!.url}/api/services/todo/get_items?return_response`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ entity_id: entityId }) },
  );
  return (r.service_response?.[entityId]?.items ?? [])
    .filter((i) => i.uid && i.summary)
    .map((i) => ({ uid: i.uid!, summary: i.summary!, done: i.status === 'completed', due: i.due }));
}

/** Add an item, or mark one done or not done again. */
export async function haTodoChange(entityId: string, change: { add?: string; done?: string; undo?: string }): Promise<void> {
  const call = (service: string, body: Record<string, string>) =>
    request(`${config.homeassistant!.url}/api/services/todo/${service}`, { method: 'POST', headers: headers(), body: JSON.stringify({ entity_id: entityId, ...body }) });
  if (change.add) await call('add_item', { item: change.add });
  else if (change.done) await call('update_item', { item: change.done, status: 'completed' });
  else if (change.undo) await call('update_item', { item: change.undo, status: 'needs_action' });
}
