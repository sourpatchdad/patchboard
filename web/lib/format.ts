const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const toMs = (t: number | string) => (typeof t === 'number' ? t : Date.parse(t));

/** Compact past time: "now", "9m", "2h", "Yesterday", "Tue", "Oct 12". */
export function ago(t: number | string, now = Date.now()): string {
  const diff = now - toMs(t);
  if (diff < MIN) return 'now';
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 2 * DAY) return 'Yesterday';
  if (diff < 6 * DAY) return new Date(toMs(t)).toLocaleDateString(undefined, { weekday: 'short' });
  return new Date(toMs(t)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Spelled-out past time for sentences: "for 2 hours", "since 9 minutes ago". */
export function agoLong(t: number | string, now = Date.now()): string {
  const diff = now - toMs(t);
  if (diff < MIN) return 'just now';
  if (diff < HOUR) return plural(Math.floor(diff / MIN), 'minute') + ' ago';
  if (diff < DAY) return plural(Math.floor(diff / HOUR), 'hour') + ' ago';
  return plural(Math.floor(diff / DAY), 'day') + ' ago';
}

/** Group counts using the reader's locale, without abbreviating them. */
export function count(n: number): string {
  return n.toLocaleString();
}

export function plural(n: number, word: string): string {
  return `${count(n)} ${word}${n === 1 ? '' : 's'}`;
}

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Day offset from today, in local time. */
export function dayOffset(t: number | string, now = Date.now()): number {
  return Math.round((startOfDay(toMs(t)) - startOfDay(now)) / DAY);
}

export function dayLabel(t: number | string, now = Date.now()): string {
  const off = dayOffset(t, now);
  if (off === 0) return 'Today';
  if (off === 1) return 'Tomorrow';
  if (off === -1) return 'Yesterday';
  const d = new Date(toMs(t));
  if (off > 1 && off < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function clock(t: number | string): string {
  const d = new Date(toMs(t));
  const s = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return s.replace(':00', '');
}

/** True when the timestamp is exactly local midnight, i.e. a date with no time. */
export function isDateOnly(t: string): boolean {
  const d = new Date(Date.parse(t));
  return d.getHours() === 0 && d.getMinutes() === 0;
}

export function speed(bytesPerSec: number): string {
  if (bytesPerSec < 1e3) return '0 KB/s';
  if (bytesPerSec < 1e6) return `${Math.round(bytesPerSec / 1e3)} KB/s`;
  return `${(bytesPerSec / 1e6).toFixed(bytesPerSec < 1e7 ? 1 : 0)} MB/s`;
}

export function eta(sec: number): string {
  if (sec <= 0 || sec >= 8_640_000) return '';
  if (sec < 60) return 'under a minute';
  if (sec < 3600) return `${Math.round(sec / 60)} min left`;
  return `${(sec / 3600).toFixed(1)} h left`;
}

export function bytes(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)} TB`;
  if (n >= 1e9) return `${Math.round(n / 1e9)} GB`;
  return `${Math.round(n / 1e6)} MB`;
}

/**
 * Binary units, as ZFS and TrueNAS report them ("4.00T" is TiB), shown with
 * the familiar letters. Three significant figures.
 */
export function size(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = v >= 100 || i === 0 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[i]}`;
}

/** CPU share: one decimal under 10%, whole numbers above. */
export function pct(n: number): string {
  if (n > 0 && n < 0.1) return '<0.1%';
  return `${n < 10 ? n.toFixed(1) : Math.round(n)}%`;
}

/** "13 h 27 m", "4 d 2 h", "35 s". */
export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} m`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

/** "Nov 1" this year, "Nov 1, 2025" otherwise. */
export function shortDate(t: number): string {
  const d = new Date(t);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function uptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${Math.floor((sec % 3600) / 60)}m`;
}

/** WMO weather interpretation codes, as Open-Meteo returns them. */
export function weatherText(code: number): string {
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code >= 85 && code <= 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorms';
  return 'Unsettled';
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** A Celsius reading in the unit chosen in Settings: "38°C", "100°F" or "38°C 100°F". */
export function temp(c: number, unit: 'f' | 'c' | 'both' = 'both'): string {
  const f = `${Math.round(c * 1.8 + 32)}°F`;
  const cc = `${Math.round(c)}°C`;
  return unit === 'f' ? f : unit === 'c' ? cc : `${cc} ${f}`;
}

/** Weather degrees without a letter, in the chosen unit (both shows Fahrenheit first). */
export function deg(c: number, unit: 'f' | 'c' | 'both'): number {
  return Math.round(unit === 'c' ? c : c * 1.8 + 32);
}
