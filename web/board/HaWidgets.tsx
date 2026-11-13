// Four Home Assistant widgets beside the general one: a to-do list to tick
// off and add to (Shopping list, Chores), a thermostat, blinds and shades,
// and who's home. Each pins its own entities, so the server reads and
// changes only those, and only in the ways shared/ha.ts allows. Patchboard
// doesn't stand in for Home Assistant: these are the things a family reaches
// for on the fridge tablet.

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { parseEntities, roomCells } from '../../shared/ha.ts';
import { parseChores } from '../../shared/fields.ts';
import type { HaEntity, HomeAssistantData, TodoItem } from '../../shared/types.ts';
import { Empty, Section } from '../components/ui.tsx';
import { agoLong } from '../lib/format.ts';
import { useSource, useStore } from '../lib/store.tsx';
import { SetupLink } from './SetupLink.tsx';
import { useWidget } from './widget-context.ts';

async function send(url: string, body?: unknown): Promise<void> {
  const res = await fetch(url, { method: 'POST', headers: { 'X-Patchboard': 'action', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const out = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`);
}

/** The pinned entities this widget shows, in its order, and whether this screen may change them. */
function usePinned(list: string | undefined, type: 'halist' | 'climate' | 'shades' | 'people' | 'rooms') {
  const { state, data } = useSource<HomeAssistantData>('homeassistant');
  const { snap } = useStore();
  const ids = parseEntities(list, type);
  const byId = new Map((data?.entities ?? []).map((e) => [e.id, e]));
  // A household device may still change what's pinned; a read-only server may not.
  const canAct = !(snap?.readOnly && !snap.household?.lights);
  return { state, ids, entities: ids.map((id) => byId.get(id)).filter((e): e is HaEntity => !!e), canAct, loaded: !!data };
}

// ---------- List ----------

/** A Home Assistant to-do list: open items to tick off, a box to add one, and the last few done. */
export function ListWidget({ entities }: { entities?: string }) {
  const { state, ids, entities: found, canAct } = usePinned(entities, 'halist');
  const { limit = 12 } = useWidget();
  const id = ids[0];
  const [items, setItems] = useState<TodoItem[] | null>(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const load = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/ha/todo/${encodeURIComponent(id)}`).catch(() => null);
    const body = res ? ((await res.json().catch(() => ({}))) as { items?: TodoItem[]; error?: string }) : { error: "Can't reach Patchboard" };
    if (res?.ok) {
      setItems(body.items ?? []);
      setError('');
    } else setError(body.error ?? 'The list did not load');
  }, [id]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);
  const change = async (body: { add?: string; done?: string; undo?: string }) => {
    // Shown at once; the list as Home Assistant has it follows.
    setItems((l) => l && (body.add ? [{ uid: `new-${Date.now()}`, summary: body.add, done: false }, ...l] : l.map((i) => (i.uid === body.done ? { ...i, done: true } : i.uid === body.undo ? { ...i, done: false } : i))));
    try {
      await send(`/api/ha/todo/${encodeURIComponent(id!)}`, body);
    } catch (err) {
      setError((err as Error).message);
    }
    void load();
  };
  const add = (e: FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    setText('');
    void change({ add: v });
  };
  if (!state) return null;
  const name = found[0]?.name ?? 'List';
  const open = (items ?? []).filter((i) => !i.done);
  const done = (items ?? []).filter((i) => i.done);
  return (
    <Section title={name} className="ha-list" count={items ? (open.length ? `${open.length} to go` : 'all done') : undefined}>
      {!id ? (
        <Empty>
          No list picked yet. <SetupLink>Pick a Home Assistant list</SetupLink>
        </Empty>
      ) : (
        <>
          {canAct && (
            <form className="ha-list-add" onSubmit={add}>
              <input className="field" value={text} maxLength={200} placeholder={`Add to ${name}`} aria-label={`Add to ${name}`} onChange={(e) => setText(e.target.value)} />
              <button type="submit" className="button button-quiet" disabled={!text.trim()}>
                Add
              </button>
            </form>
          )}
          {items && open.length === 0 && <p className="speed-seen">Nothing left on it.</p>}
          <ul className="ha-list-items">
            {open.slice(0, limit).map((i) => (
              <li key={i.uid}>
                <label>
                  <input type="checkbox" checked={false} disabled={!canAct || i.uid.startsWith('new-')} onChange={() => void change({ done: i.uid })} />
                  <span>{i.summary}</span>
                </label>
              </li>
            ))}
          </ul>
          {open.length > limit && <p className="speed-seen">{open.length - limit} more in Home Assistant.</p>}
          {done.length > 0 && (
            <details className="ha-list-done">
              <summary>{done.length} done</summary>
              <ul className="ha-list-items">
                {done.slice(0, 8).map((i) => (
                  <li key={i.uid} className="is-done">
                    <label>
                      <input type="checkbox" checked disabled={!canAct} onChange={() => void change({ undo: i.uid })} />
                      <span>{i.summary}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      {error && <p className="settings-note crit-text">{error}</p>}
    </Section>
  );
}

// ---------- Thermostat ----------

const MODE_WORDS: Record<string, string> = { heat: 'Heat', cool: 'Cool', heat_cool: 'Heat and cool', auto: 'Auto', dry: 'Dry', fan_only: 'Fan', off: 'Off' };
const ACTION_WORDS: Record<string, string> = { heating: 'Heating', cooling: 'Cooling', idle: 'Idle', drying: 'Drying', fan: 'Fan running', off: 'Off', preheating: 'Preheating' };

/** One thermostat: the temperature inside, what it's set to with minus and plus, and what it's doing. */
export function ThermostatWidget({ entities }: { entities?: string }) {
  const { state, ids, entities: found, canAct, loaded } = usePinned(entities, 'climate');
  const e = found[0];
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState('');
  // A burst of taps settles into one change, a moment after the last.
  useEffect(() => {
    if (pending == null || !e) return;
    const t = setTimeout(() => {
      send(`/api/ha/${encodeURIComponent(e.id)}/set`, { temperature: pending })
        .then(() => setError(''))
        .catch((err: Error) => setError(err.message))
        .finally(() => setTimeout(() => setPending(null), 4000));
    }, 900);
    return () => clearTimeout(t);
  }, [pending]);
  if (!state) return null;
  if (!ids.length || !e) {
    return (
      <Section title="Thermostat" className="thermostat">
        <Empty>{ids.length && !loaded ? 'Loading' : ids.length ? 'Save the board to load it.' : <>No thermostat picked yet. <SetupLink>Pick one</SetupLink></>}</Empty>
      </Section>
    );
  }
  const a = e.attrs ?? {};
  const step = a.step ?? 1;
  const target = pending ?? a.target;
  const unit = '°';
  const off = e.state === 'off';
  const nudge = (by: number) => {
    if (target == null) return;
    const next = Math.round((target + by) / step) * step;
    if (next < (a.min ?? -Infinity) || next > (a.max ?? Infinity)) return;
    setPending(next);
  };
  return (
    <Section title={e.name} className="thermostat">
      <div className="thermo">
        <p className="thermo-now">
          <span className="speed-big">{a.current != null ? `${Math.round(a.current)}${unit}` : '–'}</span>
          <span className="speed-unit">{a.action ? (ACTION_WORDS[a.action] ?? a.action) : 'inside'}</span>
        </p>
        <div className="thermo-set">
          <span className="thermo-mode">{MODE_WORDS[e.state] ?? e.state}</span>
          {!off && target != null && (
            <div className="thermo-target" role="group" aria-label={`${e.name} set to`}>
              {canAct && (
                <button type="button" className="thermo-btn" aria-label="Lower" onClick={() => nudge(-step)}>
                  −
                </button>
              )}
              <span className="thermo-value" aria-live="polite">
                {target}
                {unit}
              </span>
              {canAct && (
                <button type="button" className="thermo-btn" aria-label="Raise" onClick={() => nudge(step)}>
                  +
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {error && <p className="settings-note crit-text">{error}</p>}
    </Section>
  );
}

// ---------- Shades ----------

/** Blinds and shades: how far open each is, and open, stop or close. Anything else pinned shows its state only. */
export function ShadesWidget({ entities }: { entities?: string }) {
  const { state, ids, entities: found, canAct } = usePinned(entities, 'shades');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  if (!state) return null;
  const act = async (id: string, action: 'open' | 'close' | 'stop') => {
    setBusy(id);
    try {
      await send(`/api/ha/${encodeURIComponent(id)}/${action}`);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  };
  const SHADES = new Set(['shade', 'blind', 'curtain', 'awning', 'shutter']);
  return (
    <Section title="Shades" className="shades">
      {!ids.length ? (
        <Empty>
          No shades picked yet. <SetupLink>Pick blinds and shades</SetupLink>
        </Empty>
      ) : (
        <ul className="shade-list">
          {found.map((e) => {
            const pos = e.attrs?.position;
            const movable = canAct && SHADES.has(e.deviceClass ?? '');
            return (
              <li key={e.id}>
                <span className="shade-name">{e.name}</span>
                <span className="shade-pos mono">{pos != null ? `${pos}%` : e.state === 'open' ? 'Open' : e.state === 'closed' ? 'Closed' : e.state}</span>
                <span className="shade-bar" aria-hidden="true">
                  <i style={{ width: `${pos ?? (e.state === 'open' ? 100 : 0)}%` }} />
                </span>
                {movable ? (
                  <span className="shade-btns">
                    <button type="button" className="device-move" disabled={busy === e.id} aria-label={`Open ${e.name}`} onClick={() => void act(e.id, 'open')}>
                      ▲
                    </button>
                    <button type="button" className="device-move" disabled={busy === e.id} aria-label={`Stop ${e.name}`} onClick={() => void act(e.id, 'stop')}>
                      ■
                    </button>
                    <button type="button" className="device-move" disabled={busy === e.id} aria-label={`Close ${e.name}`} onClick={() => void act(e.id, 'close')}>
                      ▼
                    </button>
                  </span>
                ) : (
                  <span className="shade-btns settings-note">State only</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="settings-note crit-text">{error}</p>}
    </Section>
  );
}

// ---------- Rooms ----------

/** Cool blue to warm orange across the widget's own range; e-ink gets gray steps instead. */
function warmth(v: number, lo: number, hi: number): string {
  const f = hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0.5;
  // Blue, then sand, then orange: never through a status green or red.
  return f < 0.5 ? `color-mix(in oklab, #4c8fe6 ${Math.round((1 - f * 2) * 100)}%, #c9b07c)` : `color-mix(in oklab, #c9b07c ${Math.round((2 - f * 2) * 100)}%, #ef8a2e)`;
}

/** Each room's temperature now, and its last day as a strip of half-hour cells. */
export function RoomsWidget({ entities }: { entities?: string }) {
  const { state, ids, entities: found } = usePinned(entities, 'rooms');
  const [history, setHistory] = useState<Record<string, [number, number][]> | null>(null);
  const key = ids.join(',');
  useEffect(() => {
    if (!key) return;
    let gone = false;
    const load = () =>
      fetch(`/api/ha/history?ids=${encodeURIComponent(key)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((b: { history?: Record<string, [number, number][]> } | null) => !gone && b?.history && setHistory(b.history))
        .catch(() => {});
    void load();
    const t = setInterval(load, 5 * 60_000);
    return () => {
      gone = true;
      clearInterval(t);
    };
  }, [key]);
  if (!state) return null;
  const now = Date.now();
  const cells = Object.fromEntries(found.map((e) => [e.id, roomCells(history?.[e.id] ?? [], now)]));
  const all = Object.values(cells).flat().filter((v): v is number => v != null);
  const lo = all.length ? Math.min(...all) : 0;
  const hi = all.length ? Math.max(...all) : 1;
  return (
    <Section title="Rooms" className="rooms">
      {!ids.length ? (
        <Empty>
          No rooms picked yet. <SetupLink>Pick temperature sensors</SetupLink>
        </Empty>
      ) : (
        <ul className="room-list">
          {found.map((e) => {
            const reading = Number(e.state);
            return (
              <li key={e.id}>
                <span className="room-name">{e.name}</span>
                <span className="room-now mono">{Number.isFinite(reading) ? `${Math.round(reading * 10) / 10}${e.unit ?? ''}` : e.state}</span>
                <span className="room-strip" role="img" aria-label={`${e.name}, last 24 hours: from ${Math.min(...cells[e.id].filter((v): v is number => v != null))} to ${Math.max(...cells[e.id].filter((v): v is number => v != null))}`}>
                  {cells[e.id].map((v, i) => (
                    <i key={i} style={v == null ? undefined : { background: warmth(v, lo, hi) }} title={v == null ? undefined : `${v}${e.unit ?? ''}`} />
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {ids.length > 0 && <p className="speed-seen">The last 24 hours, blue for the coolest and orange for the warmest.</p>}
    </Section>
  );
}

// ---------- Chores ----------

const DAY = 86_400_000;

/** Chores: the days since each was done, due ones first and amber, and Done to start over, with a moment to undo. */
export function ChoresWidget({ board, id, config, now }: { board: string; id: string; config?: Record<string, string>; now: number }) {
  const list = parseChores(config?.chores);
  const { snap } = useStore();
  const canAct = !(snap?.readOnly && !snap.household?.lights);
  const [done, setDone] = useState<Record<string, number> | null>(null);
  const [undo, setUndo] = useState<{ name: string; at: number | null } | null>(null);
  const [error, setError] = useState('');
  const url = `/api/chores/${encodeURIComponent(board)}/${encodeURIComponent(id)}`;
  const load = useCallback(async () => {
    const res = await fetch(url).catch(() => null);
    const body = res ? ((await res.json().catch(() => ({}))) as { done?: Record<string, number>; error?: string }) : {};
    if (res?.ok) setDone(body.done ?? {});
    else if (res?.status === 404) setDone({});
  }, [url]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load, config?.chores]);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 10_000);
    return () => clearTimeout(t);
  }, [undo]);
  const mark = async (name: string, at?: number | null) => {
    const before = done?.[name] ?? null;
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'X-Patchboard': 'action', 'Content-Type': 'application/json' }, body: JSON.stringify({ name, at }) });
      const body = (await res.json().catch(() => ({}))) as { done?: Record<string, number>; error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setDone(body.done ?? {});
      setError('');
      setUndo(at === undefined ? { name, at: before } : null);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const rows = list
    .map((c) => {
      const last = done?.[c.name];
      const days = last ? Math.floor((now - last) / DAY) : null;
      const due = c.every != null && (days == null || days >= c.every);
      return { ...c, last, days, due };
    })
    // Due first, the longest waiting at the top; then the rest by how soon they come due.
    .sort((a, b) => Number(b.due) - Number(a.due) || (b.days ?? 1e9) - (a.days ?? 1e9));
  const dueCount = rows.filter((r) => r.due).length;
  return (
    <Section title="Chores" className="chores" count={list.length ? (dueCount ? `${dueCount} due` : 'all done') : undefined}>
      {!list.length ? (
        <Empty>
          No chores yet. <SetupLink>Add chores</SetupLink>
        </Empty>
      ) : (
        <ul className="chore-list">
          {rows.map((r) => (
            <li key={r.name} className={r.due ? 'is-due' : undefined}>
              <span className="chore-name">{r.name}</span>
              <span className={`chore-since ${r.due ? 'warn-text' : ''}`}>
                {done == null ? '' : r.days == null ? 'Not done yet' : r.days === 0 ? 'Done today' : r.days === 1 ? 'Yesterday' : `${r.days} days ago`}
                {r.every && <span className="chore-every">, every {r.every === 1 ? 'day' : r.every === 7 ? 'week' : `${r.every} days`}</span>}
              </span>
              {canAct && (
                <button type="button" className="button button-quiet chore-done" disabled={done == null || r.days === 0} onClick={() => void mark(r.name)}>
                  Done
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {undo && (
        <p className="speed-seen" role="status">
          {undo.name} marked done.{' '}
          <button type="button" className="text-button" onClick={() => void mark(undo.name, undo.at)}>
            Undo
          </button>
        </p>
      )}
      {error && <p className="settings-note crit-text">{error}</p>}
    </Section>
  );
}

// ---------- People ----------

/** Who's home and who's out, and since when. */
export function PeopleWidget({ entities, now }: { entities?: string; now: number }) {
  const { state, ids, entities: found } = usePinned(entities, 'people');
  if (!state) return null;
  const home = found.filter((p) => p.state === 'home').length;
  return (
    <Section title="People" className="people" count={found.length ? `${home} of ${found.length} home` : undefined}>
      {!ids.length ? (
        <Empty>
          No one picked yet. <SetupLink>Pick people from Home Assistant</SetupLink>
        </Empty>
      ) : (
        <ul className="people-list">
          {found.map((p) => {
            const at = p.state === 'home' ? 'Home' : p.state === 'not_home' ? 'Away' : p.state === 'unknown' || p.state === 'unavailable' ? 'Unknown' : p.state;
            return (
              <li key={p.id} className={p.state === 'home' ? 'is-home' : undefined}>
                <span className="person-badge" aria-hidden="true">
                  {p.name
                    .split(/\s+/)
                    .map((w) => w[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <span className="person-name">{p.name}</span>
                <span className="person-at">
                  {at}
                  <span className="person-since">, {agoLong(p.changedAt, now)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
