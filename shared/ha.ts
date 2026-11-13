// Home Assistant rules shared by the server and the browser: which entities
// Patchboard may act on, and how. Only entities pinned to a Home Assistant
// widget on the saved board can be watched or changed: the Home Assistant
// widget itself, or a List, Thermostat, Shades or People widget.

import type { Board, WidgetType } from './board.ts';

export const HA_ENTITY = /^[a-z_]{1,32}\.[a-z0-9_]{1,96}$/;
export const HA_MAX_PINNED = 24;

/** Flipped with one tap. */
const TOGGLE = new Set(['light', 'switch', 'fan', 'input_boolean', 'automation']);
/** Run with one tap. */
const RUN: Record<string, string> = { scene: 'turn_on', script: 'turn_on', button: 'press', input_button: 'press' };

export type HaAction = 'toggle' | 'run' | 'set' | 'open' | 'close' | 'stop';

/** Covers a tap may move: blinds and their kin. Garage doors, gates and doors stay read-only. */
export const SHADE_CLASSES = new Set(['shade', 'blind', 'curtain', 'awning', 'shutter']);

/**
 * The widgets that pin Home Assistant entities, with the kinds each takes
 * and how many. An empty kind list takes any kind.
 */
export const HA_WIDGETS: Partial<Record<WidgetType, { domains: string[]; max: number }>> = {
  homeassistant: { domains: [], max: HA_MAX_PINNED },
  halist: { domains: ['todo'], max: 1 },
  climate: { domains: ['climate'], max: 1 },
  shades: { domains: ['cover'], max: 12 },
  people: { domains: ['person'], max: 12 },
};

/**
 * Whether this action is allowed on this entity, beyond a tap: a thermostat's
 * set point, and a shade's open, close and stop. The server checks the
 * entity's own class before it moves anything.
 */
export function haAllows(entityId: string, action: HaAction, deviceClass?: string): boolean {
  const domain = entityId.split('.')[0];
  if (action === 'toggle' || action === 'run') return haActionFor(entityId) === action;
  if (action === 'set') return domain === 'climate';
  return domain === 'cover' && !!deviceClass && SHADE_CLASSES.has(deviceClass);
}

/**
 * What a tap does for this entity, or null for read-only. Locks, covers
 * (garage doors), alarms and climate stay read-only on purpose: a dashboard
 * tap shouldn't open the house.
 */
export function haActionFor(entityId: string): 'toggle' | 'run' | null {
  const domain = entityId.split('.')[0];
  if (TOGGLE.has(domain)) return 'toggle';
  if (domain in RUN) return 'run';
  return null;
}

/** The Home Assistant service a Patchboard action calls. */
export function haService(entityId: string, action: HaAction): [string, string] | null {
  const domain = entityId.split('.')[0];
  if (action === 'set') return domain === 'climate' ? ['climate', 'set_temperature'] : null;
  if (action === 'open' || action === 'close' || action === 'stop') return domain === 'cover' ? ['cover', `${action}_cover`] : null;
  if (action === 'toggle' && TOGGLE.has(domain)) return [domain, 'toggle'];
  if (action === 'run' && domain in RUN) return [domain, RUN[domain]];
  return null;
}

/** Parse a widget's comma-separated list, keeping valid ids only, of the kinds this widget takes. */
export function parseEntities(list: string | undefined, type: WidgetType = 'homeassistant'): string[] {
  const rule = HA_WIDGETS[type] ?? HA_WIDGETS.homeassistant!;
  const out: string[] = [];
  for (const raw of (list ?? '').split(',')) {
    const id = raw.trim().toLowerCase();
    if (HA_ENTITY.test(id) && !out.includes(id) && (!rule.domains.length || rule.domains.includes(id.split('.')[0]))) out.push(id);
  }
  return out.slice(0, rule.max);
}

/** Every entity pinned on the board, across all the widgets that pin Home Assistant entities. */
export function pinnedEntities(board: Board | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const w of board?.widgets ?? []) if (HA_WIDGETS[w.type]) for (const id of parseEntities(w.config?.entities, w.type)) out.add(id);
  return out;
}
