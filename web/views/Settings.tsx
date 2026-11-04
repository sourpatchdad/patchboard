// Appearance, per device. Themes are token sets in styles.css; adding one
// means a block of variables there and an entry in THEMES.

import { useEffect, useState } from 'react';
import { Section } from '../components/ui.tsx';
import { ACCENTS, type Appearance, setAppearance, THEMES, useAppearance } from '../lib/appearance.ts';

export function Settings() {
  const a = useAppearance();
  const seg = <K extends keyof Appearance>(key: K, options: [Appearance[K], string][]) => (
    <div className="seg" role="group">
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" aria-pressed={a[key] === v} onClick={() => setAppearance({ [key]: v } as Partial<Appearance>)}>
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
      <p className="page-lede">Connections are shared by every device. Appearance is saved on this device, so the phone and the desktop can differ.</p>

      <Connections />

      <Section title="Theme">
        <div className="choice-row">
          {THEMES.map((t) => (
            <button key={t.id} type="button" className="theme-card" aria-pressed={a.theme === t.id} onClick={() => setAppearance({ theme: t.id })}>
              <span className="theme-preview" style={{ background: t.swatch[0] }} aria-hidden>
                {t.swatch.slice(1).map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </span>
              <strong>{t.name}</strong>
              <span>{t.note}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Mode">
        <div className="choice-row">
          {seg('scheme', [
            ['auto', 'Match the system'],
            ['dark', 'Dark'],
            ['light', 'Light'],
          ])}
        </div>
      </Section>

      <Section title="Accent">
        <div className="choice-row">
          {ACCENTS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="swatch"
              style={{ background: c.color }}
              aria-pressed={a.accent === c.id}
              aria-label={c.name}
              title={c.name}
              onClick={() => setAppearance({ accent: c.id })}
            />
          ))}
        </div>
        <p className="settings-note">Used for links, the current page, focus and the heat squares. Problems keep their own amber and red.</p>
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
    </div>
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
  const [s, setS] = useState<TraktStatus | null>(null);
  const [err, setErr] = useState('');
  const load = async () => setS((await (await fetch('/api/trakt')).json()) as TraktStatus);

  useEffect(() => {
    void load();
  }, []);
  // While a code is waiting, check every few seconds for the hand-off.
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
              <span className="ledger-aside">Add TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET to the environment to connect.</span>
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
                {s.canConnect && (
                  <button type="button" className="text-button" onClick={() => void disconnect()}>
                    Disconnect
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="ledger-aside">Not connected.</span>
                {s.canConnect && (
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


