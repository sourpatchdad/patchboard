// Settings. Connections and the catalog live on the server and are shared by
// every device; everything else is a per-device preference (appearance.ts).
// Themes are data in themes.ts, so this page renders whatever is there.

import { HELP } from '../lib/docs.ts';
import { HoldButton } from '../components/Hold.tsx';
import { CATEGORIES, INTEGRATIONS, type Integration } from '../../shared/integrations.ts';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useUrlChoice } from '../lib/url.ts';
import { land, useLanding } from '../lib/landing.ts';
import type { CatalogAudit, DeviceView, SelfCheck } from '../../shared/types.ts';
import { DIM_HOURS, dimLabel, MAX_PAGES, ROTATE_SECONDS } from '../../shared/wall.ts';
import { setShowcase, useShowcase } from '../lib/showcase.ts';
import { Section } from '../components/ui.tsx';
import { IntegrationForm } from '../components/IntegrationSetup.tsx';
import { HomepageImport } from '../components/HomepageImport.tsx';
import { SignIn } from '../components/SignIn.tsx';
import { BrandName } from '../components/BrandName.tsx';
import { type SetupIntegration, THRESHOLDS, type ThresholdState } from '../../shared/setup.ts';
import {
  ACCENTS,
  type Appearance,
  exportAppearance,
  importAppearance,
  resetAppearance,
  setAppearance,
  THEMES,
  tokensFor,
  useAppearance,
} from '../lib/appearance.ts';
import { contrast, FONTS, type FontSet } from '../lib/themes.ts';
import { useNow, useStore } from '../lib/store.tsx';
import { agoLong } from '../lib/format.ts';
import { SelfUpdate } from '../components/Updater.tsx';
import { CURRENCIES, currency, locale, money, num, REGIONS } from '../lib/region.ts';
import { LANGUAGES } from '../lib/i18n.ts';

/** A household device as Settings lists it. */
type Listed = { id: string; name: string; created: number; seen?: number } & DeviceView;

type Tab = 'look' | 'home' | 'alerts' | 'connections' | 'activity';

