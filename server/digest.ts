// The weekly summary: one quiet message on the day and hour you pick, to the
// channels alerts already use. What changed, what broke and came back, what
// waits for you, and where storage is heading, in five lines at most.
// Off until you turn it on in Settings, Alerts.

import type { Alert, ChangeEvent } from '../shared/types.ts';
import { kvGet, kvSet, latestSample, listChanges, series } from './db.ts';
import type { Message } from './notify.ts';

const DAY = 86_400_000;
const WEEK = 7 * DAY;

export interface DigestSettings {
  on: boolean;
  /** 0 Sunday to 6 Saturday, in the server's time zone. */
  day: number;
  /** 0 to 23. */
  hour: number;
  /** When the last one went out. */
  lastSent: number;
}

const DEFAULTS: DigestSettings = { on: false, day: 1, hour: 8, lastSent: 0 };
const KEY = 'digest';

export const digestSettings = (): DigestSettings => ({ ...DEFAULTS, ...(kvGet<Partial<DigestSettings>>(KEY) ?? {}) });

/** Turn it on or off, or move it. Turning it on starts the count now, so nothing fires at once. */
export function saveDigest(input: unknown, now = Date.now()): DigestSettings | { error: string } {
  const b = (input ?? {}) as Partial<Record<keyof DigestSettings, unknown>>;
  const prev = digestSettings();
  const on = typeof b.on === 'boolean' ? b.on : prev.on;
  const day = b.day === undefined ? prev.day : Number(b.day);
  const hour = b.hour === undefined ? prev.hour : Number(b.hour);
  if (!Number.isInteger(day) || day < 0 || day > 6) return { error: 'Pick a day of the week.' };
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return { error: 'Pick an hour from 0 to 23.' };
  const next = { on, day, hour, lastSent: on && !prev.on ? now : prev.lastSent };
  kvSet(KEY, next);
  return next;
}

/** The latest moment the summary was due, at or before now, in the server's local time. */
export function lastDue(now: number, day: number, hour: number): number {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() - day + 7) % 7));
  if (d.getTime() > now) d.setDate(d.getDate() - 7);
  return d.getTime();
}

/** Due once each week: when this week's moment has passed and nothing has gone out since. */
export const digestDue = (s: DigestSettings, now: number): boolean => s.on && s.lastSent < lastDue(now, s.day, s.hour);

export interface DigestInput {
  name: string;
  running: number;
  alerts: Alert[];
  events: ChangeEvent[];
  pendingUpdates: string[];
  /** Storage use now and a week ago, in percent, when Patchboard tracks it. */
  pool?: { now: number; weekAgo?: number };
}

const list = (names: string[], max = 4) => (names.length > max ? `${names.slice(0, max).join(', ')} and ${names.length - max} more` : names.join(', '));

/** The week in at most five lines. Pure: everything it says comes in through `input`. */
export function composeDigest(input: DigestInput): Message {
  const lines: string[] = [];
  const trouble = input.alerts.filter((a) => a.level !== 'info');
  lines.push(
    trouble.length
      ? `${trouble.length === 1 ? 'One thing needs you' : `${trouble.length} things need you`}: ${list(trouble.map((a) => a.title), 3)}.`
      : `All quiet: ${input.running} container${input.running === 1 ? '' : 's'} running.`,
  );
  const updated = [...new Set(input.events.filter((e) => e.kind === 'container.restarted' && e.detail === 'updated').map((e) => e.subject))];
  if (updated.length) lines.push(`Updated: ${list(updated)}.`);
  // Down by itself: a stop or a failed health check that nobody asked for.
  const asked = new Map<string, number>();
  const down = new Map<string, number>();
  for (const e of [...input.events].sort((a, b) => a.at - b.at)) {
    if (e.kind === 'container.action') asked.set(e.subject, e.at);
    else if ((e.kind === 'container.stopped' || e.kind === 'container.unhealthy') && !(e.at - (asked.get(e.subject) ?? -Infinity) < 120_000)) down.set(e.subject, (down.get(e.subject) ?? 0) + 1);
  }
  if (down.size)
    lines.push(
      `Went down: ${list(
        [...down].sort((a, b) => b[1] - a[1]).map(([n, k]) => (k > 1 ? `${n} (${k} times)` : n)),
        3,
      )}.`,
    );
  if (input.pendingUpdates.length) lines.push(`Updates waiting: ${list(input.pendingUpdates)}.`);
  if (input.pool) {
    const delta = input.pool.weekAgo === undefined ? undefined : Math.round((input.pool.now - input.pool.weekAgo) * 10) / 10;
    lines.push(`Storage: ${Math.round(input.pool.now)}% full${delta === undefined || Math.abs(delta) < 0.5 ? '' : delta > 0 ? `, up ${delta} points this week` : `, down ${-delta} points this week`}.`);
  }
  return { title: `Your week on ${input.name}`, body: lines.join('\n'), level: 'digest', href: '/' };
}

/** The week's input from what Patchboard keeps. */
export function gatherDigest(now: number, live: { name: string; running: number; alerts: Alert[]; pendingUpdates: string[] }): DigestInput {
  const used = latestSample('pool.used');
  const size = latestSample('pool.size');
  const before = series('pool.used', now - WEEK - DAY, 400).find(([at]) => at >= now - WEEK - DAY);
  const pct = (v: number) => (size?.v ? (v / size.v) * 100 : NaN);
  const pool = used && size?.v ? { now: pct(used.v), weekAgo: before ? pct(before[1]) : undefined } : undefined;
  return { ...live, events: listChanges(now - WEEK, 1000), pool: pool && Number.isFinite(pool.now) ? pool : undefined };
}
