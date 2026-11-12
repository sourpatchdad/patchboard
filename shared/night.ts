// Night hours for a household device, set in Settings: the screen dims
// through them. Whole hours, start-end, and they may run past midnight.

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
