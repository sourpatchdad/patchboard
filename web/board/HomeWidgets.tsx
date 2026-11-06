// Widgets for the house and the network: Home Assistant entities, the car,
// Wake-on-LAN, Uptime Kuma monitors, ad blocking, internet speed, and
// Overseerr requests.

import { HoldButton } from '../components/Hold.tsx';
import { useEffect, useMemo, useState } from 'react';
import { haActionFor, HA_MAX_PINNED, parseEntities } from '../../shared/ha.ts';
import { NAS_SOURCES } from '../../shared/types.ts';
import type { BooksData, CalendarData, CarData, DnsData, GlancesData, NasSystem, NutData, PortainerData, TailnetData, UnifiData, HaEntity, ImmichData, ProxmoxData, ScrutinyData, SeerrData, SpeedData, SyncDevice, SyncFolder, SyncthingData, HomeAssistantData, KumaMonitor, KumaState, SourceState, UptimeKumaData } from '../../shared/types.ts';
import { Spark } from '../components/Spark.tsx';
import { Empty, Meter, Section } from '../components/ui.tsx';
import { useAppearance } from '../lib/appearance.ts';
import { ago, agoLong, deg, pct, size, uptime } from '../lib/format.ts';
import { storageLevel, useLimits, useSource, useStore } from '../lib/store.tsx';
import { useWidget } from './widget-context.ts';

async function post(url: string): Promise<void> {
  const res = await fetch(url, { method: 'POST', headers: { 'X-Patchboard': 'action' } });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
}

// ---------- Home Assistant ----------

const OPENING = new Set(['door', 'window', 'garage_door', 'opening', 'garage']);

