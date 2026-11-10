// What needs you: one list, so the header, the tab title, Needs attention and
// Jump to always count the same things. Notes (info) are kept apart: they
// never raise the count.

import type { Alert } from '../../shared/types.ts';

const ORDER: Record<Alert['level'], number> = { critical: 0, warn: 1, info: 2 };

/** Problems, worst first; the server's order within each level. */
export function needsYou(alerts: Alert[] | undefined): Alert[] {
  return (alerts ?? []).filter((a) => a.level !== 'info').sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}

/** Every alert, problems first, notes last: the order lists show them in. */
export function byUrgency(alerts: Alert[] | undefined): Alert[] {
  return [...(alerts ?? [])].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}
