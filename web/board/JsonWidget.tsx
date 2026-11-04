// "API numbers": up to four values from any JSON API. The view asks the
// server for its widget by id (never by URL). The editor previews a draft
// configuration through the server before anything is saved.

import { useEffect, useState } from 'react';
import { FORMATS, type FieldFormat, type JsonField, type JsonWidgetConfig, toneFor } from '../../shared/jsonwidget.ts';
import { ago, duration, size } from '../lib/format.ts';

interface Result {
  values: { label: string; value: unknown }[];
  at: number;
  error?: string;
  sample?: string;
}

export function formatValue(v: unknown, f: JsonField): string {
  if (v == null) return 'no value';
  if (f.format === 'text' || typeof v !== 'number') return `${String(v)}${f.suffix ?? ''}`;
  const n = v * (f.scale ?? 1);
  switch (f.format) {
    case 'percent':
      return `${n < 10 ? n.toFixed(1) : Math.round(n)}%`;
    case 'bytes':
      return size(n);
    case 'duration':
      return duration(n * 1000);
    case 'relative':
      return ago(n < 1e12 ? n * 1000 : n);
    default:
      return `${Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : Number.isInteger(n) ? n : n.toFixed(2)}${f.suffix ?? ''}`;
  }
}

export function parseConfig(json?: string): JsonWidgetConfig | null {
  try {
    return json ? (JSON.parse(json) as JsonWidgetConfig) : null;
  } catch {
    return null;
  }
}