/** An entity's state in words, and whether it deserves a look. */
export function haDisplay(e: HaEntity): { text: string; tone?: 'warn' | 'muted'; on?: boolean } {
  const domain = e.id.split('.')[0];
  const s = e.state;
  if (s === 'unavailable' || s === 'unknown') return { text: 'Unavailable', tone: 'muted' };
  switch (domain) {
    case 'binary_sensor':
      if (OPENING.has(e.deviceClass ?? '')) return s === 'on' ? { text: 'Open', tone: 'warn' } : { text: 'Closed' };
      if (e.deviceClass === 'motion' || e.deviceClass === 'occupancy') return { text: s === 'on' ? 'Motion' : 'Clear' };
      if (e.deviceClass === 'moisture') return s === 'on' ? { text: 'Wet', tone: 'warn' } : { text: 'Dry' };
      return { text: s === 'on' ? 'On' : 'Off' };
    case 'sensor': {
      const n = Number(s);
      const value = Number.isFinite(n) ? String(Math.round(n * 10) / 10) : s;
      return { text: e.unit ? `${value}${e.unit === '%' || e.unit.startsWith('°') ? '' : ' '}${e.unit}` : value };
    }
    case 'lock':
      return s === 'locked' ? { text: 'Locked' } : { text: s === 'unlocked' ? 'Unlocked' : cap(s), tone: 'warn' };
    case 'cover':
      return s === 'closed' ? { text: 'Closed' } : { text: cap(s), tone: 'warn' };
    case 'person':
    case 'device_tracker':
      return { text: s === 'home' ? 'Home' : s === 'not_home' ? 'Away' : cap(s) };
    case 'scene':
      return { text: '' };
    case 'script':
      return { text: s === 'on' ? 'Running' : '' };
    case 'automation':
      return { text: s === 'on' ? 'Enabled' : 'Disabled', on: s === 'on' };
    case 'light':
    case 'switch':
    case 'fan':
    case 'input_boolean':
      return { text: s === 'on' ? 'On' : 'Off', on: s === 'on' };
  }
  return { text: cap(s) };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

export function HomeAssistantWidget({ entities: list }: { entities?: string }) {
  const { state, data } = useSource<HomeAssistantData>('homeassistant');
  const { snap } = useStore();
  const ids = parseEntities(list);
  const byId = new Map((data?.entities ?? []).map((e) => [e.id, e]));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!state) return null;
  async function act(id: string, action: 'toggle' | 'run') {
    setBusy(id);
    setError(null);
    try {
      await post(`/api/ha/${encodeURIComponent(id)}/${action}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <Section title="Home" count={ids.length ? undefined : 'Home Assistant'} source={state} className="ha">
      {ids.length === 0 ? (
        <Empty>Pick lights, switches, sensors and scenes in this widget's settings. Customize the board, then the gear on this widget.</Empty>
      ) : (
        <ul className="ha-grid">
          {ids.map((id) => {
            const e = byId.get(id);
            if (!e) {
              return (
                <li key={id} className="ha-tile is-muted">
                  <span className="ha-name mono">{id}</span>
                  <span className="ha-state">{data ? 'Save the board to load it' : 'Loading'}</span>
                </li>
              );
            }
            const d = haDisplay(e);
            const action = snap?.readOnly ? null : haActionFor(id);
            const body = (
              <>
                <span className="ha-name">{e.name}</span>
                {action === 'run' ? (
                  <span className="ha-state ha-run">{busy === id ? 'Running' : d.text || 'Run'}</span>
                ) : (
                  <span className={`ha-state ${d.tone ? `is-${d.tone}` : ''}`}>
                    {d.text}
                    {d.tone === 'warn' && <span className="ha-since"> {ago(e.changedAt)}</span>}
                  </span>
                )}
              </>
            );
            return (
              <li key={id} className={`ha-tile ${d.on ? 'is-on' : ''} ${d.tone === 'muted' ? 'is-muted' : ''}`}>
                {action ? (
                  <button
                    type="button"
                    className="ha-act"
                    disabled={busy === id}
                    aria-pressed={action === 'toggle' ? !!d.on : undefined}
                    title={action === 'toggle' ? `Turn ${d.on ? 'off' : 'on'}` : 'Run'}
                    onClick={() => void act(id, action)}
                  >
                    {body}
                  </button>
                ) : (
                  <div className="ha-act">{body}</div>
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

/** The widget's settings: search every entity and tick the ones to show. */
export function HaPicker({ value, onChange }: { value: string | undefined; onChange: (v: string) => void }) {
  const [all, setAll] = useState<HaEntity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const picked = parseEntities(value);
  useEffect(() => {
    fetch('/api/ha/entities')
      .then(async (r) => {
        const body = (await r.json()) as { entities?: HaEntity[]; error?: string };
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        setAll(body.entities ?? []);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (all ?? []).filter((e) => !t || e.id.includes(t) || e.name.toLowerCase().includes(t)).slice(0, 80);
  }, [all, q]);
  const toggle = (id: string) => onChange((picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id].slice(0, HA_MAX_PINNED)).join(','));
  return (
    <div className="ha-picker">
      <span>
        Entities, {picked.length} of {HA_MAX_PINNED}
      </span>
      {error ? (
        <p className="settings-note crit-text">{error}</p>
      ) : (
        <>
          <input className="field" type="search" placeholder="Search lights, sensors, scenes" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="ha-pick-list">
            {!all && <li className="settings-note">Loading entities</li>}
            {shown.map((e) => (
              <li key={e.id}>
                <label>
                  <input type="checkbox" checked={picked.includes(e.id)} onChange={() => toggle(e.id)} />
                  <span>{e.name}</span>
                  <span className="mono ha-pick-id">{e.id}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="settings-note">Lights, switches, fans and automations toggle; scenes and scripts run. Locks, garage doors and alarms show their state only.</p>
        </>
      )}
    </div>
  );
}

// ---------- The car ----------

const CHARGE_WORDS: Record<string, string> = {
  Charging: 'Charging',
  Complete: 'Charged',
  Stopped: 'Plugged in, not charging',
  Disconnected: 'Unplugged',
  Starting: 'Starting to charge',
  NoPower: 'Plugged in, no power',
};

export function CarWidget() {
  const { state, data } = useSource<CarData>('tessie');
  const { temp: unit } = useAppearance();
  if (!state || !data) return null;
  return (
    <Section title="Car" source={state} className="car">
      {data.cars.length === 0 && <Empty>Tessie returned no cars for this token.</Empty>}
      {data.cars.map((c) => {
        const low = c.battery <= 20;
        const words = CHARGE_WORDS[c.charging] ?? c.charging;
        const h = c.minutesToFull ? Math.floor(c.minutesToFull / 60) : 0;
        const m = c.minutesToFull ? c.minutesToFull % 60 : 0;
        return (
          <div className="car-one" key={c.vin}>
            {data.cars.length > 1 && <h3 className="car-name">{c.name}</h3>}
            <div className="car-top">
              <span className={`car-pct ${low ? 'warn-text' : ''}`}>{c.battery}%</span>
              <span className="car-range">{c.rangeMi} mi</span>
            </div>
            <div className="car-bar">
              <Meter value={c.battery} level={low ? 'warn' : 'ok'} />
              <i className="car-limit" style={{ left: `${c.limit}%` }} title={`Charge limit ${c.limit}%`} />
            </div>
            <p className="car-line">
              {c.driving ? 'Driving' : words}
              {c.charging === 'Charging' && c.minutesToFull ? `, full in ${h ? `${h} h ` : ''}${m} min` : ''}
              {c.chargeKw ? ` at ${c.chargeKw} kW` : ''}. Limit {c.limit}%.
            </p>
            <dl className="car-facts">
              <div>
                <dt>Doors</dt>
                <dd className={c.locked ? '' : 'warn-text'}>{c.locked ? 'Locked' : 'Unlocked'}</dd>
              </div>
              {c.insideC != null && (
                <div>
                  <dt>Inside</dt>
                  <dd>
                    {deg(c.insideC, unit)}°{c.climateOn ? ', climate on' : ''}
                  </dd>
                </div>
              )}
              <div>
                <dt>Odometer</dt>
                <dd>{c.odometerMi.toLocaleString()} mi</dd>
              </div>
              {c.sentry && (
                <div>
                  <dt>Sentry</dt>
                  <dd>On</dd>
                </div>
              )}
            </dl>
            <p className="car-seen">{c.asleep ? 'Asleep. ' : ''}Updated {agoLong(c.updatedAt)}.</p>
          </div>
        );
      })}
    </Section>
  );
}

// ---------- Wake-on-LAN ----------

export function WakeWidget() {
  const { snap } = useStore();
  const [sent, setSent] = useState<Record<string, string>>({});
  const names = snap?.wake ?? [];
  if (!snap?.features?.includes('wake')) return null;
  async function wake(name: string) {
    setSent((s) => ({ ...s, [name]: 'Sending' }));
    try {
      await post(`/api/wake/${encodeURIComponent(name)}`);
      setSent((s) => ({ ...s, [name]: 'Sent' }));
    } catch (err) {
      setSent((s) => ({ ...s, [name]: (err as Error).message }));
    }
  }
  return (
    <Section title="Wake" className="wake">
      {names.length === 0 ? (
        <Empty>Add machines to WOL_DEVICES to wake them from here.</Empty>
      ) : (
        <ul className="wake-list">
          {names.map((n) => (
            <li key={n}>
              <span>{n}</span>
              {snap.readOnly ? null : (
                <button type="button" className="text-button" disabled={sent[n] === 'Sending'} onClick={() => void wake(n)}>
                  {sent[n] ?? 'Wake'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------- Uptime Kuma ----------

const KUMA_ORDER: Record<KumaState, number> = { down: 0, pending: 1, maintenance: 2, unknown: 3, up: 4 };
const KUMA_WORDS: Record<KumaState, string> = { up: 'Up', down: 'Down', pending: 'Retrying', maintenance: 'Maintenance', unknown: 'No checks yet' };

function Beats({ m }: { m: KumaMonitor }) {
  const bad = m.beats.filter((b) => b === 'down').length;
  return (
    <span className="beats" role="img" aria-label={`${m.name}, last ${m.beats.length} checks: ${bad ? `${bad} down` : 'all up'}`}>
      {m.beats.map((b, i) => (
        <i key={i} className={`beat beat-${b}`} />
      ))}
    </span>
  );
}

/** Uptime Kuma, Gatus and Healthchecks.io in one list; a link out only when there's one of them. */
const MONITOR_SOURCES = ['uptimekuma', 'gatus', 'healthchecks'] as const;

export function UptimeWidget({ now }: { now: number }) {
  const { snap } = useStore();
  const { limit = 8 } = useWidget();
  const parts = MONITOR_SOURCES.map((id) => snap?.sources[id] as SourceState<UptimeKumaData> | undefined).filter((s): s is SourceState<UptimeKumaData> => !!s?.data);
  if (!parts.length) return null;
  const state = parts.find((s) => !s.ok) ?? parts[0];
  const data = { link: parts.length === 1 ? parts[0].data!.link : '', monitors: parts.flatMap((s) => s.data!.monitors) };
  const sorted = [...data.monitors].sort((a, b) => KUMA_ORDER[a.status] - KUMA_ORDER[b.status] || a.name.localeCompare(b.name));
  const down = sorted.filter((m) => m.status === 'down').length;
  const up = sorted.filter((m) => m.status === 'up').length;
  const shown = sorted.slice(0, limit);
  const rest = sorted.slice(limit);
  const restDown = rest.filter((m) => m.status !== 'up').length;
  return (
    <Section title="Uptime" count={down ? `${down} down` : `${up} of ${sorted.length} up`} source={state} action={data.link ? { label: 'Open', href: data.link } : undefined} className={`uptime ${down ? 'has-down' : ''}`}>
      {sorted.length === 0 ? (
        <Empty>No monitors yet. Add some in Uptime Kuma, Gatus or Healthchecks.</Empty>
      ) : (
        <ul className="kuma-list">
          {shown.map((m) => (
            <li key={m.id} className={`kuma kuma-${m.status}`}>
              <span className="kuma-name" title={m.group}>
                {m.name}
              </span>
              <Beats m={m} />
              <span className="kuma-num">
                {m.status === 'up' ? (m.uptime24 != null ? `${m.uptime24 % 1 ? m.uptime24.toFixed(1) : m.uptime24}%` : m.ping != null ? `${m.ping} ms` : 'Up') : String(m.id).startsWith('hc-') && m.status === 'pending' ? 'Late' : KUMA_WORDS[m.status]}
              </span>
              {m.status !== 'up' && (m.msg || m.since) && (
                <span className="kuma-why">
                  {m.msg}
                  {m.msg && m.since ? ', ' : ''}
                  {m.since ? `since ${ago(m.since, now)}` : ''}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {rest.length > 0 &&
        (data.link ? (
          <a className="kuma-more" href={data.link} target="_blank" rel="noreferrer">
            {rest.length} more{restDown ? `, ${restDown} not up` : ', all up'}
          </a>
        ) : (
          <span className="kuma-more">
            {rest.length} more{restDown ? `, ${restDown} not up` : ', all up'}
          </span>
        ))}
    </Section>
  );
}

// ---------- Ad blocking ----------

const BLOCKERS = [
  { id: 'pihole', label: 'Pi-hole' },
  { id: 'adguard', label: 'AdGuard Home' },
] as const;

function Blocker({ id, label, showName, now }: { id: 'pihole' | 'adguard'; label: string; showName: boolean; now: number }) {
  const { state, data } = useSource<DnsData>(id);
  const { snap } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!state || !data) return null;
  async function act(action: string) {
    setBusy(true);
    setError(null);
    try {
      await post(`/api/dns/${id}/${action}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // The board clock ticks once a minute; the later of the two keeps "30 min" from reading 31.
  const left = data.resumesAt ? Math.max(1, Math.ceil((data.resumesAt - Math.max(now, Date.now())) / 60_000)) : 0;
  return (
    <div className={`dns-one ${data.protecting ? '' : 'is-paused'}`}>
      {showName && <h3 className="dns-name">{label}</h3>}
      <p className="dns-big">
        <span className="dns-pct">{data.pct}%</span> blocked
      </p>
      <p className="dns-sub">
        {data.blocked.toLocaleString()} of {data.queries.toLocaleString()} queries today
      </p>
      <p className={`dns-state ${data.protecting ? '' : 'warn-text'}`}>
        {data.protecting
          ? data.listSize
            ? `On, ${data.listSize.toLocaleString()} domains on the lists.`
            : 'On.'
          : data.resumesAt
            ? `Paused, back on in ${left >= 60 ? `${Math.round(left / 60)} h` : `${left} min`}.`
            : 'Off, with no timer.'}
      </p>
      {!snap?.readOnly && (
        <div className="dns-actions">
          {data.protecting ? (
            <>
              <span className="dns-label">Pause</span>
              <button type="button" className="text-button" disabled={busy} onClick={() => void act('pause-5')}>
                5 min
              </button>
              <button type="button" className="text-button" disabled={busy} onClick={() => void act('pause-30')}>
                30 min
              </button>
              <button type="button" className="text-button" disabled={busy} onClick={() => void act('pause-60')}>
                1 h
              </button>
            </>
          ) : (
            <button type="button" className="text-button" disabled={busy} onClick={() => void act('resume')}>
              Turn back on
            </button>
          )}
        </div>
      )}
      {error && <p className="dns-error warn-text">{error}</p>}
    </div>
  );
}

export function DnsWidget({ now }: { now: number }) {
  const states = { pihole: useSource<DnsData>('pihole').state, adguard: useSource<DnsData>('adguard').state };
  const on = BLOCKERS.filter((b) => states[b.id]);
  if (!on.length) return null;
  return (
    <Section title="Ad blocking" source={on.length === 1 ? states[on[0].id] : undefined} className="dns">
      {on.map((b) => (
        <Blocker key={b.id} id={b.id} label={b.label} showName={on.length > 1} now={now} />
      ))}
    </Section>
  );
}

// ---------- Internet speed ----------

export function SpeedWidget({ now }: { now: number }) {
  const { state, data } = useSource<SpeedData>('speedtest');
  if (!state || !data) return null;
  const l = data.latest;
  const failed = !!data.lastFailed && (!l || data.lastFailed > l.at);
  return (
    <Section title="Internet" source={state} className="speed">
      {!l ? (
        <Empty>No speed tests yet. Speedtest Tracker runs them on its schedule.</Empty>
      ) : (
        <>
          <div className="speed-nums">
            <p>
              <span className={`speed-big ${l.healthy === false ? 'warn-text' : ''}`}>{Math.round(l.down)}</span>
              <span className="speed-unit">Mbps down</span>
            </p>
            <p>
              <span className="speed-mid">{Math.round(l.up)}</span>
              <span className="speed-unit">up</span>
            </p>
            {l.ping != null && (
              <p>
                <span className="speed-mid">{Math.round(l.ping)}</span>
                <span className="speed-unit">ms ping</span>
              </p>
            )}
          </div>
          <Spark data={data.runs.map((r) => [r.at, r.down] as [number, number])} height={28} label="Download speed, last 24 hours" />
          <p className="speed-seen">
            {failed ? <span className="warn-text">The last test failed. </span> : null}
            Tested {agoLong(l.at, now)}{l.server ? ` against ${l.server}` : ''}
            {l.loss ? `, ${l.loss}% packet loss` : ''}.
          </p>
        </>
      )}
    </Section>
  );
}

// ---------- Calendar ----------

/** The days ahead, grouped by day; all-day events first in each. */
export function CalendarWidget({ now }: { now: number }) {
  const { state, data } = useSource<CalendarData>('calendar');
  const { limit = 8 } = useWidget();
  const { clock24 } = useAppearance();
  if (!state || !data) return null;
  const upcoming = data.events.filter((e) => (e.end ?? e.start + (e.allDay ? 86_400_000 : 0)) > now || e.start > now).slice(0, limit);
  const calendars = new Set(data.events.map((e) => e.calendar).filter(Boolean));
  const dayKey = (t: number) => new Date(t).toDateString();
  const days = [...new Set(upcoming.map((e) => dayKey(Math.max(e.start, now - (e.allDay ? 0 : 0)))))];
  const time = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: !clock24 }).replace(':00', '');
  const label = (k: string) => {
    const d = new Date(k);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
    return diff <= 0 ? 'Today' : diff === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  };
  return (
    <Section title="Calendar" source={state} className="cal-widget" count={data.failed ? `${data.failed} calendar${data.failed === 1 ? '' : 's'} unreachable` : undefined}>
      {!upcoming.length ? (
        <Empty>Nothing on the calendar.</Empty>
      ) : (
        <div className="calw-days">
        {days.map((k) => (
          <div key={k} className="calw-day">
            <h3>{label(k)}</h3>
            <ul>
              {upcoming
                .filter((e) => dayKey(e.start) === k)
                .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start)
                .map((e) => (
                  <li key={e.id}>
                    <span className="calw-time mono">{e.allDay ? 'All day' : time(e.start)}</span>
                    <span className="calw-title">
                      {e.title}
                      {e.location && <span className="calw-where"> {e.location}</span>}
                    </span>
                    {calendars.size > 1 && e.calendar && <span className="calw-cal">{e.calendar}</span>}
                  </li>
                ))}
            </ul>
          </div>
        ))}
        </div>
      )}
    </Section>
  );
}

