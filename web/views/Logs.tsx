// Live container logs straight from the Docker socket, with a hand-off to
// Dozzle for anything heavier (search across containers, history, merging).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Empty } from '../components/ui.tsx';
import { containerMap } from '../lib/services.ts';
import { lineClass, useLogStream } from '../lib/logs.ts';
import { useStore } from '../lib/store.tsx';

export function Logs() {
  const { name } = useParams();
  const { snap } = useStore();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');
  const [listFilter, setListFilter] = useState('');
  const [follow, setFollow] = useState(true);
  const [wrap, setWrap] = useState(true);
  const paneRef = useRef<HTMLDivElement>(null);

  const containers = useMemo(() => [...containerMap(snap).values()], [snap]);
  const current = name ? containers.find((c) => c.name === name) : undefined;

  const { lines, status, failure } = useLogStream(name);

  useEffect(() => {
    if (follow && paneRef.current) paneRef.current.scrollTop = paneRef.current.scrollHeight;
  }, [lines, follow]);

  const shown = useMemo(() => {
    if (!filter) return lines;
    const f = filter.toLowerCase();
    return lines.filter((l) => l.text.toLowerCase().includes(f));
  }, [lines, filter]);

  const dozzle = snap?.links.dozzle;
  const listed = containers.filter((c) => !listFilter || c.name.includes(listFilter.toLowerCase()));

  return (
    <div className={`logs-layout ${name ? 'has-selection' : ''}`}>
      <aside className="logs-list" aria-label="Containers">
        <div className="reader-list-head">
          <h1 className="page-title">Logs</h1>
          <span className="section-count">{containers.length} containers</span>
        </div>
        <input
          className="field"
          type="search"
          placeholder="Filter containers"
          value={listFilter}
          onChange={(e) => setListFilter(e.target.value)}
        />
        <ul className="ctr-list">
          {listed.map((c) => (
            <li key={c.name}>
              <Link to={`/logs/${c.name}`} className={`ctr ${c.name === name ? 'is-selected' : ''}`} data-state={c.state === 'running' ? (c.health === 'unhealthy' ? 'warn' : 'up') : 'down'}>
                <span className="ctr-led" aria-hidden />
                <span className="ctr-name">{c.name}</span>
                <span className="ctr-status">{c.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <section className="logs-pane" aria-label={name ? `Logs for ${name}` : 'Logs'}>
        {name ? (
          <>
            <header className="logs-head">
              <button type="button" className="text-button reader-back" onClick={() => navigate('/logs')}>
                All containers
              </button>
              <div className="logs-title">
                <h2>
                  <Link to={`/c/${name}`} className="logs-detail-link" title="Container details">{name}</Link>
                </h2>
                <span className="logs-sub">
                  {current ? `${current.image}, ${current.status}` : 'Not in the container list'}
                </span>
              </div>
              <div className="logs-tools">
                <input className="field" type="search" placeholder="Filter lines" value={filter} onChange={(e) => setFilter(e.target.value)} />
                <label className="toggle">
                  <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow
                </label>
                <label className="toggle">
                  <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} /> Wrap
                </label>
                {dozzle && current && (
                  <a className="text-button" href={dozzle === '#' ? '#' : `${dozzle}/container/${current.id}`} target="_blank" rel="noreferrer">
                    Open in Dozzle
                  </a>
                )}
              </div>
            </header>
            <div
              className={`logs-out ${wrap ? 'wrap' : ''}`}
              ref={paneRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
                if (atBottom !== follow) setFollow(atBottom);
              }}
            >
              {shown.map((l) => (
                <div key={l.n} className={lineClass(l)}>
                  {l.text || ' '}
                </div>
              ))}
              {status === 'failed' && <p className="logs-note">Couldn't read logs: {failure}</p>}
              {status === 'ended' && <p className="logs-note">Stream closed. The container may have stopped. Pick it again to reconnect.</p>}
              {status === 'streaming' && lines.length === 0 && <p className="logs-note">Waiting for output.</p>}
            </div>
          </>
        ) : (
          <div className="reader-empty">
            <p>Pick a container to follow its logs live.</p>
            {dozzle && <p><a href={dozzle} target="_blank" rel="noreferrer">Open Dozzle</a> to search across everything.</p>}
          </div>
        )}
      </section>
      {containers.length === 0 && !name && <Empty>No containers yet. Is the Docker socket mounted?</Empty>}
    </div>
  );
}
