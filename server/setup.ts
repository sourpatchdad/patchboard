// Integration settings saved from the UI. Every value is sealed with
// AES-256-GCM before it reaches SQLite (server/vault.ts). The browser can
// write a secret but never read one back. Environment variables win over
// anything saved here.

import { INTEGRATIONS, type Integration } from '../shared/integrations.ts';
import { fieldHint, fieldKind, fieldLabel, fieldsOf, type SetupIntegration, UI_SETUP, CHOICES, THRESHOLDS, type ThresholdState } from '../shared/setup.ts';
import { envHas, envValue, setSavedSettings } from './config.ts';
import { kvGet, kvSet } from './db.ts';
import { seal, unsealOr } from './vault.ts';

const KV = 'integration-settings';
type Stored = Record<string, { value: string; at: number }>;

/**
 * Saved values, unsealed. One no key can open (a new PATCHBOARD_SECRET_KEY
 * with secret.key gone) is left out with a warning instead of stopping
 * Patchboard; values that opened with the old key are sealed again.
 */
function read(): Stored {
  const out: Stored = {};
  let reseal = false;
  for (const [k, v] of Object.entries(kvGet<Stored>(KV) ?? {})) {
    const r = unsealOr(v.value);
    if (!r) {
      console.warn(`settings: ${k} can't be read with this secret key; set it again in Settings`);
      continue;
    }
    if (r.stale) reseal = true;
    out[k] = { ...v, value: r.value };
  }
  if (reseal) write(out);
  return out;
}
function write(s: Stored): void {
  kvSet(KV, Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { ...v, value: seal(v.value) }])));
}

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
        // Locked, and Patchboard has the same value: the .env line can go.
        ...(locked && value !== undefined && value === envValue(name) ? { savedToo: true } : {}),
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
    if (v && name === 'DISCORD_WEBHOOK' && !/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(v)) {
      return { error: "That isn't a Discord webhook address. In the channel's settings: Integrations, Webhooks, Copy Webhook URL." };
    }
    if (v && fieldKind(name) === 'flag' && v !== '1' && v !== '0') return { error: `${fieldLabel(name)} is on (1) or off (0)` };
    if (v && fieldKind(name) === 'choice' && !CHOICES[name]!.some(([c]) => c === v)) return { error: `${fieldLabel(name)} is one of: ${CHOICES[name].map(([c]) => c).join(', ')}` };
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

/**
 * Copy every integration value set in the environment into the encrypted
 * store, so the .env lines can go. Values move server side only; nothing
 * reaches a browser. Returns the variable names copied.
 */
export function adoptEnvironment(): string[] {
  const s = read();
  const at = Date.now();
  const copied: string[] = [];
  for (const i of INTEGRATIONS.filter((x) => UI_SETUP.has(x.id))) {
    for (const n of fieldsOf(i)) {
      const v = envValue(n);
      if (v === undefined || s[n]?.value === v) continue;
      s[n] = { value: v, at };
      copied.push(n);
    }
  }
  if (copied.length) write(s);
  loadSavedSettings();
  return copied;
}

/** Each threshold with the value in effect. */
export function describeThresholds(): ThresholdState[] {
  const stored = read();
  return THRESHOLDS.map((t) => {
    const locked = envHas(t.name);
    const saved = stored[t.name]?.value;
    return { name: t.name, value: (locked ? envValue(t.name) : saved) ?? t.default, locked, saved: !locked && saved !== undefined };
  });
}

/** Check and save thresholds. An empty value goes back to the default. */
export function saveThresholds(input: unknown): { error: string } | { ok: true } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Expected a map of settings' };
  const values: Record<string, string | null> = {};
  for (const [name, raw] of Object.entries(input as Record<string, unknown>)) {
    const t = THRESHOLDS.find((x) => x.name === name);
    if (!t) return { error: `${name} isn't an alert setting` };
    if (envHas(name)) return { error: `${t.label} is set in the environment, which wins. Change it there.` };
    const v = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw);
    if (!v || v === t.default) {
      values[name] = null;
      continue;
    }
    if (t.kind === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n) || (t.min != null && n < t.min) || (t.max != null && n > t.max)) return { error: `${t.label} must be between ${t.min} and ${t.max}` };
      values[name] = String(n);
    } else {
      const list = v.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
      if (list.length > 50 || !list.every((d) => /^[a-z0-9.-]{1,253}$/.test(d))) return { error: 'Domains are names like example.com, comma-separated' };
      values[name] = list.join(',');
    }
  }
  const merged = { ...Object.fromEntries(describeThresholds().map((t) => [t.name, t.value])), ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v ?? THRESHOLDS.find((t) => t.name === k)!.default])) };
  if (Number(merged.POOL_CRIT_PCT) <= Number(merged.POOL_WARN_PCT)) return { error: 'The storage alarm must be higher than the warning' };
  if (Number(merged.DISK_CRIT_C) <= Number(merged.DISK_WARN_C)) return { error: 'The drive alarm must be higher than the warning' };
  saveValues(values);
  return { ok: true };
}

/** Forget everything saved for one integration. */
export function clearIntegration(i: Integration): void {
  const s = read();
  for (const n of fieldsOf(i)) delete s[n];
  write(s);
  loadSavedSettings();
}
