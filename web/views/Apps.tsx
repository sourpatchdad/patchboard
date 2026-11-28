// Every app as a live tile, then what's running that no app points at, and
// the bookmarks. Edit apps changes all of it in place: order, groups, names,
// what's hidden, icons, and apps added without touching services.yaml.

import { t } from '../lib/i18n.ts';
import { HoldButton } from '../components/Hold.tsx';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlsoConnected, ServiceSheet } from '../components/ServiceSheet.tsx';
import type { CatalogAudit, Service } from '../../shared/types.ts';
import { AppForm, applyAppEdit, type Draft, draftFrom, draftProblem, EditApps, layoutOf } from '../components/AppEditor.tsx';
import { AddAppPicker } from '../components/AddAppPicker.tsx';
import type { JsonWidgetConfig } from '../../shared/jsonwidget.ts';
import { AppTiles, TILE_SORTS, type TileSort } from '../components/AppTiles.tsx';
import { Icon, Section } from '../components/ui.tsx';
import { useJson } from '../lib/api.ts';
import { containerMap } from '../lib/services.ts';
import { useStore } from '../lib/store.tsx';
import { useUrlChoice } from '../lib/url.ts';
import { useLeaveGuard } from '../lib/leave.ts';
import { breakable } from '../lib/format.ts';

