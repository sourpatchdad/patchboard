// App tiles: every service in the catalog as a compact tile with its icon,
// full name and one live line (see appstat.ts). Clicking the tile opens the
// app; the chevron opens its container page. Groups come from the catalog.
// A group header counts only what needs attention, so a quiet group says
// nothing at all.

import { Link } from 'react-router-dom';
import type { Service } from '../../shared/types.ts';
import { appStat } from '../lib/appstat.ts';
import { containerMap, isExternal } from '../lib/services.ts';
import { useStore } from '../lib/store.tsx';
import { Icon } from './ui.tsx';

export type TileSort = 'catalog' | 'name' | 'status';

const TONE_RANK = { crit: 0, warn: 1, ok: 2, idle: 3, none: 4 } as const;

export function AppTiles({ filter = '', size = 'normal', sort = 'catalog', legend = false }: { filter?: string; size?: 'normal' | 'large'; sort?: TileSort; legend?: boolean }) {
  const { snap } = useStore();
  if (!snap) return <div className="tiles tiles-loading" aria-hidden />;
  const containers = containerMap(snap);
  const q = filter.trim().toLowerCase();
  const match = (s: Service) => !q || s.name.toLowerCase().includes(q) || (s.container ?? '').includes(q);

  return (
    <div className={`tiles tiles-${size}`}>
      {snap.catalog.groups.map((g) => {
        const pairs = g.services.filter(match).map((s) => ({ s, st: appStat(s, snap, containers) }));
        if (!pairs.length) return null;
        // Catalog order is the default: positions stay put, so muscle memory works.
        if (sort === 'name') pairs.sort((x, y) => x.s.name.localeCompare(y.s.name));
        if (sort === 'status') pairs.sort((x, y) => TONE_RANK[x.st.tone] - TONE_RANK[y.st.tone] || x.s.name.localeCompare(y.s.name));
        const list = pairs.map((x) => x.s);
        const stats = pairs.map((x) => x.st);
        const trouble = stats.filter((x) => x.tone === 'warn' || x.tone === 'crit').length;
        return (
          <section className="tile-group" key={g.name} aria-label={g.name}>
            <header className="tile-group-head">
              <h3>{g.name}</h3>
              {trouble > 0 && <span className="tile-group-trouble">{trouble} {trouble === 1 ? 'needs' : 'need'} attention</span>}
            </header>
            <ul className="tile-grid">
              {list.map((s, i) => (
                <Tile key={s.name} s={s} stat={stats[i]} />
              ))}
            </ul>
          </section>
        );
      })}
      {legend && <TileLegend />}
    </div>
  );
}

/** What the marks on a tile mean. */
export function TileLegend() {
  return (
    <p className="tile-legend">
      <span>
        <i className="lg-dot lg-warn" /> needs a look
      </span>
      <span>
        <i className="lg-dot lg-crit" /> down
      </span>
      <span>
        <b className="tile-update">↑</b> newer image available
      </span>
      <span>
        <code>29 ms</code> how fast the app answered
      </span>
      <span>
        <code>Up 6 days</code> no link to check, so uptime
      </span>
    </p>
  );
}

function Tile({ s, stat }: { s: Service; stat: ReturnType<typeof appStat> }) {
  const body = (
    <>
      <span className="tile-icon">
        <Icon name={s.name} icon={s.icon} size={24} />
      </span>
      <span className="tile-name">
        {s.name}
        {stat.update && (
          <span className="tile-update" title="A newer image is available" aria-label="update available">
            ↑
          </span>
        )}
      </span>
      <span className={`tile-stat ${stat.mono ? 'mono' : ''}`}>{stat.text}</span>
    </>
  );
  const main =
    s.href && isExternal(s.href) ? (
      <a className="tile-main" href={s.href} target="_blank" rel="noreferrer" title={stat.title}>
        {body}
      </a>
    ) : s.container ? (
      <Link className="tile-main" to={`/c/${s.container}`} title={stat.title}>
        {body}
      </Link>
    ) : (
      <span className="tile-main" title={stat.title}>
        {body}
      </span>
    );
  return (
    <li className="tile" data-tone={stat.tone}>
      {main}
      {s.container && s.href && (
        <Link className="tile-more" to={`/c/${s.container}`} aria-label={`${s.name} details`} title="Container details">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3.5 10.5 8 6 12.5" />
          </svg>
        </Link>
      )}
    </li>
  );
}
