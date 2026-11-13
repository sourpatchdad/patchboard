// Settings, Devices: the wall tablets, e-ink panels and family phones that
// opened a household link, each set from here. Pick one on the left; on the
// right are its pages in order, how it looks, and its link. Every change is
// saved at once and the device follows within a second, with nobody touching
// it. A household device can't open Settings, so this is the only place its
// look changes once it's on a wall.

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { DeviceLook, DeviceView } from '../../shared/types.ts';
import { NUMBERS, type Widget, type WidgetType, WIDGET_INFO } from '../../shared/board.ts';
import { DIM_HOURS, dimLabel, MAX_PAGES, ROTATE_SECONDS } from '../../shared/wall.ts';
import { THEMES } from '../lib/appearance.ts';
import { agoLong } from '../lib/format.ts';
import { LANGUAGES } from '../lib/i18n.ts';
import { CURRENCIES, REGIONS } from '../lib/region.ts';
import { useStore } from '../lib/store.tsx';
import { HoldButton } from './Hold.tsx';
import { Qr } from './Qr.tsx';
import { Section } from './ui.tsx';

type Listed = { id: string; name: string; created: number; seen?: number } & DeviceView;
type Patch = { name?: string; opens?: string; pages?: string[]; rotate?: number; tint?: string; dim?: string; screen?: string; look?: DeviceLook };

const ACTION = { 'X-Patchboard': 'action', 'Content-Type': 'application/json' };
// A device counts as on when it asked for anything this recently (it checks in every ten minutes).
const ON_MS = 15 * 60_000;
const KEEP = 'As the device has it';

/** A page a device can show: its address, its name, and whether it's one widget on its own. */
type Place = [string, string, boolean?, WidgetType?];

/**
 * Every page a device can show, by name: Home, the other boards, the pages a
 * household device may open, then each widget on each board on its own.
 */
function usePlaces(): Place[] {
  const { snap } = useStore();
  const boards = snap?.boards ?? [];
  const [widgets, setWidgets] = useState<Place[]>([]);
  const key = boards.map((b) => b.id).join(' ');
  useEffect(() => {
    void Promise.all(
      boards.map(async (b) => {
        const r = await fetch(`/api/boards/${encodeURIComponent(b.id)}`).catch(() => null);
        const body = r?.ok ? ((await r.json()) as { board?: { widgets: Widget[] } }) : null;
        return (body?.board?.widgets ?? [])
          .filter((w) => w.type !== 'attention' || w.config?.style === 'card')
          .map((w) => [`/w/${b.id}/${w.id}`, `${w.config?.title || WIDGET_INFO[w.type]?.name || w.type}, from ${b.name}`, true, w.type] as Place);
      }),
    ).then((lists) => setWidgets(lists.flat()));
  }, [key]);
  return [
    ['/', 'Home'],
    ...boards.filter((b) => b.id !== 'home').map((b) => [`/b/${b.id}`, b.name] as Place),
    ['/monitor', 'Monitor'],
    ['/server', 'Server'],
    ['/upcoming', 'Upcoming'],
    ['/reading', 'Reading'],
    ['/weather', 'Weather'],
    ...widgets,
  ];
}

/** Places as options: the pages, then the single widgets in a group of their own. */
function PlaceOptions({ places }: { places: Place[] }) {
  const opt = ([v, l]: Place) => (
    <option key={v} value={v}>
      {l}
    </option>
  );
  const alone = places.filter((p) => p[2]);
  return (
    <>
      {places.filter((p) => !p[2]).map(opt)}
      {alone.length > 0 && <optgroup label="One widget, full screen">{alone.map(opt)}</optgroup>}
    </>
  );
}

/** "Monitor, then 2 more pages", for the list. */
function summary(d: Listed, name: (p: string) => string): string {
  if (!d.opens) return 'Stays on the last page it showed';
  const more = d.pages?.length ?? 0;
  return more ? `${name(d.opens)}, then ${more} more ${more === 1 ? 'page' : 'pages'}` : name(d.opens);
}