/** Tabs move with the arrow keys, Home and End, as tabs do everywhere else. */
function tabKeys(e: React.KeyboardEvent<HTMLDivElement>) {
  const tabs = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const at = tabs.indexOf(document.activeElement as HTMLButtonElement);
  if (at < 0) return;
  const to = e.key === 'ArrowRight' ? (at + 1) % tabs.length : e.key === 'ArrowLeft' ? (at - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
  if (to < 0) return;
  e.preventDefault();
  tabs[to].focus();
  tabs[to].click();
}
type Part = 'integrations' | 'access' | 'apps' | 'backup';
const PARTS: [Part, string][] = [
  ['integrations', 'Integrations'],
  ['access', 'Sign-in and keys'],
  ['apps', 'Apps'],
  ['backup', 'Backup'],
];
const TABS: [Tab, string, string][] = [
  ['look', 'Look', 'Saved on this device, so the phone and the desktop can differ. A new browser or home-screen app starts from the last look you saved.'],
  ['home', 'Home', 'Header, app appearance and units for this device. Arrange board on Home changes the shared widget layout.'],
  ['alerts', 'Alerts', 'When storage, drives and links count as trouble. Shared by every device.'],
  ['connections', 'Connections', 'Integrations, sign-in, keys and setup backups. Shared by every device.'],
  ['activity', 'Activity', 'Who changed what, newest first.'],
];

export function Settings() {
  const a = useAppearance();
  const [tab, setTab] = useUrlChoice<Tab>('tab', ['look', 'home', 'alerts', 'connections', 'activity'], 'look', true, ['part']);
  // Connections is four pages in one: each part on its own, so none is a long scroll away.
  const [part, setPart] = useUrlChoice<Part>('part', ['integrations', 'access', 'apps', 'backup'], 'integrations', true);
  const { hash, search } = useLocation();
  useEffect(() => {
    if (hash === '#catalog' || new URLSearchParams(search).get('import') === 'homepage') setPart('apps');
  }, [hash, search]);
  // Older links point at #catalog.
  useEffect(() => {
    if (hash === '#catalog' && tab !== 'connections') setTab('connections');
  }, [hash]);
  useLanding(!!useStore().snap && (tab === 'connections' || tab === 'home'));
  const groupLabels: Partial<Record<keyof Appearance, string>> = { homeStatusSize: 'Status size', homeClockSize: 'Clock size', homeWeather: 'Weather view', homeApps: 'App appearance', clock24: 'Time format', temp: 'Temperature units', scheme: 'Color mode', icons: 'Service icons', appIcon: 'App icon', font: 'Typeface', density: 'Density' };
  const seg = <K extends keyof Appearance>(key: K, options: [Appearance[K], string][], disabled = false) => (
    <div className="seg" role="group" aria-label={groupLabels[key]}>
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" disabled={disabled} aria-pressed={a[key] === v} onClick={() => setAppearance({ [key]: v } as Partial<Appearance>)}>
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="page settings">
      <div className="page-head">
        <h1 className="page-title">Settings</h1>
      </div>
      <div className="seg settings-tabs" role="tablist" aria-label="Settings" onKeyDown={tabKeys}>
        {TABS.map(([v, label]) => (
          <button key={v} type="button" role="tab" tabIndex={tab === v ? 0 : -1} aria-selected={tab === v} onClick={() => setTab(v)}>
            {label}
          </button>
        ))}
      </div>
      <p className="page-lede">{TABS.find((t) => t[0] === tab)![2]}</p>

      <div className="settings-grid">
      {tab === 'look' && (
      <>
      <BrandName />

      <Section title="Theme" count={`${THEMES.length + 1} themes`} className="span-all">
        <div className="theme-grid">
          {THEMES.map((t) => (
            <ThemeCard key={t.id} id={t.id} name={t.name} note={t.note} active={a.theme === t.id} />
          ))}
          <ThemeCard id="custom" name="Custom" note="Your background, text and accent." active={a.theme === 'custom'} />
        </div>
        {a.theme === 'custom' && <CustomBuilder />}
      </Section>

      <Section title="Mode">
        <div className="choice-row">
          {seg(
            'scheme',
            [
              ['auto', 'Match the system'],
              ['dark', 'Dark'],
              ['light', 'Light'],
            ],
            a.theme === 'custom',
          )}
        </div>
        {a.theme === 'custom' && <p className="settings-note">A custom theme turns light or dark with its background color.</p>}
      </Section>

      <Section title="App icon">
        <div className="choice-row icon-choices">
          {(
            [
              ['dark', 'Dark', '/icon-192.png'],
              ['light', 'Light', '/icon-light-192.png'],
              ['auto', 'Match the mode', a.scheme === 'light' || (a.scheme === 'auto' && matchMedia('(prefers-color-scheme: light)').matches) ? '/icon-light-192.png' : '/icon-192.png'],
            ] as const
          ).map(([v, label, src]) => (
            <button key={v} type="button" className="icon-choice" aria-pressed={a.appIcon === v} onClick={() => setAppearance({ appIcon: v })}>
              <img src={src} alt="" width={44} height={44} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <p className="settings-note">
          For this device: the icon you get from Add to Home Screen or Install. Dark reads on light and dark home screens; a phone in dark
          mode can darken the Light icon and hide its P. A phone keeps the icon it had when you added it, so pick first, then add. The browser tab adds an amber dot for warnings or a red dot for critical alerts, and its title counts what needs you.
        </p>
      </Section>

      <Section title="Accent">
        <div className="choice-row swatches">
          <button type="button" className="swatch swatch-theme" aria-pressed={a.accent === 'default'} title="The theme's own" aria-label="The theme's own accent" onClick={() => setAppearance({ accent: 'default' })} />
          {ACCENTS.map((c) => (
            <button key={c.id} type="button" className="swatch" style={{ background: c.dark }} aria-pressed={a.accent === c.id} aria-label={c.name} title={c.name} onClick={() => setAppearance({ accent: c.id })} />
          ))}
          <label className={`swatch swatch-pick ${a.accent === 'custom' ? 'is-on' : ''}`} title="Any color" style={a.accent === 'custom' ? { background: a.accentHex } : undefined}>
            <input type="color" value={a.accentHex} onChange={(e) => setAppearance({ accent: 'custom', accentHex: e.target.value })} aria-label="Pick any accent color" />
            <span aria-hidden>+</span>
          </label>
        </div>
        <p className="settings-note">For links, the current page, focus, charts and the health squares. Problems keep their own amber and red in every theme.</p>
      </Section>

      <Section title="Type">
        <div className="choice-row">
          {seg('font', [
            ['theme', "Theme's own"],
            ...(Object.entries(FONTS) as [FontSet, (typeof FONTS)[FontSet]][]).map(([k, f]) => [k, f.label] as [Appearance['font'], string]),
          ])}
        </div>
      </Section>

      <Section title="Density">
        <div className="choice-row">
          {seg('density', [
            ['compact', 'Compact'],
            ['comfortable', 'Comfortable'],
            ['large', 'Large'],
          ])}
        </div>
      </Section>

      <Section title="Region">
        <div className="region-picks">
          <label>
            <span>Language</span>
            <select
              className="field"
              value={a.lang}
              onChange={(e) => {
                setAppearance({ lang: e.target.value });
                // Every word on the page changes: draw it again.
                location.reload();
              }}
            >
              <option value="">Match this browser</option>
              {LANGUAGES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Dates and numbers</span>
            <select className="field" value={a.locale} onChange={(e) => setAppearance({ locale: e.target.value })}>
              <option value="">Match this browser</option>
              {REGIONS.map(([tag, name]) => (
                <option key={tag} value={tag}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Prices in</span>
            <select className="field" value={a.currency} onChange={(e) => setAppearance({ currency: e.target.value })}>
              <option value="">The region's own ({currency()})</option>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="settings-note">
          Here: {new Date().toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, {new Date().toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit', hour12: !a.clock24 })}, {num(1234567.89, 2)}, {money(1234.5, currency(), 2)}. The time format and temperature units are under Home. Français covers the boards, the wall screens and the Monitor so far; Settings stays in English.
        </p>
      </Section>

      <Section title="Screen">
        <label className="check">
          <input type="checkbox" checked={a.eink} onChange={(e) => setAppearance({ eink: e.target.checked })} />
          E-ink
        </label>
        <p className="settings-note">For an e-ink reader or panel: black on white, no motion, problems marked by shape as well as color, and the page redrawn once a minute with whatever changed, so it doesn't flash all day. A household device can be set from Settings, Household devices, instead.</p>
      </Section>

      <Section title="Keyboard">
        <label className="check">
          <input type="checkbox" checked={a.keys} onChange={(e) => setAppearance({ keys: e.target.checked })} />
          Single-key shortcuts
        </label>
        <p className="settings-note">/ opens Jump to, ? lists the shortcuts, g then a letter goes to a page, and j and k move through Reading. Turn them off if you use speech input. Ctrl K always works.</p>
      </Section>

      <ShowcaseSettings />

      </>
      )}
      {tab === 'home' && (
      <>
      <Section title="Home header" id="home-header" className="span-all">
        <p className="settings-note">The default header shows status, server graphs, and time above weather. These controls change this device only.</p>
        <div className="header-switches">
          <label className="check"><input type="checkbox" checked={a.homeStatusSize !== 'hidden'} onChange={(e) => setAppearance({ homeStatusSize: e.target.checked ? 'medium' : 'hidden' })} />Show status</label>
          <label className="check"><input type="checkbox" checked={a.homeServer !== 'hidden'} onChange={(e) => setAppearance({ homeServer: e.target.checked ? 'card' : 'hidden' })} />Show server details</label>
          <label className="check"><input type="checkbox" checked={a.homeClockSize !== 'hidden'} onChange={(e) => setAppearance({ homeClockSize: e.target.checked ? 'small' : 'hidden' })} />Show time and date</label>
          <label className="check"><input type="checkbox" checked={a.homeWeather !== 'hidden'} onChange={(e) => setAppearance({ homeWeather: e.target.checked ? 'current' : 'hidden' })} />Show weather</label>
        </div>
        <p className="settings-note">Server details includes CPU history, memory, storage and uptime. Its Details link opens Server. With status off, the Needs attention widget appears on the board. A Weather widget on the board takes the place of header weather.</p>
        <details className="header-options-details">
          <summary>Sizes and forecast details</summary>
          <div className="header-options">
            <div><span>Status size</span>{seg('homeStatusSize', [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']], a.homeStatusSize === 'hidden')}</div>
            <div><span>Clock size</span>{seg('homeClockSize', [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']], a.homeClockSize === 'hidden')}</div>
            <div><span>Weather view</span>{seg('homeWeather', [['current', 'Current'], ['summary', 'Forecast'], ['hourly', 'Hourly chart']], a.homeWeather === 'hidden')}</div>
          </div>
        </details>
        <button type="button" className="button button-quiet" onClick={() => setAppearance({ homeStatusSize: 'medium', homeServer: 'card', homeWeather: 'current', homeClockSize: 'small' })}>Restore default header</button>
      </Section>

      <Section title="Default app appearance">
        <div className="choice-row">
          {seg('homeApps', [
            ['tiles', 'Tiles with a live number'],
            ['patchbay', 'Icons'],
          ])}
        </div>
        <p className="settings-note">
          Used when an Apps widget follows this default. <strong>Arrange board → Apps settings</strong> can give a widget its own look. Widget placement is shared across devices.
        </p>
      </Section>

      <Section title="Units and time">
        <div className="choice-row">
          {seg('clock24', [
            [false, '12-hour'],
            [true, '24-hour'],
          ])}
          {seg('temp', [
            ['f', '°F'],
            ['c', '°C'],
            ['both', 'Both'],
          ])}
        </div>
      </Section>

      </>
      )}
      {tab === 'look' && (
      <Section title="Service icons">
        <div className="choice-row">
          {seg('icons', [
            ['mono', 'Grayscale'],
            ['color', 'Full color'],
          ])}
        </div>
        <p className="settings-note">Grayscale icons get their color back when you point at them.</p>
      </Section>
      )}
      {tab === 'look' && <Portability />}
      {tab === 'connections' && (
        <>
          <div className="seg settings-tabs settings-parts span-all" role="tablist" aria-label="Connections" onKeyDown={tabKeys}>
            {PARTS.map(([v, label]) => (
              <button key={v} type="button" role="tab" tabIndex={part === v ? 0 : -1} aria-selected={part === v} onClick={() => setPart(v)}>
                {label}
              </button>
            ))}
          </div>
          {part === 'integrations' && (
            <>
              <Integrations />
              <Connections />
            </>
          )}
          {part === 'access' && (
            <>
              <SignIn />
              <Household />
              <Keys />
            </>
          )}
          {part === 'apps' && <CatalogCheck />}
          {part === 'backup' && <SetupFile />}
        </>
      )}
      {tab === 'alerts' && <Alerts />}
      {tab === 'activity' && <Activity />}
      </div>
      <AppVersion />
    </div>
  );
}

/** Patchboard's version, whether a newer image is out, and updating it from here. */
function AppVersion() {
  const { snap } = useStore();
  const now = useNow(60_000);
  const [check, setCheck] = useState<SelfCheck | undefined>();
  const [busy, setBusy] = useState(false);
  const me = snap?.self;
  if (!me) return null;
  const c = check ?? me.check;
  const newer = !!(me.container && snap.updates[me.container]);
  const ro = !!snap.readOnly;
  const status = newer
    ? 'A newer image is out.'
    : c?.state === 'current'
      ? `Up to date, checked ${agoLong(c.at, now)}.`
      : c?.state === 'unknown'
        ? `Can't check for updates. ${c.reason ?? ''}`
        : 'Not checked yet.';
  const checkNow = async () => {
    setBusy(true);
    const res = await fetch('/api/self/check', { method: 'POST', headers: { 'X-Patchboard': 'action' } }).catch(() => null);
    const body = res?.ok ? ((await res.json()) as { check?: SelfCheck }) : null;
    if (body?.check) setCheck(body.check);
    setBusy(false);
  };
  return (
    <div className="app-version">
      <span>Patchboard {me.version}</span>
      <span className={newer ? 'warn-text' : undefined}>{status}</span>
      {!ro && (
        <button type="button" className="text-button" aria-disabled={busy || undefined} onClick={() => !busy && void checkNow()}>
          {busy ? 'Checking...' : 'Check now'}
        </button>
      )}
      {/* Update shows when there is one, or when Patchboard can't tell; never beside "Up to date". */}
      {!ro && me.container && snap.features?.includes('updates') && (newer || c?.state !== 'current') && <SelfUpdate name={me.container} waiting={newer} />}
      <span className="app-help">
        Help:{' '}
        <a href={HELP.tour} target="_blank" rel="noreferrer">
          tour
        </a>
        ,{' '}
        <a href={HELP.integrations} target="_blank" rel="noreferrer">
          integrations
        </a>
        ,{' '}
        <a href={HELP.configuration} target="_blank" rel="noreferrer">
          configuration
        </a>
      </span>
    </div>
  );
}

function ThemeCard({ id, name, note, active }: { id: string; name: string; note: string; active: boolean }) {
  const a = useAppearance();
  const light = a.scheme === 'light' || (a.scheme === 'auto' && matchMedia('(prefers-color-scheme: light)').matches);
  const t = tokensFor({ ...a, theme: id, accent: 'default' }, id !== 'custom' && light ? 'light' : 'dark');
  return (
    <button type="button" className="theme-card" aria-pressed={active} onClick={() => setAppearance({ theme: id })}>
      {/* A miniature of the theme: a title bar, two tiles, a health strip. */}
      <span className="theme-mini" style={{ background: t.bg, borderColor: t.line }} aria-hidden>
        <i style={{ background: t.head, width: '38%' }} />
        <span className="theme-mini-row">
          <b style={{ background: t.raised, borderColor: t.lineSoft }}>
            <i style={{ background: t.ink2 }} />
          </b>
          <b style={{ background: t.raised, borderColor: t.lineSoft }}>
            <i style={{ background: t.ink3 }} />
          </b>
        </span>
        <span className="theme-mini-sq">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
            <u key={n} style={{ background: n === 5 ? t.crit : t.accent }} />
          ))}
        </span>
      </span>
      <strong>{name}</strong>
      <span>{note}</span>
    </button>
  );
}

function CustomBuilder() {
  const a = useAppearance();
  const t = tokensFor({ ...a, theme: 'custom', accent: 'default' }, 'dark');
  const ratio = contrast(t.ink3, t.bg);
  const pick = (key: 'bg' | 'ink' | 'accent', label: string) => (
    <label className="color-field" style={{ ['--swatch' as string]: a.custom[key] }}>
      <input type="color" value={a.custom[key]} onChange={(e) => setAppearance({ theme: 'custom', custom: { ...a.custom, [key]: e.target.value } })} />
      <span>{label}</span>
      <code>{a.custom[key]}</code>
    </label>
  );
  return (
    <div className="custom-builder">
      {pick('bg', 'Background')}
      {pick('ink', 'Text')}
      {pick('accent', 'Accent')}
      <p className={`settings-note ${ratio < 4.5 ? 'warn-text' : ''}`}>
        Quiet text contrast {ratio.toFixed(1)}:1
        {ratio < 4.5 ? '. Below 4.5:1, small labels get hard to read; move the text and background further apart.' : ', readable.'}
      </p>
    </div>
  );
}

/** Copy settings to another device, or start over. */
function Portability() {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  return (
    <Section title="Carry these settings">
      <div className="choice-row">
        <button
          type="button"
          className="button button-quiet"
          onClick={async () => {
            await navigator.clipboard.writeText(exportAppearance());
            setMsg('Copied. Paste it into Settings on the other device.');
          }}
        >
          Copy settings
        </button>
        <button
          type="button"
          className="button button-quiet"
          onClick={() => {
            resetAppearance();
            setMsg('Back to the defaults.');
          }}
        >
          Reset to defaults
        </button>
      </div>
      <div className="import-row">
        <input className="field" placeholder="Paste settings from another device" value={text} onChange={(e) => setText(e.target.value)} />
        <button
          type="button"
          className="button button-quiet"
          disabled={!text.trim()}
          onClick={() => {
            const ok = importAppearance(text);
            setMsg(ok ? 'Applied.' : "That isn't a Patchboard settings string. Use Copy settings on the other device.");
            if (ok) setText('');
          }}
        >
          Apply
        </button>
      </div>
      {msg && <p className="settings-note">{msg}</p>}
    </Section>
  );
}

interface TraktStatus {
  configured: boolean;
  canConnect: boolean;
  connected: boolean;
  user?: string;
  expiresAt?: number;
  pending?: { userCode: string; verifyUrl: string; expiresAt: number };
  error?: string;
}

const ACTION = { 'X-Patchboard': 'action' };

/** Trakt sign-in: shows the code to type at trakt.tv/activate and waits. */
function Connections() {
  const readOnly = !!useStore().snap?.readOnly;
  const [s, setS] = useState<TraktStatus | null>(null);
  const [err, setErr] = useState('');
  const load = async () => setS((await (await fetch('/api/trakt')).json()) as TraktStatus);

  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!s?.pending) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [s?.pending?.userCode]);

  const connect = async () => {
    setErr('');
    const res = await fetch('/api/trakt/connect', { method: 'POST', headers: ACTION });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) setErr(body.error ?? "Couldn't start the Trakt sign-in. Try again.");
    await load();
  };
  const disconnect = async () => {
    await fetch('/api/trakt/disconnect', { method: 'POST', headers: ACTION });
    await load();
  };

  if (!s) return null;
  return (
    <Section title="Signed-in accounts">
      <dl className="ledger">
        <div className="ledger-row">
          <dt>Trakt</dt>
          <dd>
            {!s.configured ? (
              <span className="ledger-aside">
                Patchboard can't see TRAKT_CLIENT_ID. Add it to the environment, then recreate the container (a restart doesn't reload it).
              </span>
            ) : s.pending ? (
              <span className="trakt-code">
                Go to{' '}
                <a href={s.pending.verifyUrl} target="_blank" rel="noreferrer">
                  {s.pending.verifyUrl.replace(/^https?:\/\//, '')}
                </a>{' '}
                and enter <code className="big-code">{s.pending.userCode}</code>
                <span className="ledger-aside">Waiting. The code works for {Math.max(0, Math.round((s.pending.expiresAt - Date.now()) / 60_000))} more minutes.</span>
              </span>
            ) : s.connected ? (
              <>
                <span>Connected{s.user ? <> as <span className="mono">{s.user}</span></> : ''}</span>
                {s.expiresAt && <span className="ledger-aside">renews on its own, next by {new Date(s.expiresAt).toLocaleDateString(locale())}</span>}
                {s.canConnect && !readOnly && (
                  <button type="button" className="text-button" onClick={() => void disconnect()}>
                    Disconnect
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="ledger-aside">Not connected.</span>
                {s.canConnect && !readOnly && (
                  <button type="button" className="button button-quiet" onClick={() => void connect()}>
                    Connect Trakt
                  </button>
                )}
              </>
            )}
            {(err || s.error) && <span className="ledger-note">{err || s.error}</span>}
          </dd>
        </div>
      </dl>
    </Section>
  );
}

/** Catalog vs. Docker: entries pointing at nothing, and apps not listed yet. */
function CatalogCheck() {
  const [copied, setCopied] = useState(false);
  const readOnly = !!useStore().snap?.readOnly;
  const [adoptState, setAdoptState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [adoptErr, setAdoptErr] = useState('');
  // First run links here with ?import=homepage to open the import straight away.
  const { search } = useLocation();
  const [importing, setImporting] = useState(() => new URLSearchParams(search).get('import') === 'homepage');
  const adoptYaml = async () => {
    setAdoptState('busy');
    setAdoptErr('');
    try {
      const res = await fetch('/api/catalog/adopt', { method: 'POST', headers: { 'x-patchboard': 'action' } });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setAdoptState('done');
    } catch (e) {
      // Inline, as every other refusal is.
      setAdoptErr((e as Error).message);
      setAdoptState('idle');
    }
  };
  const [audit, setAudit] = useState<CatalogAudit | null>(null);
  useEffect(() => {
    void (async () => setAudit(await (await fetch('/api/catalog/audit')).json()))();
  }, []);
  if (!audit) return null;
  const clean = !audit.missing.length && !audit.discovered.length;
  return (
    <section className="section span-all" id="catalog">
      <header className="section-head">
        <h2>Catalog</h2>
        <span className="section-count">{(audit.yamlApps ?? 0) > 0 ? 'config/services.yaml' : 'apps saved in Patchboard'}</span>
      </header>
      <p className="settings-note">
        Keep your catalog in git? <a href="/api/catalog/yaml" download>Download services.yaml</a> writes the apps as you arranged them here, with groups,
        order, icons and apps you added. Hidden apps and live numbers stay in Patchboard.
      </p>
      {(audit.yamlApps ?? 0) > 0 && !readOnly && (
        <div className="adopt">
          <p>
            <strong>
              services.yaml lists {audit.yamlApps} {audit.yamlApps === 1 ? 'app' : 'apps'}
              {audit.yamlLinks ? ` and ${audit.yamlLinks} ${audit.yamlLinks === 1 ? 'link' : 'links'}` : ''}.
            </strong>{' '}
            Copy them into Patchboard, with their groups, order, icons and checks, and you no longer need the file. Patchboard never edits the file;
            delete it yourself afterward.
          </p>
          <button type="button" className="button" disabled={adoptState === 'busy'} onClick={() => void adoptYaml()}>
            {adoptState === 'busy' ? 'Copying...' : adoptState === 'done' ? 'Copied. Safe to delete services.yaml' : 'Copy into Patchboard'}
          </button>
          {adoptErr && <p className="crit-text" role="alert">{adoptErr}</p>}
        </div>
      )}
      {!readOnly && (
        <div className="adopt">
          <p>
            <strong>Coming from Homepage?</strong> Paste its services.yaml and bookmarks.yaml, and the apps, groups, icons and links come over beside what you
            already have.
          </p>
          <button type="button" className="button button-quiet" onClick={() => setImporting(true)}>
            Import from Homepage
          </button>
        </div>
      )}
      {importing && <HomepageImport onClose={() => setImporting(false)} />}
      {clean && <p className="settings-note">Every catalog entry matches a container, and every running app is listed.</p>}
      {audit.missing.length > 0 && (
        <dl className="ledger">
          {audit.missing.map((m) => (
            <div className="ledger-row" key={m.service}>
              <dt>{m.service}</dt>
              <dd>
                <span className="warn-text">
                  No container named <span className="mono">{m.container}</span>
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {audit.discovered.length > 0 && (
        <>
          <p className="settings-note">
            {audit.discovered.length} running {audit.discovered.length === 1 ? "app isn't" : "apps aren't"} listed. Add {audit.discovered.length === 1 ? 'it' : 'them'} in
            one click from <Link to="/apps?arrange=1">Apps, Edit apps</Link>, or paste these entries under a group's <code>services:</code> in services.yaml.
          </p>
          <div className="rb-body">
            <pre>
              <code>{audit.yaml}</code>
              <button
                type="button"
                className="copy"
                onClick={async () => {
                  await navigator.clipboard.writeText(audit.yaml ?? '');
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </pre>
          </div>
        </>
      )}
    </section>
  );
}

interface AuditRow {
  id: number;
  at: number;
  who: string;
  action: string;
  target: string;
  detail?: string;
}

const ACTION_TEXT: Record<string, string> = {
  'container.restart': 'restarted',
  'container.stop': 'stopped',
  'container.start': 'started',
  'container.update': 'updated',
  'container.rollback': 'rolled back an update',
  'board.save': 'saved the Home board',
  'board.reset': 'reset the Home board',
  'apps.order': 'rearranged the apps',
  'apps.order.reset': 'put the apps back in catalog order',
  'secret.set': 'saved the key',
  'secret.delete': 'removed the key',
  'icon.upload': 'uploaded an icon',
  'pages.save': 'customized a page',
  'setup.import': 'imported a setup file',
  'update.dismiss': 'dismissed an image update mark for',
  'trakt.connect': 'started a Trakt sign-in',
  'trakt.disconnect': 'disconnected Trakt',
  'auth.signin': 'signed in',
  'household.add': 'made a household link',
  'household.remove': 'removed a household device',
  'household.join': 'opened its household link',
  'household.view': 'changed what a household device shows',
  'auth.failed': 'failed to sign in',
  'auth.hosts': 'changed the addresses Patchboard answers on',
  'auth.off': 'turned sign-in off',
  'board.add': 'added a board',
  'brand.save': 'renamed the dashboard',
  'setup.save': 'saved the settings for',
  'setup.remove': 'removed the integration',
  'setup.test': 'tested the connection to',
  'setup.thresholds': 'changed the alert thresholds',
  'wake': 'woke',
  'downloads.pause': 'paused every download in',
  'downloads.resume': 'resumed every download in',
  'downloads.altspeed': 'switched alternative speed limits in',
  'downloads.item.pause': 'paused',
  'downloads.item.resume': 'resumed',
  'downloads.item.remove': 'removed the download',
  'arr.search': 'searched again for',
  'arr.retry': 'tried another release for',
  'arr.remove': 'removed from the queue',
  'requests.approve': 'approved',
  'requests.decline': 'declined',
  'ha.toggle': 'switched',
  'ha.run': 'ran',
  'proxmox.start': 'started',
  'proxmox.shutdown': 'shut down',
  'proxmox.reboot': 'rebooted',
};

/** What an action was done to, in words: a title or name over an id. */
function auditSubject(r: AuditRow): string | undefined {
  if (r.action.startsWith('auth.')) return undefined;
  if (r.action.startsWith('requests.')) return r.detail || `request ${r.target}`;
  if (r.action.startsWith('setup.') && r.action !== 'setup.thresholds' && r.action !== 'setup.import') return INTEGRATIONS.find((i) => i.id === r.target)?.name ?? r.target;
  return r.detail && (r.action.startsWith('downloads.item.') || r.action.startsWith('arr.')) ? r.detail : r.target;
}

/** Who changed what, newest first: every action, update, board edit and sign-in. */
function Activity() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  useEffect(() => {
    void (async () => setRows(await (await fetch('/api/audit')).json()))();
  }, []);
  return (
    <Section title="Activity" count={rows ? `${rows.length} recent` : undefined} className="span-all">
      {!rows?.length ? (
        <p className="settings-note">Nothing yet. Container actions, updates, board changes and sign-ins show up here, with who did each.</p>
      ) : (
        <ul className="audit">
          {rows.slice(0, 60).map((r) => (
            <li key={r.id}>
              <span className="mono audit-who">{r.who}</span>
              <span>
                {ACTION_TEXT[r.action] ?? r.action.replace(/[._]/g, ' ')}
                {auditSubject(r) && !['board.save', 'board.reset', 'apps.order', 'apps.order.reset', 'icon.upload', 'pages.save', 'brand.save', 'trakt.connect', 'trakt.disconnect', 'setup.import', 'setup.thresholds'].includes(r.action) && (
                  <>
                    {' '}
                    <span className={r.action.startsWith('container.') || r.action.startsWith('secret.') || r.action === 'update.dismiss' ? 'ident' : undefined}>{auditSubject(r)}</span>
                  </>
                )}
                {r.detail && r.action.startsWith('auth.') ? <span className="ledger-aside"> from {r.detail}</span> : null}
              </span>
              <time>{agoLong(r.at)}</time>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/**
 * Keys pasted for live numbers and API numbers widgets. Names and dates only:
 * the server never sends a value back, so this list is safe to show.
 */
function Keys() {
  const readOnly = !!useStore().snap?.readOnly;
  const [list, setList] = useState<{ name: string; at: number }[] | null>(null);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [err, setErr] = useState('');
  const load = async () => setList((await (await fetch('/api/secrets')).json()) as { name: string; at: number }[]);
  useEffect(() => {
    void load();
  }, []);
  const add = async () => {
    setErr('');
    const n = name.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
    const res = await fetch(`/api/secrets/${n}`, { method: 'PUT', headers: ACTION, body: JSON.stringify({ value }) });
    if (!res.ok) return setErr(((await res.json()) as { error?: string }).error ?? `HTTP ${res.status}`);
    setName('');
    setValue('');
    await load();
  };
  const remove = async (n: string) => {
    await fetch(`/api/secrets/${n}`, { method: 'DELETE', headers: ACTION });
    await load();
  };
  if (!list) return null;
  return (
    <Section title="Keys" count={list.length ? String(list.length) : undefined}>
      <p className="settings-note">
        Keys you pasted for live numbers. Patchboard keeps them on the server and never shows them again. An API numbers widget can use one as{' '}
        <code>{'${secret:NAME}'}</code>.
      </p>
      {list.length > 0 && (
        <ul className="audit keys">
          {list.map((k) => (
            <li key={k.name}>
              <span className="mono">{k.name}</span>
              <time>{agoLong(k.at)}</time>
              {!readOnly && (
                <HoldButton className="text-button" danger hint="Hold to remove. Anything using it stops working." onConfirm={() => void remove(k.name)}>
                  Remove
                </HoldButton>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <div className="key-add">
          <input className="field mono" value={name} placeholder="NAME" aria-label="Key name" onChange={(e) => setName(e.target.value)} />
          <input className="field mono" type="password" autoComplete="off" value={value} placeholder="Paste the key" aria-label="Key" onChange={(e) => setValue(e.target.value)} />
          <button type="button" className="button button-quiet" disabled={!name.trim() || !value.trim()} onClick={() => void add()}>
            Save key
          </button>
          {err && <span className="crit-text" role="alert">{err}</span>}
        </div>
      )}
    </Section>
  );
}

/**
 * Household devices: a link per family phone or wall tablet. The device sees
 * the boards, cameras, reading and calendar and can switch pinned lights and
 * scenes; the server refuses everything else from it.
 */
function Household() {
  const { snap } = useStore();
  const readOnly = !!snap?.readOnly;
  // Where a device can open: Home, the other boards, and the pages a household device may see.
  const places: [string, string][] = [
    ['', 'Wherever it is'],
    ['/', 'Home'],
    ...(snap?.boards ?? []).filter((b) => b.id !== 'home').map((b) => [`/b/${b.id}`, b.name] as [string, string]),
    ['/monitor', 'Monitor'],
    ['/server', 'Server'],
    ['/upcoming', 'Upcoming'],
    ['/reading', 'Reading'],
    ['/weather', 'Weather'],
  ];
  // Saved at once; the device follows within a second.
  const setView = async (id: string, view: { opens?: string; pages?: string[]; rotate?: number; tint?: string; dim?: string; screen?: string }) => {
    const res = await fetch(`/api/household/${id}`, { method: 'PUT', headers: { ...ACTION, 'Content-Type': 'application/json' }, body: JSON.stringify(view) });
    if (!res.ok) return;
    // The server's answer is the whole view: a field it leaves out is unset.
    const saved = (await res.json()) as DeviceView;
    setList((l) => l && l.map((d) => (d.id === id ? { id: d.id, name: d.name, created: d.created, seen: d.seen, ...saved } : d)));
  };
  const placeName = (path: string) => places.find(([v]) => v === path)?.[1] ?? path;
  const [list, setList] = useState<Listed[] | null>(null);
  const [auth, setAuth] = useState<string>('none');
  const [name, setName] = useState('');
  const [made, setMade] = useState<{ name: string; url: string; panel: string } | null>(null);
  // A panel address just made for an existing device, shown once.
  const [panelFor, setPanelFor] = useState<{ id: string; url: string } | null>(null);
  const newPanel = async (id: string) => {
    const res = await fetch(`/api/household/${id}/panel`, { method: 'POST', headers: ACTION });
    const body = (await res.json()) as { panel?: string };
    if (res.ok && body.panel) setPanelFor({ id, url: `${location.origin}${body.panel}` });
  };
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');
  const load = async () => setList((await (await fetch('/api/household')).json()) as Listed[]);
  useEffect(() => {
    void load();
    void fetch('/api/session')
      .then((r) => r.json())
      .then((s: { auth?: string }) => setAuth(s.auth ?? 'none'));
  }, []);
  const add = async () => {
    setErr('');
    setCopied(false);
    const res = await fetch('/api/household', { method: 'POST', headers: { ...ACTION, 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const body = (await res.json()) as { path?: string; panel?: string; error?: string };
    if (!res.ok || !body.path) return setErr(body.error ?? `HTTP ${res.status}`);
    setMade({ name: name.trim(), url: `${location.origin}${body.path}`, panel: `${location.origin}${body.panel}` });
    setName('');
    await load();
  };
  const remove = async (id: string) => {
    await fetch(`/api/household/${id}`, { method: 'DELETE', headers: ACTION });
    setMade(null);
    await load();
  };
  const copy = async () => {
    // Browsers allow the clipboard only on https or localhost; elsewhere the field is selected to copy by hand.
    try {
      await navigator.clipboard.writeText(made!.url);
      setCopied(true);
    } catch {
      document.querySelector<HTMLInputElement>('.household-url')?.select();
    }
  };
  if (!list) return null;
  return (
    <Section title="Household devices" count={list.length ? String(list.length) : undefined}>
      <p className="settings-note">
        A link for a family phone or a wall tablet. Open it once on that device: it sees the boards, cameras, Server and Monitor, reading and calendar, and switches the lights
        and scenes pinned to a board. It can't update, restart or stop anything, or open Settings, logs or container pages. Give a wall tablet more pages and a swipe moves
        between them, or let it turn them by itself.
      </p>
      {made && (
        <div className="household-made" role="status">
          <p>
            Open this link on <strong>{made.name}</strong>. Patchboard shows it only now, and anyone with it gets the same view.
          </p>
          <div className="key-add household-add">
            <input className="field mono household-url" readOnly value={made.url} aria-label={`Household link for ${made.name}`} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="button button-quiet" onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <p className="settings-note">
            For an e-paper panel with no browser (TRMNL, Inky, an ESP32), point it at this picture instead. Add <code>?w=</code> and <code>?h=</code> for its size,
            or use <code>.bmp</code> in place of <code>.png</code>:
          </p>
          <input className="field mono household-url" readOnly value={made.panel} aria-label={`Panel picture for ${made.name}`} onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
      {list.length > 0 && (
        <ul className="audit keys household-list">
          {list.map((d) => (
            <li key={d.id}>
              <span>{d.name}</span>
              <time>{d.seen ? `used ${agoLong(d.seen)}` : 'not opened yet'}</time>
              {!readOnly && (
                <HoldButton className="text-button" danger hint="Hold to remove. The device stops working as a household device." onConfirm={() => void remove(d.id)}>
                  Remove
                </HoldButton>
              )}
              {!readOnly && (
                <button type="button" className="text-button household-panel" title="An address for an e-paper panel with no browser. It shows the picture and nothing else, and a new one retires the last." onClick={() => void newPanel(d.id)}>
                  New panel address
                </button>
              )}
              {panelFor?.id === d.id && (
                <input className="field mono household-url household-panel-url" readOnly value={panelFor.url} aria-label={`Panel picture for ${d.name}`} autoFocus onFocus={(e) => e.currentTarget.select()} />
              )}
              {!readOnly && (
                <div className="household-view">
                  <label>
                    <span>Opens</span>
                    <select className="field" value={d.opens ?? ''} onChange={(e) => void setView(d.id, { opens: e.target.value })}>
                      {places.map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {d.opens && (
                    <div className="household-pages">
                      <span>Swipes to</span>
                      {(d.pages ?? []).map((pg) => (
                        <button
                          key={pg}
                          type="button"
                          className="chip"
                          aria-label={`Remove ${placeName(pg)}`}
                          onClick={() => void setView(d.id, { pages: (d.pages ?? []).filter((x) => x !== pg) })}
                        >
                          {placeName(pg)} <span aria-hidden="true">×</span>
                        </button>
                      ))}
                      {(d.pages?.length ?? 0) < MAX_PAGES - 1 && (
                        <select className="field" aria-label="Add a page" value="" onChange={(e) => e.target.value && void setView(d.id, { pages: [...(d.pages ?? []), e.target.value] })}>
                          <option value="">{d.pages?.length ? 'Add another' : 'Add a page'}</option>
                          {places
                            .filter(([v]) => v && v !== d.opens && !d.pages?.includes(v))
                            .map(([v, label]) => (
                              <option key={v} value={v}>
                                {label}
                              </option>
                            ))}
                        </select>
                      )}
                    </div>
                  )}
                  {!!d.pages?.length && (
                    <label>
                      <span>Turns pages</span>
                      <select className="field" value={d.rotate ?? 0} onChange={(e) => void setView(d.id, { rotate: Number(e.target.value) })}>
                        {ROTATE_SECONDS.map((s) => (
                          <option key={s} value={s}>
                            {s === 0 ? 'When swiped' : s < 60 ? `Every ${s} seconds` : s === 60 ? 'Every minute' : `Every ${s / 60} minutes`}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    <span>Monitor</span>
                    <select className="field" value={d.tint ?? 'gray'} onChange={(e) => void setView(d.id, { tint: e.target.value })}>
                      <option value="gray">Gray</option>
                      <option value="blue">Blue</option>
                      <option value="color">Color</option>
                    </select>
                  </label>
                  <label>
                    <span>Screen</span>
                    <select className="field" value={d.screen ?? ''} onChange={(e) => void setView(d.id, { screen: e.target.value })}>
                      <option value="">Color</option>
                      <option value="eink">E-ink</option>
                    </select>
                  </label>
                  <label>
                    <span>Dims</span>
                    <select className="field" value={d.dim ?? ''} onChange={(e) => void setView(d.id, { dim: e.target.value })}>
                      <option value="">Never</option>
                      {DIM_HOURS.map((h) => (
                        <option key={h} value={h}>
                          {dimLabel(h)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <div className="key-add household-add">
          <input
            className="field"
            value={name}
            maxLength={40}
            placeholder="Kitchen tablet"
            aria-label="Device name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && void add()}
          />
          <button type="button" className="button button-quiet" disabled={!name.trim()} onClick={() => void add()}>
            Make a link
          </button>
          {err && (
            <span className="crit-text" role="alert">
              {err}
            </span>
          )}
        </div>
      )}
      {auth === 'none' && list.length > 0 && (
        <p className="settings-note">With sign-in off, a device you remove goes back to full access, like any browser on your network. Turn on a password above if that matters.</p>
      )}
    </Section>
  );
}

/**
 * Every built-in integration: what's on (and whether it's answering), then
 * what you could turn on and exactly how. The list lives in
 * shared/integrations.ts, the same one docs/INTEGRATIONS.md is built from.
 */
function Integrations() {
  const { snap } = useStore();
  const [setup, setSetup] = useState<{ integrations: SetupIntegration[]; demo: boolean } | null>(null);
  const [adopting, setAdopting] = useState(false);
  // Every hook before the early return below: React needs the same hooks on every render.
  const [moveErr, setMoveErr] = useState('');
  const [find, setFind] = useState('');
  const [show, setShow] = useState<'all' | 'on' | 'off'>('all');
  // A link from elsewhere (an empty page, a storage note) opens one integration.
  const wanted = new URLSearchParams(useLocation().search).get('setup');
  const [open, setOpen] = useState<string | null>(wanted);
  const [results, setResults] = useState<Record<string, { ok: boolean; text: string } | null>>({});
  useEffect(() => {
    fetch('/api/setup/integrations')
      .then((r) => r.json())
      .then((b) => setSetup(b as { integrations: SetupIntegration[]; demo: boolean }))
      .catch(() => setSetup({ integrations: [], demo: false }));
  }, []);
  useEffect(() => {
    if (setup && wanted) land(`int-${wanted}`);
  }, [!!setup]);
  if (!snap) return null;
  const status = (i: Integration): { on: boolean; text: string; tone: 'ok' | 'warn' | 'off'; why?: string } => {
    if (i.id === 'updates' && snap.features?.includes('no-docker-cli'))
      return { on: false, text: 'Off', tone: 'off', why: 'This is the slim image, which has no Docker CLI. Use the full image to update containers from here.' };
    // Hardcover and Goodreads fill one Books widget; with both saved, Hardcover is the one used.
    if (i.id === 'goodreads' && snap.features?.includes('hardcover') && setupOf('goodreads')?.fromUi)
      return { on: false, text: 'Saved, Hardcover is in use', tone: 'off' };
    if (!i.source) return snap.features?.includes(i.id) ? { on: true, text: 'On', tone: 'ok' } : { on: false, text: 'Off', tone: 'off' };
    const s = snap.sources[i.id as keyof typeof snap.sources];
    if (!s) return { on: false, text: 'Off', tone: 'off' };
    if (!s.ok) return { on: true, text: s.error ? `Can't reach it: ${s.error}` : s.updatedAt ? "Can't reach it" : 'Connecting', tone: s.error ? 'warn' : 'off' };
    return { on: true, text: s.updatedAt ? `On, updated ${agoLong(s.updatedAt)}` : 'On', tone: 'ok' };
  };
  const setupOf = (id: string) => setup?.integrations.find((x) => x.id === id);
  const rows = INTEGRATIONS.map((i) => ({ i, st: status(i) }));
  const on = rows.filter((r) => r.st.on);
  const off = rows.filter((r) => !r.st.on);
  const row = ({ i, st }: { i: Integration; st: ReturnType<typeof status> }) => {
    const su = setupOf(i.id);
    const locked = su ? su.fields.every((f) => f.locked) : false;
    return (
      <li
        key={i.id}
        id={`int-${i.id}`}
        className={`integration tone-${st.tone} ${open === i.id ? 'is-open' : ''} ${st.why ? 'has-why' : ''}`}
        onKeyDown={(e) => {
          // Escape closes an open setup panel, as it closes every other panel.
          if (e.key === 'Escape' && open === i.id) {
            e.stopPropagation();
            setOpen(null);
            setResults((prev) => ({ ...prev, [i.id]: null }));
            document.querySelector<HTMLButtonElement>(`#int-${i.id} .integration-end .text-button`)?.focus();
          }
        }}
      >
        <span className="integration-name">{i.name}</span>
        <span className="integration-adds">
          {i.adds}
          {st.why ? <small>{st.why}</small> : !su && !st.on && i.where && <small>{i.where}</small>}
        </span>
        <span className="integration-end">
          <span className={`integration-status tone-${st.tone}`}>
            {st.text}
            {su?.fromUi && <small> Set up here</small>}
            {locked && st.on && <small> From the environment</small>}
          </span>
          {su ? (
            <button type="button" className="text-button" aria-expanded={open === i.id} aria-label={`${st.on ? 'Settings for' : 'Set up'} ${i.name}`} onClick={() => setOpen(open === i.id ? null : i.id)}>
              {/* The form below has Cancel; this stays its name and only shows it's open. */}
              {st.on ? 'Settings' : 'Set up'}
            </button>
          ) : (
            st.on && <span className="integration-slot" aria-hidden />
          )}
          {!su && !st.on && !st.why && (
            <span className="integration-env">
              {[...i.env, ...(i.optional ?? []).map((v) => `${v} (optional)`)].map((v) => (
                <code key={v}>{v}</code>
              ))}
            </span>
          )}
        </span>
        {open === i.id && su && setup && (
          <div className="integration-form">
            <IntegrationForm
              integration={i}
              setup={su}
              demo={setup.demo}
              readOnly={!!snap.readOnly}
              onSaved={(all) => setSetup({ ...setup, integrations: all })}
              // Closing clears its message with its typed values, and focus goes back to the row's link, as Escape does.
              onClose={() => {
                setOpen(null);
                setResults((prev) => ({ ...prev, [i.id]: null }));
                requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`#int-${i.id} .integration-end .text-button`)?.focus());
              }}
              result={results[i.id] ?? null}
              setResult={(r) => setResults((prev) => ({ ...prev, [i.id]: r }))}
            />
          </div>
        )}
      </li>
    );
  };
  // Values still living only in the environment: offer to move them in.
  const envOnly = setup?.integrations.flatMap((x) => x.fields.filter((f) => f.locked && !f.savedToo)) ?? [];
  const movedIn = setup?.integrations.flatMap((x) => x.fields.filter((f) => f.savedToo).map((f) => f.name)) ?? [];
  const adopt = async () => {
    setAdopting(true);
    setMoveErr('');
    try {
      const res = await fetch('/api/setup/adopt-env', { method: 'POST', headers: { 'x-patchboard': 'action' } });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setSetup({ ...setup!, integrations: body.integrations });
    } catch (e) {
      setMoveErr((e as Error).message);
    } finally {
      setAdopting(false);
    }
  };
  return (
    <Section title="Integrations" count={`${on.length} of ${rows.length} on`} className="span-all" id="integrations">
      <p className="settings-note">
        Press Set up, paste the address and key, test and save. Keys are encrypted on this server and never sent back to a browser, not even
        this one. Keeping config in git? A variable in your environment file works too, wins over this page, and shows here as locked.
      </p>
      {!setup?.demo && !snap.readOnly && envOnly.length > 0 && (
        <div className="adopt">
          <p>
            <strong>{envOnly.length} settings come from your .env.</strong> Save them in Patchboard, encrypted, and you can remove those lines. Nothing
            changes until you do; the .env keeps winning while it has them.
          </p>
          <button type="button" className="button" disabled={adopting} onClick={() => void adopt()}>
            {adopting ? 'Saving...' : 'Save them in Patchboard'}
          </button>
          {moveErr && <p className="crit-text" role="alert">{moveErr}</p>}
        </div>
      )}
      {movedIn.length > 0 && (
        <p className="settings-note adopt-done">
          Saved here too, so these can come out of your .env: <span className="mono">{movedIn.join(', ')}</span>. Then recreate Patchboard with{' '}
          <code>docker compose up -d</code>: a restart keeps the old environment.
        </p>
      )}
      <div className="int-tools">
        <input className="field" type="search" value={find} placeholder="Find an integration" aria-label="Find an integration" onChange={(e) => setFind(e.target.value)} />
        <span className="seg" role="group" aria-label="Show">
          {(
            [
              ['all', `All ${rows.length}`],
              ['on', `On ${on.length}`],
              ['off', `Not set up ${off.length}`],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)}>
              {label}
            </button>
          ))}
        </span>
      </div>
      {/* Categories in a set order, A to Z inside, in two columns that stand on
          their own: opening a form grows only its column, so nothing beside it moves. */}
      {(() => {
        const q = find.trim().toLowerCase();
        const cats = CATEGORIES.map(([cat, ids]) => ({
          cat,
          list: rows
            .filter((r) => ids.includes(r.i.id))
            // An open form stays put whatever the filter; search also knows the variable names (SONARR_KEY).
            .filter((r) => (show === 'on' ? r.st.on : show === 'off' ? !r.st.on : true) || open === r.i.id)
            .filter((r) => !q || `${r.i.name} ${r.i.adds} ${[...r.i.env, ...(r.i.optional ?? [])].join(' ')}`.toLowerCase().includes(q) || open === r.i.id)
            .sort((a, b) => a.i.name.localeCompare(b.i.name)),
        })).filter((c) => c.list.length);
        // Balance by rows: each category goes to the shorter column, in order.
        const cols: (typeof cats)[] = [[], []];
        const size = [0, 0];
        for (const c of cats) {
          const k = size[0] <= size[1] ? 0 : 1;
          cols[k].push(c);
          size[k] += c.list.length + 1;
        }
        return (
          <div className="int-cols">
            {cols.map((col, k) => (
              <ul className="integrations" key={k}>
                {col.flatMap(({ cat, list }) => [
                  <li key={`cat-${cat}`} className="integrations-divider">
                    <h3 className="jw-sub">
                      {cat} <span className="int-cat-count">{list.filter((r) => r.st.on).length} on</span>
                    </h3>
                  </li>,
                  ...list.map(row),
                ])}
              </ul>
            ))}
          </div>
        );
      })()}
      {find.trim() && !rows.some((r) => `${r.i.name} ${r.i.adds}`.toLowerCase().includes(find.trim().toLowerCase())) && (
        <p className="settings-note">Nothing called that. App numbers on tiles work for any app with a JSON API: Apps, Edit apps.</p>
      )}
      <p className="settings-note">
        More on each: <a href="https://github.com/sourpatchdad/patchboard/blob/main/docs/INTEGRATIONS.md" target="_blank" rel="noreferrer">docs/INTEGRATIONS.md</a>.
      </p>
    </Section>
  );
}

/**
 * The whole setup as a file: the board, apps (groups, hidden, icons, live
 * numbers) and what each page shows. For a backup, a move to a new server,
 * or sharing a layout. Keys aren't in it.
 */
function SetupFile() {
  const fileInput = useRef<HTMLInputElement>(null);
  const readOnly = !!useStore().snap?.readOnly;
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  /** A file read and waiting for the hold that replaces everything with it. */
  const [pending, setPending] = useState<{ name: string; body: unknown } | null>(null);
  const load = async (f: File) => {
    setMsg('');
    setErr('');
    try {
      setPending({ name: f.name, body: JSON.parse(await f.text()) });
    } catch {
      setErr("That file isn't JSON. Pick one saved with Download setup.");
    }
  };
  const replace = async () => {
    if (!pending) return;
    const res = await fetch('/api/setup', { method: 'PUT', headers: ACTION, body: JSON.stringify(pending.body) });
    setPending(null);
    if (!res.ok) return setErr(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
    setMsg('Replaced. Every open tab shows the new boards.');
  };
  return (
    <Section title="Setup file">
      <p className="settings-note">
        Your boards, apps, page settings, notes, alert thresholds and name in one file, for a backup or a new server. Integration settings, keys and uploaded icons stay on this server; add them again after a move.
      </p>
      <div className="choice-row">
        <a className="button button-quiet" href="/api/setup" download>
          Download setup
        </a>
        {!readOnly && (
          <>
            <button type="button" className="button button-quiet" onClick={() => fileInput.current?.click()}>Import a setup file</button>
            <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => {
              const f = e.target.files?.[0];
              // Cleared, so choosing the same file again after Cancel still counts.
              e.target.value = '';
              if (f) void load(f);
            }}
            />
          </>
        )}
      </div>
      {pending && (
        <div className="choice-row">
          <span>
            Replace your boards, apps, page settings, notes and thresholds with <span className="mono">{pending.name}</span>?
          </span>
          <HoldButton danger hint="Hold to replace" onConfirm={() => void replace()}>
            Replace
          </HoldButton>
          <button type="button" className="text-button" onClick={() => setPending(null)}>
            Cancel
          </button>
        </div>
      )}
      {msg && <p className="settings-note">{msg}</p>}
      {err && <p className="crit-text" role="alert">{err}</p>}
    </Section>
  );
}

/** Settings, Alerts: thresholds with sensible defaults, one form, saved together. */
function Alerts() {
  const readOnly = !!useStore().snap?.readOnly;
  const { temp: unit } = useAppearance();
  const [state, setState] = useState<ThresholdState[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const take = (list: ThresholdState[]) => {
    setState(list);
    setValues(Object.fromEntries(list.map((t) => [t.name, t.value])));
  };
  useEffect(() => {
    void fetch('/api/setup/thresholds')
      .then((r) => r.json())
      .then((b) => take(b.thresholds as ThresholdState[]));
  }, []);
  if (!state) return null;
  const changed = state.some((t) => !t.locked && (values[t.name] ?? '') !== t.value);
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const body = Object.fromEntries(state.filter((t) => !t.locked).map((t) => [t.name, values[t.name] ?? '']));
      const res = await fetch('/api/setup/thresholds', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-patchboard': 'action' }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      take(j.thresholds);
      setMsg({ ok: true, text: 'Saved. Needs attention uses the new numbers now.' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  // Drive temperatures are stored in °C; show the °F equivalent beside them.
  const asF = (c: string) => (c && Number.isFinite(Number(c)) ? `${Math.round(Number(c) * 1.8 + 32)}°F` : '');
  const groups = [...new Set(THRESHOLDS.map((t) => t.group))];
  return (
    <>
      {groups.map((g) => (
        <Section key={g} title={g}>
          <div className="thresholds">
            {THRESHOLDS.filter((t) => t.group === g).map((t) => {
              const st = state.find((x) => x.name === t.name)!;
              return (
                <label key={t.name} className="threshold">
                  <span className="threshold-label">{t.label}</span>
                  <span className="threshold-input">
                    {st.locked ? (
                      <span className="setup-locked">
                        {st.value || 'none'} {t.unit} (set in the environment, {t.name})
                      </span>
                    ) : (
                      <>
                        <input
                          className={`field ${t.kind === 'number' ? 'field-num' : ''}`}
                          type={t.kind === 'number' ? 'number' : 'text'}
                          inputMode={t.kind === 'number' ? 'numeric' : undefined}
                          min={t.min}
                          max={t.max}
                          placeholder={t.kind === 'list' ? 'example.com' : t.default}
                          value={values[t.name] ?? ''}
                          disabled={readOnly}
                          onChange={(e) => setValues({ ...values, [t.name]: e.target.value })}
                        />
                        {t.unit && <span className="threshold-unit">{t.unit}</span>}
                        {t.unit === '°C' && unit === 'f' && <span className="threshold-unit">{asF(values[t.name] ?? '')}</span>}
                      </>
                    )}
                  </span>
                  <small className="threshold-hint">
                    {t.hint}
                    {t.kind === 'number' && !st.locked && ` Default ${t.default}${t.unit === '°C' ? '°C' : t.unit?.startsWith('%') ? '%' : t.unit ? ` ${t.unit}` : ''}.`}
                  </small>
                </label>
              );
            })}
          </div>
        </Section>
      ))}
      {!readOnly && (
        <div className="thresholds-save">
          <button type="button" className="button" disabled={!changed} aria-disabled={busy || undefined} onClick={() => !busy && void save()}>
            {busy ? 'Saving...' : 'Save'}
          </button>
          {changed && (
            <button type="button" className="text-button" onClick={() => take(state)}>
              Undo changes
            </button>
          )}
          {/* A problem is announced and reads as one; a confirmation is a quiet note. */}
          {msg && <span className={msg.ok ? 'settings-note' : 'crit-text'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</span>}
        </div>
      )}
    </>
  );
}

/** Showcase mode: stand-ins for private details, before a screenshot is shared. */
function ShowcaseSettings() {
  const sc = useShowcase();
  const [words, setWords] = useState(sc.words);
  return (
    <Section title="Screenshots">
      <label className="check">
        <input type="checkbox" checked={sc.on} onChange={(e) => setShowcase({ on: e.target.checked, words })} />
        Showcase mode
      </label>
      <p className="settings-note">
        On this device, addresses, domain names, email and MAC addresses become made-up ones, the words below get stand-ins, and camera pictures blur, so a screenshot is safe
        to post. Fields you type in keep their real values. Turning it off draws the page again.
      </p>
      <textarea
        className="field mono showcase-words"
        aria-label="Words to swap"
        rows={4}
        spellCheck={false}
        value={words}
        placeholder={'tank\nNicholas = Rivera\nyour town'}
        onChange={(e) => setWords(e.target.value)}
        onBlur={() => words !== sc.words && setShowcase({ words })}
      />
      <p className="settings-note">One per line: your server's name, family names, your town. Write Nicholas = Rivera to pick the stand-in.</p>
    </Section>
  );
}
