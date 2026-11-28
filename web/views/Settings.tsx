// Settings. Connections and the catalog live on the server and are shared by
// every device; everything else is a per-device preference (appearance.ts).
// Themes are data in themes.ts, so this page renders whatever is there.

import { HELP } from '../lib/docs.ts';
import { HoldButton } from '../components/Hold.tsx';
import { CATEGORIES, INTEGRATIONS, type Integration } from '../../shared/integrations.ts';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ConnectOne, runningHere } from '../components/ConnectOne.tsx';
import { sourceOf } from '../../shared/feeds.ts';
import { useUrlChoice } from '../lib/url.ts';
import { land, useLanding } from '../lib/landing.ts';
import type { CatalogAudit, SelfCheck } from '../../shared/types.ts';
import { Section } from '../components/ui.tsx';
import { IntegrationForm } from '../components/IntegrationSetup.tsx';
import { HomepageImport } from '../components/HomepageImport.tsx';
import { SignIn } from '../components/SignIn.tsx';
import { BrandName } from '../components/BrandName.tsx';
import { AppIconSection } from '../components/AppIcon.tsx';
import { ApiKeys } from '../components/ApiKeys.tsx';
import { HeaderSettings } from '../components/HeaderSettings.tsx';
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
import { LANGUAGES, msg, t as tr, tn, tx } from '../lib/i18n.ts';
import { copyText } from '../lib/copy.ts';
import { Devices } from '../components/Devices.tsx';
import { tabKeys } from '../lib/tabs.ts';

type Tab = 'look' | 'home' | 'devices' | 'alerts' | 'connections' | 'activity';

type Part = 'integrations' | 'access' | 'apps' | 'backup';
const PARTS: [Part, string][] = [
  ['integrations', msg('All connections')],
  ['access', msg('Sign-in and keys')],
  ['apps', msg('App catalog')],
  ['backup', msg('Backup')],
];
const TABS: [Tab, string, string][] = [
  ['look', msg('Look'), msg('This browser only. A new browser starts from the last look you saved.')],
  ['home', msg('Home'), msg("This browser only. A board's widgets are shared.")],
  ['devices', msg('Devices'), msg('Wall tablets, e-ink panels and family phones, set up from here.')],
  ['alerts', msg('Alerts'), msg('What counts as trouble, and where you hear about it. Shared by every device.')],
  ['connections', msg('Connections'), msg('Shared by every device.')],
  ['activity', msg('Activity'), msg('Who changed what, newest first.')],
];


/**
 * The sentence a search found, when it isn't the one a description starts
 * with: a long description shows two lines, and the match may be in its
 * fifth sentence. Search reads the English; this shows the same sentence in
 * the reader's language when both split the same way.
 */
function foundIn(english: string, said: string, q: string): string | null {
  if (!q) return null;
  const split = (s: string) => s.match(/[^.!?]+[.!?]+(?=\s|$)/g)?.map((x) => x.trim()) ?? [s];
  const en = split(english);
  const k = en.findIndex((s) => s.toLowerCase().includes(q));
  if (k <= 0) return null;
  const local = split(said);
  return local.length === en.length ? local[k] : en[k];
}

