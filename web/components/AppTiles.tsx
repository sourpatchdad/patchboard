// App tiles: every service in the catalog as a compact tile with its icon,
// full name and one live line (see appstat.ts). Clicking the tile opens the
// app; the chevron opens its container page. Groups come from the catalog.
// A group header counts only what needs attention, so a quiet group says
// nothing at all.

import { useRef } from 'react';
import { Link } from 'react-router-dom';
import type { Catalog, Service } from '../../shared/types.ts';
import { appStat } from '../lib/appstat.ts';
import { containerMap, isExternal } from '../lib/services.ts';
import { useStore } from '../lib/store.tsx';
import { Icon } from './ui.tsx';

export type TileSort = 'catalog' | 'name' | 'status';
export const TILE_SORTS = ['catalog', 'status', 'name'] as const;

/** Groups while arranging; from is the name a group had when arranging began. */
export type Groups = (Catalog['groups'][number] & { from?: string })[];

/** Rearranging: the working order, and where to send a change. */
export interface Arrange {
  groups: Groups;
  onChange: (groups: Groups) => void;
}

const moved = <T,>(list: T[], from: number, to: number): T[] => {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
};

const TONE_RANK = { crit: 0, warn: 1, ok: 2, idle: 3, none: 4 } as const;

export function AppTiles({
  filter = '',
  size = 'normal',
  sort = 'catalog',
  legend = false,
  arrange,
}: {
  filter?: string;
  size?: 'normal' | 'large';
  sort?: TileSort;
  legend?: boolean;
  arrange?: Arrange;
}) {
  const { snap } = useStore();
  if (!snap) return <div className="tiles tiles-loading" aria-hidden />;
  if (arrange) return <ArrangeTiles {...arrange} size={size} />;
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

/**
 * Rearranging. Drag an app within its group or into another; drag a group by
 * its handle. Group names are editable in place. The arrows and the "Move to"
 * menu do the same on a phone or keyboard. Links are off meanwhile, so a drag
 * never opens an app.
 */
function ArrangeTiles({ groups, onChange, size }: Arrange & { size: string }) {
  const drag = useRef<{ g: number; i?: number } | null>(null);
  const moveGroup = (from: number, to: number) => to >= 0 && to < groups.length && onChange(moved(groups, from, to));
  /** Move app i of group g to group tg at index ti (end when omitted). */
  const moveApp = (g: number, i: number, tg: number, ti?: number) => {
    if (tg < 0 || tg >= groups.length) return;
    if (g === tg) {
      const list = groups[g].services;
      const to = ti ?? list.length - 1;
      if (to < 0 || to >= list.length || to === i) return;
      onChange(groups.map((x, j) => (j === g ? { ...x, services: moved(list, i, to) } : x)));
      return;
    }
    const app = groups[g].services[i];
    onChange(
      groups.map((x, j) => {
        if (j === g) return { ...x, services: x.services.filter((_, k) => k !== i) };
        if (j === tg) {
          const next = [...x.services];
          next.splice(ti ?? next.length, 0, app);
          return { ...x, services: next };
        }
        return x;
      }),
    );
  };
  const rename = (g: number, name: string) => onChange(groups.map((x, j) => (j === g ? { ...x, name } : x)));
  const addGroup = () => {
    let n = 1;
    while (groups.some((x) => x.name === (n === 1 ? 'New group' : `New group ${n}`))) n++;
    onChange([...groups, { name: n === 1 ? 'New group' : `New group ${n}`, services: [] }]);
  };
  const dupes = new Set(groups.map((g) => g.name.trim()).filter((n, i, all) => all.indexOf(n) !== i));

  return (
    <div className={`tiles tiles-${size} tiles-arranging`}>
      {groups.map((g, gi) => (
        <section
          className="tile-group"
          key={gi}
          aria-label={g.name}
          onDragOver={(e) => drag.current && (drag.current.i === undefined ? drag.current.g !== gi : true) && e.preventDefault()}
          onDrop={(e) => {
            const d = drag.current;
            drag.current = null;
            if (!d) return;
            e.preventDefault();
            if (d.i === undefined) {
              if (d.g !== gi) moveGroup(d.g, gi);
            } else if (d.g !== gi) moveApp(d.g, d.i, gi);
          }}
        >
          <header className="tile-group-head arrange-head">
            <span className="arrange-name">
              <span className="grip" draggable onDragStart={() => (drag.current = { g: gi })} onDragEnd={() => (drag.current = null)} title="Drag to move this group" aria-hidden>
                ⠿
              </span>
              <input
                className={`field group-name ${dupes.has(g.name.trim()) || !g.name.trim() ? 'is-bad' : ''}`}
                value={g.name}
                maxLength={60}
                aria-label="Group name"
                onChange={(e) => rename(gi, e.target.value)}
              />
            </span>
            <span className="arrange-btns">
              <button type="button" className="cell-btn" disabled={gi === 0} onClick={() => moveGroup(gi, gi - 1)} aria-label={`Move ${g.name} up`}>
                ↑
              </button>
              <button type="button" className="cell-btn" disabled={gi === groups.length - 1} onClick={() => moveGroup(gi, gi + 1)} aria-label={`Move ${g.name} down`}>
                ↓
              </button>
            </span>
          </header>
          <ul className="tile-grid">
            {g.services.length === 0 && <li className="tile-drop">Drag apps here, or use an app's Move to menu. Empty groups are dropped on save.</li>}
            {g.services.map((s, i) => (
              <li
                key={s.name}
                className="tile tile-arrange"
                data-tone="none"
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  drag.current = { g: gi, i };
                }}
                onDragEnd={() => (drag.current = null)}
                onDragOver={(e) => {
                  if (drag.current?.i !== undefined) e.preventDefault();
                }}
                onDrop={(e) => {
                  const d = drag.current;
                  if (d?.i === undefined) return;
                  e.preventDefault();
                  e.stopPropagation();
                  drag.current = null;
                  moveApp(d.g, d.i, gi, i);
                }}
              >
                <span className="tile-main">
                  <span className="tile-icon">
                    <Icon name={s.name} icon={s.icon} size={24} />
                  </span>
                  <span className="tile-name">{s.name}</span>
                  <span className="tile-stat">
                    {i + 1} of {g.services.length}
                  </span>
                </span>
                <span className="arrange-btns tile-arrange-btns">
                  <button type="button" className="cell-btn" disabled={i === 0} onClick={() => moveApp(gi, i, gi, i - 1)} aria-label={`Move ${s.name} earlier`}>
                    ←
                  </button>
                  <button type="button" className="cell-btn" disabled={i === g.services.length - 1} onClick={() => moveApp(gi, i, gi, i + 1)} aria-label={`Move ${s.name} later`}>
                    →
                  </button>
                  {groups.length > 1 && (
                    <span className="cell-btn move-to" title="Move to another group">
                      ⋯
                      <select
                        aria-label={`Move ${s.name} to group`}
                        value=""
                        onChange={(e) => {
                          const tg = Number(e.target.value);
                          if (!Number.isNaN(tg)) moveApp(gi, i, tg);
                        }}
                      >
                        <option value="" disabled>
                          Move to
                        </option>
                        {groups.map((x, j) =>
                          j === gi ? null : (
                            <option key={j} value={j}>
                              {x.name || 'Unnamed group'}
                            </option>
                          ),
                        )}
                      </select>
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="tile-group">
        <span />
        <button type="button" className="button button-quiet add-group" onClick={addGroup}>
          New group
        </button>
      </div>
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
