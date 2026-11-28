// A widget's options: its name, width, items, look and what it shows. One
// form, used where a widget is added (the gallery) and where it's edited
// (Arrange board), each beside a live preview of the widget it changes.

import { Link } from 'react-router-dom';
import { NUMBERS, spanOf, viewsOf, WIDGET_INFO, type Widget } from '../../shared/board.ts';
import { HA_WIDGETS } from '../../shared/ha.ts';
import type { FrigateData } from '../../shared/types.ts';
import { useAppearance } from '../lib/appearance.ts';
import { t, tx } from '../lib/i18n.ts';
import { containerMap } from '../lib/services.ts';
import { useStore } from '../lib/store.tsx';
import { HaPicker } from './HomeWidgets.tsx';

/** Width on the board, in columns: "1", "2", or "Full" for every column. */
export const spanLabel = (n: number, cols: number) => (n >= cols ? t('Full width') : String(n));

export function PickField({ label, hint, names, value, onChange }: { label: string; hint?: string; names: string[]; value: string; onChange: (v: string) => void }) {
  const picked = value.split('\n').map((x) => x.trim()).filter(Boolean);
  const all = [...names, ...picked.filter((p) => !names.includes(p))];
  const toggle = (n: string, on: boolean) => onChange((on ? [...picked, n] : picked.filter((p) => p !== n)).join('\n'));
  return (
    <fieldset className="ws-pick">
      <legend>{label}</legend>
      {all.length === 0 ? (
        <p className="ws-hint">{t('Nothing to pick from yet.')}</p>
      ) : (
        <div className="ws-pick-list">
          {all.map((n) => (
            <label key={n} className="check">
              <input type="checkbox" checked={picked.includes(n)} onChange={(e) => toggle(n, e.target.checked)} />
              {n}
              {!names.includes(n) && <small className="ws-hint"> {t('(not found)')}</small>}
            </label>
          ))}
        </div>
      )}
      {hint && <small className="ws-hint">{hint}</small>}
    </fieldset>
  );
}

