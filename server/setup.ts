// Integration settings saved from the UI. Every value is sealed with
// AES-256-GCM before it reaches SQLite (server/vault.ts). The browser can
// write a secret but never read one back. Environment variables win over
// anything saved here.

import { INTEGRATIONS, type Integration } from '../shared/integrations.ts';
import { fieldHint, fieldKind, fieldLabel, fieldsOf, type SetupIntegration, UI_SETUP } from '../shared/setup.ts';
import { envHas, setSavedSettings } from './config.ts';
import { kvGet, kvSet } from './db.ts';
import { seal, unseal } from './vault.ts';

const KV = 'integration-settings';
type Stored = Record<string, { value: string; at: number }>;

/** Saved values, unsealed. */
const read = (): Stored => Object.fromEntries(Object.entries(kvGet<Stored>(KV) ?? {}).map(([k, v]) => [k, { ...v, value: unseal(v.value) }]));
const write = (s: Stored) => kvSet(KV, Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { ...v, value: seal(v.value) }])));

/** Apply what's saved to the live configuration. Call at startup and after each change. */
export function loadSavedSettings(): void {
  setSavedSettings(Object.fromEntries(Object.entries(read()).map(([k, v]) => [k, v.value])));
}

export function setupIntegration(id: string): Integration | undefined {
  return UI_SETUP.has(id) ? INTEGRATIONS.find((i) => i.id === id) : undefined;
}

/** Every integration you can set up here, with each field's state. */
export function describeSetup(): SetupIntegration[] {
  const stored = read();
  return INTEGRATIONS.filter((i) => UI_SETUP.has(i.id)).map((i) => ({
    id: i.id,
    fromUi: fieldsOf(i).some((n) => n in stored && !envHas(n)),
    fields: fieldsOf(i).map((name) => {
      const kind = fieldKind(name);
      const locked = envHas(name);
      const value = stored[name]?.value;
      return {
        name,
        label: fieldLabel(name),
        kind,
        required: i.env.includes(name),
        locked,
        set: locked || value !== undefined,
        ...(kind !== 'secret' && !locked && value !== undefined ? { value } : {}),
        ...(fieldHint(name) ? { hint: fieldHint(name) } : {}),
      };
    }),
  }));
}

/**
 * Check what the browser sent. A string sets a field, null clears it, and an
 * empty string on a secret keeps the saved one (the form never shows it).
 */
export function checkValues(i: Integration, input: unknown): { values: Record<string, string | null> } | { error: string } {
  if (!input || typeof input !== 'object') return { error: 'Expected { values: {...} }' };
  const allowed = new Set(fieldsOf(i));
  const out: Record<string, string | null> = {};
  for (const [name, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!allowed.has(name)) return { error: `${name} isn't a setting of ${i.name}` };
    if (envHas(name)) return { error: `${name} is set in the environment, which wins. Change it there.` };
    if (raw === null) {
      out[name] = null;
      continue;
    }
    if (typeof raw !== 'string') return { error: `${fieldLabel(name)} must be text` };
    const v = raw.trim();
    if (v.length > 2048 || /[\u0000-\u001f]/.test(v)) return { error: `${fieldLabel(name)} is too long or has control characters` };
    if (!v && fieldKind(name) === 'secret') continue;
    if (v && fieldKind(name) === 'url' && !/^(https?|wss?):\/\/[^\s/]+/i.test(v)) return { error: `${fieldLabel(name)} must start with http:// or https://` };
    if (v && fieldKind(name) === 'flag' && v !== '1' && v !== '0') return { error: `${fieldLabel(name)} is on (1) or off (0)` };
    out[name] = v || null;
  }
  return { values: out };
}

/** Saved values merged with candidates, as config sees them. Secrets left blank keep their saved value. */
export function candidate(values: Record<string, string | null>): Record<string, string> {
  const merged: Record<string, string> = Object.fromEntries(Object.entries(read()).map(([k, v]) => [k, v.value]));
  for (const [k, v] of Object.entries(values)) {
    if (v === null) delete merged[k];
    else merged[k] = v;
  }
  return merged;
}

/** Fields still missing once these values are in. */
export function missing(i: Integration, values: Record<string, string | null>): string[] {
  const merged = candidate(values);
  return i.env.filter((n) => !envHas(n) && !merged[n]);
}

export function saveValues(values: Record<string, string | null>): void {
  const s = read();
  const at = Date.now();
  for (const [k, v] of Object.entries(values)) {
    if (v === null) delete s[k];
    else s[k] = { value: v, at };
  }
  write(s);
  loadSavedSettings();
}

/** Forget everything saved for one integration. */
export function clearIntegration(i: Integration): void {
  const s = read();
  for (const n of fieldsOf(i)) delete s[n];
  write(s);
  loadSavedSettings();
}
