// Settings, Look: the name in the header and the tab, and the otter beside it.
// Shared by every device, unlike the rest of the Look tab.

import { useState } from 'react';
import { useStore } from '../lib/store.tsx';
import { Section } from './ui.tsx';

/**
 * The name field, saved on Enter or Save. Settings shows it with the otter
 * switch; the first-run welcome shows it on its own.
 */
export function NameForm({ withOtter = false }: { withOtter?: boolean }) {
  const { snap } = useStore();
  const brand = snap?.brand ?? {};
  const [name, setName] = useState<string | null>(null);
  const [err, setErr] = useState('');
  // The box answers at once; the server's copy follows a moment later.
  const [otter, setOtter] = useState<boolean | null>(null);
  if (!snap) return null;
  const readOnly = !!snap.readOnly;

  const save = async (next: { name?: string; otter?: boolean }) => {
    setErr('');
    const res = await fetch('/api/brand', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Patchboard': 'action' },
      body: JSON.stringify({ name: brand.name ?? '', otter: brand.otter === true, ...next }),
    });
    setOtter(null);
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
      {withOtter && (
        <label className="check">
          <input type="checkbox" checked={otter ?? brand.otter === true} disabled={readOnly} onChange={(e) => (setOtter(e.target.checked), void save({ otter: e.target.checked }))} />
          The otter beside it
        </label>
      )}
      {err && <span className="crit-text">{err}</span>}
    </form>
  );
}

export function BrandName() {
  return (
    <Section title="Name" className="span-all">
      <p className="settings-note">What the header and the browser tab call this dashboard, on every device.</p>
      <NameForm withOtter />
    </Section>
  );
}
