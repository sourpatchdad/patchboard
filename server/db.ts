// SQLite via Node's built-in driver, so the image needs no native build step.
// It holds what the integrations can't tell us themselves: when a container
// changed state, and the last state we saw for each one.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ChangeEvent } from '../shared/types.ts';
import { config } from './config.ts';

mkdirSync(config.dataDir, { recursive: true });

const db = new DatabaseSync(join(config.dataDir, 'patchboard.db'));
db.exec(`
  pragma journal_mode = wal;
  create table if not exists events (
    id integer primary key,
    at integer not null,
    kind text not null,
    subject text not null,
    detail text
  );
  create index if not exists events_at on events(at);
  create table if not exists kv (k text primary key, v text not null);
  create table if not exists audit (
    id integer primary key,
    at integer not null,
    who text not null,
    action text not null,
    target text not null,
    detail text
  );
  create index if not exists audit_at on audit(at);
  create table if not exists samples (
    key text not null,
    at integer not null,
    v real not null,
    primary key (key, at)
  ) without rowid;
`);

// Time series: one row per key per sample. Keys are short and flat:
// "cpu", "mem.used", "pool.used", "ctr.cpu:plex", "ctr.mem:plex".
const insertSample = db.prepare('insert or replace into samples (key, at, v) values (?, ?, ?)');
const selectSeries = db.prepare('select at, v from samples where key = ? and at >= ? order by at');
const lastSample = db.prepare('select at, v from samples where key = ? order by at desc limit 1');
const pruneSamplesStmt = db.prepare('delete from samples where key like ? and at < ?');

export function recordSamples(at: number, values: [string, number][]): void {
  db.exec('begin');
  try {
    for (const [k, v] of values) if (Number.isFinite(v)) insertSample.run(k, at, v);
    db.exec('commit');
  } catch (err) {
    db.exec('rollback');
    throw err;
  }
}

/** A series averaged into at most `maxPoints` buckets, oldest first. */
export function series(key: string, sinceMs: number, maxPoints = 240): [number, number][] {
  const from = Date.now() - sinceMs;
  const rows = selectSeries.all(key, from).map((r) => [Number(r.at), Number(r.v)] as [number, number]);
  if (rows.length <= maxPoints) return rows;
  const width = sinceMs / maxPoints;
  const out: [number, number][] = [];
  let bucket = -1;
  let sumT = 0;
  let sumV = 0;
  let n = 0;
  for (const [t, v] of rows) {
    const b = Math.floor((t - from) / width);
    if (b !== bucket && n) {
      out.push([sumT / n, sumV / n]);
      sumT = sumV = n = 0;
    }
    bucket = b;
    sumT += t;
    sumV += v;
    n++;
  }
  if (n) out.push([sumT / n, sumV / n]);
  return out;
}

export function latestSample(key: string): { at: number; v: number } | undefined {
  const r = lastSample.get(key);
  return r ? { at: Number(r.at), v: Number(r.v) } : undefined;
}

export function pruneSamples(keyPrefix: string, olderThanMs: number): void {
  pruneSamplesStmt.run(`${keyPrefix}%`, Date.now() - olderThanMs);
}

const insertEvent = db.prepare('insert into events (at, kind, subject, detail) values (?, ?, ?, ?)');
const recentEvents = db.prepare('select id, at, kind, subject, detail from events where at >= ? order by at desc limit ?');
const lastEventFor = db.prepare('select at from events where subject = ? and kind = ? order by at desc limit 1');
const eventsSince = db.prepare('select at, kind, subject from events where at >= ? order by at');
const firstEvent = db.prepare('select min(at) as at from events');
const pruneEvents = db.prepare('delete from events where at < ?');
const getKv = db.prepare('select v from kv where k = ?');
const setKv = db.prepare('insert into kv (k, v) values (?, ?) on conflict(k) do update set v = excluded.v');

export function recordEvent(kind: ChangeEvent['kind'], subject: string, detail?: string, at = Date.now()): void {
  insertEvent.run(at, kind, subject, detail ?? null);
}

export function listChanges(sinceMs: number, limit = 30): ChangeEvent[] {
  return recentEvents.all(Date.now() - sinceMs, limit).map((r) => ({
    id: Number(r.id),
    at: Number(r.at),
    kind: r.kind as ChangeEvent['kind'],
    subject: String(r.subject),
    detail: r.detail == null ? undefined : String(r.detail),
  }));
}

export function allEventsSince(at: number): { at: number; kind: string; subject: string }[] {
  return eventsSince.all(at).map((r) => ({ at: Number(r.at), kind: String(r.kind), subject: String(r.subject) }));
}

export function lastEventAt(subject: string, kind: ChangeEvent['kind']): number | undefined {
  const row = lastEventFor.get(subject, kind);
  return row ? Number(row.at) : undefined;
}

export function firstEventAt(): number | undefined {
  const r = firstEvent.get();
  return r?.at == null ? undefined : Number(r.at);
}

export function prune(olderThanMs: number): void {
  pruneEvents.run(Date.now() - olderThanMs);
}

export function kvGet<T>(key: string): T | undefined {
  const row = getKv.get(key);
  return row ? (JSON.parse(String(row.v)) as T) : undefined;
}

export function kvSet(key: string, value: unknown): void {
  setKv.run(key, JSON.stringify(value));
}

// Who did what: actions, updates, board changes, sign-ins. Kept 180 days.
const insertAudit = db.prepare('insert into audit (at, who, action, target, detail) values (?, ?, ?, ?, ?)');
const selectAudit = db.prepare('select id, at, who, action, target, detail from audit order by at desc limit ?');
const pruneAuditStmt = db.prepare('delete from audit where at < ?');

export function recordAudit(who: string, action: string, target: string, detail?: string): void {
  insertAudit.run(Date.now(), who.slice(0, 200), action, target.slice(0, 200), detail?.slice(0, 500) ?? null);
}

export function listAudit(limit = 200): { id: number; at: number; who: string; action: string; target: string; detail?: string }[] {
  return selectAudit.all(limit).map((r) => ({
    id: Number(r.id),
    at: Number(r.at),
    who: String(r.who),
    action: String(r.action),
    target: String(r.target),
    detail: r.detail == null ? undefined : String(r.detail),
  }));
}

export function pruneAudit(): void {
  pruneAuditStmt.run(Date.now() - 180 * 86_400_000);
}
