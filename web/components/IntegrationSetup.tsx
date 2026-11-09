// Set up an integration from Settings: fill in the address and key, test the
// connection, save. Keys go to the server and never come back; a saved one
// shows as "Saved" with a blank field to replace it. Anything set in the
// environment shows as locked, because the environment wins.

import { HoldButton } from './Hold.tsx';
import { useEffect, useState } from 'react';
import type { Integration } from '../../shared/integrations.ts';
import { CHOICES, type SetupIntegration } from '../../shared/setup.ts';

async function call(url: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Patchboard': 'action' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((json.error as string) ?? `HTTP ${res.status}`);
  return json;
}

export function IntegrationForm({
  integration,
  setup,
  demo,
  readOnly,
  onSaved,
  onClose,
  result,
  setResult,
}: {
  integration: Integration;
  setup: SetupIntegration;
  demo: boolean;
  readOnly: boolean;
  onSaved: (all: SetupIntegration[]) => void;
  onClose: () => void;
  /** Kept by the list, so the message survives the row moving when it turns on. */
  result: { ok: boolean; text: string } | null;
  setResult: (r: { ok: boolean; text: string } | null) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(setup.fields.filter((f) => !f.locked && f.kind !== 'secret').map((f) => [f.name, f.value ?? ''])),
  );
  // After a save, show what the server now holds in any field you haven't touched.
  useEffect(() => {
    setValues((prev) => {
      const next = { ...prev };
      for (const f of setup.fields) if (!f.locked && f.kind !== 'secret' && !prev[f.name]) next[f.name] = f.value ?? '';
      return next;
    });
  }, [setup]);
  const [busy, setBusy] = useState<'test' | 'save' | 'remove' | null>(null);

  // Only fields you can edit, and secrets only when typed in, go to the server.
  const payload = () => Object.fromEntries(setup.fields.filter((f) => !f.locked && (f.kind !== 'secret' || values[f.name])).map((f) => [f.name, values[f.name] ?? '']));

  async function test() {
    setBusy('test');
    setResult(null);
    try {
      const r = await call(`/api/setup/integrations/${integration.id}/test`, 'POST', { values: payload() });
      setResult(r.ok ? { ok: true, text: String(r.summary ?? 'Connected.') } : { ok: false, text: String(r.error ?? 'It did not connect.') });
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy('save');
    setResult(null);
    try {
      const r = await call(`/api/setup/integrations/${integration.id}`, 'PUT', { values: payload() });
      onSaved(r.integrations as SetupIntegration[]);
      setValues((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => setup.fields.find((f) => f.name === k)?.kind !== 'secret')));
      setResult({ ok: true, text: 'Saved. Patchboard connects now; the status above updates within a few seconds.' });
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy('remove');
    try {
      const r = await call(`/api/setup/integrations/${integration.id}`, 'DELETE');
      onSaved(r.integrations as SetupIntegration[]);
      onClose();
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message });
      setBusy(null);
    }
  }

  const editable = setup.fields.some((f) => !f.locked);
  const disabled = readOnly || demo;

  return (
    <form
      className="setup-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {setup.fields.map((f, idx) => (
        <label key={f.name} className="setup-field">
          <span>
            {f.label}
            {!f.required && <em> optional</em>}
          </span>
          {f.locked ? (
            <span className="setup-locked">
              {f.savedToo ? `Saved here too. You can remove ${f.name} from your .env.` : `Set in the environment (${f.name})`}
            </span>
          ) : f.kind === 'flag' ? (
            <select className="field" value={values[f.name] || '0'} disabled={readOnly} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
              <option value="0">No</option>
              <option value="1">Yes</option>
            </select>
          ) : f.kind === 'choice' ? (
            <select className="field" value={values[f.name] || CHOICES[f.name][0][0]} disabled={readOnly} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
              {CHOICES[f.name].map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="field"
              // Opening setup lands on the first thing to fill in.
              autoFocus={idx === setup.fields.findIndex((x) => !x.locked)}
              aria-describedby={`${setup.id}-${f.name}-env`}
              type={f.kind === 'secret' ? 'password' : f.kind === 'url' ? 'url' : 'text'}
              autoComplete={f.kind === 'secret' ? 'new-password' : 'off'}
              spellCheck={false}
              disabled={readOnly}
              placeholder={f.kind === 'secret' ? (f.set ? 'Saved. Type to replace it.' : 'Paste it here') : (f.hint ?? (f.kind === 'url' ? 'For example http://192.168.1.10:port' : ''))}
              value={values[f.name] ?? ''}
              onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
            />
          )}
          <code className="setup-name" id={`${setup.id}-${f.name}-env`}>{f.name}</code>
        </label>
      ))}
      {integration.where && <p className="settings-note">{integration.where}</p>}
      {result && (
        <p key={result.text} className={`setup-result ${result.ok ? 'ok-text is-ok' : 'crit-text is-bad'}`}>
          {result.ok && (
            <svg className="check-draw" viewBox="0 0 16 16" width="15" height="15" aria-hidden>
              <path d="M3 8.5l3.2 3L13 4.5" />
            </svg>
          )}
          {result.text}
        </p>
      )}
      {demo && <p className="settings-note">Demo mode: Test works, Save doesn't.</p>}
      <div className="setup-actions">
        <button type="button" className="button button-quiet" disabled={!!busy || readOnly} onClick={() => void test()}>
          {busy === 'test' ? 'Testing' : 'Test connection'}
        </button>
        {editable && (
          <button type="submit" className="button" disabled={!!busy || disabled}>
            {busy === 'save' ? 'Saving' : 'Save'}
          </button>
        )}
        <button type="button" className="text-button" onClick={onClose}>
          Cancel
        </button>
        {setup.fromUi && !disabled && (
          <span className="setup-remove">
            <HoldButton className="text-button" danger hint="Hold to remove" onConfirm={() => void remove()}>
              Remove
            </HoldButton>
          </span>
        )}
      </div>
    </form>
  );
}
