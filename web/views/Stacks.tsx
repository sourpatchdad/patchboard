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

const LOOSE = 'Standalone';
const rank: Record<JackState, number> = { down: 0, warn: 1, up: 2, idle: 3, none: 4 };

export function Stacks() {
  const { snap } = useStore();
  const { data: stats } = useSource<StatsData>('stats');
  const [q, setQ] = useState('');
  const [params, setParams] = useSearchParams();
  const onlyUpdates = params.get('updates') === '1';
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
  for (const c of all.filter(match)) {
    const key = c.project ?? LOOSE;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const worst = (list: Container[]) => Math.min(...list.map((c) => rank[ctrState(c, serviceFor(snap, c.name))]));
  const ordered = [...groups].sort(([a, la], [b, lb]) => {
    if (a === LOOSE || b === LOOSE) return a === LOOSE ? 1 : -1;
    return worst(la) - worst(lb) || a.localeCompare(b);
  });

  const s = stats?.containers ?? {};
  const totalCpu = Object.values(s).reduce((n, x) => n + x.cpu, 0);
  const totalMem = Object.values(s).reduce((n, x) => n + x.memBytes, 0);
  const running = all.filter((c) => c.state === 'running').length;

  return (
    <div className="page stacks">
      <div className="page-head">
        <h1 className="page-title">Stacks</h1>
        <input className="field" type="search" placeholder="Filter by name, stack or image" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {Object.keys(snap.updates).length > 0 && (
        <div className="stack-filters">
          <button type="button" className="chip" aria-pressed={onlyUpdates} onClick={() => setParams(onlyUpdates ? {} : { updates: '1' })}>
            {onlyUpdates ? 'Showing' : 'Show'} {plural(Object.keys(snap.updates).length, 'image update')}
          </button>
        </div>
      )}
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
                      <span className="srow-status">{st === 'idle' && svc?.expectStopped ? 'Finished, runs on a schedule' : shortStatus(c)}</span>
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