export function Settings() {
  const a = useAppearance();
  const [tab, setTab] = useUrlChoice<Tab>('tab', ['look', 'home', 'devices', 'alerts', 'connections', 'activity'], 'look', true, ['part', 'device']);
  // Connections is four pages in one: each part on its own, so none is a long scroll away.
  const [part, setPart] = useUrlChoice<Part>('part', ['integrations', 'access', 'apps', 'backup'], 'integrations', true);
  const { hash, search } = useLocation();
  useEffect(() => {
    if (hash === '#catalog' || new URLSearchParams(search).get('import') === 'homepage') setPart('apps');
  }, [hash, search]);
  // A way to be told about trouble lives under Alerts: a link to one in Connections lands there.
  useEffect(() => {
    const setup = new URLSearchParams(search).get('setup');
    if (setup && NOTIFY.has(setup) && tab !== 'alerts') setTab('alerts');
  }, [search]);
  // Older links point at #catalog.
  useEffect(() => {
    if (hash === '#catalog' && tab !== 'connections') setTab('connections');
  }, [hash]);
  useLanding(!!useStore().snap && (tab === 'connections' || tab === 'home'));
  const groupLabels: Partial<Record<keyof Appearance, string>> = { homeStatusSize: msg('Status size'), homeClockSize: msg('Clock size'), homeWeather: msg('Weather view'), homeApps: msg('App appearance'), clock24: msg('Time format'), temp: msg('Temperature units'), scheme: msg('Color mode'), icons: msg('Service icons'), appIcon: msg('App icon'), font: msg('Typeface'), density: msg('Density') };
  const seg = <K extends keyof Appearance>(key: K, options: [Appearance[K], string][], disabled = false) => (
    <div className="seg" role="group" aria-label={tr(groupLabels[key] ?? '')}>
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" disabled={disabled} aria-pressed={a[key] === v} onClick={() => setAppearance({ [key]: v } as Partial<Appearance>)}>
          {tr(label)}
        </button>
      ))}
    </div>
  );

  return (
    <div className="page settings">
      <div className="page-head">
        <h1 className="page-title">{tr('Settings')}</h1>
      </div>
      <FinishSetup />
      <div className="seg settings-tabs" role="tablist" aria-label={tr('Settings')} onKeyDown={tabKeys}>
        {TABS.map(([v, label]) => (
          <button key={v} type="button" role="tab" tabIndex={tab === v ? 0 : -1} aria-selected={tab === v} onClick={() => setTab(v)}>
            {tr(label)}
          </button>
        ))}
      </div>
      <p className="page-lede">{tr(TABS.find((t) => t[0] === tab)![2])}</p>

      <div className="settings-grid">
      {tab === 'look' && (
      <>
      <BrandName />

      {/* The kind of screen comes first: e-ink sets aside the theme, mode and
          accent under it, and nothing above the choice moves when it does. */}
      <Section title="Theme" count={a.eink ? undefined : tr('{n} themes', { n: THEMES.length + 1 })} className="span-all">
        <div className="look-screen">
          <span id="look-screen">{tr('Screen')}</span>
          <div className="seg" role="group" aria-labelledby="look-screen">
            {(
              [
                ['', msg('Standard')],
                ['bw', msg('E-ink')],
                ['color', msg('Color e-ink')],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={(a.eink ? (a.einkColor ? 'color' : 'bw') : '') === v}
                onClick={() => setAppearance({ eink: v !== '', einkColor: v === 'color' })}
              >
                {tr(label)}
              </button>
            ))}
          </div>
        </div>
        {a.eink ? (
          <p className="settings-note">{tr('For an e-ink reader or panel: no motion, and one redraw a minute. Only this screen changes; a wall device is set from Devices.')}</p>
        ) : (
          <>
            <div className="theme-grid">
              {THEMES.map((t) => (
                <ThemeCard key={t.id} id={t.id} name={t.name} note={t.note} active={a.theme === t.id} />
              ))}
              <ThemeCard id="custom" name={tr('Custom')} note={msg('Your background, text and accent.')} active={a.theme === 'custom'} />
            </div>
            {a.theme === 'custom' && <CustomBuilder />}
            <div className="look-row">
              <div>
                <span>{tr('Mode')}</span>
                {seg(
                  'scheme',
                  [
                    ['auto', msg('Match the system')],
                    ['dark', msg('Dark')],
                    ['light', msg('Light')],
                  ],
                  a.theme === 'custom',
                )}
                {a.theme === 'custom' && <p className="settings-note">{tr('A custom theme turns light or dark with its background color.')}</p>}
              </div>
              <div>
                <span>{tr('Accent')}</span>
                <div className="swatches">
                  <button type="button" className="swatch swatch-theme" aria-pressed={a.accent === 'default'} title={tr("The theme's own")} aria-label={tr("The theme's own accent")} onClick={() => setAppearance({ accent: 'default' })} />
                  {ACCENTS.map((c) => (
                    <button key={c.id} type="button" className="swatch" style={{ background: document.documentElement.dataset.scheme === 'light' ? c.light : c.dark }} aria-pressed={a.accent === c.id} aria-label={c.name} title={c.name} onClick={() => setAppearance({ accent: c.id })} />
                  ))}
                  <label className={`swatch swatch-pick ${a.accent === 'custom' ? 'is-on' : ''}`} title={tr('Any color')} style={a.accent === 'custom' ? { background: a.accentHex } : undefined}>
                    <input type="color" value={a.accentHex} onChange={(e) => setAppearance({ accent: 'custom', accentHex: e.target.value })} aria-label={tr('Pick any accent color')} />
                    <span aria-hidden>+</span>
                  </label>
                </div>
                <p className="settings-note">{tr('For links, the current page, focus and charts.')}</p>
              </div>
            </div>
          </>
        )}
      </Section>

      <AppIconSection />

      <Section title="Type">
        <div className="choice-row">
          {seg('font', [
            ['theme', msg("Theme's own")],
            ...(Object.entries(FONTS) as [FontSet, (typeof FONTS)[FontSet]][]).map(([k, f]) => [k, f.label] as [Appearance['font'], string]),
          ])}
        </div>
      </Section>

      <Section title="Density">
        <div className="choice-row">
          {seg('density', [
            ['compact', msg('Compact')],
            ['comfortable', msg('Comfortable')],
            ['large', msg('Large')],
          ])}
        </div>
      </Section>

      <Section title="Language and region">
        <div className="region-picks">
          <label>
            <span>{tr('Language')}</span>
            <select
              className="field"
              value={a.lang}
              onChange={(e) => {
                setAppearance({ lang: e.target.value });
                // Every word on the page changes: draw it again.
                location.reload();
              }}
            >
              <option value="">{tr('Match this browser')}</option>
              {LANGUAGES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{tr('Dates and numbers')}</span>
            <select className="field" value={a.locale} onChange={(e) => setAppearance({ locale: e.target.value })}>
              <option value="">{tr('Match this browser')}</option>
              {REGIONS.map(([tag, name]) => (
                <option key={tag} value={tag}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{tr('Prices in')}</span>
            <select className="field" value={a.currency} onChange={(e) => setAppearance({ currency: e.target.value })}>
              <option value="">{tr("The region's own ({currency})", { currency: currency() })}</option>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="choice-row">
          {seg('clock24', [
            [false, msg('12-hour')],
            [true, msg('24-hour')],
          ])}
          {seg('temp', [
            ['f', '°F'],
            ['c', '°C'],
            ['both', msg('Both')],
          ])}
        </div>
        <p className="settings-note">
          {tr('Here: {sample}.', {
            sample: [
              new Date().toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
              new Date().toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit', hour12: !a.clock24 }),
              num(1234567.89, 2),
              money(1234.5, currency(), 2),
            ].join(', '),
          })}
        </p>
      </Section>

      <Section title="Keyboard">
        <label className="check">
          <input type="checkbox" checked={a.keys} onChange={(e) => setAppearance({ keys: e.target.checked })} />
          {tr('Single-key shortcuts')}
        </label>
        <p className="settings-note">{tr('? lists them. Turn them off for speech input; Ctrl K always works.')}</p>
      </Section>

      </>
      )}
      {tab === 'home' && (
      <>
      <Section title="Home header" id="home-header" className="span-all">
        <HeaderSettings />
      </Section>

      <Section title="Default app appearance">
        <div className="choice-row">
          {seg('homeApps', [
            ['tiles', msg('Tiles with a live number')],
            ['patchbay', msg('Icons')],
          ])}
        </div>
        <p className="settings-note">
          {tr('An Apps widget can have its own look, set in Arrange board.')}
        </p>
      </Section>

      </>
      )}
      {tab === 'look' && (
      <Section title="Service icons">
        <div className="choice-row">
          {seg('icons', [
            ['mono', msg('Grayscale')],
            ['color', msg('Full color')],
          ])}
        </div>
      </Section>
      )}
      {tab === 'look' && <Portability />}
      {tab === 'connections' && (
        <>
          <div className="seg settings-tabs settings-parts span-all" role="tablist" aria-label={tr('Connections')} onKeyDown={tabKeys}>
            {PARTS.map(([v, label]) => (
              <button key={v} type="button" role="tab" tabIndex={part === v ? 0 : -1} aria-selected={part === v} onClick={() => setPart(v)}>
                {tr(label)}
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
              <Keys />
              <ApiKeys />
            </>
          )}
          {part === 'apps' && <CatalogCheck />}
          {part === 'backup' && <SetupFile />}
        </>
      )}
      {tab === 'devices' && <Devices />}
      {tab === 'alerts' && (
        <>
          <Integrations which="notify" />
          <Alerts />
        </>
      )}
      {tab === 'activity' && <Activity />}
      </div>
      <AppVersion />
    </div>
  );
}

/**
 * What first run left for later, in one quiet line at the top: the town for
 * the weather and a password. Gone once both are set, or hidden here.
 */
function FinishSetup() {
  const { snap } = useStore();
  const [auth, setAuth] = useState<{ mode: string; locked?: boolean } | null>(null);
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('pb-finish-hidden') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (hidden || snap?.demo || snap?.readOnly) return;
    void fetch('/api/auth/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then(setAuth)
      .catch(() => {});
  }, [hidden]);
  if (!snap || hidden || snap.demo || snap.readOnly || snap.household) return null;
  const items: [string, string][] = [];
  if (!snap.sources.weather) items.push([tr('Set your town'), '/settings?tab=connections&setup=weather']);
  if (auth?.mode === 'none' && !auth.locked) items.push([tr('Turn on a password'), '/settings?tab=connections&part=access']);
  if (!items.length) return null;
  return (
    <p className="finish-setup">
      <span>{tr('Finish setup')}</span>
      {items.map(([label, to]) => (
        <Link key={to} to={to}>
          {label}
        </Link>
      ))}
      <button
        type="button"
        className="text-button"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem('pb-finish-hidden', '1');
          } catch {
            /* comes back next visit */
          }
        }}
      >
        {tr('Hide')}
      </button>
    </p>
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
    ? tr('A newer image is out.')
    : c?.state === 'current'
      ? tr('Up to date, checked {when}.', { when: agoLong(c.at, now) })
      : c?.state === 'unknown'
        ? `${tr("Can't check for updates.")} ${c.reason ?? ''}`
        : tr('Not checked yet.');
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
          {busy ? tr('Checking...') : tr('Check now')}
        </button>
      )}
      {/* Update shows when there is one, or when Patchboard can't tell; never beside "Up to date". */}
      {!ro && me.container && snap.features?.includes('updates') && (newer || c?.state !== 'current') && <SelfUpdate name={me.container} waiting={newer} />}
      <span className="app-help">
        {tr('Help:')}{' '}
        <a href={HELP.tour} target="_blank" rel="noreferrer">
          {tr('tour')}
        </a>
        ,{' '}
        <a href={HELP.integrations} target="_blank" rel="noreferrer">
          {tr('connecting apps')}
        </a>
        ,{' '}
        <a href={HELP.configuration} target="_blank" rel="noreferrer">
          {tr('configuration')}
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
      <span>{tr(note)}</span>
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
      {pick('bg', tr('Background'))}
      {pick('ink', tr('Text'))}
      {pick('accent', tr('Accent'))}
      <p className={`settings-note ${ratio < 4.5 ? 'warn-text' : ''}`}>
        {ratio < 4.5
          ? tr('Quiet text contrast {ratio}:1. Below 4.5:1, small labels get hard to read; move the text and background further apart.', { ratio: ratio.toFixed(1) })
          : tr('Quiet text contrast {ratio}:1, readable.', { ratio: ratio.toFixed(1) })}
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
            setMsg((await copyText(exportAppearance())) ? tr('Copied. Paste it into Settings on the other device.') : tr('This browser didn’t copy. Try again from another browser.'));
          }}
        >
          {tr('Copy settings')}
        </button>
        <button
          type="button"
          className="button button-quiet"
          onClick={() => {
            resetAppearance();
            setMsg(tr('Back to the defaults.'));
          }}
        >
          {tr('Reset to defaults')}
        </button>
      </div>
      <div className="import-row">
        <input className="field" placeholder={tr('Paste settings here')} aria-label={tr('Paste settings here')} value={text} onChange={(e) => setText(e.target.value)} />
        <button
          type="button"
          className="button button-quiet"
          disabled={!text.trim()}
          onClick={() => {
            const ok = importAppearance(text);
            setMsg(ok ? tr('Applied.') : tr("That isn't a Patchboard settings string. Use Copy settings on the other device."));
            if (ok) setText('');
          }}
        >
          {tr('Apply')}
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
    if (!res.ok) setErr(body.error ?? tr("Couldn't start the Trakt sign-in. Try again."));
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
                {tr('Add your Trakt app\'s Client ID first.')} <ConnectOne sources={['trakt']} label={tr('Add it')} />
              </span>
            ) : s.pending ? (
              <span className="trakt-code">
                {tx('Go to {link} and enter {code}', {
                  link: (
                    <a href={s.pending.verifyUrl} target="_blank" rel="noreferrer">
                      {s.pending.verifyUrl.replace(/^https?:\/\//, '')}
                    </a>
                  ),
                  code: <code className="big-code">{s.pending.userCode}</code>,
                })}
                <span className="ledger-aside">
                  {tn(Math.max(0, Math.round((s.pending.expiresAt - Date.now()) / 60_000)), 'Waiting. The code works for {n} more minute.', 'Waiting. The code works for {n} more minutes.')}
                </span>
              </span>
            ) : s.connected ? (
              <>
                <span>{s.user ? tx('Connected as {user}', { user: <span className="mono">{s.user}</span> }) : tr('Connected')}</span>
                {s.expiresAt && <span className="ledger-aside">{tr('renews on its own, next by {date}', { date: new Date(s.expiresAt).toLocaleDateString(locale()) })}</span>}
                {s.canConnect && !readOnly && (
                  <button type="button" className="text-button" onClick={() => void disconnect()}>
                    {tr('Disconnect')}
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="ledger-aside">{tr('Not connected.')}</span>
                {s.canConnect && !readOnly && (
                  <button type="button" className="button button-quiet" onClick={() => void connect()}>
                    {tr('Connect Trakt')}
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
  const discoveredParts = { link: <Link to="/apps?arrange=1">{tr('Apps, Edit apps')}</Link>, services: <code>services:</code> };
  return (
    <section className="section span-all" id="catalog">
      <header className="section-head">
        <h2>{tr('Catalog')}</h2>
        <span className="section-count">{(audit.yamlApps ?? 0) > 0 ? 'config/services.yaml' : 'apps saved in Patchboard'}</span>
      </header>
      <p className="settings-note">
        {tx('Keep your catalog in git? {download} writes the apps as you arranged them here, with groups, order, icons and apps you added. Hidden apps and live numbers stay in Patchboard.', {
          download: (
            <a href="/api/catalog/yaml" download>
              {tr('Download services.yaml')}
            </a>
          ),
        })}
      </p>
      {(audit.yamlApps ?? 0) > 0 && !readOnly && (
        <div className="adopt">
          <p>
            <strong>
              {audit.yamlLinks
                ? tr('services.yaml lists {apps} and {links}.', { apps: tn(audit.yamlApps ?? 0, '{n} app', '{n} apps'), links: tn(audit.yamlLinks, '{n} link', '{n} links') })
                : tn(audit.yamlApps ?? 0, 'services.yaml lists {n} app.', 'services.yaml lists {n} apps.')}
            </strong>{' '}
            {tr('Copy them into Patchboard with their groups, order, icons and checks, then delete the file yourself. Patchboard never edits it.')}
          </p>
          <button type="button" className="button" disabled={adoptState === 'busy'} onClick={() => void adoptYaml()}>
            {adoptState === 'busy' ? tr('Copying...') : adoptState === 'done' ? tr('Copied. Safe to delete services.yaml') : tr('Copy into Patchboard')}
          </button>
          {adoptErr && <p className="crit-text" role="alert">{adoptErr}</p>}
        </div>
      )}
      {!readOnly && (
        <div className="adopt">
          <p>
            <strong>{tr('Coming from Homepage?')}</strong>{' '}{tr('Paste its services.yaml and bookmarks.yaml, and the apps, groups, icons and links come over beside what you have.')}
          </p>
          <button type="button" className="button button-quiet" onClick={() => setImporting(true)}>
            {tr('Import from Homepage')}
          </button>
        </div>
      )}
      {importing && <HomepageImport onClose={() => setImporting(false)} />}
      {clean && <p className="settings-note">{tr('Every catalog entry matches a container, and every running app is listed.')}</p>}
      {audit.missing.length > 0 && (
        <dl className="ledger">
          {audit.missing.map((m) => (
            <div className="ledger-row" key={m.service}>
              <dt>{m.service}</dt>
              <dd>
                <span className="warn-text">
                  {tx('No container named {name}', { name: <span className="mono">{m.container}</span> })}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {audit.discovered.length > 0 && (
        <>
          <p className="settings-note">
            {audit.discovered.length === 1
              ? tx("One running app isn't listed. Add it in one click from {link}, or paste this entry under a group's {services} in services.yaml.", discoveredParts)
              : tx("{n} running apps aren't listed. Add them in one click from {link}, or paste these entries under a group's {services} in services.yaml.", { ...discoveredParts, n: audit.discovered.length })}
          </p>
          <div className="rb-body">
            <pre>
              <code>{audit.yaml}</code>
              <button
                type="button"
                className="copy"
                onClick={async () => {
                  if (!(await copyText(audit.yaml ?? ''))) return;
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }}
              >
                {copied ? tr('Copied') : tr('Copy')}
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
  'container.restart': msg('restarted'),
  'container.stop': msg('stopped'),
  'container.start': msg('started'),
  'container.update': msg('updated'),
  'container.rollback': msg('rolled back an update'),
  'board.save': msg('saved the Home board'),
  'board.reset': msg('reset the Home board'),
  'apps.order': msg('rearranged the apps'),
  'apps.order.reset': msg('put the apps back in catalog order'),
  'secret.set': msg('saved the key'),
  'secret.delete': msg('removed the key'),
  'icon.upload': msg('uploaded an icon'),
  'pages.save': msg('customized a page'),
  'setup.import': msg('restored a setup file'),
  'update.dismiss': msg('dismissed an image update mark for'),
  'trakt.connect': msg('started a Trakt sign-in'),
  'trakt.disconnect': msg('disconnected Trakt'),
  'auth.signin': msg('signed in'),
  'household.add': msg('made a household link'),
  'household.remove': msg('removed a household device'),
  'household.join': msg('opened its household link'),
  'household.view': msg('changed what a household device shows'),
  'auth.failed': msg('failed to sign in'),
  'auth.hosts': msg('changed the addresses Patchboard answers on'),
  'auth.off': msg('turned sign-in off'),
  'board.add': msg('added a board'),
  'brand.save': msg('renamed the dashboard'),
  'setup.save': msg('saved the settings for'),
  'setup.remove': msg('removed the connection'),
  'setup.test': msg('tested the connection to'),
  'setup.thresholds': msg('changed the alert thresholds'),
  'wake': msg('woke'),
  'downloads.pause': msg('paused every download in'),
  'downloads.resume': msg('resumed every download in'),
  'downloads.altspeed': msg('switched alternative speed limits in'),
  'downloads.item.pause': msg('paused'),
  'downloads.item.resume': msg('resumed'),
  'downloads.item.remove': msg('removed the download'),
  'arr.search': msg('searched again for'),
  'arr.retry': msg('tried another release for'),
  'arr.remove': msg('removed from the queue'),
  'requests.approve': msg('approved'),
  'requests.decline': msg('declined'),
  'ha.toggle': msg('switched'),
  'ha.run': msg('ran'),
  'proxmox.start': msg('started'),
  'proxmox.shutdown': msg('shut down'),
  'proxmox.reboot': msg('rebooted'),
};

/** What an action was done to, in words: a title or name over an id. */
function auditSubject(r: AuditRow): string | undefined {
  if (r.action.startsWith('auth.')) return undefined;
  if (r.action.startsWith('requests.')) return r.detail || tr('request {id}', { id: r.target });
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
    <Section title="Activity" count={rows ? tr('{n} recent', { n: rows.length }) : undefined} className="span-all">
      {!rows?.length ? (
        <p className="settings-note">{tr('Nothing yet. Container actions, updates, board changes and sign-ins show here, with who did each.')}</p>
      ) : (
        <ul className="audit">
          {rows.slice(0, 60).map((r) => (
            <li key={r.id}>
              <span className="mono audit-who">{r.who}</span>
              <span>
                {ACTION_TEXT[r.action] ? tr(ACTION_TEXT[r.action]) : r.action.replace(/[._]/g, ' ')}
                {auditSubject(r) && !['board.save', 'board.reset', 'apps.order', 'apps.order.reset', 'icon.upload', 'pages.save', 'brand.save', 'trakt.connect', 'trakt.disconnect', 'setup.import', 'setup.thresholds'].includes(r.action) && (
                  <>
                    {' '}
                    <span className={r.action.startsWith('container.') || r.action.startsWith('secret.') || r.action === 'update.dismiss' ? 'ident' : undefined}>{auditSubject(r)}</span>
                  </>
                )}
                {r.detail && r.action.startsWith('auth.') ? <span className="ledger-aside"> {tr('from {place}', { place: r.detail })}</span> : null}
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
    <Section title="Saved secrets" count={list.length ? String(list.length) : undefined}>
      <p className="settings-note">
        {tx('Keys you pasted for live numbers. Patchboard keeps them on the server and never shows them again. An API numbers widget can use one as {ref}.', {
          ref: <code>{'${secret:NAME}'}</code>,
        })}
      </p>
      {list.length > 0 && (
        <ul className="audit keys">
          {list.map((k) => (
            <li key={k.name}>
              <span className="mono">{k.name}</span>
              <time>{agoLong(k.at)}</time>
              {!readOnly && (
                <HoldButton className="text-button" danger hint={tr('Hold to remove. Anything using it stops working.')} onConfirm={() => void remove(k.name)}>
                  {tr('Remove')}
                </HoldButton>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <div className="key-add">
          <input className="field mono" value={name} placeholder="NAME" aria-label={tr('Key name')} onChange={(e) => setName(e.target.value)} />
          <input className="field mono" type="password" autoComplete="off" value={value} placeholder={tr('Paste the key')} aria-label={tr('Key')} onChange={(e) => setValue(e.target.value)} />
          <button type="button" className="button button-quiet" disabled={!name.trim() || !value.trim()} onClick={() => void add()}>
            {tr('Save key')}
          </button>
          {err && <span className="crit-text" role="alert">{err}</span>}
        </div>
      )}
    </Section>
  );
}

/** The ways Patchboard tells you about trouble: listed under Alerts, beside the thresholds. */
const NOTIFY = new Set(CATEGORIES.find(([name]) => name === 'Notifications')?.[1] ?? []);

/**
 * Every connection: what's on (and whether it's answering), then what you
 * could turn on and exactly how, each set up in place. The apps and services
 * are under Connections; the ways to be told about trouble, under Alerts. The
 * list lives in shared/integrations.ts, the same one docs/INTEGRATIONS.md is
 * built from.
 */
function Integrations({ which = 'services' }: { which?: 'services' | 'notify' }) {
  const { snap } = useStore();
  const [setup, setSetup] = useState<{ integrations: SetupIntegration[]; demo: boolean } | null>(null);
  const [adopting, setAdopting] = useState(false);
  // Every hook before the early return below: React needs the same hooks on every render.
  const [moveErr, setMoveErr] = useState('');
  const [find, setFind] = useState('');
  const [show, setShow] = useState<'here' | 'all' | 'on' | 'off'>('all');
  /** Running here and not connected: shown first, once, when there are any. */
  const ledWithHere = useRef(false);
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
      return { on: false, text: tr('Off'), tone: 'off', why: tr('This is the slim image, which has no Docker CLI. Use the full image to update containers from here.') };
    // Hardcover and Goodreads fill one Books widget; with both saved, Hardcover is the one used.
    if (i.id === 'goodreads' && snap.features?.includes('hardcover') && setupOf('goodreads')?.fromUi)
      return { on: false, text: tr('Saved, Hardcover is in use'), tone: 'off' };
    if (!i.source) return snap.features?.includes(i.id) ? { on: true, text: tr('On'), tone: 'ok' } : { on: false, text: tr('Off'), tone: 'off' };
    const s = snap.sources[i.id as keyof typeof snap.sources];
    if (!s) return { on: false, text: tr('Off'), tone: 'off' };
    if (!s.ok) return { on: true, text: s.error ? tr("Can't reach it: {error}", { error: s.error }) : s.updatedAt ? tr("Can't reach it") : tr('Connecting'), tone: s.error ? 'warn' : 'off' };
    return { on: true, text: s.updatedAt ? tr('On, updated {when}', { when: agoLong(s.updatedAt) }) : tr('On'), tone: 'ok' };
  };
  const setupOf = (id: string) => setup?.integrations.find((x) => x.id === id);
  const rows = INTEGRATIONS.filter((i) => (which === 'notify') === NOTIFY.has(i.id)).map((i) => ({ i, st: status(i) }));
  const on = rows.filter((r) => r.st.on);
  const off = rows.filter((r) => !r.st.on);
  const here = runningHere(snap);
  const isHere = (r: (typeof rows)[number]) => !r.st.on && here.has(sourceOf(r.i.id)) && !!setupOf(r.i.id);
  const waiting = rows.filter(isHere);
  if (which === 'services' && setup && !ledWithHere.current) {
    ledWithHere.current = true;
    if (waiting.length && !wanted) queueMicrotask(() => setShow('here'));
  }
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
        <span className="integration-name">
          {i.name} {which === 'services' && !st.on && here.has(sourceOf(i.id)) && <span className="quiet-tag">{tr('Running here')}</span>}
        </span>
        <span className="integration-adds">
          <span className="integration-line" title={tr(i.adds)}>{foundIn(i.adds, tr(i.adds), find.trim().toLowerCase()) ?? tr(i.adds)}</span>
          {st.why ? <small>{st.why}</small> : !su && !st.on && i.where && <small>{i.where}</small>}
        </span>
        <span className="integration-end">
          <span className={`integration-status tone-${st.tone}`}>
            {/* Off says nothing Set up doesn't. */}
            {st.on || st.why || !su ? st.text : ''}
            {su?.fromUi && <small>{' '}{tr('Set up here')}</small>}
            {locked && st.on && <small>{' '}{tr('From the environment')}</small>}
          </span>
          {su ? (
            <button type="button" className="text-button" aria-expanded={open === i.id} aria-label={st.on ? tr('Settings for {name}', { name: i.name }) : tr('Set up {name}', { name: i.name })} onClick={() => setOpen(open === i.id ? null : i.id)}>
              {/* The form below has Cancel; this stays its name and only shows it's open. */}
              {st.on ? tr('Edit') : tr('Set up')}
            </button>
          ) : (
            st.on && <span className="integration-slot" aria-hidden />
          )}
          {!su && !st.on && !st.why && (
            <span className="integration-env">
              {[...i.env, ...(i.optional ?? []).map((v) => tr('{name} (optional)', { name: v }))].map((v) => (
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
    <Section title={which === 'notify' ? msg('Where alerts go') : msg('Connections')} count={tr('{on} of {all} on', { on: on.length, all: rows.length })} className="span-all" id={which === 'notify' ? 'notifications' : 'integrations'}>
      {which === 'services' && (
        <p className="settings-note">
          {tr('Keys stay encrypted on this server and never reach a browser. A variable in your environment wins over this page and shows here as locked.')}
        </p>
      )}
      {which === 'services' && !setup?.demo && !snap.readOnly && envOnly.length > 0 && (
        <div className="adopt">
          <p>
            <strong>{tn(envOnly.length, '{n} setting comes from your .env.', '{n} settings come from your .env.')}</strong>{' '}
            {tr('Save them in Patchboard, encrypted, and you can remove those lines. Nothing changes until you do; the .env keeps winning while it has them.')}
          </p>
          <button type="button" className="button" disabled={adopting} onClick={() => void adopt()}>
            {adopting ? tr('Saving...') : tr('Save them in Patchboard')}
          </button>
          {moveErr && <p className="crit-text" role="alert">{moveErr}</p>}
        </div>
      )}
      {movedIn.length > 0 && (
        <p className="settings-note adopt-done">
          {tx('Saved here too, so these can come out of your .env: {names}. Then recreate Patchboard with {command}: a restart keeps the old environment.', {
            names: <span className="mono">{movedIn.join(', ')}</span>,
            command: <code>docker compose up -d</code>,
          })}
        </p>
      )}
      {which === 'services' && <div className="int-tools">
        <input className="field" type="search" value={find} placeholder={tr('Find a connection')} aria-label={tr('Find a connection')} onChange={(e) => setFind(e.target.value)} />
        <span className="seg" role="group" aria-label={tr('Show')}>
          {(
            [
              ...(waiting.length ? [['here', tr('Running here {n}', { n: waiting.length })] as const] : []),
              ['all', tr('All {n}', { n: rows.length })],
              ['on', tr('On {n}', { n: on.length })],
              ['off', tr('Not set up {n}', { n: off.length })],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)}>
              {label}
            </button>
          ))}
        </span>
      </div>}
      {/* Categories in a set order, A to Z inside, in two columns that stand on
          their own: opening a form grows only its column, so nothing beside it moves. */}
      {(() => {
        const q = find.trim().toLowerCase();
        const cats = CATEGORIES.map(([cat, ids]) => ({
          cat,
          list: rows
            .filter((r) => ids.includes(r.i.id))
            // An open form stays put whatever the filter; search also knows the variable names (SONARR_KEY).
            .filter((r) => (show === 'here' ? isHere(r) : show === 'on' ? r.st.on : show === 'off' ? !r.st.on : true) || open === r.i.id)
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
                  // Where alerts go is one group: it needs no heading of its own.
                  which === 'services' && <li key={`cat-${cat}`} className="integrations-divider">
                    <h3 className="jw-sub">
                      {tr(cat)} <span className="int-cat-count">{tr('{n} on', { n: list.filter((r) => r.st.on).length })}</span>
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
        <p className="settings-note">{tr('Nothing called that. App numbers on tiles work for any app with a JSON API: Apps, Edit apps.')}</p>
      )}
      <p className="settings-note">
        {tx('More on each: {link}.', {
          link: (
            <a href="https://github.com/sourpatchdad/patchboard/blob/main/docs/INTEGRATIONS.md" target="_blank" rel="noreferrer">
              docs/INTEGRATIONS.md
            </a>
          ),
        })}
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
  const [pending, setPending] = useState<{ name: string; body: string } | null>(null);
  const load = async (f: File) => {
    setMsg('');
    setErr('');
    // The server reads JSON or YAML and checks the whole file before it changes anything.
    setPending({ name: f.name, body: await f.text() });
  };
  const replace = async () => {
    if (!pending) return;
    const res = await fetch('/api/setup', { method: 'PUT', headers: { ...ACTION, 'Content-Type': 'text/plain' }, body: pending.body });
    setPending(null);
    if (!res.ok) return setErr(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
    setMsg(tr('Replaced. Every open tab shows the new boards.'));
  };
  return (
    <Section title="Setup file">
      <p className="settings-note">
        {tr('Boards, apps, settings, notes and thresholds in one file, for a backup or a new server. Integrations, keys and uploaded icons stay behind.')}
      </p>
      <div className="choice-row">
        <a className="button button-quiet" href="/api/setup" download>
          {tr('Download setup')}
        </a>
        <a className="button button-quiet" href="/api/setup?format=yaml" download>
          {tr('As YAML')}
        </a>
        {!readOnly && (
          <>
            <button type="button" className="button button-quiet" onClick={() => fileInput.current?.click()}>{tr('Restore a setup file')}</button>
            <input ref={fileInput} type="file" accept="application/json,.json,.yaml,.yml,application/yaml,text/yaml" hidden onChange={(e) => {
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
            {tx('Replace your boards, apps, page settings, notes and thresholds with {file}?', { file: <span className="mono">{pending.name}</span> })}
          </span>
          <HoldButton danger hint={tr('Hold to replace')} onConfirm={() => void replace()}>
            {tr('Replace')}
          </HoldButton>
          <button type="button" className="text-button" onClick={() => setPending(null)}>
            {tr('Cancel')}
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
      setMsg({ ok: true, text: tr('Saved. Needs attention uses the new numbers now.') });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  // Drive temperatures are stored in °C; show the °F equivalent beside them.
  const asF = (c: string) => (c && Number.isFinite(Number(c)) ? `${Math.round(Number(c) * 1.8 + 32)}°F` : '');
  // Thresholds for things this server has: no tire pressures without a car.
  const { snap } = useStore();
  const has = (ids: string[]) => ids.some((id) => !!snap?.sources[id as keyof NonNullable<typeof snap>['sources']]);
  const shown = (g: string) => (g === 'Car' ? has(['tessie']) : g === 'Drives' ? has(['truenas', 'scrutiny', 'unraid', 'synology', 'qnap']) : true);
  const groups = [...new Set(THRESHOLDS.map((t) => t.group))].filter(shown);
  return (
    <>
      {groups.map((g) => (
        <Section key={g} title={g}>
          <div className="thresholds">
            {THRESHOLDS.filter((t) => t.group === g).map((t) => {
              const st = state.find((x) => x.name === t.name)!;
              return (
                <label key={t.name} className="threshold">
                  <span className="threshold-label">{tr(t.label)}</span>
                  <span className="threshold-input">
                    {st.locked ? (
                      <span className="setup-locked">
                        {tr('{value} (set in the environment, {name})', { value: `${st.value || tr('none')} ${t.unit ?? ''}`.trim(), name: t.name })}
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
                        {t.unit && <span className="threshold-unit">{tr(t.unit)}</span>}
                        {t.unit === '°C' && unit === 'f' && <span className="threshold-unit">{asF(values[t.name] ?? '')}</span>}
                      </>
                    )}
                  </span>
                  <small className="threshold-hint">
                    {tr(t.hint)}
                    {t.kind === 'number' && !st.locked && ` ${tr('Default {value}.', { value: `${t.default}${t.unit === '°C' ? '°C' : t.unit?.startsWith('%') ? '%' : t.unit ? ` ${t.unit}` : ''}` })}`}
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
            {busy ? tr('Saving...') : tr('Save')}
          </button>
          {changed && (
            <button type="button" className="text-button" onClick={() => take(state)}>
              {tr('Undo changes')}
            </button>
          )}
          {/* A problem is announced and reads as one; a confirmation is a quiet note. */}
          {msg && <span className={msg.ok ? 'settings-note' : 'crit-text'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</span>}
        </div>
      )}
    </>
  );
}
