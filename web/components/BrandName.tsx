// Settings, Look: the name in the header and the tab.
// Shared by every device, unlike the rest of the Look tab.

import { useState } from 'react';
import { useStore } from '../lib/store.tsx';
import { Section } from './ui.tsx';

/** The dashboard name, saved on Enter or Save. */
export function NameForm() {
  const { snap } = useStore();
  const brand = snap?.brand ?? {};
  const [name, setName] = useState<string | null>(null);
  const [err, setErr] = useState('');
  if (!snap) return null;
  const readOnly = !!snap.readOnly;

  const save = async (next: { name?: string }) => {
    setErr('');
    const res = await fetch('/api/brand', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Patchboard': 'action' },
      body: JSON.stringify({ name: brand.name ?? '', ...next }),
    });
    if (!res.ok) return setErr(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
    setName(null);
  };

  return (
    <form
      className="brand-row"
      onSubmit={(e) => {
        e.preventDefault();
        void save({ name: name ?? '' });
      }}
    >
      <input
        className="field"
        value={name ?? brand.name ?? ''}
        placeholder="Patchboard"
        maxLength={40}
        aria-label="Name"
        disabled={readOnly}
        onChange={(e) => setName(e.target.value)}
      />
      {name !== null && (
        <button type="submit" className="button button-quiet">
          Save
        </button>
      )}
      {err && <span className="crit-text">{err}</span>}
    </form>
  );
}

export function BrandName() {
  return (
    <Section title="Name" className="span-all">
      <p className="settings-note">What the header and the browser tab call this dashboard, on every device.</p>
      <NameForm />
    </Section>
  );
}
