// Home Assistant rules shared by the server and the browser: which entities
// Patchboard may act on, and how. Only entities pinned to a Home Assistant
// widget on the saved board can be watched or changed.

import type { Board } from './board.ts';

export const HA_ENTITY = /^[a-z_]{1,32}\.[a-z0-9_]{1,96}$/;
export const HA_MAX_PINNED = 24;

/** Flipped with one tap. */
const TOGGLE = new Set(['light', 'switch', 'fan', 'input_boolean', 'automation']);
/** Run with one tap. */
const RUN: Record<string, string> = { scene: 'turn_on', script: 'turn_on', button: 'press', input_button: 'press' };

export type HaAction = 'toggle' | 'run';

/**
 * What a tap does for this entity, or null for read-only. Locks, covers
 * (garage doors), alarms and climate stay read-only on purpose: a dashboard
 * tap shouldn't open the house.
 */
export function haActionFor(entityId: string): HaAction | null {
  const domain = entityId.split('.')[0];
  if (TOGGLE.has(domain)) return 'toggle';
  if (domain in RUN) return 'run';
  return null;
}

/** The Home Assistant service a Patchboard action calls. */
export function haService(entityId: string, action: HaAction): [string, string] | null {
  const domain = entityId.split('.')[0];
  if (action === 'toggle' && TOGGLE.has(domain)) return [domain, 'toggle'];
  if (action === 'run' && domain in RUN) return [domain, RUN[domain]];
  return null;
}

/** Parse a widget's comma-separated list, keeping valid ids only. */
export function parseEntities(list: string | undefined): string[] {
  const out: string[] = [];
  for (const raw of (list ?? '').split(',')) {
    const id = raw.trim().toLowerCase();
    if (HA_ENTITY.test(id) && !out.includes(id)) out.push(id);
  }
  return out.slice(0, HA_MAX_PINNED);
}

/** Every entity pinned on the board, across all Home Assistant widgets. */
export function pinnedEntities(board: Board | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const w of board?.widgets ?? []) if (w.type === 'homeassistant') for (const id of parseEntities(w.config?.entities)) out.add(id);
  return out;
}
