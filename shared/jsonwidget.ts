// The JSON widget's configuration, shared by server and browser. A widget
// calls one HTTP endpoint that returns JSON and shows up to four values from
// it, each with an optional threshold that turns it amber or red.
//
// No secrets live here: header values and the URL may reference environment
// variables as ${env:WIDGET_NAME} (only WIDGET_ names, so a board edit can't
// reach Patchboard's own keys) or keys saved in the UI as ${secret:NAME}
// (${secret64:NAME} sends it base64-encoded, for Basic auth). All resolve only
// on the server.

export type FieldFormat = 'number' | 'percent' | 'bytes' | 'duration' | 'relative' | 'text';

export interface JsonField {
  label: string;
  /** Dot path into the response: "data.users.active", "items.0.name", "items[0].name". */
  path: string;
  format: FieldFormat;
  /** Thresholds. If crit > warn, higher is worse; if crit < warn, lower is worse. */
  warn?: number;
  crit?: number;
  /** Multiply before display, e.g. 100 to show a 0..1 ratio as percent. */
  scale?: number;
  suffix?: string;
}

export interface JsonWidgetConfig {
  title: string;
  url: string;
  headers: Record<string, string>;
  /** Seconds between fetches. */
  interval: number;
  fields: JsonField[];
  /** Where clicking the title goes. */
  href?: string;
}

export const FORMATS: FieldFormat[] = ['number', 'percent', 'bytes', 'duration', 'relative', 'text'];
export const ENV_REF = /\$\{env:([A-Z0-9_]+)\}/g;
export const SECRET_REF = /\$\{secret(64)?:([A-Z0-9_]{1,40})\}/g;
const ANY_REF = /\$\{([a-z0-9]+):/g;
const badRef = (s: string) => [...s.matchAll(ANY_REF)].map((m) => m[1]).find((k) => !['env', 'secret', 'secret64'].includes(k));

const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** A clean config from untrusted input, or an error. */
export function validateJsonConfig(input: unknown): { config: JsonWidgetConfig } | { error: string } {
  const c = input as Partial<JsonWidgetConfig> | null;
  if (!c || typeof c !== 'object') return { error: 'Expected an object' };
  const url = str(c.url, 500);
  if (!url || !/^https?:\/\/[^\s]+$/i.test(url)) return { error: 'URL must start with http:// or https://' };
  for (const m of url.matchAll(ENV_REF)) if (!m[1].startsWith('WIDGET_')) return { error: `Only WIDGET_* variables can be used, not ${m[1]}` };
  if (badRef(url)) return { error: `Unknown reference \${${badRef(url)}:...}` };
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries((c.headers as Record<string, unknown>) ?? {}).slice(0, 10)) {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(k) || typeof v !== 'string' || v.length > 1000) return { error: `Bad header ${k}` };
    for (const m of v.matchAll(ENV_REF)) if (!m[1].startsWith('WIDGET_')) return { error: `Only WIDGET_* variables can be used, not ${m[1]}` };
    if (badRef(v)) return { error: `Unknown reference \${${badRef(v)}:...}` };
    headers[k] = v;
  }
  const fields: JsonField[] = [];
  for (const f of (Array.isArray(c.fields) ? c.fields : []).slice(0, 4) as Partial<JsonField>[]) {
    const label = str(f?.label, 40);
    const path = str(f?.path, 200);
    if (!label || !path) return { error: 'Each value needs a label and a path' };
    const format = FORMATS.includes(f.format as FieldFormat) ? (f.format as FieldFormat) : 'number';
    fields.push({ label, path, format, warn: num(f.warn), crit: num(f.crit), scale: num(f.scale), suffix: str(f.suffix, 12) });
  }
  if (!fields.length) return { error: 'Add at least one value to show' };
  const interval = Math.min(Math.max(num(c.interval) ?? 60, 15), 86_400);
  const title = str(c.title, 60)?.trim() || 'API';
  const href = str(c.href, 500);
  return { config: { title, url, headers, interval, fields, href: href && /^https?:\/\//.test(href) ? href : undefined } };
}

/** Read a dot path such as "data.items[0].count" out of parsed JSON. */
export function readPath(data: unknown, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur: unknown = data;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export type Tone = 'ok' | 'warn' | 'crit';

export function toneFor(f: JsonField, value: unknown): Tone {
  const n = typeof value === 'number' ? value * (f.scale ?? 1) : NaN;
  if (Number.isNaN(n) || (f.warn == null && f.crit == null)) return 'ok';
  const higherWorse = f.crit != null && f.warn != null ? f.crit >= f.warn : true;
  const past = (t?: number) => t != null && (higherWorse ? n >= t : n <= t);
  return past(f.crit) ? 'crit' : past(f.warn) ? 'warn' : 'ok';
}
