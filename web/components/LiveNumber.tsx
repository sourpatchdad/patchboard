// The "Live number" part of an app's edit form: pick the app's preset (or any
// JSON API), paste its key once, choose the value, test it. The key goes to
// the server's key store and is referenced as ${secret:APP_NAME}; the browser
// never gets it back.

import { useEffect, useState } from 'react';
import { FORMATS, type FieldFormat, type JsonWidgetConfig } from '../../shared/jsonwidget.ts';
import { PRESETS, presetFor, presetRequest, secretName } from '../../shared/presets.ts';
import { formatValue } from '../board/JsonWidget.tsx';

export interface LiveDraft {
  mode: string;
  base: string;
  key: string;
  valueIdx: number;
  url: string;
  header: string;
  path: string;
  format: FieldFormat;
  label: string;
}

const ACTION = { 'Content-Type': 'application/json', 'X-Patchboard': 'action' };

/** Start from a saved setup, or suggest the app's preset. */
export function liveDraft(app: { name: string; href?: string; container?: string; icon?: string }, cfg?: JsonWidgetConfig): LiveDraft {
  const base = /^https?:\/\//.test(app.href ?? '') ? app.href!.replace(/\/+$/, '') : '';
  const empty: LiveDraft = { mode: '', base, key: '', valueIdx: 0, url: '', header: '', path: '', format: 'number', label: '' };
  if (!cfg) return { ...empty, mode: '' };
  const p = PRESETS.find((x) => x.id === cfg.title);
  const f = cfg.fields[0];
  if (p) {
    const at = cfg.url.indexOf(p.path.split('?')[0]);
    return { ...empty, mode: p.id, base: at > 0 ? cfg.url.slice(0, at) : base, valueIdx: Math.max(0, p.values.findIndex((v) => v.path === f?.path)) };
  }
  const sec = `\${secret:${secretName(app.name)}}`;
  const [h, v] = Object.entries(cfg.headers)[0] ?? [];
  return {
    ...empty,
    mode: 'custom',
    url: cfg.url.replace(sec, '{key}'),
    header: h ? `${h}: ${v.replace(sec, '{key}')}` : '',
    path: f?.path ?? '',
    format: f?.format ?? 'number',
    label: f?.label ?? '',
  };
}

