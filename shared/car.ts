// Rules about the car that the server, the widget and its one number share.

import { type Car, TIRES, type TirePos } from './types.ts';

export const PSI = 14.5038;

/**
 * A tire to look at: soft against the others (3 psi under the fullest), or
 * low outright (under 38 psi, where Tesla's own warning sits near 36).
 */
export function softTires(tires: Car['tires']): TirePos[] {
  if (!tires) return [];
  const top = Math.max(...TIRES.map((t) => tires[t]));
  return TIRES.filter((t) => tires[t] * PSI < 38 || (top - tires[t]) * PSI >= 3);
}
