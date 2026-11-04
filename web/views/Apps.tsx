// Every app in the catalog as a live tile, then what's running on the box
// that the catalog doesn't mention yet, and the bookmarks.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CatalogAudit } from '../../shared/types.ts';
import { AppTiles } from '../components/AppTiles.tsx';
import { Icon, Section } from '../components/ui.tsx';
import { useJson } from '../lib/api.ts';
import { useStore } from '../lib/store.tsx';

export function Apps() {
  const { snap } = useStore();
  const [q, setQ] = useState('');
  const audit = useJson<CatalogAudit>('/api/catalog/audit', 5 * 60_000).data;
  if (!snap) return null;
  const match = (name: string) => name.toLowerCase().includes(q.toLowerCase());
  const extra = (audit?.discovered ?? []).filter((d) => match(d.name) || match(d.container));
  const dock = snap.catalog.dock.filter((b) => match(b.name));

  return (
    <div className="page apps-page">
      <div className="page-head">
        <h1 className="page-title">Apps</h1>
        <input className="field" type="search" placeholder="Filter apps" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <AppTiles filter={q} size="large" />

      {extra.length > 0 && (
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

      {dock.length > 0 && (
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
