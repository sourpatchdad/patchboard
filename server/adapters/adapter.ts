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
  /**
   * Optional push: keep one line open to the service. `update` hands over new
   * data the line already carried; `refresh` asks for a poll now. Returns a
   * function that closes the line. Polling carries on underneath, slower.
   */
  live?(on: { update(data: T): void; refresh(): void }): () => void;
}

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