export function Devices() {
  const { snap } = useStore();
  const readOnly = !!snap?.readOnly;
  const places = usePlaces();
  const placeName = (p: string) => places.find(([v]) => v === p)?.[1] ?? p;
  const [list, setList] = useState<Listed[] | null>(null);
  const [auth, setAuth] = useState('none');
  const [params, setParams] = useSearchParams();
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  /** A link just made, shown once: Patchboard keeps only its hash. */
  const [link, setLink] = useState<{ id: string; url: string; panel?: string } | null>(null);

  const load = async () => setList((await (await fetch('/api/household')).json()) as Listed[]);
  useEffect(() => {
    void load();
    void fetch('/api/session')
      .then((r) => r.json())
      .then((s: { auth?: string }) => setAuth(s.auth ?? 'none'));
  }, []);

  const picked = list?.find((d) => d.id === params.get('device')) ?? list?.[0];
  const pick = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('device', id);
    setParams(next, { replace: true });
  };

  const save = async (id: string, patch: Patch) => {
    setErr('');
    const res = await fetch(`/api/household/${id}`, { method: 'PUT', headers: ACTION, body: JSON.stringify(patch) });
    const body = (await res.json()) as DeviceView & { error?: string };
    if (!res.ok) return setErr(body.error ?? `HTTP ${res.status}`);
    // The answer is the whole view: a field it leaves out is unset.
    setList((l) => l && l.map((d) => (d.id === id ? { id, name: patch.name ?? d.name, created: d.created, seen: d.seen, ...body } : d)));
  };
  const add = async () => {
    setErr('');
    const res = await fetch('/api/household', { method: 'POST', headers: ACTION, body: JSON.stringify({ name }) });
    const body = (await res.json()) as { id?: string; path?: string; panel?: string; error?: string };
    if (!res.ok || !body.id) return setErr(body.error ?? `HTTP ${res.status}`);
    setLink({ id: body.id, url: `${location.origin}${body.path}`, panel: `${location.origin}${body.panel}` });
    setName('');
    await load();
    pick(body.id);
  };

  const wallBoards = (snap?.boards ?? []).filter((b) => b.wall);
  if (!list) return null;
  return (
    <Section title="Devices" count={list.length ? String(list.length) : undefined} className="span-all">
      <div className="devices">
        <div className="device-list">
          {list.length > 0 && (
            <ul aria-label="Devices">
              {list.map((d) => {
                const on = !!d.seen && Date.now() - d.seen < ON_MS;
                return (
                  <li key={d.id}>
                    <button type="button" className="device-pick" aria-current={picked?.id === d.id ? 'true' : undefined} onClick={() => pick(d.id)}>
                      <span className="device-pick-name">
                        <span className={`device-dot ${on ? 'is-on' : ''}`} aria-hidden="true" />
                        {d.name}
                      </span>
                      <span className="device-pick-what">{summary(d, placeName)}</span>
                      <span className="device-pick-seen">{d.seen ? (on ? 'On now' : `Last on ${agoLong(d.seen)}`) : 'Link not opened yet'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!readOnly && (
            <form
              className="device-add"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) void add();
              }}
            >
              <label htmlFor="device-name">{list.length ? 'Add another device' : 'Add a device'}</label>
              <div>
                <input id="device-name" className="field" value={name} maxLength={40} placeholder="Kitchen tablet" onChange={(e) => setName(e.target.value)} />
                <button type="submit" className="button button-quiet" disabled={!name.trim()}>
                  Make a link
                </button>
              </div>
            </form>
          )}
          <p className="settings-note">
            A device opens its link once and from then on sees the boards, cameras, Server and Monitor, reading and calendar, and switches the lights pinned to a board. It
            can't update, restart or stop anything, or open Settings, logs or container pages.
          </p>
          {wallBoards.length > 0 && (
            <p className="settings-note wall-boards">
              Wall boards stay off Home's tabs. Edit one:{' '}
              {wallBoards.map((b, i) => (
                <span key={b.id}>
                  {i > 0 && ', '}
                  <Link to={`/b/${b.id}?arrange=1`}>{b.name}</Link>
                </span>
              ))}
              .
            </p>
          )}
          {auth === 'none' && list.length > 0 && (
            <p className="settings-note">With sign-in off, a device you remove goes back to full access, like any browser on your network. Turn on a password under Connections if that matters.</p>
          )}
        </div>

        {picked ? (
          <DeviceEditor
            key={picked.id}
            d={picked}
            readOnly={readOnly}
            places={places}
            placeName={placeName}
            link={link?.id === picked.id ? link : null}
            onLink={setLink}
            onSave={(patch) => void save(picked.id, patch)}
            onRemove={async () => {
              await fetch(`/api/household/${picked.id}`, { method: 'DELETE', headers: ACTION });
              setLink(null);
              await load();
            }}
            err={err}
          />
        ) : (
          <div className="device-editor device-empty">
            <p>No devices yet. Name one on the left, like Kitchen tablet, and open the link it makes on that device, or scan its code.</p>
          </div>
        )}
      </div>
    </Section>
  );
}

function DeviceEditor({
  d,
  readOnly,
  places,
  placeName,
  link,
  onLink,
  onSave,
  onRemove,
  err,
}: {
  d: Listed;
  readOnly: boolean;
  places: Place[];
  placeName: (p: string) => string;
  link: { id: string; url: string; panel?: string } | null;
  onLink: (l: { id: string; url: string; panel?: string } | null) => void;
  onSave: (patch: Patch) => void;
  onRemove: () => Promise<void>;
  err: string;
}) {
  const [name, setName] = useState(d.name);
  const [copied, setCopied] = useState(false);
  const order = d.opens ? [d.opens, ...(d.pages ?? [])] : [];
  const setOrder = (next: string[]) => onSave({ opens: next[0] ?? '', pages: next.slice(1) });
  const move = (i: number, by: number) => {
    const next = [...order];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setOrder(next);
  };
  const look = d.look ?? {};
  const setLook = (k: keyof DeviceLook, v: string | boolean | undefined) => onSave({ look: { ...look, [k]: v === '' ? undefined : v } });
  const lookSelect = (k: keyof DeviceLook, label: string, options: [string, string][]) => (
    <label>
      <span>{label}</span>
      <select className="field" disabled={readOnly} value={look[k] === undefined ? '' : String(look[k])} onChange={(e) => setLook(k, k === 'clock24' ? (e.target.value === '' ? '' : e.target.value === 'true') : e.target.value)}>
        <option value="">{KEEP}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  // The board to arrange for a page: the board itself, or the board a single widget lives on.
  const boardOf = (p: string) => (p === '/' || p.startsWith('/b/') ? p : p.startsWith('/w/') ? (p.split('/')[2] === 'home' ? '/' : `/b/${p.split('/')[2]}`) : null);
  const newLink = async () => {
    const res = await fetch(`/api/household/${d.id}/link`, { method: 'POST', headers: ACTION });
    const body = (await res.json()) as { path?: string };
    if (res.ok && body.path) onLink({ id: d.id, url: `${location.origin}${body.path}` });
  };
  const [panelShows, setPanelShows] = useState('');
  const newPanel = async () => {
    const res = await fetch(`/api/household/${d.id}/panel`, { method: 'POST', headers: ACTION });
    const body = (await res.json()) as { panel?: string };
    if (res.ok && body.panel) onLink({ id: d.id, url: link?.url ?? '', panel: `${location.origin}${body.panel}` });
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Browsers allow the clipboard only on https or localhost; the field selects itself to copy by hand.
    }
  };

  return (
    <div className="device-editor">
      <div className="device-head">
        <input
          className="field device-name"
          aria-label="Device name"
          value={name}
          maxLength={40}
          disabled={readOnly}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== d.name && onSave({ name: name.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <span className="settings-note">{d.seen ? `Last checked in ${agoLong(d.seen)}` : 'Link not opened yet'}. Changes reach it within a second.</span>
      </div>
      {err && (
        <p className="crit-text" role="alert">
          {err}
        </p>
      )}

      {link?.url && (
        <div className="device-made" role="status">
          <Qr text={link.url} label={`QR code of the link for ${d.name}`} />
          <div>
            <p>
              Open this link on <strong>{d.name}</strong>, or scan the code with it. Patchboard shows it only now, and anyone with it gets the same view.
            </p>
            <div className="device-copy">
              <input className="field mono" readOnly value={link.url} aria-label={`Link for ${d.name}`} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="button button-quiet" onClick={() => void copy(link.url)}>
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="device-part" aria-labelledby={`pages-${d.id}`}>
        <h3 id={`pages-${d.id}`}>Pages</h3>
        <p className="settings-note">
          It opens on the first and a swipe moves down the list. A page can be one widget on its own, filling the screen: set that widget to One number for a small display. Leave the list
          empty and the device stays on whatever page it last showed.
        </p>
        <ol className="device-pages">
          {order.map((p, i) => (
            <li key={p}>
              <span className="device-page-num">{i === 0 ? 'Opens on' : `Page ${i + 1}`}</span>
              <select className="field" value={p} disabled={readOnly} aria-label={i === 0 ? 'Opens on' : `Page ${i + 1}`} onChange={(e) => setOrder(order.map((x, j) => (j === i ? e.target.value : x)))}>
                <PlaceOptions places={places.filter(([v]) => v === p || !order.includes(v))} />
              </select>
              {!readOnly && (
                <span className="device-page-tools">
                  <button type="button" className="device-move" disabled={i === 0} aria-label={`Move ${placeName(p)} up`} onClick={() => move(i, -1)}>
                    ↑
                  </button>
                  <button type="button" className="device-move" disabled={i === order.length - 1} aria-label={`Move ${placeName(p)} down`} onClick={() => move(i, 1)}>
                    ↓
                  </button>
                  <button type="button" className="device-move" aria-label={`Remove ${placeName(p)}`} onClick={() => setOrder(order.filter((x) => x !== p))}>
                    ×
                  </button>
                </span>
              )}
              {boardOf(p) && (
                <Link className="text-button" to={`${boardOf(p)}?arrange=1`}>
                  {p.startsWith('/w/') ? 'Edit widget' : 'Edit board'}
                </Link>
              )}
            </li>
          ))}
        </ol>
        {!readOnly && order.length < MAX_PAGES && (
          <select className="field device-page-add" aria-label="Add a page" value="" onChange={(e) => e.target.value && setOrder([...order, e.target.value])}>
            <option value="">{order.length ? 'Add a page' : 'Pick the page it opens on'}</option>
            <PlaceOptions places={places.filter(([v]) => !order.includes(v))} />
          </select>
        )}
        {order.length > 1 && (
          <label className="device-inline">
            <span>Turns pages</span>
            <select className="field" value={d.rotate ?? 0} disabled={readOnly} onChange={(e) => onSave({ rotate: Number(e.target.value) })}>
              {ROTATE_SECONDS.map((s) => (
                <option key={s} value={s}>
                  {s === 0 ? 'Only when swiped' : s < 60 ? `Every ${s} seconds` : s === 60 ? 'Every minute' : `Every ${s / 60} minutes`}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <section className="device-part" aria-labelledby={`screen-${d.id}`}>
        <h3 id={`screen-${d.id}`}>Screen</h3>
        <div className="device-grid">
          <label>
            <span>Kind of screen</span>
            <select className="field" value={d.screen ?? ''} disabled={readOnly} onChange={(e) => onSave({ screen: e.target.value })}>
              <option value="">Color</option>
              <option value="eink">E-ink</option>
            </select>
          </label>
          <label>
            <span>Dims at night</span>
            <select className="field" value={d.dim ?? ''} disabled={readOnly} onChange={(e) => onSave({ dim: e.target.value })}>
              <option value="">Never</option>
              {DIM_HOURS.map((h) => (
                <option key={h} value={h}>
                  {dimLabel(h)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Monitor colors</span>
            <select className="field" value={d.tint ?? 'gray'} disabled={readOnly} onChange={(e) => onSave({ tint: e.target.value })}>
              <option value="gray">Gray</option>
              <option value="blue">Blue</option>
              <option value="color">Full color</option>
            </select>
          </label>
        </div>
      </section>

      <section className="device-part" aria-labelledby={`look-${d.id}`}>
        <h3 id={`look-${d.id}`}>Look</h3>
        <p className="settings-note">{KEEP} keeps whatever was set on the device itself.</p>
        <div className="device-grid">
          {lookSelect(
            'theme',
            'Theme',
            THEMES.map((t) => [t.id, t.name]),
          )}
          {lookSelect('scheme', 'Mode', [
            ['dark', 'Dark'],
            ['light', 'Light'],
            ['auto', 'Match the system'],
          ])}
          {lookSelect('density', 'Density', [
            ['compact', 'Compact'],
            ['comfortable', 'Comfortable'],
            ['large', 'Large'],
          ])}
          {lookSelect('clock24', 'Time', [
            ['false', '12-hour'],
            ['true', '24-hour'],
          ])}
          {lookSelect('temp', 'Temperature', [
            ['f', '°F'],
            ['c', '°C'],
            ['both', 'Both'],
          ])}
          {lookSelect('lang', 'Language', LANGUAGES)}
          {lookSelect('locale', 'Dates and numbers', REGIONS)}
          {lookSelect(
            'currency',
            'Prices in',
            CURRENCIES.map((c) => [c, c]),
          )}
        </div>
      </section>

      {!readOnly && (
        <section className="device-part" aria-labelledby={`link-${d.id}`}>
          <h3 id={`link-${d.id}`}>Link</h3>
          <p className="settings-note">
            A new link is for a replacement device, or one that lost its link: the old link stops working. An e-paper panel with no browser (TRMNL, Inky, an ESP32) shows a picture
            from its own address instead.
          </p>
          <div className="device-actions">
            <HoldButton className="button button-quiet" hint="Hold to make a new link. The old one stops working." onConfirm={() => void newLink()}>
              New link
            </HoldButton>
            <button type="button" className="button button-quiet" onClick={() => void newPanel()}>
              New panel address
            </button>
            <HoldButton className="text-button" danger hint="Hold to remove. The device stops working as a household device." onConfirm={() => void onRemove()}>
              Remove device
            </HoldButton>
          </div>
          {link?.panel && (
            <>
              <label className="device-inline">
                <span>Panel shows</span>
                <select className="field" value={panelShows} onChange={(e) => setPanelShows(e.target.value)}>
                  <option value="">The server: status, weather and gauges</option>
                  {/* Any widget with a number of its own, as one big number. */}
                  {places
                    .filter((p) => p[2] && p[3] && (NUMBERS[p[3]] || p[3] === 'markets'))
                    .map(([v, l]) => (
                      <option key={v} value={v.slice(3)}>
                        {l}
                      </option>
                    ))}
                </select>
              </label>
              <input className="field mono" readOnly value={`${link.panel}${panelShows ? `?widget=${panelShows}` : ''}`} aria-label={`Panel picture for ${d.name}`} onFocus={(e) => e.currentTarget.select()} />
              <p className="settings-note">
                Add <code>w=</code> and <code>h=</code> for the panel's size, or use <code>.bmp</code> in place of <code>.png</code>. A widget shows the number its One number setting picks. A new address retires the last.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
