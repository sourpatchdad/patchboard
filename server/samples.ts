// Sample data for the widget gallery: what a widget looks like before its
// app is connected. It's demo mode's made-up data, made on request; nothing
// here talks to a real service. The gallery marks every preview drawn from
// it as Sample.

import type { Adapter } from './adapters/adapter.ts';
import { demoAdapters } from './demo.ts';
import type { SourceState } from '../shared/types.ts';

/** The most sources one request may ask for: every widget in the gallery at once. */
export const MAX_SAMPLES = 64;

let adapters: Map<string, Adapter> | undefined;

/** Sample states for these sources. An id demo mode doesn't know is left out. */
export async function samples(ids: string[]): Promise<Record<string, SourceState>> {
  adapters ??= new Map(demoAdapters().map((a) => [a.id, a as Adapter]));
  const out: Record<string, SourceState> = {};
  for (const id of [...new Set(ids)].slice(0, MAX_SAMPLES)) {
    const a = adapters.get(id);
    if (!a) continue;
    try {
      out[id] = { id: a.id, label: a.label, ok: true, updatedAt: Date.now(), data: await a.fetch() };
    } catch {
      // A sample that can't be made is left out; the preview says so.
    }
  }
  return out;
}
