// Shown when the server asks for sign-in. Password mode gets a form; OIDC a
// button to the provider; forward mode means the reverse proxy should have
// signed you in, so it says so.

import { useEffect, useState } from 'react';

export function SignIn({ mode }: { mode: 'password' | 'forward' | 'oidc' }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(() => new URLSearchParams(location.search).get('signin_error') ?? '');
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState('your identity provider');
  useEffect(() => {
    if (mode !== 'oidc') return;
    void (async () => {
      const s = (await (await fetch('/api/session')).json()) as { provider?: string };
      if (s.provider) setProvider(s.provider);
    })();
  }, [mode]);

  if (mode === 'oidc') {
    return (
      <div className="signin">
        <h1 className="page-title">Patchboard</h1>
        <p className="page-lede">Sign in to see your server.</p>
        <a className="button board-save" href="/api/oidc/login">
          Sign in with {provider}
        </a>
        {error && <p className="crit-text">{error}</p>}
      </div>
    );
  }

  if (mode === 'forward') {
    return (
      <div className="signin">
        <h1 className="page-title">Sign in through your proxy</h1>
        <p className="page-lede">
          Patchboard expects your reverse proxy (Authelia, Authentik, Cloudflare Access or similar) to sign you in and pass your name along. This request
          arrived without it. Open Patchboard through the proxy's address.
        </p>
      </div>
    );
  }

  return (
    <form
      className="signin"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Patchboard': 'action' }, body: JSON.stringify({ password }) });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setBusy(false);
        if (res.ok) location.reload();
        else setError(body.error ?? 'Sign-in failed.');
      }}
    >
      <h1 className="page-title">Patchboard</h1>
      <p className="page-lede">Sign in to see your server.</p>
      <label className="signin-field">
        <span>Password</span>
        <input className="field" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <button type="submit" className="button board-save" disabled={busy || !password}>
        {busy ? 'Signing in...' : 'Sign in'}
      </button>
      {error && <p className="crit-text">{error}</p>}
    </form>
  );
}
