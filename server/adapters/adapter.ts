import type { SourceId } from '../../shared/types.ts';

/**
 * One integration. The hub polls `fetch` every `intervalMs` and caches the
 * result. Every adapter has a real implementation and a demo implementation
 * with the same shape, selected at startup by DEMO=1.
 */
export interface Adapter<T = unknown> {
  id: SourceId;
  label: string;
  intervalMs: number;
  fetch(): Promise<T>;
}

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
