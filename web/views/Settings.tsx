// Settings. Connections and the catalog live on the server and are shared by
// every device; everything else is a per-device preference (appearance.ts).
// Themes are data in themes.ts, so this page renders whatever is there.

import { useEffect, useState } from 'react';
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

export function Settings() {
  const a = useAppearance();
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
      <p className="page-lede">Connections and the catalog are shared by every device. Everything else is saved on this device, so the phone and the desktop can differ.</p>

      <div className="settings-grid">

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
        {a.theme === 'custom' && <p className="settings-note">A custom theme is dark or light by its own background.</p>}
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

      <Section title="Home">
        <div className="choice-row">
          {seg('homeApps', [
            ['tiles', 'App tiles with live stats'],
            ['patchbay', 'Patch bay'],
          ])}
        </div>
        <p className="settings-note">
          To choose which widgets Home shows, their order and their width, use <strong>Customize</strong> on Home. The board is the same on every device.
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

      <Section title="Service icons">
        <div className="choice-row">
          {seg('icons', [
            ['mono', 'Grayscale'],
            ['color', 'Full color'],
          ])}
        </div>
        <p className="settings-note">Grayscale icons get their color back when you point at them.</p>
      </Section>

      <Portability />
      <Connections />
      <CatalogCheck />
      <Activity />
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
            {audit.discovered.length} running {audit.discovered.length === 1 ? "app isn't" : "apps aren't"} in the catalog. Drafted entries below, with names and
            icons guessed from their images and links from their published ports. Paste them under a group's <code>services:</code> and adjust; the page picks up the
            change on save.
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
        <p className="settings-note">Nothing yet. Every container action, update, board change and sign-in will be listed here, with who did it.</p>
      ) : (
        <ul className="audit">
          {rows.slice(0, 60).map((r) => (
            <li key={r.id}>
              <span className="mono audit-who">{r.who}</span>
              <span>
                {ACTION_TEXT[r.action] ?? r.action}
                {r.target && r.action.startsWith('container.') && (
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
