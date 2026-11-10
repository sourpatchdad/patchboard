// Every container on the box, grouped by compose project. The grouping comes
// from Docker's own labels, so nothing has to be listed in the catalog to show
// up here. Stacks with a problem sort first; healthy rows stay quiet.

import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import type { Container, StatsData, UptimeData } from '../../shared/types.ts';
import { HealthStrip } from '../components/Squares.tsx';
import { Icon } from '../components/ui.tsx';
import { useJson } from '../lib/api.ts';
import { pct, plural, size } from '../lib/format.ts';
import { containerMap, ctrState, type JackState, serviceFor, statusLine } from '../lib/services.ts';
import { useSource, useStore } from '../lib/store.tsx';
import { useUrlChoice } from '../lib/url.ts';
import { CustomizePage } from '../components/PageCustomize.tsx';
import { RowUpdate } from '../components/Updater.tsx';

const LOOSE = 'Standalone';
type SortKey = 'problems' | 'name' | 'cpu' | 'memory';
const rank: Record<JackState, number> = { down: 0, warn: 1, idle: 2, up: 3, none: 4 };

export function Stacks() {
  const { snap } = useStore();
  const { data: stats } = useSource<StatsData>('stats');
  const [q, setQ] = useState('');
  const [params, setParams] = useSearchParams();
  const onlyUpdates = params.get('updates') === '1';
  const [sort, setSort] = useUrlChoice<SortKey>('sort', ['problems', 'name', 'cpu', 'memory'], 'problems');
  const { hash } = useLocation();
  // On a phone, healthy stacks fold to their header; these are the ones opened.
  const [opened, setOpened] = useState<Set<string>>(() => new Set(hash ? [decodeURIComponent(hash.slice(1))] : []));
  const uptime = useJson<UptimeData>('/api/uptime?days=14', 5 * 60_000).data;

  // Arriving from a container page's breadcrumb: scroll to that stack.
  useEffect(() => {
    if (!hash || !snap) return;
    document.getElementById(`stack-${decodeURIComponent(hash.slice(1))}`)?.scrollIntoView({ block: 'start' });
  }, [hash, !!snap]);

  if (!snap) return null;
  const all = [...containerMap(snap).values()];
  // An update waiting, or a newer copy already pulled and not yet running: both are Update's job.
  const hasUpdate = (c: Container) => !!snap.updates[c.name] || !!c.staleImage;
  const match = (c: Container) => {
    const t = q.trim().toLowerCase();
    if (onlyUpdates && !hasUpdate(c)) return false;
    return !t || c.name.includes(t) || (c.project ?? '').includes(t) || c.image.toLowerCase().includes(t);
  };

  const groups = new Map<string, Container[]>();
  const hiddenStacks = new Set(snap.pages?.stacks?.hideStacks ?? []);
  const stackNames = [...new Set([...all.map((c) => c.project ?? LOOSE), ...hiddenStacks])].sort();
  for (const c of all.filter(match)) {
    const key = c.project ?? LOOSE;
    if (hiddenStacks.has(key)) continue;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const s = stats?.containers ?? {};
  const worst = (list: Container[]) => Math.min(...list.map((c) => rank[ctrState(c, serviceFor(snap, c.name))]));
  const cpuOf = (list: Container[]) => list.reduce((n, c) => n + (s[c.name]?.cpu ?? 0), 0);
  const memOf = (list: Container[]) => list.reduce((n, c) => n + (s[c.name]?.memBytes ?? 0), 0);
  const ordered = [...groups].sort(([a, la], [b, lb]) => {
    if (a === LOOSE || b === LOOSE) return a === LOOSE ? 1 : -1;
    if (sort === 'name') return a.localeCompare(b);
    if (sort === 'cpu') return cpuOf(lb) - cpuOf(la) || a.localeCompare(b);
    if (sort === 'memory') return memOf(lb) - memOf(la) || a.localeCompare(b);
    return worst(la) - worst(lb) || a.localeCompare(b);
  });
  // Rows inside a stack follow the same order.
  for (const [, list] of ordered) {
    list.sort((x, y) => {
      if (sort === 'cpu') return (s[y.name]?.cpu ?? -1) - (s[x.name]?.cpu ?? -1);
      if (sort === 'memory') return (s[y.name]?.memBytes ?? -1) - (s[x.name]?.memBytes ?? -1);
      if (sort === 'problems') return rank[ctrState(x, serviceFor(snap, x.name))] - rank[ctrState(y, serviceFor(snap, y.name))] || x.name.localeCompare(y.name);
      return x.name.localeCompare(y.name);
    });
  }

  // Totals cover the stacks this page shows; hidden ones are named as hidden.
  const shownCtrs = all.filter((c) => !hiddenStacks.has(c.project ?? LOOSE));
  const hiddenCount = [...hiddenStacks].filter((h) => all.some((c) => (c.project ?? LOOSE) === h)).length;
  const totalCpu = shownCtrs.reduce((n, c) => n + (s[c.name]?.cpu ?? 0), 0);
  const totalMem = shownCtrs.reduce((n, c) => n + (s[c.name]?.memBytes ?? 0), 0);
  const running = shownCtrs.filter((c) => c.state === 'running').length;
  const updateCount = shownCtrs.filter(hasUpdate).length;
  // The chip keeps the sort; only the filter changes.
  const toggleUpdates = () => {
    const next = new URLSearchParams(params);
    if (onlyUpdates) next.delete('updates');
    else next.set('updates', '1');
    setParams(next);
  };

  return (
    <div className="page stacks">
      <div className="page-head">
        <h1 className="page-title">Stacks</h1>
        <input className="field" type="search" placeholder="Filter by name, stack or image" value={q} onChange={(e) => setQ(e.target.value)} />
        <CustomizePage
          page="stacks"
          title="Stacks"
          lists={[{ key: 'hideStacks', title: 'Stacks', note: 'Tap a stack to hide it from this page. Its containers still raise alerts.', items: stackNames }]}
        />
      </div>
      <div className="page-toolbar">
        <div className="seg sort-seg" role="group" aria-label="Sort stacks">
          {(
            [
              ['problems', 'Problems first'],
              ['name', 'A to Z'],
              ['cpu', 'Busiest CPU'],
              ['memory', 'Most memory'],
            ] as [SortKey, string][]
          ).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={sort === v} onClick={() => setSort(v)}>
              {label}
            </button>
          ))}
        </div>
        {/* Stays while the filter is on, even with nothing left, so there's always a way out. */}
        {(updateCount > 0 || onlyUpdates) && (
          <button type="button" className="chip" aria-pressed={onlyUpdates} onClick={toggleUpdates}>
            {onlyUpdates ? (updateCount ? `Showing ${plural(updateCount, 'image update')}` : 'Show every container') : `Show ${plural(updateCount, 'image update')}`}
          </button>
        )}
      </div>
      {/* A breadcrumb to a stack you've hidden says so, instead of landing nowhere. */}
      {hash && hiddenStacks.has(decodeURIComponent(hash.slice(1))) && (
        <p className="update-notice">The {decodeURIComponent(hash.slice(1))} stack is hidden on this page. Customize shows it again.</p>
      )}
      <p className="page-lede">
        {plural(groups.size, 'stack')}, {running} of {shownCtrs.length} containers running
        {stats ? `, using ${pct(totalCpu)} of the CPU and ${size(totalMem)} of memory.` : '.'}
        {hiddenCount > 0 && ` ${plural(hiddenCount, 'stack')} hidden; Customize shows ${hiddenCount === 1 ? 'it' : 'them'}.`}
      </p>

      <div className="stack-cols" aria-hidden>
        <span />
        <span>14 days</span>
        <span>Status</span>
        <span>CPU</span>
        <span>Memory</span>
      </div>

      {ordered.map(([project, list]) => {
        const cpu = list.reduce((n, c) => n + (s[c.name]?.cpu ?? 0), 0);
        const mem = list.reduce((n, c) => n + (s[c.name]?.memBytes ?? 0), 0);
        const quiet = list.every((c) => ['up', 'idle', 'none'].includes(ctrState(c, serviceFor(snap, c.name)))) && !list.some(hasUpdate);
        const isOpen = opened.has(project);
        // Says what runs: a stopped or finished container isn't counted as running.
        const running = list.filter((c) => c.state === 'running').length;
        return (
          <section className={`stack ${quiet ? 'is-quiet' : ''} ${isOpen ? 'is-open' : ''}`} key={project} id={`stack-${project}`}>
            <header className="stack-head">
              <h2>{project}</h2>
              <span className="section-count">{running === list.length ? `${list.length} running` : `${running} of ${list.length} running`}</span>
              {quiet && (
                <button
                  type="button"
                  className="text-button stack-toggle"
                  aria-expanded={isOpen}
                  onClick={() => setOpened((prev) => (prev.has(project) ? new Set([...prev].filter((x) => x !== project)) : new Set([...prev, project])))}
                >
                  {isOpen ? 'Hide' : 'Show'}
                </button>
              )}
              {stats && list.some((c) => s[c.name]) && (
                <span className="stack-load">
                  <span>{pct(cpu)}</span>
                  <span>{size(mem)}</span>
                </span>
              )}
            </header>
            <ul className="stack-rows">
              {list.map((c) => {
                const svc = serviceFor(snap, c.name);
                const st = ctrState(c, svc);
                const load = s[c.name];
                // Updating from the row, where the update is the reason the row is here.
                const act = onlyUpdates && hasUpdate(c) && !snap.readOnly && !!snap.features?.includes('updates');
                return (
                  <li key={c.name} className={act ? 'has-act' : undefined}>
                    <Link to={`/c/${c.name}`} className="srow" data-state={st}>
                      <span className="srow-id">
                        <span className="srow-icon">{svc?.icon ? <Icon name={svc.name} icon={svc.icon} size={18} /> : <span className="dot" />}</span>
                        <span className="srow-name">{c.name}</span>
                        {svc && svc.name.toLowerCase() !== c.name && <span className="srow-app">{svc.name}</span>}
                        {hasUpdate(c) && !act && <span className="tag tag-update" title={c.staleImage ? 'A newer copy is downloaded; Update switches to it' : 'A newer image is out'}>update</span>}
                      </span>
                      <HealthStrip states={uptime?.containers[c.name]} days={uptime?.days ?? []} label={`${c.name}, last 14 days`} />
                      <span className="srow-status">{statusLine(c, svc)}</span>
                      <span className="srow-num">{load ? pct(load.cpu) : ''}</span>
                      <span className="srow-num">{load ? size(load.memBytes) : ''}</span>
                    </Link>
                    {act && (
                      <span className="srow-act">
                        <RowUpdate name={c.name} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {!all.length && <p className="empty">{snap.sources.docker?.ok ? 'No containers.' : "Can't see Docker right now."}</p>}
      {all.length > 0 && ordered.length === 0 && (
        <p className="empty">{onlyUpdates && !updateCount ? 'No image updates left. Every container runs its newest image.' : 'Nothing matches that filter.'}</p>
      )}
    </div>
  );
}