/** The widget on the board. Saved widgets only; a draft shows its preview in the editor. */
export function JsonWidgetView({ id, json, saved }: { id: string; json?: string; saved: boolean }) {
  const cfg = parseConfig(json);
  const [r, setR] = useState<Result | null>(null);
  useEffect(() => {
    if (!cfg || !saved) return;
    let gone = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/widgets/${encodeURIComponent(id)}`);
        const body = (await res.json()) as Result & { error?: string };
        if (!gone) setR(res.ok ? body : { values: [], at: Date.now(), error: body.error });
      } catch {
        if (!gone) setR({ values: [], at: Date.now(), error: 'Patchboard did not answer' });
      }
    };
    void load();
    const t = setInterval(load, Math.max(15, cfg.interval) * 1000);
    return () => {
      gone = true;
      clearInterval(t);
    };
  }, [id, json, saved]);
  if (!cfg) return null;

  const tones = cfg.fields.map((f, i) => toneFor(f, r?.values[i]?.value));
  const worst = tones.includes('crit') ? 'crit' : tones.includes('warn') ? 'warn' : 'ok';
  return (
    <section className="section jw" data-tone={r?.error ? 'warn' : worst}>
      <header className="jw-head">
        {cfg.href ? (
          <a href={cfg.href} target="_blank" rel="noreferrer" className="jw-title">
            {cfg.title}
          </a>
        ) : (
          <span className="jw-title">{cfg.title}</span>
        )}
        <span className="jw-at">{!saved ? 'Save the board to start' : r?.error ? r.error : r ? ago(r.at) : '...'}</span>
      </header>
      <div className="jw-values">
        {cfg.fields.map((f, i) => (
          <div className="jw-value" key={f.label + i} data-tone={tones[i]}>
            <span className="jw-num">{r && !r.error ? formatValue(r.values[i]?.value, f) : '...'}</span>
            <span className="jw-label">{f.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const EMPTY_FIELD: JsonField = { label: '', path: '', format: 'number' };

/** Build and test a configuration. Calls onSave with the validated JSON string. */
export function JsonEditor({ initial, onSave, onClose }: { initial: JsonWidgetConfig | null; onSave: (json: string) => void; onClose: () => void }) {
  const [cfg, setCfg] = useState<JsonWidgetConfig>(
    initial ?? { title: '', url: '', headers: {}, interval: 60, fields: [{ ...EMPTY_FIELD }] },
  );
  const [headersText, setHeadersText] = useState(Object.entries(initial?.headers ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n'));
  const [preview, setPreview] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const full = (): JsonWidgetConfig => {
    const headers: Record<string, string> = {};
    for (const line of headersText.split('\n')) {
      const i = line.indexOf(':');
      if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return { ...cfg, headers, fields: cfg.fields.filter((f) => f.label || f.path) };
  };

  const test = async () => {
    setBusy(true);
    setError('');
    const res = await fetch('/api/widgets/preview', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Patchboard': 'action' }, body: JSON.stringify(full()) });
    const body = (await res.json()) as Result & { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? `HTTP ${res.status}`);
      setPreview(null);
    } else setPreview(body);
  };

  const setField = (i: number, patch: Partial<JsonField>) => setCfg((c) => ({ ...c, fields: c.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  const num = (s: string) => (s.trim() === '' ? undefined : Number(s));

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette drawer jw-editor" role="dialog" aria-label="API numbers widget" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <h2>API numbers</h2>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="jw-form">
          <label>
            <span>Title</span>
            <input className="field" value={cfg.title} placeholder="Pi-hole" onChange={(e) => setCfg({ ...cfg, title: e.target.value })} />
          </label>
          <label className="jw-wide">
            <span>URL that returns JSON</span>
            <input className="field mono" value={cfg.url} placeholder="http://192.168.1.10/api/stats" onChange={(e) => setCfg({ ...cfg, url: e.target.value })} />
          </label>
          <label className="jw-wide">
            <span>
              Headers, one per line. Use a key saved in Settings, Keys as <code>{'${secret:NAME}'}</code>, or one from the environment as{' '}
              <code>{'${env:WIDGET_NAME}'}</code>.
            </span>
            <textarea className="field mono" rows={2} value={headersText} placeholder={'X-Api-Key: ${env:WIDGET_PIHOLE_KEY}'} onChange={(e) => setHeadersText(e.target.value)} />
          </label>
          <label>
            <span>Refresh every (seconds)</span>
            <input className="field" type="number" min={15} value={cfg.interval} onChange={(e) => setCfg({ ...cfg, interval: Number(e.target.value) || 60 })} />
          </label>
          <label>
            <span>Clicking the title opens</span>
            <input className="field" value={cfg.href ?? ''} placeholder="http://192.168.1.10/admin" onChange={(e) => setCfg({ ...cfg, href: e.target.value || undefined })} />
          </label>
        </div>

        <h3 className="jw-sub">Values to show</h3>
        <div className="jw-fields">
          <span>Label</span>
          <span>Path</span>
          <span>Format</span>
          <span title="Amber at or past this">Warn at</span>
          <span title="Red at or past this">Red at</span>
          <span />
          {cfg.fields.map((f, i) => (
            <FieldRow key={i} f={f} onChange={(p) => setField(i, p)} onRemove={() => setCfg((c) => ({ ...c, fields: c.fields.filter((_, j) => j !== i) }))} num={num} />
          ))}
        </div>
        {cfg.fields.length < 4 && (
          <button type="button" className="text-button" onClick={() => setCfg((c) => ({ ...c, fields: [...c.fields, { ...EMPTY_FIELD }] }))}>
            Add a value
          </button>
        )}
        <p className="settings-note">
          Paths read into the response with dots: <code>queries.blocked</code>, <code>items[0].count</code>. If red is above amber, higher is worse; if below,
          lower is worse.
        </p>

        <div className="jw-actions">
          <button type="button" className="button button-quiet" disabled={busy} onClick={() => void test()}>
            {busy ? 'Testing...' : 'Test'}
          </button>
          <button type="button" className="button board-save" onClick={() => onSave(JSON.stringify(full()))}>
            Use these settings
          </button>
          {error && <span className="crit-text">{error}</span>}
        </div>

        {preview && (
          <div className="jw-preview">
            <div className="jw-values">
              {full().fields.map((f, i) => (
                <div className="jw-value" key={i} data-tone={toneFor(f, preview.values[i]?.value)}>
                  <span className="jw-num">{preview.error ? '...' : formatValue(preview.values[i]?.value, f)}</span>
                  <span className="jw-label">{f.label || 'unnamed'}</span>
                </div>
              ))}
            </div>
            {preview.error ? <p className="crit-text">{preview.error}</p> : <pre className="jw-sample">{preview.sample}</pre>}
          </div>
        )}
      </div>
    </div>
  );
}

function FieldRow({ f, onChange, onRemove, num }: { f: JsonField; onChange: (p: Partial<JsonField>) => void; onRemove: () => void; num: (s: string) => number | undefined }) {
  return (
    <>
      <input className="field" aria-label="Label" value={f.label} placeholder="Blocked" onChange={(e) => onChange({ label: e.target.value })} />
      <input className="field mono" aria-label="Path" value={f.path} placeholder="queries.blocked" onChange={(e) => onChange({ path: e.target.value })} />
      <select className="field" aria-label="Format" value={f.format} onChange={(e) => onChange({ format: e.target.value as FieldFormat })}>
        {FORMATS.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <input className="field" aria-label="Warn at" inputMode="decimal" value={f.warn ?? ''} onChange={(e) => onChange({ warn: num(e.target.value) })} />
      <input className="field" aria-label="Red at" inputMode="decimal" value={f.crit ?? ''} onChange={(e) => onChange({ crit: num(e.target.value) })} />
      <button type="button" className="cell-btn cell-remove" aria-label="Remove value" onClick={onRemove}>
        ×
      </button>
    </>
  );
}