// ---------- Books ----------

export function BooksWidget() {
  const { state, data } = useSource<BooksData>('books');
  const { limit = 4 } = useWidget();
  if (!state || !data) return null;
  return (
    <Section title="Books" source={state} className="books" count="reading now" action={{ label: `Open ${data.source}`, href: data.webUrl }}>
      {!data.books.length ? (
        <Empty>Nothing on the currently-reading shelf.</Empty>
      ) : (
        <ul className="book-list">
          {data.books.slice(0, limit).map((b, i) => (
            <li key={`${b.title}-${i}`}>
              {b.cover ? <img className="book-cover" src={b.cover} alt="" /> : <span className="book-cover book-blank" aria-hidden />}
              <span className="book-text">
                <span className="book-title">{b.title}</span>
                {b.author && <span className="book-author">{b.author}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------- Notes ----------

/** A shared note. Lines starting "- [ ]" or "- [x]" are checkboxes you can tick. */
export function NotesWidget({ id }: { id: string }) {
  const readOnly = !!useStore().snap?.readOnly;
  const [text, setText] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');
  const load = () =>
    void fetch('/api/notes')
      .then((r) => r.json())
      .then((all: Record<string, { text: string }>) => setText(all[id]?.text ?? ''))
      .catch(() => setText(''));
  useEffect(() => {
    load();
    const t = setInterval(() => !editing && load(), 30_000);
    return () => clearInterval(t);
  }, [id, editing]);
  /** True once saved. A failure keeps the draft open with the reason beside it. */
  const save = async (next: string): Promise<boolean> => {
    setErr('');
    const res = await fetch(`/api/notes/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-patchboard': 'action' }, body: JSON.stringify({ text: next }) }).catch(() => null);
    if (!res?.ok) {
      setErr((await res?.json().catch(() => ({}))).error ?? 'Not saved: Patchboard did not answer');
      return false;
    }
    setText(next);
    return true;
  };
  if (text === null) return null;
  const toggle = (i: number) => {
    const ls = text.split('\n');
    ls[i] = ls[i].replace(/^(\s*- \[)( |x)(\])/i, (_, a, b, c) => `${a}${b === ' ' ? 'x' : ' '}${c}`);
    void save(ls.join('\n'));
  };
  return (
    <Section title="Notes" className="notes" action={readOnly || editing ? undefined : { label: text ? 'Edit' : 'Write', onClick: () => (setDraft(text), setEditing(true)) }}>
      {editing ? (
        <div className="notes-edit">
          <textarea className="field" value={draft} rows={Math.min(14, Math.max(4, draft.split('\n').length + 1))} onChange={(e) => setDraft(e.target.value)} placeholder={'Groceries\n- [ ] milk\n- [ ] coffee'} autoFocus />
          <div className="notes-actions">
            <button type="button" className="button" onClick={() => void save(draft).then((ok) => ok && setEditing(false))}>
              Save
            </button>
            <button type="button" className="text-button" onClick={() => setEditing(false)}>
              Cancel
            </button>
            {err && <span className="warn-text">{err}</span>}
          </div>
        </div>
      ) : !text.trim() ? (
        <Empty>Nothing here yet. A shopping list, the Wi-Fi password for guests, who feeds the cat.</Empty>
      ) : (
        <ul className="notes-lines">
          {text.split('\n').map((l, i) => {
            const box = /^\s*- \[( |x)\]\s?(.*)$/i.exec(l);
            if (box)
              return (
                <li key={i} className={`notes-check ${box[1].toLowerCase() === 'x' ? 'is-done' : ''}`}>
                  <label>
                    <input type="checkbox" checked={box[1].toLowerCase() === 'x'} disabled={readOnly} onChange={() => toggle(i)} />
                    <span>{box[2]}</span>
                  </label>
                </li>
              );
            return <li key={i}>{l.replace(/^\s*[-*]\s/, '• ') || '\u00a0'}</li>;
          })}
        </ul>
      )}
      {!editing && err && <p className="warn-text">{err}</p>}
    </Section>
  );
}

// ---------- Network: UniFi, Tailscale ----------

/** Clients and devices from UniFi, machines from Tailscale; trouble first. */
export function NetworkWidget({ now }: { now: number }) {
  const unifi = useSource<UnifiData>('unifi');
  const ts = useSource<TailnetData>('tailscale');
  const { limit = 6 } = useWidget();
  const state = unifi.state ?? ts.state;
  if (!state) return null;
  const off = unifi.data?.devices.filter((d) => !d.online) ?? [];
  const soon = (d: TailnetData['devices'][number]) => d.keyExpires != null && d.keyExpires - now < 7 * 86_400_000;
  const machines = [...(ts.data?.devices ?? [])].sort((a, b) => Number(soon(b)) - Number(soon(a)) || Number(b.online) - Number(a.online));
  return (
    <Section title="Network" source={state} className="net">
      {unifi.data && (
        <div className="net-block">
          <p className="speed-nums">
            <span className="speed-big">{unifi.data.clients}</span>
            <span className="speed-unit">clients</span>
            <span className="speed-mid">
              {unifi.data.devices.length - off.length}/{unifi.data.devices.length}
            </span>
            <span className="speed-unit">devices online</span>
          </p>
          {off.length > 0 && (
            <ul className="drive-list">
              {off.slice(0, limit).map((d) => (
                <li key={d.id} className="drive-warn">
                  <span className="drive-dot" aria-hidden />
                  <span className="drive-name">{d.name}</span>
                  <span className="drive-model">Offline</span>
                  <span />
                  <span />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {ts.data && (
        <div className="net-block">
          <h3 className="net-sub">
            Tailscale <span>{ts.data.devices.filter((d) => d.online).length} of {ts.data.devices.length} online</span>
          </h3>
          <ul className="drive-list">
            {machines.slice(0, limit).map((d) => {
              const days = d.keyExpires != null ? Math.round((d.keyExpires - now) / 86_400_000) : null;
              const expired = days != null && days < 0;
              return (
                <li key={d.id} className={expired ? 'drive-failed' : soon(d) ? 'drive-warn' : 'drive-ok'} title={d.os}>
                  <span className="drive-dot" aria-hidden style={d.online || expired || soon(d) ? undefined : { opacity: 0.35 }} />
                  <span className="drive-name">{d.name}</span>
                  <span className="drive-model">{expired ? 'Key expired' : soon(d) ? `Key expires in ${Math.max(1, days!)} d` : d.online ? (d.update ? 'Update available' : 'Online') : `Seen ${d.lastSeen ? ago(d.lastSeen, now) : 'a while'} ago`}</span>
                  <span />
                  <span />
                </li>
              );
            })}
          </ul>
          {machines.length > limit && <p className="speed-seen">{machines.length - limit} more machines.</p>}
        </div>
      )}
    </Section>
  );
}

// ---------- Portainer ----------

/** Every Docker environment: down and unhealthy first, then counts. */
export function DockerHostsWidget() {
  const { state, data } = useSource<PortainerData>('portainer');
  const { limit = 8 } = useWidget();
  if (!state || !data) return null;
  const total = data.envs.reduce((n, e) => n + e.running, 0);
  return (
    <Section title="Docker hosts" source={state} className="pt" count={`${total} running`} action={{ label: 'Open Portainer', href: data.webUrl }}>
      <ul className="drive-list pt-list">
        {data.envs.slice(0, limit).map((e) => (
          <li key={e.id} className={!e.up ? 'drive-failed' : e.unhealthy ? 'drive-warn' : 'drive-ok'} title={e.docker ? `Docker ${e.docker}` : undefined}>
            <span className="drive-dot" aria-hidden />
            <span className="drive-name">{e.name}</span>
            <span className="drive-model">
              {!e.up ? 'Down' : e.unhealthy ? `${e.unhealthy} unhealthy` : `${e.stacks} ${e.stacks === 1 ? 'stack' : 'stacks'}`}
            </span>
            <span className="mono drive-num">{e.up ? `${e.running} up` : ''}</span>
            <span className="mono drive-num">{e.up && e.stopped ? `${e.stopped} off` : ''}</span>
          </li>
        ))}
      </ul>
      {data.envs.length > limit && <p className="speed-seen">{data.envs.length - limit} more in Portainer.</p>}
    </Section>
  );
}

// ---------- Storage: Unraid, Synology, QNAP ----------

/** Every storage system: volumes as meters, then disks, trouble first. */
export function StorageWidget() {
  const { snap } = useStore();
  const { limit = 10 } = useWidget();
  const { temp: unit } = useAppearance();
  const limits = useLimits();
  if (!snap) return null;
  const systems = NAS_SOURCES.map((id) => ({ id, state: snap.sources[id] })).filter((x) => x.state);
  if (!systems.length) return null;
  const rank = { failed: 0, warn: 1, ok: 2 } as const;
  return (
    <Section title="Storage" className="nas" source={systems[0].state}>
      {systems.map(({ id, state }) => {
        const n = state!.data as NasSystem | null;
        if (!n) return <Empty key={id}>Connecting to {state!.label}.</Empty>;
        const level = (p: number) => storageLevel(p, limits);
        const disks = [...n.disks].sort((a, b) => rank[a.status] - rank[b.status]);
        return (
          <div key={id} className="nas-system">
            {systems.length > 1 && (
              <h3 className="nas-name">
                <a href={n.webUrl} target="_blank" rel="noreferrer">
                  {n.name}
                </a>{' '}
                <span>{n.platform}</span>
              </h3>
            )}
            {n.state && <p className="crit-text nas-state">{n.state}.</p>}
            <ul className="nas-volumes">
              {n.volumes.map((v) => {
                const pct = v.total ? (v.used / v.total) * 100 : 0;
                return (
                  <li key={v.name}>
                    <span className="nas-vol-name">{v.name}</span>
                    <Meter value={pct} level={v.status === 'failed' ? 'crit' : v.status === 'warn' ? 'warn' : level(pct)} />
                    <span className="mono nas-vol-num">
                      {Math.round(pct)}% of {size(v.total)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <ul className="nas-disks">
              {disks.slice(0, limit).map((d) => (
                <li key={d.name} className={`drive-${d.status}`} title={[d.model, d.detail].filter(Boolean).join(', ')}>
                  <span className="drive-dot" aria-hidden />
                  <span className="mono">{d.name}</span>
                  <span className="nas-disk-temp mono">{d.status !== 'ok' ? (d.detail ?? 'trouble') : d.tempC != null ? `${deg(d.tempC, unit)}°` : 'spun down'}</span>
                </li>
              ))}
            </ul>
            {disks.length > limit && <p className="speed-seen">{disks.length - limit} more disks.</p>}
          </div>
        );
      })}
    </Section>
  );
}

// ---------- NUT ----------

/** Each UPS: on mains or on battery, then charge, runtime and load. */
export function PowerWidget() {
  const { state, data } = useSource<NutData>('nut');
  if (!state || !data) return null;
  const out = data.ups.some((u) => u.onBattery);
  const mins = (s?: number) => (s == null ? '' : s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} m` : `${Math.round(s / 60)} min`);
  return (
    <Section title="Power" source={state} className="power" count={out ? 'On battery' : 'On mains'}>
      {!data.ups.length ? (
        <Empty>NUT knows no UPS yet.</Empty>
      ) : (
        <ul className="ups-list">
          {data.ups.map((u) => (
            <li key={u.name} className={u.onBattery || u.lowBattery ? 'is-out' : undefined} title={u.model}>
              <span className="ups-head">
                <span className="ups-name">{u.name}</span>
                <span className={u.onBattery || u.lowBattery ? 'crit-text' : u.replaceBattery ? 'warn-text' : 'ups-state'}>
                  {u.lowBattery ? 'Battery nearly empty' : u.onBattery ? 'On battery' : u.replaceBattery ? 'Replace battery' : u.charging ? 'Charging' : 'On mains'}
                </span>
              </span>
              {u.charge != null && <Meter value={u.charge} level={u.charge < 30 ? 'crit' : u.charge < 60 ? 'warn' : 'ok'} />}
              <span className="ups-nums mono">
                {u.charge != null && <span>{Math.round(u.charge)}%</span>}
                {u.runtimeSec != null && <span>{mins(u.runtimeSec)} left</span>}
                {u.loadPct != null && <span>{Math.round(u.loadPct)}% load{u.watts ? `, ${u.watts} W` : ''}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------- Glances ----------

/** Every host: CPU and memory meters, the fullest disk, network, the hottest sensor. Trouble first. */
export function HostsWidget() {
  const { snap } = useStore();
  const { limit = 6 } = useWidget();
  const { temp: unit } = useAppearance();
  // Glances and Beszel hosts in one list.
  const parts = (['glances', 'beszel'] as const).map((id) => snap?.sources[id] as SourceState<GlancesData> | undefined).filter((s): s is SourceState<GlancesData> => !!s?.data);
  if (!parts.length) return null;
  const state = parts.find((s) => !s.ok) ?? parts[0];
  const data = { hosts: parts.flatMap((s) => s.data!.hosts) };
  const level = (p: number) => (p >= 90 ? 'crit' : p >= 75 ? 'warn' : 'ok');
  const worst = (h: GlancesData['hosts'][number]) => (h.ok ? Math.max(h.cpuPct, h.memPct, h.disks[0]?.pct ?? 0) : 999);
  const list = [...data.hosts].sort((a, b) => worst(b) - worst(a));
  const rate = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB/s` : `${Math.round(b / 1e3)} KB/s`);
  const down = data.hosts.filter((h) => !h.ok).length;
  return (
    <Section title="Hosts" source={state} className="hosts" count={down ? `${down} not answering` : `${data.hosts.length} ${data.hosts.length === 1 ? 'host' : 'hosts'}`}>
      <ul className="host-list">
        {list.slice(0, limit).map((h) => (
          <li key={h.url} className={h.ok ? undefined : 'is-off'} title={[h.os, h.uptime ? `up ${h.uptime}` : ''].filter(Boolean).join(', ')}>
            <a className="host-name" href={h.url} target="_blank" rel="noreferrer">
              {h.name}
            </a>
            {h.ok ? (
              <>
                <span className="host-stat">
                  <Meter value={h.cpuPct} level={level(h.cpuPct)} />
                  <span className="mono">{Math.round(h.cpuPct)}% CPU</span>
                </span>
                <span className="host-stat">
                  <Meter value={h.memPct} level={level(h.memPct)} />
                  <span className="mono">{Math.round(h.memPct)}% mem</span>
                </span>
                <span className="host-stat">
                  {h.disks[0] ? (
                    <>
                      <Meter value={h.disks[0].pct} level={level(h.disks[0].pct)} />
                      <span className="mono" title={h.disks[0].mount}>
                        {Math.round(h.disks[0].pct)}% {h.disks[0].mount === '/' ? 'disk' : h.disks[0].mount.split('/').pop()}
                      </span>
                    </>
                  ) : null}
                </span>
                <span className="host-meta mono">
                  ↓ {rate(h.rx)}
                  {h.tempC != null ? `  ${deg(h.tempC, unit)}°` : ''}
                </span>
              </>
            ) : (
              <span className="host-meta warn-text">Not answering</span>
            )}
          </li>
        ))}
      </ul>
      {data.hosts.length > limit && <p className="speed-seen">{data.hosts.length - limit} more hosts.</p>}
    </Section>
  );
}

// ---------- Scrutiny ----------

/** Drives: trouble first, then by name, each with temperature and age. */
export function DrivesWidget({ now }: { now: number }) {
  const { state, data } = useSource<ScrutinyData>('scrutiny');
  const { limit = 8 } = useWidget();
  const { temp: unit } = useAppearance();
  if (!state || !data) return null;
  const rank = { failed: 0, warn: 1, ok: 2 } as const;
  const list = [...data.drives].sort((a, b) => rank[a.status] - rank[b.status]);
  const bad = data.drives.filter((d) => d.status !== 'ok').length;
  const last = Math.max(0, ...data.drives.map((d) => d.checkedAt ?? 0));
  const years = (h: number) => (h >= 8766 ? `${(h / 8766).toFixed(1)} yr` : `${Math.round(h / 24)} d`);
  return (
    <Section title="Drives" source={state} className="drives" count={bad ? `${bad} need${bad === 1 ? 's' : ''} you` : `${data.drives.length} healthy`} action={{ label: 'Open Scrutiny', href: data.webUrl }}>
      <ul className="drive-list">
        {list.slice(0, limit).map((d) => (
          <li key={d.id} className={`drive-${d.status}`} title={[d.model, d.host].filter(Boolean).join(', ')}>
            <span className="drive-dot" aria-hidden />
            <span className="drive-name mono">{d.name}</span>
            <span className="drive-model">{d.status === 'ok' ? d.model : d.status === 'failed' ? 'SMART failed' : 'Wearing out'}</span>
            <span className="mono drive-num">{d.temp != null ? `${deg(d.temp, unit)}°` : ''}</span>
            <span className="mono drive-num">{d.hours != null ? years(d.hours) : ''}</span>
          </li>
        ))}
      </ul>
      {last > 0 && <p className="speed-seen">Checked {agoLong(last, now)}.</p>}
    </Section>
  );
}

// ---------- Syncthing ----------

const SYNC_RANK = { error: 0, failing: 1, syncing: 2, paused: 3, idle: 4 } as const;

/** Folders, trouble first, then devices with their last contact. */
export function SyncWidget({ now }: { now: number }) {
  const { state, data } = useSource<SyncthingData>('syncthing');
  const { limit = 8 } = useWidget();
  if (!state || !data) return null;
  const folders = [...data.folders].sort((a, b) => SYNC_RANK[a.state] - SYNC_RANK[b.state] || a.label.localeCompare(b.label));
  const quiet = (d: SyncDevice) => !d.connected && !d.paused && d.lastSeen != null && now - d.lastSeen >= 86_400_000;
  const devices = [...data.devices].sort((a, b) => Number(quiet(b)) - Number(quiet(a)) || Number(b.connected) - Number(a.connected) || a.name.localeCompare(b.name));
  const bad = folders.filter((f) => f.state === 'error' || f.state === 'failing').length + devices.filter(quiet).length;
  const syncing = folders.filter((f) => f.state === 'syncing').length;
  const word = (f: SyncFolder) =>
    f.state === 'error' ? 'Stopped' : f.state === 'failing' ? `${f.failing} can't sync` : f.state === 'syncing' ? `Syncing, ${f.pct}%` : f.state === 'paused' ? 'Paused' : 'Up to date';
  return (
    <Section
      title="Sync"
      source={state}
      className="sync"
      count={bad ? `${bad} need${bad === 1 ? 's' : ''} you` : syncing ? `${syncing} syncing` : 'All in sync'}
      action={{ label: 'Open Syncthing', href: data.webUrl }}
    >
      <ul className="drive-list sync-list">
        {folders.slice(0, limit).map((f) => (
          <li key={f.id} className={f.state === 'error' ? 'drive-failed' : f.state === 'failing' ? 'drive-warn' : f.state === 'paused' ? 'is-paused' : undefined} title={f.error}>
            <span className="drive-dot" aria-hidden />
            <span className="sync-name">{f.label}</span>
            <span className="drive-model">{word(f)}</span>
            <span className="mono drive-num">{f.bytes ? size(f.bytes) : ''}</span>
          </li>
        ))}
      </ul>
      {devices.length > 0 && (
        <ul className="drive-list sync-list sync-devices" aria-label="Devices">
          {devices.slice(0, limit).map((d) => (
            <li key={d.id} className={quiet(d) ? 'drive-warn' : d.connected ? undefined : 'is-paused'}>
              <span className="drive-dot" aria-hidden />
              <span className="sync-name">{d.name}</span>
              <span className="drive-model">{d.paused ? 'Paused' : d.connected ? 'Connected' : d.lastSeen ? `Seen ${agoLong(d.lastSeen, now)}` : 'Never connected'}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------- Proxmox ----------

/** Nodes as meters, then guests: running ones busiest first, stopped ones after. */
export function ProxmoxWidget({ now: _now }: { now: number }) {
  const { state, data } = useSource<ProxmoxData>('proxmox');
  const { limit = 8 } = useWidget();
  const readOnly = !!useStore().snap?.readOnly;
  // One guest open at a time; shut down and reboot take a press and hold.
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ vmid: number; text: string; bad?: boolean; was?: boolean } | null>(null);
  if (!state || !data) return null;
  const act = async (vmid: number, name: string, was: boolean, action: 'start' | 'shutdown' | 'reboot') => {
    setBusy(true);
    setMsg(null);
    try {
      await post(`/api/proxmox/${vmid}/${action}`);
      setMsg({ vmid, was: action === 'reboot' ? undefined : was, text: action === 'start' ? `Starting ${name}.` : action === 'reboot' ? `Rebooting ${name}.` : `Shutting ${name} down.` });
    } catch (e) {
      setMsg({ vmid, text: (e as Error).message, bad: true });
    } finally {
      setBusy(false);
    }
  };
  // Guests keep their place (by ID) so a row never moves under your finger.
  const running = data.guests.filter((g) => g.running);
  const stopped = data.guests.filter((g) => !g.running);
  const shown = [...running, ...stopped].slice(0, limit);
  const level = (v: number) => (v >= 0.9 ? 'crit' : v >= 0.75 ? 'warn' : 'ok');
  return (
    <Section
      title="Proxmox"
      source={state}
      className="pve"
      count={`${running.length} running${stopped.length ? `, ${stopped.length} stopped` : ''}`}
      action={{ label: 'Open Proxmox', href: data.webUrl }}
    >
      <ul className="pve-nodes">
        {data.nodes.map((n) => (
          <li key={n.name} className={n.online ? undefined : 'is-off'}>
            <span className="pve-node-name">{n.name}</span>
            {n.online ? (
              <>
                <span className="pve-node-stat">
                  <Meter value={n.cpu * 100} level={level(n.cpu)} />
                  <span className="mono">{pct(n.cpu * 100)} CPU</span>
                </span>
                <span className="pve-node-stat">
                  <Meter value={n.maxmem ? (n.mem / n.maxmem) * 100 : 0} level={level(n.maxmem ? n.mem / n.maxmem : 0)} />
                  <span className="mono">
                    {size(n.mem)} of {size(n.maxmem)}
                  </span>
                </span>
              </>
            ) : (
              <span className="crit-text">Offline</span>
            )}
          </li>
        ))}
      </ul>
      <ul className="pve-guests">
        {shown.map((g) => (
          <li key={g.vmid} className={`${g.running ? '' : 'is-stopped'} ${open === g.vmid ? 'is-open' : ''}`}>
            <button
              type="button"
              className="pve-row"
              aria-expanded={open === g.vmid}
              disabled={readOnly}
              title={g.running ? `Up ${uptime(g.uptime)} on ${g.node}` : `Stopped, on ${g.node}`}
              onClick={() => (setOpen(open === g.vmid ? null : g.vmid), setMsg(null))}
            >
              <span className="pve-kind mono">
                {g.kind === 'lxc' ? 'CT' : 'VM'} {g.vmid}
              </span>
              <span className="pve-name">{g.name}</span>
              {g.running ? (
                <>
                  <span className="mono pve-num">{pct(g.cpu * 100)}</span>
                  <span className="mono pve-num">{size(g.mem)}</span>
                </>
              ) : (
                <span className="pve-off">Stopped</span>
              )}
            </button>
            {open === g.vmid && (
              <div className="pve-actions">
                <span className="pve-where">
                  {g.running ? `Up ${uptime(g.uptime)}` : 'Stopped'} on {g.node}
                </span>
                {!g.running ? (
                  <button type="button" className="text-button" disabled={busy} onClick={() => void act(g.vmid, g.name, g.running, 'start')}>
                    Start
                  </button>
                ) : (
                  <>
                    <HoldButton className="text-button" disabled={busy} hint="Hold to reboot" onConfirm={() => void act(g.vmid, g.name, g.running, 'reboot')}>
                      Reboot
                    </HoldButton>
                    <HoldButton className="text-button req-quiet" danger disabled={busy} hint="Hold to shut down" onConfirm={() => void act(g.vmid, g.name, g.running, 'shutdown')}>
                      Shut down
                    </HoldButton>
                  </>
                )}
                {/* The note goes once Proxmox reports the new state. */}
                {msg?.vmid === g.vmid && (msg.bad || msg.was === undefined || msg.was === g.running) && <span className={msg.bad ? 'warn-text' : 'pve-where'}>{msg.text}</span>}
              </div>
            )}
          </li>
        ))}
      </ul>
      {data.guests.length > shown.length && <p className="speed-seen">{data.guests.length - shown.length} more in Proxmox.</p>}
    </Section>
  );
}

// ---------- Immich ----------

/** Immich's queue names, as people say them. */
export const QUEUE_NAMES: Record<string, string> = {
  thumbnailGeneration: 'thumbnails',
  metadataExtraction: 'metadata',
  videoConversion: 'video encoding',
  faceDetection: 'face detection',
  facialRecognition: 'face recognition',
  smartSearch: 'smart search',
  duplicateDetection: 'duplicate check',
  storageTemplateMigration: 'storage moves',
  library: 'library scan',
  sidecar: 'sidecar files',
  migration: 'migration',
  backgroundTask: 'cleanup',
  search: 'search index',
  notifications: 'notifications',
  ocr: 'text recognition',
};

export function PhotosWidget() {
  const { state, data } = useSource<ImmichData>('immich');
  if (!state || !data) return null;
  const busy = data.queues.filter((q) => q.active + q.waiting > 0).sort((a, b) => b.active + b.waiting - (a.active + a.waiting));
  const failed = data.queues.reduce((n, q) => n + q.failed, 0);
  const paused = data.queues.filter((q) => q.paused);
  return (
    <Section title="Photos" source={state} className="photos" action={{ label: 'Open Immich', href: data.webUrl }}>
      <div className="speed-nums">
        <p>
          <span className="speed-big">{data.photos.toLocaleString()}</span>
          <span className="speed-unit">photos</span>
        </p>
        <p>
          <span className="speed-mid">{data.videos.toLocaleString()}</span>
          <span className="speed-unit">videos</span>
        </p>
        <p>
          <span className="speed-mid">{size(data.usage)}</span>
        </p>
      </div>
      {busy.length > 0 ? (
        <ul className="photo-queues">
          {busy.slice(0, 3).map((q) => (
            <li key={q.name}>
              <span>{QUEUE_NAMES[q.name] ?? q.name}</span>
              <span className="photo-queue-n">{(q.active + q.waiting).toLocaleString()} to go</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="speed-seen">Nothing processing.</p>
      )}
      {(failed > 0 || paused.length > 0) && (
        <p className="speed-seen">
          {failed > 0 && (
            <a className="warn-text" href={`${data.webUrl}/admin/jobs-status`} target="_blank" rel="noreferrer">
              {failed.toLocaleString()} failed {failed === 1 ? 'job' : 'jobs'}
            </a>
          )}
          {failed > 0 && paused.length > 0 ? '. ' : ''}
          {paused.length > 0 && `Paused: ${paused.map((q) => QUEUE_NAMES[q.name] ?? q.name).join(', ')}`}
          .
        </p>
      )}
      {data.version && <p className="speed-seen">Immich {data.version}</p>}
    </Section>
  );
}

// ---------- Overseerr and Jellyseerr requests ----------

function seasonsText(s: number[]): string {
  if (s.length === 1) return `Season ${s[0]}`;
  const sorted = [...s].sort((a, b) => a - b);
  const run = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);
  return run ? `Seasons ${sorted[0]} to ${sorted[sorted.length - 1]}` : `${s.length} seasons`;
}

export function RequestsWidget({ now }: { now: number }) {
  const { state, data } = useSource<SeerrData>('overseerr');
  const { snap } = useStore();
  const { limit = 5, editing } = useWidget();
  const [busy, setBusy] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!state || !data) return null;
  // Nothing to approve: the widget steps aside until someone asks for something.
  if (!data.requests.length && !editing && state.ok) return null;
  async function act(id: number, action: 'approve' | 'decline') {
    setBusy(id);
    setError(null);
    try {
      await post(`/api/requests/${id}/${action}`);
      setConfirm(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const shown = data.requests.slice(0, limit);
  return (
    <Section title="Requests" count={data.pending ? `${data.pending} waiting` : undefined} source={state} className="requests">
      {shown.length === 0 ? (
        <Empty>Nothing waiting for approval.{data.processing ? ` ${data.processing} approved and on the way.` : ''}</Empty>
      ) : (
        <ul className="req-list">
          {shown.map((r) => (
            <li key={r.id} className="req">
              {r.art ? <img className="req-art" src={r.art} alt="" loading="lazy" /> : <span className="req-art req-art-none" aria-hidden />}
              <div className="req-main">
                <span className="req-title">
                  {r.title}
                  {r.year ? <span className="req-year"> {r.year}</span> : null}
                </span>
                <span className="req-sub">
                  {[r.by, ago(r.at, now), r.seasons ? seasonsText(r.seasons) : null, r.is4k ? '4K' : null].filter(Boolean).join(', ')}
                </span>
              </div>
              {!snap?.readOnly && (
                <span className="req-actions">
                  {confirm === r.id ? (
                    <>
                      <button type="button" className="text-button req-decline" disabled={busy === r.id} onClick={() => void act(r.id, 'decline')}>
                        Decline it
                      </button>
                      <button type="button" className="text-button req-quiet" onClick={() => setConfirm(null)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="text-button" disabled={busy === r.id} onClick={() => void act(r.id, 'approve')}>
                        Approve
                      </button>
                      <button type="button" className="text-button req-quiet" disabled={busy === r.id} onClick={() => setConfirm(r.id)}>
                        Decline
                      </button>
                    </>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {data.requests.length > shown.length && <p className="req-more">{data.requests.length - shown.length} more waiting in Overseerr.</p>}
      {error && <p className="dns-error warn-text">{error}</p>}
    </Section>
  );
}
