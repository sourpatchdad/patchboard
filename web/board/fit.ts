/** Removing items from a single horizontal row cannot make a widget shorter. */
export function canTrimHeight(itemTops: number[]): boolean {
  // Widgets without list markup still use their configured limit.
  if (itemTops.length < 2) return true;
  return Math.max(...itemTops) - Math.min(...itemTops) > 1;
}
