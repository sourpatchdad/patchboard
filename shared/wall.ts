// A wall device's settings, set in Settings for each household device: the
// pages it swipes through, how often it turns to the next one by itself, and
// the night hours it dims through.

/** The most pages one device swipes through. */
export const MAX_PAGES = 8;

/** Seconds between pages when a device turns them by itself; 0 never does. */
export const ROTATE_SECONDS = [0, 30, 60, 120, 300, 600] as const;

/** Night hours, start-end in whole hours; they may run past midnight. */
export const DIM_HOURS = ['21-6', '22-6', '22-7', '23-7'] as const;

/** "22-7" as "10 PM to 7 AM". */
export function dimLabel(hours: string): string {
  const [from, to] = hours.split('-').map(Number);
  const h = (n: number) => `${n % 12 || 12} ${n < 12 ? 'AM' : 'PM'}`;
  return `${h(from)} to ${h(to)}`;
}

/** Inside night hours like "22-7", which may run past midnight. */
export function isNight(hours: string, at: Date): boolean {
  const [from, to] = hours.split('-').map(Number);
  const h = at.getHours();
  return from > to ? h >= from || h < to : h >= from && h < to;
}
