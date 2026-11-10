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

/**
 * The worst problem that names an app, for its light: an alert about the app
 * itself keeps its level; one that only comes from it (a Frigate camera
 * offline) is amber, since the app runs and something in it needs a look.
 */
export function alertLevelFor(alerts: Alert[] | undefined, app: { name: string; container?: string }): 'warn' | 'crit' | null {
  const keys = [app.name, app.container].filter(Boolean).map((k) => k!.toLowerCase());
  let level: 'warn' | 'crit' | null = null;
  for (const a of needsYou(alerts)) {
    const direct = !!a.subject && keys.includes(a.subject.toLowerCase());
    const from = !!a.source && a.source !== 'docker' && keys.includes(a.source.toLowerCase());
    if (direct && a.level === 'critical') return 'crit';
    if (direct || from) level = 'warn';
  }
  return level;
}