export function WidgetOptions({
  w,
  columns,
  fitShows,
  where = true,
  onChange,
  onSpan,
  onColumn,
}: {
  w: Widget;
  columns: number;
  /** Fit the window is showing fewer than the setting right now. */
  fitShows?: number;
  /** Offer Column: on a board being arranged, not while adding. */
  where?: boolean;
  onChange: (cfg: Record<string, string> | undefined) => void;
  onSpan: (n: number) => void;
  onColumn?: (n: number | undefined) => void;
}) {
  const { snap } = useStore();
  const info = WIDGET_INFO[w.type];
  const o = info.options;
  const cfg = w.config ?? {};
  // Apps: the look in effect, this widget's own or the Settings default it follows.
  const { homeApps } = useAppearance();
  const appsLook = cfg.style || homeApps;
  const limitN = Number(cfg.limit);
  const badLimit = !!o.limit && !!cfg.limit && !(Number.isInteger(limitN) && limitN >= o.limit[1] && limitN <= o.limit[2]);
  const set = (k: string, v: string) => {
    const next = { ...cfg, [k]: v };
    if (!v) delete next[k];
    onChange(Object.keys(next).length ? next : undefined);
  };
  const containers = [...containerMap(snap ?? null).values()].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="ws-form">
      {w.type === 'container' && (
        <label>
          <span>{t('Container')}</span>
          <select className="field" value={cfg.container ?? ''} onChange={(e) => set('container', e.target.value)}>
            {!cfg.container && <option value="">{t('Pick one')}</option>}
            {containers.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {o.title !== false && (
        <label>
          <span>{t('Name')}</span>
          <input className="field" value={cfg.title ?? ''} maxLength={40} placeholder={info.name} onChange={(e) => set('title', e.target.value)} />
        </label>
      )}
      <div className="ws-row">
        <span>{t('Width')}</span>
        <span className="seg" role="group" aria-label={t('Width')}>
          {Array.from({ length: columns }, (_, k) => k + 1).map((n) => (
            <button key={n} type="button" aria-pressed={spanOf(w, columns) === n} aria-label={n === columns ? t('Full width') : t('{n} of {total} columns wide', { n: String(n), total: String(columns) })} onClick={() => onSpan(n)}>
              {spanLabel(n, columns)}
            </button>
          ))}
        </span>
      </div>
      {where && onColumn && (
        <label>
          <span>{t('Column')}</span>
          <select className="field" value={w.column ?? ''} onChange={(e) => onColumn(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">{t('Automatic')}</option>
            {Array.from({ length: Math.max(1, columns - spanOf(w, columns) + 1) }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
      )}
      {o.limit && (
        <label>
          <span>{t('Items to show, {min} to {max}', { min: String(o.limit[1]), max: String(o.limit[2]) })}</span>
          <input className="field" type="number" min={o.limit[1]} max={o.limit[2]} value={cfg.limit ?? ''} placeholder={String(o.limit[0])} aria-invalid={badLimit || undefined} onChange={(e) => set('limit', e.target.value)} />
          {!badLimit && fitShows !== undefined && fitShows < Number(cfg.limit || o.limit[0]) && <small className="ws-hint">{t('Fit the window shows {n} right now, to keep the board on one screen.', { n: String(fitShows) })}</small>}
          {badLimit && (
            <small className="ws-hint warn-text" role="alert">
              {t('Use a whole number from {min} to {max}. Until then it shows {n}.', { min: String(o.limit[1]), max: String(o.limit[2]), n: String(o.limit[0]) })}
            </small>
          )}
        </label>
      )}
      {(o.fields ?? []).map((f) =>
        f.pick ? (
          <PickField key={f.key} label={f.label} hint={f.hint} names={f.pick === 'groups' ? (snap?.catalog.groups.map((g) => g.name) ?? []) : ((snap?.sources.frigate?.data as FrigateData | null)?.cameras.map((c) => c.name) ?? [])} value={cfg[f.key] ?? ''} onChange={(v) => set(f.key, v)} />
        ) : f.choices ? (
          <label key={f.key}>
            <span>{f.label}</span>
            <select className="field" value={cfg[f.key] ?? f.choices[0][0]} onChange={(e) => set(f.key, e.target.value)}>
              {f.choices.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label key={f.key}>
            <span>{f.label}</span>
            {f.multiline ? <textarea className="field" rows={4} value={cfg[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} /> : <input className="field" value={cfg[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />}
            {cfg[f.key]?.trim() && f.check(cfg[f.key]) === null ? (
              <small className="ws-hint warn-text" role="alert">
                {t('Nothing here can be used yet.')} {f.hint}
              </small>
            ) : (
              f.hint && <small className="ws-hint">{f.hint}</small>
            )}
          </label>
        ),
      )}
      {o.days && (
        <div className="ws-row">
          <span>{t('Look ahead')}</span>
          <span className="seg" role="group" aria-label={t('Look ahead')}>
            {[
              ['', t('One week')],
              ['14', t('Two weeks')],
            ].map(([v, label]) => (
              <button key={v} type="button" aria-pressed={(cfg.days ?? '') === v || (v === '' && cfg.days === '7')} onClick={() => set('days', v)}>
                {label}
              </button>
            ))}
          </span>
        </div>
      )}
      {viewsOf(w.type).length > 0 && (
        <div className="ws-row">
          <span>{t('Show as')}</span>
          <span className="seg" role="group" aria-label={t('Show as')}>
            {viewsOf(w.type).map(([v, label]) => (
              <button key={v} type="button" aria-pressed={(cfg.view ?? '') === v} onClick={() => set('view', v)}>
                {t(label)}
              </button>
            ))}
          </span>
        </div>
      )}
      {cfg.view === 'number' && (NUMBERS[w.type]?.length ?? 0) > 1 && (
        <label>
          <span>{t('Which number')}</span>
          <select className="field" value={cfg.number ?? NUMBERS[w.type]![0][0]} onChange={(e) => set('number', e.target.value)}>
            {NUMBERS[w.type]!.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      {o.styles && cfg.view !== 'number' && (
        <div className="ws-row">
          <span>{t('Look')}</span>
          <span className="seg" role="group" aria-label={t('Look')}>
            {o.styles.map(([v, label]) => (
              <button key={v} type="button" aria-pressed={(cfg.style ?? '') === v} onClick={() => set('style', v)}>
                {v === '' && w.type === 'apps' ? `${label} (${homeApps === 'patchbay' ? t('icons') : t('tiles')})` : label}
              </button>
            ))}
          </span>
        </div>
      )}
      {o.names && appsLook === 'patchbay' && (
        <div className="ws-row">
          <span>{t('Names under icons')}</span>
          <span className="seg" role="group" aria-label={t('Names under icons')}>
            {[
              ['', t('On hover')],
              ['show', t('Always')],
            ].map(([v, label]) => (
              <button key={v} type="button" aria-pressed={(cfg.names ?? '') === v} onClick={() => set('names', v)}>
                {label}
              </button>
            ))}
          </span>
        </div>
      )}
      {HA_WIDGETS[w.type] && <HaPicker type={w.type} value={cfg.entities} onChange={(v) => set('entities', v)} />}
      {w.type === 'apps' && (
        <p className="settings-note">
          {tx('Change the apps themselves in {link}.', { link: <Link to="/apps?arrange=1">{t('Edit apps')}</Link> })}
        </p>
      )}
    </div>
  );
}