/** The setup to save, or null for none. Throws a plain-words message when incomplete. */
export function liveConfig(appName: string, d: LiveDraft): JsonWidgetConfig | null {
  if (!d.mode) return null;
  const secret = secretName(appName);
  const ref = `\${secret:${secret}}`;
  if (d.mode === 'custom') {
    if (!/^https?:\/\//.test(d.url)) throw new Error('The API address needs to start with http:// or https://');
    if (!d.path.trim()) throw new Error('Say where the number is in the response, like data.count');
    const headers: Record<string, string> = {};
    const i = d.header.indexOf(':');
    if (i > 0) headers[d.header.slice(0, i).trim()] = d.header.slice(i + 1).trim().replace('{key}', ref);
    return { title: 'custom', url: d.url.trim().replace('{key}', ref), headers, interval: 60, fields: [{ label: d.label.trim() || d.path.trim().split('.').pop() || 'value', path: d.path.trim(), format: d.format }] };
  }
  const p = PRESETS.find((x) => x.id === d.mode);
  if (!p) return null;
  if (!/^https?:\/\//.test(d.base)) throw new Error(`Give ${p.name}'s address, like http://192.168.1.10:8096`);
  const v = p.values[d.valueIdx] ?? p.values[0];
  return { title: p.id, ...presetRequest(p, d.base.trim(), secret), interval: 60, fields: [{ label: v.label, path: v.path, format: v.format, scale: v.scale }] };
}

/** Save a typed key. Resolves to an error message, or null. */
export async function saveKey(appName: string, key: string): Promise<string | null> {
  if (!key.trim()) return null;
  const res = await fetch(`/api/secrets/${secretName(appName)}`, { method: 'PUT', headers: ACTION, body: JSON.stringify({ value: key }) });
  return res.ok ? null : (((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
}

export function LiveNumberFields({ app, d, onChange }: { app: { name: string; href?: string; container?: string; icon?: string }; d: LiveDraft; onChange: (d: LiveDraft) => void }) {
  const [hasKey, setHasKey] = useState(false);
  const [test, setTest] = useState<{ text?: string; error?: string; sample?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const suggested = presetFor(app);
  const preset = PRESETS.find((x) => x.id === d.mode);
  const needsKey = d.mode === 'custom' ? /\{key\}/.test(d.url + d.header) : !!preset?.auth;

  useEffect(() => {
    void (async () => {
      try {
        const list = (await (await fetch('/api/secrets')).json()) as { name: string }[];
        setHasKey(list.some((s) => s.name === secretName(app.name)));
      } catch {
        /* unknown; the field won't say "saved" */
      }
    })();
  }, [app.name]);

  const run = async () => {
    setTest(null);
    let cfg: JsonWidgetConfig | null;
    try {
      cfg = liveConfig(app.name, d);
    } catch (e) {
      return setTest({ error: (e as Error).message });
    }
    if (!cfg) return;
    setBusy(true);
    const keyErr = await saveKey(app.name, d.key);
    if (keyErr) {
      setBusy(false);
      return setTest({ error: keyErr });
    }
    if (d.key) {
      setHasKey(true);
      onChange({ ...d, key: '' });
    }
    const res = await fetch('/api/widgets/preview', { method: 'POST', headers: ACTION, body: JSON.stringify(cfg) });
    const body = (await res.json()) as { values?: { value: unknown }[]; error?: string; sample?: string };
    setBusy(false);
    if (!res.ok || body.error) return setTest({ error: body.error ?? `HTTP ${res.status}`, sample: body.sample });
    const value = body.values?.[0]?.value;
    setTest({
      text: value == null ? 'Connected, but nothing at that path' : `${formatValue(value, cfg.fields[0])} ${cfg.fields[0].label}`.trim(),
      sample: d.mode === 'custom' ? body.sample : undefined,
    });
  };

  return (
    <div className="ws-row live-number">
      <span id="live-number-label">Live number on its tile</span>
      <select className="field" aria-labelledby="live-number-label" value={d.mode} onChange={(e) => (setTest(null), onChange({ ...d, mode: e.target.value, valueIdx: 0 }))}>
        <option value="">None: show status and response time</option>
        {suggested && <option value={suggested.id}>{suggested.name} (suggested)</option>}
        {PRESETS.filter((p) => p.id !== suggested?.id).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        <option value="custom">Any JSON API</option>
      </select>

      {preset && (
        <>
          <label>
            <span>{preset.name} address</span>
            <input className="field mono" value={d.base} placeholder="http://192.168.1.10:8096" onChange={(e) => onChange({ ...d, base: e.target.value })} />
          </label>
          <label>
            <span>Show</span>
            <select className="field" value={d.valueIdx} onChange={(e) => onChange({ ...d, valueIdx: Number(e.target.value) })}>
              {preset.values.map((v, i) => (
                <option key={v.path} value={i}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {d.mode === 'custom' && (
        <>
          <label>
            <span>API address that returns JSON. Put {'{key}'} where the key goes, if it goes in the address.</span>
            <input className="field mono" value={d.url} placeholder="http://192.168.1.10/api/stats?token={key}" onChange={(e) => onChange({ ...d, url: e.target.value })} />
          </label>
          <label>
            <span>Header, if the key goes in one</span>
            <input className="field mono" value={d.header} placeholder="X-Api-Key: {key}" onChange={(e) => onChange({ ...d, header: e.target.value })} />
          </label>
          <div className="live-grid">
            <label>
              <span>Where the number is</span>
              <input className="field mono" value={d.path} placeholder="data.count" onChange={(e) => onChange({ ...d, path: e.target.value })} />
            </label>
            <label>
              <span>Shown as</span>
              <select className="field" value={d.format} onChange={(e) => onChange({ ...d, format: e.target.value as FieldFormat })}>
                {FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Followed by <em>optional</em></span>
              <input className="field" value={d.label} placeholder="users" maxLength={40} onChange={(e) => onChange({ ...d, label: e.target.value })} />
            </label>
          </div>
        </>
      )}

      {d.mode && needsKey && (
        <label>
          <span>
            Key{preset?.keyHelp ? `. Where to find it: ${preset.keyHelp}.` : ''}
            {hasKey && !d.key ? ' One is saved; paste a new one to replace it.' : ''}
          </span>
          <input className="field mono" type="password" autoComplete="off" value={d.key} placeholder={hasKey ? '••••••••  saved' : 'Paste it here'} onChange={(e) => onChange({ ...d, key: e.target.value })} />
        </label>
      )}

      {d.mode && (
        <div className="live-test">
          <button type="button" className="button button-quiet" disabled={busy} onClick={() => void run()}>
            {busy ? 'Testing...' : 'Test'}
          </button>
          {test?.text && <span className="ok-text">{test.text}</span>}
          {test?.error && <span className="crit-text">{test.error}</span>}
        </div>
      )}
      {test?.sample && <pre className="jw-sample">{test.sample}</pre>}
    </div>
  );
}
