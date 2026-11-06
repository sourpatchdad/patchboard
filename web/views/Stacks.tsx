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
import { containerMap, ctrState, type JackState, serviceFor, shortStatus } from '../lib/services.ts';
import { useSource, useStore } from '../lib/store.tsx';
import { useUrlChoice } from '../lib/url.ts';
import { CustomizePage } from '../components/PageCustomize.tsx';

const LOOSE = 'Standalone';
type SortKey = 'problems' | 'name' | 'cpu' | 'memory';
const rank: Record<JackState, number> = { down: 0, warn: 1, up: 2, idle: 3, none: 4 };

export function Stacks() {
  const { snap } = useStore();
  const { data: stats } = useSource<StatsData>('stats');
  const [q, setQ] = useState('');
  const [params, setParams] = useSearchParams();
  const onlyUpdates = params.get('updates') === '1';
  const [sort, setSort] = useUrlChoice<SortKey>('sort', ['problems', 'name', 'cpu', 'memory'], 'problems');
  const { hash } = useLocation();
  const uptime = useJson<UptimeData>('/api/uptime?days=14', 5 * 60_000).data;

  // Arriving from a container page's breadcrumb: scroll to that stack.
  useEffect(() => {
    if (!hash || !snap) return;
    document.getElementById(`stack-${decodeURIComponent(hash.slice(1))}`)?.scrollIntoView({ block: 'start' });
  }, [hash, !!snap]);

  if (!snap) return null;
  const all = [...containerMap(snap).values()];
  const match = (c: Container) => {
    const t = q.trim().toLowerCase();
    if (onlyUpdates && !snap.updates[c.name]) return false;
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

  const totalCpu = Object.values(s).reduce((n, x) => n + x.cpu, 0);
  const totalMem = Object.values(s).reduce((n, x) => n + x.memBytes, 0);
  const running = all.filter((c) => c.state === 'running').length;

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
        {Object.keys(snap.updates).length > 0 && (
          <button type="button" className="chip" aria-pressed={onlyUpdates} onClick={() => setParams(onlyUpdates ? {} : { updates: '1' })}>
            {onlyUpdates ? 'Showing' : 'Show'} {plural(Object.keys(snap.updates).length, 'image update')}
          </button>
        )}
      </div>
      <p className="page-lede">
        {plural(groups.size, 'stack')}, {running} of {all.length} containers running
        {stats ? `, using ${pct(totalCpu)} of the CPU and ${size(totalMem)} of memory.` : '.'}
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
        return (
          <section className="stack" key={project} id={`stack-${project}`}>
            <header className="stack-head">
              <h2>{project}</h2>
              <span className="section-count">{plural(list.length, 'container')}</span>
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
                return (
                  <li key={c.name}>
                    <Link to={`/c/${c.name}`} className="srow" data-state={st}>
                      <span className="srow-id">
                        <span className="srow-icon">{svc?.icon ? <Icon name={svc.name} icon={svc.icon} size={18} /> : <span className="dot" />}</span>
                        <span className="srow-name">{c.name}</span>
                        {svc && svc.name.toLowerCase() !== c.name && <span className="srow-app">{svc.name}</span>}
                        {snap.updates[c.name] && <span className="tag tag-update" title="Diun found a newer image">update</span>}
                      </span>
                      <HealthStrip states={uptime?.containers[c.name]} days={uptime?.days ?? []} label={`${c.name}, last 14 days`} />
                      <span className="srow-status">{st === 'idle' && svc?.expectStopped ? 'Scheduled job, finished' : c.state === 'running' && c.health !== 'unhealthy' ? `Up ${shortStatus(c)}` : shortStatus(c)}</span>
                      <span className="srow-num">{load ? pct(load.cpu) : ''}</span>
                      <span className="srow-num">{load ? size(load.memBytes) : ''}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {!all.length && <p className="empty">{snap.sources.docker?.ok ? 'No containers.' : "Can't see Docker right now."}</p>}
    </div>
  );
}
