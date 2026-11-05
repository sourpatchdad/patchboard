// Every app as a live tile, then what's running that no app points at, and
// the bookmarks. Edit apps changes all of it in place: order, groups, names,
// what's hidden, icons, and apps added without touching services.yaml.

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { CatalogAudit, Service } from '../../shared/types.ts';
import { type Draft, draftFrom, draftProblem, EditApps, layoutOf } from '../components/AppEditor.tsx';
import { AppTiles, TILE_SORTS, type TileSort } from '../components/AppTiles.tsx';
import { Icon, Section } from '../components/ui.tsx';
import { useJson } from '../lib/api.ts';
import { containerMap } from '../lib/services.ts';
import { useStore } from '../lib/store.tsx';
import { useUrlChoice } from '../lib/url.ts';

export function Apps() {
  const { snap } = useStore();
  const [q, setQ] = useState('');
  const [sort, setSort] = useUrlChoice<TileSort>('sort', TILE_SORTS, 'catalog');
  /** The working layout while editing; null otherwise. */
  const [draft, setDraft] = useState<Draft | null>(null);
  const [params, setParams] = useSearchParams();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const audit = useJson<CatalogAudit>('/api/catalog/audit', 5 * 60_000);
  /** The app form to open as editing starts (from a container page). */
  const [openForm, setOpenForm] = useState<{ app: Service; group: string; isNew: boolean } | null>(null);
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
    setDraft(draftFrom(snap.catalog, stats as Parameters<typeof draftFrom>[1]));
  };
  // Home's Apps widget links here with ?arrange=1; a container page with
  // ?edit=<app> (its icon and live number) or ?adopt=<container>.
  useEffect(() => {
    if (!snap || snap.readOnly) return;
    const edit = params.get('edit');
    const adopt = params.get('adopt');
    if (params.get('arrange') !== '1' && !edit && !adopt) return;
    if (edit) {
      const g = snap.catalog.groups.find((x) => x.services.some((s) => s.name === edit));
      const app = g?.services.find((s) => s.name === edit);
      if (g && app) setOpenForm({ app, group: g.name, isNew: false });
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
    for (const k of ['arrange', 'edit', 'adopt']) next.delete(k);
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
        {!draft && <input className="field" type="search" placeholder="Filter apps" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />}
      </div>
      {draft ? (
        <div className="arrange-bar" role="toolbar" aria-label="Edit apps">
          <p>Drag apps to reorder them or into another group, and groups by their grip. Type over a group's name to rename it. Each app's ⋯ menu edits, hides or moves it.</p>
          <span className="arrange-actions">
            {error && <span className="crit-text">{error}</span>}
            {snap.catalog.ordered && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  if (confirm('Go back to services.yaml as written? Your order, renamed groups, hidden apps, icons and apps added here are all removed.')) void save(true);
                }}
              >
                Start over
              </button>
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
            <button type="button" className="button button-quiet" onClick={() => void startEditing()}>
              Edit apps
            </button>
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
        <AppTiles filter={q} size="large" sort={sort} legend />
      )}

      {!draft && extra.length > 0 && (
        <Section title="Running, not listed yet" count={String(extra.length)}>
          {!snap.readOnly && (
            <p className="settings-note">
              <button type="button" className="text-button" onClick={() => void startEditing()}>
                Edit apps
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

      {!draft && dock.length > 0 && (
        <Section title="Elsewhere">
          <ul className="tile-grid">
            {dock.map((b) => (
              <li className="tile" data-tone="none" key={b.name}>
                <a className="tile-main" href={b.href} target="_blank" rel="noreferrer">
                  <span className="tile-icon">
                    <Icon name={b.name} icon={b.icon} size={24} />
                  </span>
                  <span className="tile-name">{b.name}</span>
                  <span className="tile-stat mono">{new URL(b.href, location.href).hostname.replace(/^www\./, '')}</span>
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
