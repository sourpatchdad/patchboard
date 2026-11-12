// The moon's phase and days to a date, for the Sun and moon and Countdown
// widgets. Plain arithmetic, no network: the same on the server and in the
// browser.

// The moon: days since a known new moon, over the length of a lunar month.
const SYNODIC = 29.530588853;
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
const PHASES = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];

/** Where the moon is in its month, 0 (new) to 1, and how much of it is lit. */
export function moonAt(t: number): { phase: number; lit: number; name: string; nextFull: number } {
  const days = (t - NEW_MOON) / 86_400_000;
  const phase = (((days % SYNODIC) + SYNODIC) % SYNODIC) / SYNODIC;
  const lit = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const name = PHASES[Math.round(phase * 8) % 8];
  const toFull = ((0.5 - phase + 1) % 1) * SYNODIC;
  return { phase, lit, name, nextFull: t + toFull * 86_400_000 };
}

/** Whole days from today to a day, by the calendar here, not by hours. */
export function daysUntil(day: Date, now: number): number {
  const a = new Date(now);
  const from = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const to = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate());
  return Math.round((to - from) / 86_400_000);
}

/** The next time a countdown's day comes round: a fixed date, or the next one each year. */
export function nextDay(spec: string, now: number): Date {
  const parts = spec.split('-').map(Number);
  if (parts.length === 3) return new Date(parts[0], parts[1] - 1, parts[2]);
  const t = new Date(now);
  const thisYear = new Date(t.getFullYear(), parts[0] - 1, parts[1]);
  return daysUntil(thisYear, now) >= 0 ? thisYear : new Date(t.getFullYear() + 1, parts[0] - 1, parts[1]);
}
