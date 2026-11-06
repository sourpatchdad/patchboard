// Calendars from iCal addresses: Google (the secret address), iCloud (a
// public calendar link), Outlook, Nextcloud, Proton, Fastmail. Several, one
// per line or comma-separated. Each event within the look-ahead window,
// recurring ones expanded.

import type { CalendarData, CalendarEvent } from '../../shared/types.ts';
import { config } from '../config.ts';
import { request } from '../http.ts';
import { type Adapter, MINUTE } from './adapter.ts';

const DAY = 86_400_000;

/** Unfold lines (a leading space continues the previous one) and split into properties. */
function lines(ics: string): { name: string; params: Record<string, string>; value: string }[] {
  return ics
    .replace(/\r\n[ \t]/g, '')
    .replace(/\n[ \t]/g, '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      const colon = l.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
      const head = colon >= 0 ? l.slice(0, colon) : l;
      const value = colon >= 0 ? l.slice(colon + 1) : '';
      const [name, ...ps] = head.split(';');
      const params: Record<string, string> = {};
      for (const p of ps) {
        const [k, v] = p.split('=');
        if (k) params[k.toUpperCase()] = (v ?? '').replace(/^"|"$/g, '');
      }
      return { name: name.toUpperCase(), params, value };
    });
}

const unescape = (s: string) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

/** The UTC offset of a time zone at an instant, in milliseconds. */
function offset(at: number, tz: string): number {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        .formatToParts(new Date(at))
        .map((p) => [p.type, p.value]),
    );
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - at;
  } catch {
    return 0;
  }
}

/** An iCal date or date-time to epoch ms: UTC (Z), in a named zone, floating (server time), or all-day. */
export function parseTime(value: string, tz?: string): { at: number; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h == null) return { at: new Date(+y, +mo - 1, +d).getTime(), allDay: true };
  const naive = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0));
  if (z) return { at: naive, allDay: false };
  if (tz) {
    let at = naive - offset(naive, tz);
    at = naive - offset(at, tz);
    return { at, allDay: false };
  }
  return { at: new Date(+y, +mo - 1, +d, +h, +mi, +(s ?? 0)).getTime(), allDay: false };
}

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** Expand an RRULE into start times inside [from, to). Common rules only: FREQ, INTERVAL, COUNT, UNTIL, weekly BYDAY. */
export function expand(start: number, rule: string, from: number, to: number, allDay: boolean): number[] {
  const r = Object.fromEntries(rule.split(';').map((p) => p.split('=') as [string, string]));
  const freq = r.FREQ;
  const interval = Math.max(1, Number(r.INTERVAL) || 1);
  const count = r.COUNT ? Number(r.COUNT) : Infinity;
  const until = r.UNTIL ? (parseTime(r.UNTIL)?.at ?? Infinity) : Infinity;
  const byday = freq === 'WEEKLY' && r.BYDAY ? r.BYDAY.split(',').map((d) => WEEKDAYS.indexOf(d.slice(-2))).filter((d) => d >= 0) : null;
  const out: number[] = [];
  const base = new Date(start);
  let n = 0;
  for (let i = 0; i < 3000 && n < count; i++) {
    const cands: Date[] = [];
    const step = new Date(base);
    if (freq === 'DAILY') step.setDate(base.getDate() + i * interval);
    else if (freq === 'WEEKLY') step.setDate(base.getDate() + i * 7 * interval);
    else if (freq === 'MONTHLY') step.setMonth(base.getMonth() + i * interval);
    else if (freq === 'YEARLY') step.setFullYear(base.getFullYear() + i * interval);
    else return start >= from && start < to ? [start] : [];
    if (byday) {
      const weekStart = new Date(step);
      weekStart.setDate(step.getDate() - step.getDay());
      for (const wd of [...byday].sort()) {
        const c = new Date(weekStart);
        c.setDate(weekStart.getDate() + wd);
        if (c.getTime() >= start) cands.push(c);
      }
    } else {
      // A month or year without that day (31st, Feb 29) is skipped, as iCal says.
      if ((freq === 'MONTHLY' || freq === 'YEARLY') && step.getDate() !== base.getDate()) continue;
      cands.push(step);
    }
    for (const c of cands) {
      const t = c.getTime();
      if (t > until || n >= count) return out;
      n++;
      if (t >= to) return out;
      if (t >= from - (allDay ? DAY : 0)) out.push(t);
    }
  }
  return out;
}

