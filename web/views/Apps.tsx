// Every app in the catalog as a live tile, then what's running on the box
// that the catalog doesn't mention yet, and the bookmarks.

import { useState } from 'react';
import { orderOf } from '../../shared/order.ts';
import { Link } from 'react-router-dom';
import type { Catalog, CatalogAudit } from '../../shared/types.ts';
import { AppTiles, TILE_SORTS, type TileSort } from '../components/AppTiles.tsx';
import { useUrlChoice } from '../lib/url.ts';
import { Icon, Section } from '../components/ui.tsx';
import { useJson } from '../lib/api.ts';
import { useStore } from '../lib/store.tsx';

export function Apps() {
  const { snap } = useStore();
  const [q, setQ] = useState('');
  const [sort, setSort] = useUrlChoice<TileSort>('sort', TILE_SORTS, 'catalog');
  /** The working order while rearranging; null otherwise. */
  const [arranging, setArranging] = useState<Catalog['groups'] | null>(null);
  const [error, setError] = useState('');
  const audit = useJson<CatalogAudit>('/api/catalog/audit', 5 * 60_000).data;
  if (!snap) return null;
  const saveOrder = async (reset: boolean) => {
    setError('');
    const res = await fetch('/api/app-order', {
      method: reset ? 'DELETE' : 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Patchboard': 'action' },
      body: reset || !arranging ? undefined : JSON.stringify(orderOf(arranging)),
    });
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
      return;
    }
    setArranging(null);
    setSort('catalog');
  };
  const match = (name: string) => name.toLowerCase().includes(q.toLowerCase());
  const extra = (audit?.discovered ?? []).filter((d) => match(d.name) || match(d.container));
  const dock = snap.catalog.dock.filter((b) => match(b.name));

  return (
    <div className="page apps-page">
      <div className="page-head">
        <h1 className="page-title">Apps</h1>
        {!arranging && <input className="field" type="search" placeholder="Filter apps" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />}
      </div>
      {arranging ? (
        <div className="arrange-bar" role="toolbar" aria-label="Rearrange apps">
          <p>Drag apps within a group, or a group by its name. The arrows do the same.</p>
          <span className="arrange-actions">
            {error && <span className="crit-text">{error}</span>}
            {snap.catalog.ordered && (
              <button type="button" className="text-button" onClick={() => void saveOrder(true)}>
                Use catalog order
              </button>
            )}
            <button type="button" className="button button-quiet" onClick={() => setArranging(null)}>
              Cancel
            </button>
            <button type="button" className="button board-save" onClick={() => void saveOrder(false)}>
              Save order
            </button>
          </span>
        </div>
      ) : (
        <div className="sort-row">
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
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setQ('');
                setArranging(snap.catalog.groups);
              }}
            >
              Rearrange
            </button>
          )}
        </div>
      )}
      <AppTiles filter={q} size="large" sort={sort} legend={!arranging} arrange={arranging ? { groups: arranging, onChange: setArranging } : undefined} />

      {!arranging && extra.length > 0 && (
        <Section title="Running, not in the catalog" count={String(extra.length)} action={{ label: 'Add them', to: '/settings#catalog' }}>
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

      {!arranging && dock.length > 0 && (
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
