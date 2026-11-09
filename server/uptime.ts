// Daily health per container, for the square grids. Built from the state
// changes the hub records: for each local day, how long the container spent
// stopped or failing its health check. Days before Patchboard started
// watching are "none", so a new install doesn't claim a perfect month.

import type { Container, DayState, UptimeData } from '../shared/types.ts';
import { allEventsSince, kvGet } from './db.ts';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
/** Shorter blips (a recreate during an update) don't mark the day. */
const GRACE = 5 * MIN;

type S = 'running' | 'stopped' | 'unhealthy';

const after: Record<string, S> = {
  'container.stopped': 'stopped',
  'container.started': 'running',
  'container.unhealthy': 'unhealthy',
  'container.recovered': 'running',
};
const before: Record<string, S> = {
  'container.stopped': 'running',
  'container.started': 'stopped',
  'container.unhealthy': 'running',
  'container.recovered': 'unhealthy',
};

function localMidnight(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function uptimeDays(containers: Container[], days: number, expectStopped: Set<string>): UptimeData {
  const now = Date.now();
  const today = localMidnight(now);
  const starts: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    starts.push(d.getTime());
  }
  const windowStart = starts[0];
  const since = kvGet<number>('tracking-since') ?? now;

  const events = allEventsSince(0);
  const bySubject = new Map<string, { at: number; kind: string }[]>();
  for (const e of events) bySubject.set(e.subject, [...(bySubject.get(e.subject) ?? []), e]);

  // A stop seen but not settled yet (the grace before it counts) is still a
  // stop from that moment, not a stop for all time.
  const pending = kvGet<{ pending?: Record<string, { at: number }> }>('container-track')?.pending ?? {};
  const out: Record<string, DayState[]> = {};
  for (const c of containers) {
    // Only state changes shape the timeline; recorded actions ("restart") don't.
    const list = (bySubject.get(c.name) ?? []).filter((e) => e.kind in after);
    if (c.state !== 'running' && pending[c.name] && !list.some((e) => e.at >= pending[c.name].at)) list.push({ at: pending[c.name].at, kind: 'container.stopped' });
    const current: S = c.state !== 'running' ? 'stopped' : c.health === 'unhealthy' ? 'unhealthy' : 'running';
    // State at the start of the window: the last event before it, else what
    // the first event in the window implies, else the current state.
    const prior = list.filter((e) => e.at < windowStart).pop();
    const firstIn = list.find((e) => e.at >= windowStart);
    let state: S = prior ? after[prior.kind] : firstIn ? before[firstIn.kind] : current;

    // Intervals of (from, to, state) across the window.
    const spans: [number, number, S][] = [];
    let from = windowStart;
    for (const e of list.filter((x) => x.at >= windowStart)) {
      spans.push([from, e.at, state]);
      state = after[e.kind];
      from = e.at;
    }
    spans.push([from, now, state]);

    out[c.name] = starts.map((start) => {
      const end = start + DAY;
      const lo = Math.max(start, since);
      const hi = Math.min(end, now);
      if (hi <= lo) return 'none';
      let stopped = 0;
      let unhealthy = 0;
      for (const [a, b, s] of spans) {
        const overlap = Math.min(b, hi) - Math.max(a, lo);
        if (overlap <= 0) continue;
        if (s === 'stopped') stopped += overlap;
        if (s === 'unhealthy') unhealthy += overlap;
      }
      if (expectStopped.has(c.name)) return 'up';
      if (stopped >= GRACE) return 'down';
      if (unhealthy >= GRACE) return 'warn';
      return 'up';
    });
  }
  return { days: starts, since, containers: out };
}