export function Apps() {
  const { snap } = useStore();
  const [q, setQ] = useState('');
  const [sort, setSort] = useUrlChoice<TileSort>('sort', TILE_SORTS, 'catalog');
  /** The working layout while editing; null otherwise. */
  const [draft, setDraft] = useState<Draft | null>(null);
  /** The draft as editing began, to tell whether anything changed. */
  const [began, setBegan] = useState('');
  useLeaveGuard(!!draft && JSON.stringify(draft) !== began, 'Leave without saving your changes to the apps?');
  const [params, setParams] = useSearchParams();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const audit = useJson<CatalogAudit>('/api/catalog/audit', 5 * 60_000);
  /** The app form to open as editing starts (from a container page). */
  // A service with no tile, open in its own sheet: from Also connected, or ?service=<id>.
  const [service, setService] = useState<{ id: string; connect: boolean } | null>(null);
  // One app's sheet, outside Edit apps: it saves itself with Done.
  const [sheet, setSheet] = useState<{ app: Service; group: string; isNew: boolean; connect: boolean; stat?: JsonWidgetConfig } | null>(null);
  const [adding, setAdding] = useState(false);
  const [sheetErr, setSheetErr] = useState('');
  /** Open an app's sheet once its saved live number is known, so the form starts from it. */
  const openSheet = async (app: Service, group: string, isNew: boolean, connect = false) => {
    setSheetErr('');
    let stats: Record<string, JsonWidgetConfig> = {};
    try {
      stats = ((await (await fetch('/api/app-order')).json()) as { stats?: Record<string, JsonWidgetConfig> } | null)?.stats ?? {};
    } catch {
      /* none yet */
    }
    setSheet({ app, group, isNew, connect, stat: isNew ? undefined : stats[app.name] });
  };
  /** The sheet's Done: this one app's change, applied to the saved layout and saved. */
  const saveSheet = async (app: Service, group: string, stat: JsonWidgetConfig | null) => {
    if (!snap || !sheet) return;
    let stats: Record<string, JsonWidgetConfig> = {};
    try {
      stats = ((await (await fetch('/api/app-order')).json()) as { stats?: Record<string, JsonWidgetConfig> } | null)?.stats ?? {};
    } catch {
      /* none yet */
    }
    const next = applyAppEdit(draftFrom(snap.catalog, stats), sheet, app, group, stat);
    const problem = draftProblem(next);
    if (problem) return setSheetErr(problem);
    const res = await fetch('/api/app-order', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Patchboard': 'action' }, body: JSON.stringify(layoutOf(next, snap.catalog.renamed)) });
    if (!res.ok) return setSheetErr(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
    setSheet(null);
  };
  const [openForm, setOpenForm] = useState<{ app: Service; group: string; isNew: boolean; connect?: boolean } | null>(null);
  const startEditing = async () => {
    if (!snap) return;
    setQ('');
    setError('');
    let stats = {};
    try {
      stats = ((await (await fetch('/api/app-order')).json()) as { stats?: object } | null)?.stats ?? {};
    } catch {
      /* none yet */
    }
    const start = draftFrom(snap.catalog, stats as Parameters<typeof draftFrom>[1]);
    setBegan(JSON.stringify(start));
    setDraft(start);
    // The Edit apps button just went away: hand focus to the editing toolbar.
    // Only when focus was lost with that button; never take it from somewhere you've moved on to.
    setTimeout(() => {
      const at = document.activeElement;
      if (!at || at === document.body) document.querySelector<HTMLElement>('.arrange-bar')?.focus();
    }, 50);
  };
  // Home's Apps widget links here with ?arrange=1; a container page with
  // ?edit=<app> (its icon and live number) or ?adopt=<container>.
  useEffect(() => {
    const name = params.get('app');
    if (!name || !snap) return;
    const g = snap.catalog.groups.find((x) => x.services.some((s) => s.name === name));
    const app = g?.services.find((s) => s.name === name);
    if (g && app) void openSheet(app, g.name, false, params.get('connect') === '1');
    const next = new URLSearchParams(params);
    for (const k of ['app', 'connect']) next.delete(k);
    setParams(next, { replace: true });
  }, [params, !!snap]);
  // ?add=1, from a board's start panel: open Add an app.
  useEffect(() => {
    if (params.get('add') !== '1' || !snap || snap.readOnly) return;
    setAdding(true);
    const next = new URLSearchParams(params);
    next.delete('add');
    setParams(next, { replace: true });
  }, [params, !!snap]);
  useEffect(() => {
    const id = params.get('service');
    if (!id) return;
    setService({ id, connect: params.get('connect') === '1' });
    const next = new URLSearchParams(params);
    for (const k of ['service', 'connect']) next.delete(k);
    setParams(next, { replace: true });
  }, [params]);
  useEffect(() => {
    if (!snap || snap.readOnly) return;
    const edit = params.get('edit');
    const adopt = params.get('adopt');
    if (params.get('arrange') !== '1' && !edit && !adopt) return;
    if (edit) {
      const g = snap.catalog.groups.find((x) => x.services.some((s) => s.name === edit));
      const app = g?.services.find((s) => s.name === edit);
      // ?connect=1 arrives from a broken connection: open its form straight away.
      if (g && app) setOpenForm({ app, group: g.name, isNew: false, connect: params.get('connect') === '1' });
    }
    if (adopt) {
      const d = audit.data?.discovered.find((x) => x.container === adopt);
      if (!audit.data) return; // wait for the list of running containers
      setOpenForm({
        app: { name: d?.name ?? adopt, icon: d?.icon, href: d?.href, container: adopt, source: 'ui' },
        group: snap.catalog.groups[0]?.name ?? 'Apps',
        isNew: true,
      });
    }
    void startEditing();
    const next = new URLSearchParams(params);
    for (const k of ['arrange', 'edit', 'adopt', 'connect']) next.delete(k);
    setParams(next, { replace: true });
  }, [params, !!snap, !!audit.data]);
  if (!snap) return null;

  const save = async (reset: boolean) => {
    setError('');
    if (!reset && draft) {
      const problem = draftProblem(draft);
      if (problem) return setError(problem);
    }
    setSaving(true);
    const res = await fetch('/api/app-order', {
      method: reset ? 'DELETE' : 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Patchboard': 'action' },
      body: reset || !draft ? undefined : JSON.stringify(layoutOf(draft, snap.catalog.renamed)),
    });
    setSaving(false);
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
      return;
    }
    setDraft(null);
    setOpenForm(null);
    setSort('catalog');
  };
  const match = (name: string) => name.toLowerCase().includes(q.toLowerCase());
  const extra = (audit.data?.discovered ?? []).filter((d) => match(d.name) || match(d.container));
  const dock = snap.catalog.dock.filter((b) => match(b.name));

  return (
    <div className="page apps-page">
      <div className="page-head">
        <h1 className="page-title">Apps</h1>
        {!draft && <input className="field" type="search" placeholder="Filter apps" aria-label="Filter apps" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={!matchMedia('(pointer: coarse)').matches} />}
      </div>
      {draft ? (
        <div className="arrange-bar" role="toolbar" aria-label={t('Edit apps')} tabIndex={-1}>
          <p>Drag apps to reorder them or into another group, and groups by their grip. Type over a group's name to rename it. Each app's ⋯ menu edits, hides or moves it.</p>
          <span className="arrange-actions">
            {error && <span className="crit-text">{error}</span>}
            {snap.catalog.ordered && (
              <HoldButton className="text-button" danger hint="Hold to start over: order, groups, hidden apps and added apps all go" onConfirm={() => void save(true)}>
                Start over
              </HoldButton>
            )}
            <button type="button" className="button button-quiet" onClick={() => (setDraft(null), setOpenForm(null))}>
              Cancel
            </button>
            <button type="button" className="button board-save" disabled={saving} onClick={() => void save(false)}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </span>
        </div>
      ) : (
        <div className="page-toolbar">
          <div className="seg sort-seg" role="group" aria-label="Sort apps">
            {(
              [
                ['catalog', 'Your order'],
                ['status', 'Problems first'],
                ['name', 'A to Z'],
              ] as [TileSort, string][]
            ).map(([v, label]) => (
              <button key={v} type="button" aria-pressed={sort === v} onClick={() => setSort(v)}>
                {label}
              </button>
            ))}
          </div>
          {!snap.readOnly && (
            <>
              <button type="button" className="button button-quiet" onClick={() => setAdding(true)}>
                {t('Add an app')}
              </button>
              <button type="button" className="button button-quiet" onClick={() => void startEditing()}>
                {t('Edit apps')}
              </button>
            </>
          )}
        </div>
      )}
      {draft ? (
        <EditApps
          draft={draft}
          onChange={setDraft}
          discovered={audit.data?.discovered ?? []}
          containers={[...containerMap(snap).keys()].sort()}
          initialForm={openForm}
        />
      ) : (
        <>
          <AppTiles filter={q} size="large" sort={sort} legend onEdit={snap.readOnly ? undefined : (s, g) => void openSheet(s, g, false)} />
          {q.trim() && !snap.catalog.groups.some((g) => g.services.some((s) => match(s.name))) && !dock.length && !extra.length && (
            <p className="empty">No apps match “{q.trim()}”.</p>
          )}
        </>
      )}

      {!draft && extra.length > 0 && (
        <Section title="Running here, not listed yet" count={String(extra.length)}>
          {!snap.readOnly && (
            <p className="settings-note">
              <button type="button" className="text-button" onClick={() => void startEditing()}>
                {t('Edit apps')}
              </button>{' '}
              to add any of these in one click.
            </p>
          )}
          <ul className="tile-grid discovered">
            {extra.map((d) => (
              <li className="tile" data-tone="none" key={d.container}>
                <Link className="tile-main" to={`/c/${d.container}`}>
                  <span className="tile-icon">
                    <Icon name={d.name} icon={d.icon} size={24} />
                  </span>
                  <span className="tile-name">{d.name}</span>
                  <span className="tile-stat mono">{d.container}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!draft && <AlsoConnected snap={snap} onOpen={(id) => setService({ id, connect: false })} />}
      {service && <ServiceSheet id={service.id} connect={service.connect} onClose={() => setService(null)} />}
      {adding && (
        <AddAppPicker
          listed={snap.catalog.groups.flatMap((g) => g.services)}
          running={(audit.data?.discovered ?? []).filter((d) => !snap.catalog.groups.some((g) => g.services.some((s) => s.container === d.container || s.name === d.name)))}
          onPick={(app) => {
            setAdding(false);
            void openSheet(app, snap.catalog.groups[0]?.name ?? 'Apps', true);
          }}
          onOpen={(app) => {
            setAdding(false);
            void openSheet(app, snap.catalog.groups.find((g) => g.services.some((s) => s.name === app.name))?.name ?? 'Apps', false);
          }}
          onClose={() => setAdding(false)}
        />
      )}
      {sheet && (
        <AppForm
          key={sheet.app.name}
          app={sheet.app}
          group={sheet.group}
          isNew={sheet.isNew}
          openConnection={sheet.connect}
          saveLabel={sheet.isNew ? t('Add') : t('Done')}
          error={sheetErr}
          groups={snap.catalog.groups.map((g) => g.name)}
          containers={[...containerMap(snap).keys()].sort()}
          stat={sheet.stat}
          taken={(n) => n.trim().toLowerCase() !== sheet.app.name.toLowerCase() && snap.catalog.groups.some((g) => g.services.some((s) => s.name.toLowerCase() === n.trim().toLowerCase()))}
          onClose={() => setSheet(null)}
          onSave={(app, group, stat) => void saveSheet(app, group, stat)}
        />
      )}

      {!draft && dock.length > 0 && (
        <Section title="Links">
          <ul className="tile-grid">
            {dock.map((b) => (
              <li className="tile" data-tone="none" key={b.name}>
                <a className="tile-main" href={b.href} target="_blank" rel="noreferrer">
                  <span className="tile-icon">
                    <Icon name={b.name} icon={b.icon} size={24} />
                  </span>
                  <span className="tile-name">{b.name}</span>
                  <span className="tile-stat mono">{breakable(new URL(b.href, location.href).hostname.replace(/^www\./, ''))}</span>
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
