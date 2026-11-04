import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/ui.tsx';
import { checkFor, containerMap, isExternal, jackState, jackStateText, shortStatus } from '../lib/services.ts';
import { useStore } from '../lib/store.tsx';

export function Apps() {
  const { snap } = useStore();
  const [q, setQ] = useState('');
  if (!snap) return null;
  const containers = containerMap(snap);
  const match = (name: string) => name.toLowerCase().includes(q.toLowerCase());

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Apps</h1>
        <input className="field" type="search" placeholder="Filter apps" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      {snap.catalog.groups.map((g) => {
        const list = g.services.filter((s) => match(s.name));
        if (!list.length) return null;
        return (
          <section className="app-group" key={g.name}>
            <h2>{g.name}</h2>
            <ul className="app-grid">
              {list.map((s) => {
                const ck = checkFor(snap, s.name);
                const state = jackState(s, containers, ck);
                const c = s.container ? containers.get(s.container) : undefined;
                const status = c ? (c.state === 'running' ? `Up ${shortStatus(c)}` : c.status) : jackStateText[state];
                const body = (
                  <>
                    <Icon name={s.name} icon={s.icon} size={32} />
                    <span className="app-name">{s.name}</span>
                    <span className="app-state" data-state={state}>
                      {ck && !ck.ok ? `${ck.error ?? 'No answer'}, not answering` : ck ? `${status} · ${ck.ms} ms` : status}
                    </span>
                  </>
                );
                return (
                  <li key={s.name}>
                    {s.href && isExternal(s.href) ? (
                      <a className="app" href={s.href} target="_blank" rel="noreferrer">{body}</a>
                    ) : s.container ? (
                      <Link className="app" to={`/c/${s.container}`}>{body}</Link>
                    ) : (
                      <div className="app">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {snap.catalog.dock.some((b) => match(b.name)) && (
        <section className="app-group">
          <h2>Elsewhere</h2>
          <ul className="app-grid">
            {snap.catalog.dock.filter((b) => match(b.name)).map((b) => (
              <li key={b.name}>
                <a className="app" href={b.href} target="_blank" rel="noreferrer">
                  <Icon name={b.name} icon={b.icon} size={32} />
                  <span className="app-name">{b.name}</span>
                  <span className="app-state">{new URL(b.href, location.href).hostname}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
