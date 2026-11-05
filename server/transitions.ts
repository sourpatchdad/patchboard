// Container state changes, settled. Updating or restarting a container stops
// it for a few seconds; that isn't an outage. A stop is held for two minutes:
// if the container is running again by then it becomes one "restarted" event
// ("updated" when its image changed), and only a stop that lasts becomes
// "stopped", dated from when it began. A restart loop is reported at once.

import type { ChangeEvent, Container } from '../shared/types.ts';

export const STOP_GRACE_MS = 2 * 60_000;

export type Seen = 'running' | 'stopped' | 'unhealthy';

export interface Track {
  /** Last state per container. */
  states: Record<string, Seen>;
  /** Last image id per container, kept while a container is briefly gone. */
  images: Record<string, string>;
  /** Stops not yet reported: when they began and Docker's status line. */
  pending: Record<string, { at: number; status: string }>;
}

export interface Event {
  kind: ChangeEvent['kind'];
  subject: string;
  detail?: string;
  at: number;
}

export const emptyTrack = (): Track => ({ states: {}, images: {}, pending: {} });

/** The events this poll settles, and the state to keep for the next one. */
export function settle(prev: Track, containers: Container[], now: number): { track: Track; events: Event[] } {
  const events: Event[] = [];
  const states: Record<string, Seen> = {};
  const images = { ...prev.images };
  const pending = { ...prev.pending };

  for (const c of containers) {
    // "Created" is the moment between compose making a container and starting
    // it, every recreate passes through it. It isn't a stop: keep what we knew.
    if (c.state === 'created') {
      if (prev.states[c.name] !== undefined) states[c.name] = prev.states[c.name];
      continue;
    }
    const state: Seen = c.state === 'running' ? (c.health === 'unhealthy' ? 'unhealthy' : 'running') : 'stopped';
    states[c.name] = state;
    const before = prev.states[c.name];
    const imageChanged = !!c.imageId && !!images[c.name] && images[c.name] !== c.imageId;
    if (c.imageId) images[c.name] = c.imageId;

    if (state === 'stopped') {
      if (c.state === 'restarting') {
        // A loop: say so now, and drop any held stop.
        if (before !== 'stopped' || pending[c.name]) events.push({ kind: 'container.stopped', subject: c.name, detail: c.status, at: pending[c.name]?.at ?? now });
        delete pending[c.name];
      } else if (before !== undefined && before !== 'stopped') {
        pending[c.name] = { at: now, status: c.status };
      }
      continue;
    }

    // Running (or unhealthy) again.
    const held = pending[c.name];
    if (held) {
      delete pending[c.name];
      events.push({ kind: 'container.restarted', subject: c.name, detail: imageChanged ? 'updated' : 'restarted', at: now });
      if (state === 'unhealthy') events.push({ kind: 'container.unhealthy', subject: c.name, detail: c.status, at: now });
      continue;
    }
    if (before === undefined) {
      // Back after being recreated (we knew its image): one line, updated when
      // the image changed. Brand new containers say nothing.
      if (prev.images[c.name]) events.push({ kind: 'container.restarted', subject: c.name, detail: imageChanged ? 'updated' : 'restarted', at: now });
      continue;
    }
    if (before === state) continue;
    if (state === 'unhealthy') events.push({ kind: 'container.unhealthy', subject: c.name, detail: c.status, at: now });
    else if (before === 'unhealthy') events.push({ kind: 'container.recovered', subject: c.name, at: now });
    else events.push({ kind: 'container.started', subject: c.name, detail: c.status, at: now });
  }

  // Stops that lasted: report them, dated from when they began.
  for (const [name, held] of Object.entries(pending)) {
    const gone = !(name in states);
    if (now - held.at >= STOP_GRACE_MS) {
      if (!gone) events.push({ kind: 'container.stopped', subject: name, detail: held.status, at: held.at });
      delete pending[name];
    }
  }
  return { track: { states, images, pending }, events };
}

/** A container stopped moments ago, still inside the grace window. */
export const settling = (t: Track, name: string, now: number): boolean => !!t.pending[name] && now - t.pending[name].at < STOP_GRACE_MS;
