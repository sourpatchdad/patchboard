// Settings, Connections, Sign-in: off or one password, set here. A reverse
// proxy or OIDC is set in the environment and shows here as locked.

import { useEffect, useState } from 'react';
import { useStore } from '../lib/store.tsx';
import { Section } from './ui.tsx';

interface AuthSettings {
  mode: 'none' | 'password' | 'forward' | 'oidc';
  locked: boolean;
  hookToken?: string | null;
  hosts: string[];
  hostsLocked: boolean;
}

const ABOUT: Record<AuthSettings['mode'], string> = {
  none: 'Anyone who can reach Patchboard can use it. Fine on Tailscale or a firewalled home network.',
  password: 'Patchboard asks for a password. A sign-in lasts 30 days on each device.',
  forward: 'Your reverse proxy signs people in and passes their name along.',
  oidc: 'People sign in through your identity provider.',
};

export function SignIn() {
  const readOnly = !!useStore().snap?.readOnly;
  const [s, setS] = useState<AuthSettings | null>(null);
  const [editing, setEditing] = useState<'on' | 'change' | 'off' | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hosts, setHosts] = useState<string | null>(null);
  const [hostsMsg, setHostsMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/auth/settings')
      .then((r) => r.json())
      .then(setS, () => setS(null));
  }, []);
  if (!s) return null;

  const reset = () => (setEditing(null), setCurrent(''), setNext(''), setAgain(''), setErr(''));
  const save = async (mode: 'none' | 'password') => {
    if (mode === 'password' && next !== again) return setErr("The two passwords don't match.");
    setBusy(true);
    setErr('');
    const res = await fetch('/api/auth/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Patchboard': 'action' },
      body: JSON.stringify({ mode, password: next, current }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(body.error ?? `HTTP ${res.status}`);
    // The session state lives in the shell; a reload picks up the new mode.
    location.reload();
  };

  const saveHosts = async () => {
    setHostsMsg(null);
    const res = await fetch('/api/auth/hosts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Patchboard': 'action' },
      body: JSON.stringify({ hosts: hosts ?? '' }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setHostsMsg({ text: body.error ?? `HTTP ${res.status}`, bad: true });
    setS({ ...s, hosts: body.hosts });
    setHosts(null);
    setHostsMsg({ text: 'Saved.' });
  };

  const hook = s.hookToken ? `${location.origin}/api/hooks/diun?token=${s.hookToken}` : '';
  const pw = (label: string, value: string, set: (v: string) => void, auto: string) => (
    <label className="signin-field">
      <span>{label}</span>
      <input className="field" type="password" autoComplete={auto} value={value} onChange={(e) => set(e.target.value)} />
    </label>
  );

  return (
    <Section title="Sign-in" count={s.mode === 'none' ? 'Off' : s.mode === 'password' ? 'Password' : s.mode === 'forward' ? 'Reverse proxy' : 'OIDC'}>
      <p className="settings-note">
        {ABOUT[s.mode]}
        {s.locked && ' Set in the environment, so it changes there.'}
      </p>

      {!s.locked && !readOnly && !editing && (
        <div className="signin-actions">
          {s.mode === 'none' ? (
            <button type="button" className="button button-quiet" onClick={() => setEditing('on')}>
              Turn on a password
            </button>
          ) : (
            <>
              <button type="button" className="button button-quiet" onClick={() => setEditing('change')}>
                Change password
              </button>
              <button type="button" className="text-button" onClick={() => setEditing('off')}>
                Turn off
              </button>
            </>
          )}
        </div>
      )}

      {editing && (
        <form
          className="signin-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save(editing === 'off' ? 'none' : 'password');
          }}
        >
          {editing !== 'on' && pw('Current password', current, setCurrent, 'current-password')}
          {editing !== 'off' && pw('New password', next, setNext, 'new-password')}
          {editing !== 'off' && pw('Once more', again, setAgain, 'new-password')}
          <div className="signin-actions">
            <button type="submit" className={editing === 'off' ? 'button req-decline' : 'button'} disabled={busy}>
              {editing === 'on' ? 'Turn on' : editing === 'change' ? 'Change password' : 'Turn off sign-in'}
            </button>
            <button type="button" className="text-button" onClick={reset}>
              Cancel
            </button>
            {err && <span className="crit-text">{err}</span>}
          </div>
          {editing !== 'off' && <p className="settings-note">Every other device signs out. Locked out later? Set AUTH=none in the environment and restart.</p>}
        </form>
      )}

      <div className="signin-hosts">
        <label className="signin-field">
          <span>Other names you open Patchboard by, like the domain your reverse proxy serves</span>
          <input
            className="field mono"
            value={hosts ?? s.hosts.join(', ')}
            placeholder="dash.example.com"
            disabled={s.hostsLocked || readOnly}
            onChange={(e) => setHosts(e.target.value)}
          />
        </label>
        {hosts !== null && (
          <button type="button" className="button button-quiet" onClick={() => void saveHosts()}>
            Save
          </button>
        )}
        {hostsMsg && <span className={hostsMsg.bad ? 'crit-text' : 'signin-saved'}>{hostsMsg.text}</span>}
      </div>
      <p className="settings-note">IP addresses and home names like nas.local always work.{s.hostsLocked && ' Set in the environment, so it changes there.'}</p>

      {hook && (
        <p className="settings-note signin-hook">
          Diun's webhook, with its token: <code className="mono">{hook}</code>{' '}
          <button
            type="button"
            className="text-button"
            onClick={() => void navigator.clipboard?.writeText(hook).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </p>
      )}
    </Section>
  );
}
