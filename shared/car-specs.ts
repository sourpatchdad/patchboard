// Published exterior dimensions, in millimeters, for the drawing sheet's
// dimension lines. Only figures Tesla publishes go here; a figure a model
// lacks is simply not drawn.

export interface CarSpec {
  length: number;
  wheelbase: number;
  height: number;
  /** Body width, mirrors folded. */
  width: number;
  /** Front and rear overhang, where published. */
  front?: number;
  rear?: number;
}

const SPECS: Record<string, CarSpec> = {
  'Model 3': { length: 4694, wheelbase: 2875, height: 1443, width: 1849, front: 841, rear: 978 },
  'Model Y': { length: 4751, wheelbase: 2890, height: 1624, width: 1921 },
  'Model S': { length: 4970, wheelbase: 2960, height: 1445, width: 1964 },
  'Model X': { length: 5057, wheelbase: 2965, height: 1680, width: 1999 },
};

export function specFor(model?: string): CarSpec | undefined {
  return model ? SPECS[model] : undefined;
}

/** "4,694 mm". Drawing sheets dimension in millimeters whatever the car reads in. */
export function dim(mm: number, locale?: string): string {
  return `${mm.toLocaleString(locale)} mm`;
}
