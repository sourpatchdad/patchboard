// Shown when the server asks for sign-in. Password mode gets a form; forward
// mode means the reverse proxy should have signed you in, so it says so.

import { useState } from 'react';

export function SignIn({ mode }: { mode: 'password' | 'forward' }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
