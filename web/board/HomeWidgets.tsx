// Widgets for the house and the network: Home Assistant entities, the car,
// Wake-on-LAN, and Uptime Kuma monitors.

import { useEffect, useMemo, useState } from 'react';
import { haActionFor, HA_MAX_PINNED, parseEntities } from '../../shared/ha.ts';
import type { CarData, HaEntity, HomeAssistantData, KumaMonitor, KumaState, UptimeKumaData } from '../../shared/types.ts';
import { Empty, Meter, Section } from '../components/ui.tsx';
import { useAppearance } from '../lib/appearance.ts';
import { ago, agoLong, deg } from '../lib/format.ts';
import { useSource, useStore } from '../lib/store.tsx';
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

export function UptimeWidget({ now }: { now: number }) {
  const { state, data } = useSource<UptimeKumaData>('uptimekuma');
  const { limit = 8 } = useWidget();
  if (!state || !data) return null;
  const sorted = [...data.monitors].sort((a, b) => KUMA_ORDER[a.status] - KUMA_ORDER[b.status] || a.name.localeCompare(b.name));
  const down = sorted.filter((m) => m.status === 'down').length;
  const up = sorted.filter((m) => m.status === 'up').length;
  const shown = sorted.slice(0, limit);
  const rest = sorted.slice(limit);
  const restDown = rest.filter((m) => m.status !== 'up').length;
  return (
    <Section title="Uptime" count={down ? `${down} down` : `${up} of ${sorted.length} up`} source={state} action={{ label: 'Open', href: data.link }} className={`uptime ${down ? 'has-down' : ''}`}>
      {sorted.length === 0 ? (
        <Empty>This status page has no monitors. Add some in Uptime Kuma.</Empty>
      ) : (
        <ul className="kuma-list">
          {shown.map((m) => (
            <li key={m.id} className={`kuma kuma-${m.status}`}>
              <span className="kuma-name" title={m.group}>
                {m.name}
              </span>
              <Beats m={m} />
              <span className="kuma-num">
                {m.status === 'up' ? (m.uptime24 != null ? `${m.uptime24 % 1 ? m.uptime24.toFixed(1) : m.uptime24}%` : m.ping != null ? `${m.ping} ms` : 'Up') : KUMA_WORDS[m.status]}
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
      {rest.length > 0 && (
        <a className="kuma-more" href={data.link} target="_blank" rel="noreferrer">
          {rest.length} more{restDown ? `, ${restDown} not up` : ', all up'}
        </a>
      )}
    </Section>
  );
}
