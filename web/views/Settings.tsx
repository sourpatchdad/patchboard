// Settings. Connections and the catalog live on the server and are shared by
// every device; everything else is a per-device preference (appearance.ts).
// Themes are data in themes.ts, so this page renders whatever is there.

import { INTEGRATIONS, type Integration } from '../../shared/integrations.ts';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useUrlChoice } from '../lib/url.ts';
import type { CatalogAudit } from '../../shared/types.ts';
import { Section } from '../components/ui.tsx';
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
import { useStore } from '../lib/store.tsx';
import { agoLong } from '../lib/format.ts';

type Tab = 'look' | 'home' | 'connections' | 'activity';
const TABS: [Tab, string, string][] = [
  ['look', 'Look', 'Saved on this device, so the phone and the desktop can differ.'],
  ['home', 'Home and units', 'Saved on this device. The Home board itself is the same everywhere: change it with Customize on Home.'],
  ['connections', 'Connections', 'Shared by every device.'],
  ['activity', 'Activity', 'Who changed what, newest first.'],
];

export function Settings() {
  const a = useAppearance();
  const [tab, setTab] = useUrlChoice<Tab>('tab', ['look', 'home', 'connections', 'activity'], 'look');
  const { hash } = useLocation();
  // Older links point at #catalog.
  useEffect(() => {
    if (hash === '#catalog' && tab !== 'connections') setTab('connections');
  }, [hash]);
  const seg = <K extends keyof Appearance>(key: K, options: [Appearance[K], string][], disabled = false) => (
    <div className="seg" role="group">
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
      <div className="seg settings-tabs" role="tablist" aria-label="Settings">
        {TABS.map(([v, label]) => (
          <button key={v} type="button" role="tab" aria-selected={tab === v} aria-pressed={tab === v} onClick={() => setTab(v)}>
            {label}
          </button>
        ))}
      </div>
      <p className="page-lede">{TABS.find((t) => t[0] === tab)![2]}</p>

      <div className="settings-grid">
      {tab === 'look' && (
      <>

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

      </>
      )}
      {tab === 'home' && (
      <>
      <Section title="Home">
        <div className="choice-row">
          {seg('homeApps', [
            ['tiles', 'App tiles with live stats'],
            ['patchbay', 'Patch bay'],
          ])}
        </div>
        <p className="settings-note">
          <strong>Customize</strong> on Home picks the widgets, their order and their width. Every device shows the same board.
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

      <Portability />
      <SetupFile />
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
      {tab === 'connections' && (
        <>
          <Integrations />
          <Connections />
          <Keys />
          <CatalogCheck />
        </>
      )}
      {tab === 'activity' && <Activity />}
      </div>
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
            setMsg(ok ? 'Applied.' : "That isn't a settings string from Patchboard.");
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
    if (!res.ok) setErr(body.error ?? 'Could not start');
    await load();
  };
  const disconnect = async () => {
    await fetch('/api/trakt/disconnect', { method: 'POST', headers: ACTION });
    await load();
  };

  if (!s) return null;
  return (
    <Section title="Connections">
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
                {s.expiresAt && <span className="ledger-aside">renews on its own, next by {new Date(s.expiresAt).toLocaleDateString()}</span>}
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
        <span className="section-count">config/services.yaml</span>
      </header>
      <p className="settings-note">
        Keep your catalog in git? <a href="/api/catalog/yaml" download>Download services.yaml</a> writes the apps as you arranged them here, with groups,
        order, icons and apps you added. Hidden apps and live numbers stay in Patchboard.
      </p>
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
  'auth.failed': 'failed to sign in',
};

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
                {ACTION_TEXT[r.action] ?? r.action}
                {r.target && (r.action.startsWith('container.') || r.action.startsWith('secret.') || r.action === 'update.dismiss') && (
                  <>
                    {' '}
                    <span className="ident">{r.target}</span>
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
    if (!confirm(`Remove the key ${n}? Anything using it stops working until a new one is saved.`)) return;
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
                <button type="button" className="text-button" onClick={() => void remove(k.name)}>
                  Remove
                </button>
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
          {err && <span className="crit-text">{err}</span>}
        </div>
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
  if (!snap) return null;
  const status = (i: Integration): { on: boolean; text: string; tone: 'ok' | 'warn' | 'off' } => {
    if (!i.source) return snap.features?.includes(i.id) ? { on: true, text: 'On', tone: 'ok' } : { on: false, text: 'Off', tone: 'off' };
    const s = snap.sources[i.id as keyof typeof snap.sources];
    if (!s) return { on: false, text: 'Off', tone: 'off' };
    if (!s.ok) return { on: true, text: s.error ? `Can't reach it: ${s.error}` : "Can't reach it", tone: 'warn' };
    return { on: true, text: s.updatedAt ? `On, updated ${agoLong(s.updatedAt)}` : 'On', tone: 'ok' };
  };
  const rows = INTEGRATIONS.map((i) => ({ i, st: status(i) }));
  const on = rows.filter((r) => r.st.on);
  const off = rows.filter((r) => !r.st.on);
  return (
    <Section title="Integrations" count={`${on.length} of ${rows.length} on`} className="span-all">
      <ul className="integrations">
        {on.map(({ i, st }) => (
          <li key={i.id} className={`integration tone-${st.tone}`}>
            <span className="integration-name">{i.name}</span>
            <span className="integration-adds">{i.adds}</span>
            <span className={`integration-status tone-${st.tone}`}>{st.text}</span>
          </li>
        ))}
      </ul>
      {off.length > 0 && (
        <>
          <h3 className="jw-sub">Available to turn on</h3>
          <p className="settings-note">
            Add the variables to your <code>.env</code>, then recreate the container (<code>docker compose up -d</code>; a restart doesn't reload them). App
            numbers on tiles need no variables: set them up in Apps, Edit apps.
          </p>
          <ul className="integrations">
            {off.map(({ i }) => (
              <li key={i.id} className="integration tone-off">
                <span className="integration-name">{i.name}</span>
                <span className="integration-adds">
                  {i.adds}
                  {i.where && <small>{i.where}</small>}
                </span>
                <span className="integration-env">
                  {[...i.env, ...(i.optional ?? []).map((v) => `${v} (optional)`)].map((v) => (
                    <code key={v}>{v}</code>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </>
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
  const readOnly = !!useStore().snap?.readOnly;
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const load = async (f: File) => {
    setMsg('');
    setErr('');
    let body: unknown;
    try {
      body = JSON.parse(await f.text());
    } catch {
      return setErr("That file isn't JSON.");
    }
    if (!confirm('Replace your board, apps and page settings with this file? Your keys stay as they are.')) return;
    const res = await fetch('/api/setup', { method: 'PUT', headers: ACTION, body: JSON.stringify(body) });
    if (!res.ok) return setErr(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
    setMsg('Imported. Reload Home to see the board.');
  };
  return (
    <Section title="Setup file">
      <p className="settings-note">
        Your board, apps and page settings in one file, for a backup or a new server. Keys and uploaded icons stay on this server; add them again after a move.
      </p>
      <div className="choice-row">
        <a className="button button-quiet" href="/api/setup" download>
          Download setup
        </a>
        {!readOnly && (
          <label className="button button-quiet file-button">
            Import a setup file
            <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void load(e.target.files[0])} />
          </label>
        )}
      </div>
      {msg && <p className="settings-note">{msg}</p>}
      {err && <p className="crit-text">{err}</p>}
    </Section>
  );
}