/** Events from one calendar file within [from, to). */
export function parseIcs(ics: string, from: number, to: number, calendar?: string): CalendarEvent[] {
  const props = lines(ics);
  const name = calendar ?? unescape(props.find((p) => p.name === 'X-WR-CALNAME')?.value ?? '');
  type Raw = { uid?: string; title?: string; location?: string; start?: { at: number; allDay: boolean }; end?: number; rule?: string; ex: number[]; recurrenceId?: number; cancelled?: boolean };
  const raw: Raw[] = [];
  let cur: Raw | null = null;
  for (const p of props) {
    if (p.name === 'BEGIN' && p.value === 'VEVENT') cur = { ex: [] };
    else if (p.name === 'END' && p.value === 'VEVENT' && cur) {
      raw.push(cur);
      cur = null;
    } else if (cur) {
      if (p.name === 'UID') cur.uid = p.value;
      else if (p.name === 'SUMMARY') cur.title = unescape(p.value);
      else if (p.name === 'LOCATION') cur.location = unescape(p.value) || undefined;
      else if (p.name === 'DTSTART') cur.start = parseTime(p.value, p.params.TZID) ?? undefined;
      else if (p.name === 'DTEND') cur.end = parseTime(p.value, p.params.TZID)?.at;
      else if (p.name === 'RRULE') cur.rule = p.value;
      else if (p.name === 'EXDATE') for (const v of p.value.split(',')) cur.ex.push(parseTime(v, p.params.TZID)?.at ?? NaN);
      else if (p.name === 'RECURRENCE-ID') cur.recurrenceId = parseTime(p.value, p.params.TZID)?.at;
      else if (p.name === 'STATUS' && p.value.toUpperCase() === 'CANCELLED') cur.cancelled = true;
    }
  }
  // A moved or cancelled single occurrence replaces that one start of its series.
  const overridden = new Set(raw.filter((e) => e.recurrenceId != null).map((e) => `${e.uid}|${e.recurrenceId}`));
  const out: CalendarEvent[] = [];
  for (const e of raw) {
    if (!e.start || e.cancelled) continue;
    const length = e.end != null ? e.end - e.start.at : e.start.allDay ? DAY : 0;
    const starts = e.rule && e.recurrenceId == null ? expand(e.start.at, e.rule, from, to, e.start.allDay) : [e.start.at];
    for (const s of starts) {
      if (e.ex.includes(s) || (e.rule && overridden.has(`${e.uid}|${s}`))) continue;
      const end = s + length;
      if (s >= to || (length ? end <= from : s < from)) continue;
      out.push({ id: `${e.uid ?? e.title}|${s}`, title: e.title || 'Busy', start: s, end: length ? end : undefined, allDay: e.start.allDay, location: e.location, calendar: name || undefined });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export function calendarAdapter(): Adapter<CalendarData> {
  const { urls } = config.calendar!;
  return {
    id: 'calendar',
    label: 'Calendar',
    intervalMs: 15 * MINUTE,
    async fetch() {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const from = now.getTime();
      const to = from + config.upcomingDays * DAY;
      const results = await Promise.allSettled(urls.map(async (u) => parseIcs(await (await request(u.replace(/^webcal:/i, 'https:'), {}, 15_000)).text(), from, to)));
      if (results.every((r) => r.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason;
      const events = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).sort((a, b) => a.start - b.start);
      return { events: events.slice(0, 300), failed: results.filter((r) => r.status === 'rejected').length };
    },
  };
}
