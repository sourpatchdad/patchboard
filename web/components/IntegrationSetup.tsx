// Set up an integration from Settings: fill in the address and key, test the
// connection, save. Keys go to the server and never come back; a saved one
// shows as "Saved" with a blank field to replace it. Anything set in the
// environment shows as locked, because the environment wins.

import { PlacePicker } from './FirstRun.tsx';
import { HoldButton } from './Hold.tsx';
import { useEffect, useState } from 'react';
import type { Integration } from '../../shared/integrations.ts';
import { CHOICES, type SetupIntegration } from '../../shared/setup.ts';
import { DEFAULT_ON } from '../../shared/setup.ts';
import { t as tr } from '../lib/i18n.ts';
import { sourceOf } from '../../shared/feeds.ts';
import type { Snapshot } from '../../shared/types.ts';
import { integrationOf } from '../lib/connect.ts';
import { useStore } from '../lib/store.tsx';

/**
 * Where this service already runs, from the app on Apps that stands for it:
 * the address its link opens. Set up from Docker's published port when
 * Patchboard found the app, so the address field arrives filled in.
 */
export function foundAt(integration: Integration, snap: Snapshot | null): { name: string; url: string } | null {
  for (const s of snap?.catalog.groups.flatMap((g) => g.services) ?? []) {
    const i = integrationOf(s);
    if (!i || sourceOf(i.id) !== sourceOf(integration.id) || !s.href) continue;
    try {
      const u = new URL(s.href);
      if (u.protocol === 'http:' || u.protocol === 'https:') return { name: s.name, url: u.origin };
    } catch {
      // Not an address: nothing to offer.
    }
  }
  return null;
}

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
  const { snap } = useStore();
  // Not set up yet and running here: its address is already known.
  const found = !setup.fields.some((f) => f.set || f.value) ? foundAt(integration, snap) : null;
  const urlField = setup.fields.find((f) => f.kind === 'url' && !f.locked)?.name;
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(setup.fields.filter((f) => !f.locked && f.kind !== 'secret').map((f) => [f.name, f.value || (found && f.name === urlField ? found.url : '')])),
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
      setResult(r.ok ? { ok: true, text: String(r.summary ?? tr('Connected.')) } : { ok: false, text: String(r.error ?? tr("Couldn't connect. Check the address and key.")) });
      // Something missing: focus the first empty field; otherwise back on Test.
      requestAnimationFrame(() => {
        const empty = !r.ok && String(r.error ?? '').startsWith('Fill in') ? [...document.querySelectorAll<HTMLInputElement>(`#int-${integration.id} .setup-field input:not([disabled])`)].find((x) => !x.value) : undefined;
        (empty ?? document.querySelector<HTMLElement>(`#int-${integration.id} .setup-test`))?.focus();
      });
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
      const check = r.check as { ok: boolean; text: string } | undefined;
      setResult(
        !check
          ? { ok: true, text: tr('Saved.') }
          : check.ok
            ? { ok: true, text: tr('Saved and connected. {summary}', { summary: check.text }) }
            : { ok: false, text: tr('Saved, but it doesn’t connect yet: {error}', { error: check.text }) },
      );
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
  const missing = (f: (typeof setup.fields)[number]) => !!result && !result.ok && result.text.startsWith('Fill in') && !!f.required && !values[f.name] && !f.set;
  const disabled = readOnly || demo;

  return (
    <form
      className="setup-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void save();
      }}
    >
      {/* Weather: find the town by name; the coordinates below fill in. */}
      {integration.id === 'weather' && !readOnly && (
        <div className="setup-field">
          <span>{tr('Find your town')}</span>
          <PlacePicker
            place={null}
            onPlace={(p) => p && setValues({ ...values, WEATHER_LAT: String(p.lat), WEATHER_LON: String(p.lon), WEATHER_LABEL: p.name })}
          />
        </div>
      )}
      {setup.fields.map((f, idx) => (
        <label key={f.name} className="setup-field">
          <span>
            {tr(f.label)}
            {!f.required && <em> {tr('optional')}</em>}
          </span>
          {f.locked ? (
            <span className="setup-locked">
              {f.savedToo ? tr('Saved here too. You can remove {name} from your .env.', { name: f.name }) : tr('Set in the environment ({name})', { name: f.name })}
            </span>
          ) : f.kind === 'flag' ? (
            <select className="field" value={values[f.name] || (DEFAULT_ON.has(f.name) ? '1' : '0')} disabled={readOnly} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
              <option value="0">{tr('No')}</option>
              <option value="1">{tr('Yes')}</option>
            </select>
          ) : f.kind === 'choice' ? (
            <select className="field" value={values[f.name] || CHOICES[f.name][0][0]} disabled={readOnly} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
              {CHOICES[f.name].map(([v, label]) => (
                <option key={v} value={v}>
                  {tr(label)}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="field"
              // Opening setup lands on the first thing to fill in.
              autoFocus={idx === setup.fields.findIndex((x) => !x.locked)}
              aria-describedby={missing(f) ? `${setup.id}-result ${setup.id}-${f.name}-env` : `${setup.id}-${f.name}-env`}
              // Marked when a test or save asked for it and it's still empty: required fields only.
              aria-invalid={missing(f) || undefined}
              type={f.kind === 'secret' ? 'password' : f.kind === 'url' ? 'url' : 'text'}
              autoComplete={f.kind === 'secret' ? 'new-password' : 'off'}
              spellCheck={false}
              title={f.name}
              disabled={readOnly}
              placeholder={f.kind === 'secret' ? (f.set ? tr('Saved. Type to replace it.') : tr('Paste it here')) : (f.hint ?? (f.kind === 'url' ? tr('For example {address}', { address: 'http://192.168.1.10:port' }) : ''))}
              value={values[f.name] ?? ''}
              onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
            />
          )}
          {/* The variable behind it, for whoever sets it in the environment: read out, not a label under every field. */}
          <code className="setup-name sr-only" id={`${setup.id}-${f.name}-env`}>{f.name}</code>
          {found && f.name === urlField && values[f.name] === found.url && <small className="setup-found">{tr('Found {name} running here.', { name: found.name })}</small>}
        </label>
      ))}
      {/* Right under the fields it's about; a problem is announced at once. */}
      {result && (
        <p key={result.text} id={`${setup.id}-result`} role={result.ok ? 'status' : 'alert'} className={`setup-result ${result.ok ? 'ok-text is-ok' : 'crit-text is-bad'}`}>
          {result.ok && (
            <svg className="check-draw" viewBox="0 0 16 16" width="15" height="15" aria-hidden>
              <path d="M3 8.5l3.2 3L13 4.5" />
            </svg>
          )}
          {result.text}
        </p>
      )}
      {integration.where && <p className="settings-note">{integration.where}</p>}
      {demo && <p className="settings-note">{tr('Demo mode: Test checks the fields are filled in. Nothing connects or saves.')}</p>}
      <div className="setup-actions">
        <button type="button" className="button button-quiet setup-test" disabled={readOnly} aria-disabled={!!busy || undefined} onClick={() => !busy && void test()}>
          {busy === 'test' ? tr('Testing...') : tr('Test connection')}
        </button>
        {editable && (
          <button type="submit" className="button board-save" disabled={disabled} aria-disabled={!!busy || undefined}>
            {busy === 'save' ? tr('Saving...') : tr('Save')}
          </button>
        )}
        <button type="button" className="text-button" onClick={onClose}>
          {tr('Cancel')}
        </button>
        {setup.fromUi && !disabled && (
          <span className="setup-remove">
            <HoldButton className="text-button" danger hint={tr('Hold to remove')} onConfirm={() => void remove()}>
              {tr('Remove')}
            </HoldButton>
          </span>
        )}
      </div>
    </form>
  );
}
