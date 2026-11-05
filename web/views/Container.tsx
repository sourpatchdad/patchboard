// One container, everything about it on one page: state, resources, live
// logs, how it's wired, what changed, and the runbook section that applies.
// When something is wrong, the runbook moves to the top.

import { Attention } from './Home.tsx';
import { numberText, useAppNumbers } from '../lib/appstats.ts';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useMemo, useRef } from 'react';
import { useMediaServers } from '../lib/media.ts';
import { PauseButton, useDownloadClients } from '../lib/downloads.tsx';
import { Link, useParams } from 'react-router-dom';
import type {
  ArrData,
  ContainerDetail,
  FrigateData,
  MinifluxData,
  RunbookSection,
  StatsData,
  UptimeData,
} from '../../shared/types.ts';
import { HealthStrip } from '../components/Squares.tsx';
import { ContainerActions } from '../components/Actions.tsx';
import { UpdateButton, UpdatePanel, useUpdateJob } from '../components/Updater.tsx';
import { Spark } from '../components/Spark.tsx';
import { Empty, Icon, Ident, Section } from '../components/ui.tsx';
import { useHistory, useJson } from '../lib/api.ts';
import { ago, agoLong, pct, plural, shortDate, size, speed } from '../lib/format.ts';
import { lineClass, useLogStream } from '../lib/logs.ts';
import { checkFor, containerMap, ctrState, isExternal, serviceFor } from '../lib/services.ts';
import { useNow, useSource, useStore } from '../lib/store.tsx';

const changeText = {
  'container.stopped': 'Stopped',
  'container.started': 'Started',
  'container.unhealthy': 'Started failing its health check',
  'container.recovered': 'Recovered',
  'container.action': 'Command sent',
} as const;

const actionWord: Record<string, string> = {
  restart: 'Restarted from Patchboard',
  stop: 'Stopped from Patchboard',
  start: 'Started from Patchboard',
  update: 'Updated from Patchboard',
  rollback: 'Rolled back from Patchboard',
};

export function ContainerPage() {
  const { name = '' } = useParams();
  const { snap } = useStore();
  const now = useNow(30_000);
  const ctr = containerMap(snap).get(name);
  const svc = serviceFor(snap, name);
  const detail = useJson<ContainerDetail>(`/api/containers/${encodeURIComponent(name)}`, 30_000);
  const runbook = useJson<{ available: boolean; sections: RunbookSection[] }>(`/api/runbook/${encodeURIComponent(name)}`);
  const { data: stats } = useSource<StatsData>('stats');
  const uptime = useJson<UptimeData>('/api/uptime?days=30', 5 * 60_000).data;
  const upd = useUpdateJob(name);
  const nums = useAppNumbers();

  if (!snap) return null;
  if (!ctr) {
    return (
      <div className="page detail ctr-page">
        <Crumbs />
        <h1 className="page-title">{name}</h1>
        <Empty>
          {snap.sources.docker?.ok ? 'Docker has no container by this name. Someone may have removed or renamed it.' : "Can't see Docker right now."}
        </Empty>
      </div>
    );
  }

  const state = ctrState(ctr, svc);
  const problem = state === 'down' || state === 'warn';
  const d = detail.data;
  const live = stats?.containers[name];
  const sections = runbook.data?.sections ?? [];
  const dozzle = snap.links.dozzle;
  // This app's alerts, from the same list as Home's Needs attention.
  const mine = snap.alerts.filter((a) => a.subject === name || a.href === `/c/${name}` || (svc && (a.subject === svc.name || a.title.includes(svc.name))));
  const number = svc ? numberText(nums[svc.name]) : null;

  return (
    <div className="page detail">
      <Crumbs project={ctr.project} />
      <header className="detail-head">
        {svc?.icon && (
          <span className="detail-icon">
            <Icon name={svc.name} icon={svc.icon} size={36} />
          </span>
        )}
        <div className="detail-titles">
          <h1 className="page-title">{svc?.name ?? name}</h1>
          <p className="detail-ident">
            <Ident>{name}</Ident>
            <span className="mono">{ctr.image}</span>
          </p>
        </div>
        <div className="detail-actions">
          {svc?.href && isExternal(svc.href) && (
            <a className="button" href={svc.href} target="_blank" rel="noreferrer">
              Open {svc.name}
            </a>
          )}
          <Link className="text-button" to={`/logs/${name}`}>
            Full logs
          </Link>
          {!snap.readOnly &&
            (svc ? (
              <Link className="text-button" to={`/apps?edit=${encodeURIComponent(svc.name)}`} title="Icon, live number, group">
                Edit app
              </Link>
            ) : (
              <Link className="text-button" to={`/apps?adopt=${encodeURIComponent(name)}`} title="Put it on Home and Apps">
                Add as an app
              </Link>
            ))}
          {dozzle && (
            <a className="text-button" href={dozzle === '#' ? '#' : `${dozzle}/container/${ctr.id}`} target="_blank" rel="noreferrer">
              Dozzle
            </a>
          )}
        </div>
      </header>

      <div className="detail-state-row">
        <p className={`detail-state tone-${problem ? (state === 'down' ? 'crit' : 'warn') : 'ok'}`}>
          <span className="status-led" aria-hidden />
          <span>{stateSentence(ctr.state, ctr.health, d, now, svc?.expectStopped)}</span>
          {number && <span className={`detail-number tone-${number.tone}`}>{number.text}</span>}
        </p>
        <div className="ctr-actions-wrap">
          {!snap.readOnly && detail.data?.update?.ok && <UpdateButton name={name} busy={upd.job?.status === 'running'} onStart={() => void upd.start()} />}
          {!snap.readOnly && <ContainerActions name={name} running={ctr.state === 'running' || ctr.state === 'restarting'} self={name === 'patchboard'} />}
        </div>
      </div>

      <div className="health-row">
        <HealthStrip states={uptime?.containers[name]} days={uptime?.days ?? []} label={`${name}, last 30 days`} large />
        <span className="health-caption">{healthCaption(uptime, name)}</span>
      </div>

      <div className="detail-grid">
        <div className="detail-main">
          <UpdatePanel job={upd.job} error={upd.error} onRollback={(id) => void upd.rollback(id)} onDismiss={upd.dismiss} />
          {mine.length > 0 && <Attention alerts={mine} now={now} />}
          {problem && sections.length > 0 && <Runbook sections={sections} open />}
          {d?.health === 'unhealthy' && d.healthLog.length > 0 && <HealthLog log={d.healthLog} now={now} />}
          {ctr.state === 'running' && <Resources name={name} cpu={live?.cpu} mem={live?.memBytes} />}
          {!problem && sections.length > 0 && <Runbook sections={sections} />}
          {runbook.data && !runbook.data.available && sections.length === 0 && problem && (
            <p className="detail-note">Mount your system docs at DOCS_PATH and the matching runbook section shows up here.</p>
          )}
        </div>

        {/* The live logs sit beside the fix, so 2 AM needs no scrolling. */}
        <aside className="detail-side">
          <Section title="Logs" action={{ label: 'Open full view', to: `/logs/${name}` }} className="side-logs">
            <LogTail name={name} />
          </Section>
          <AppPanel name={name} />
          <Section title="Container">
            {d ? (
              <dl className="ledger">
                {svc && checkFor(snap, svc.name) && <AnswersRow name={svc.name} now={now} />}
                <Row k="Image">
                  <span className="mono wrap">{d.image}</span>
                  {snap.updates[name] && (
                    <span className="update-note">
                      Update available, found {ago(snap.updates[name].at, now)}
                      {!snap.readOnly && (
                        <>
                          {' '}
                          <button
                            type="button"
                            className="text-button"
                            title="Clear this mark if you already run the newest image"
                            onClick={() => void fetch(`/api/updates/${encodeURIComponent(name)}`, { method: 'DELETE', headers: { 'X-Patchboard': 'action' } })}
                          >
                            Dismiss
                          </button>
                        </>
                      )}
                      {snap.updates[name].link && snap.updates[name].link !== '#' && (
                        <>
                          {' '}
                          <a href={snap.updates[name].link} target="_blank" rel="noreferrer">
                            registry
                          </a>
                        </>
                      )}
                    </span>
                  )}
                </Row>
                {d.imageCreated && <Row k="Image built">{agoLong(d.imageCreated, now)}</Row>}
                <Row k="Created">{shortDate(d.created)}</Row>
                {d.startedAt && <Row k="Started">{agoLong(d.startedAt, now)}</Row>}
                {d.finishedAt && <Row k="Stopped">{agoLong(d.finishedAt, now)}</Row>}
                <Row k="Restarts">
                  <span className="mono">{d.restartCount}</span>
                  <span className="ledger-aside">policy {d.restartPolicy}</span>
                </Row>
                {d.project && (
                  <Row k="Stack">
                    <Link to={`/stacks#${d.project}`} className="ident">
                      {d.project}
                    </Link>
                    {d.service && <span className="ledger-aside">service {d.service}</span>}
                  </Row>
                )}
                {d.update && !d.update.ok && (
                  <Row k="Updates">
                    <span className="ledger-aside">{d.update.reason}</span>
                  </Row>
                )}
                {d.workingDir && (
                  <Row k="Compose folder">
                    <span className="mono wrap">{d.workingDir}</span>
                  </Row>
                )}
              </dl>
            ) : (
              <Empty>{detail.error ?? 'Loading.'}</Empty>
            )}
          </Section>

          {d && <Wiring d={d} />}

          <Section title="History" count="48 hours">
            <History name={name} now={now} />
          </Section>
        </aside>
      </div>
    </div>
  );
}

function healthCaption(u: UptimeData | null, name: string): string {
  const states = u?.containers[name];
  if (!u || !states) return '';
  const watched = states.filter((s) => s !== 'none').length;
  if (!watched) return 'Patchboard started watching today.';
  const down = states.filter((s) => s === 'down').length;
  const warn = states.filter((s) => s === 'warn').length;
  const span = watched === states.length ? `the last ${states.length} days` : `${plural(watched, 'day')} watched`;
  if (!down && !warn) return `No problems in ${span}.`;
  const parts = [down && `down on ${plural(down, 'day')}`, warn && `unhealthy on ${plural(warn, 'day')}`].filter(Boolean);
  return `${parts.join(', ')} in ${span}.`.replace(/^./, (c) => c.toUpperCase());
}

function AnswersRow({ name, now }: { name: string; now: number }) {
  const { snap } = useStore();
  const ck = checkFor(snap, name);
  const h = useHistory([`svc.ms:${name}`], 24, 120);
  if (!ck) return null;
  return (
    <Row k="Answers">
      {ck.ok ? (
        <span>
          <span className="mono">{ck.ms} ms</span> <span className="ledger-aside">HTTP {ck.status}, {ago(ck.at, now)}</span>
        </span>
      ) : (
        <span className="crit-text">{ck.error ?? 'No answer'}</span>
      )}
      <span className="ledger-aside mono">{ck.target}</span>
      <span className="ledger-spark">
        <Spark data={h[`svc.ms:${name}`]} height={18} label={`${name} response time, last 24 hours`} />
      </span>
    </Row>
  );
}

function Crumbs({ project }: { project?: string }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <Link to="/stacks">Stacks</Link>
      {project && (
        <>
          <span aria-hidden>/</span>
          <Link to={`/stacks#${project}`} className="mono">
            {project}
          </Link>
        </>
      )}
    </nav>
  );
}

function stateSentence(state: string, health: string | null, d: ContainerDetail | null, now: number, expectStopped?: boolean): string {
  const restarts = d && d.restartCount > 0 ? ` Restarted ${plural(d.restartCount, 'time')}.` : '';
  if (state === 'running') {
    const since = d?.startedAt ? `Running for ${agoLong(d.startedAt, now).replace(/ ago$/, '')}.` : 'Running.';
    const h = health === 'healthy' ? ' Healthy.' : health === 'unhealthy' ? ' Failing its health check.' : health === 'starting' ? ' Health check starting.' : '';
    return `${since}${h}${restarts}`;
  }
  if (state === 'restarting') return `Restart-looping.${restarts}`;
  if (state === 'paused') return 'Paused.';
  const when = d?.finishedAt ? ` ${agoLong(d.finishedAt, now)}` : '';
  const code = d?.exitCode != null ? (d.exitCode === 0 ? ', cleanly' : ` with exit code ${d.exitCode}`) : '';
  return `${expectStopped ? 'Finished' : 'Stopped'}${when}${code}.${expectStopped ? ' It runs on a schedule.' : ''}${restarts}`;
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="ledger-row">
      <dt>{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Resources({ name, cpu, mem }: { name: string; cpu?: number; mem?: number }) {
  const h = useHistory([`ctr.cpu:${name}`, `ctr.mem:${name}`], 24, 200);
  const cpuSeries = h[`ctr.cpu:${name}`];
  const memSeries = h[`ctr.mem:${name}`];
  const peak = (s?: [number, number][]) => (s?.length ? Math.max(...s.map((p) => p[1])) : undefined);
  const cpuPeak = peak(cpuSeries);
  const memPeak = peak(memSeries);
  return (
    <Section title="Resources" count="last 24 hours">
      <div className="metrics">
        <div className="metric">
          <span className="metric-num">{cpu == null ? '...' : pct(cpu)}</span>
          <span className="metric-label">CPU, share of the server{cpuPeak != null && `. Peak ${pct(cpuPeak)}`}</span>
          <Spark data={cpuSeries} label={`${name} CPU, last 24 hours`} />
        </div>
        <div className="metric">
          <span className="metric-num">{mem == null ? '...' : size(mem)}</span>
          <span className="metric-label">Memory{memPeak != null && `. Peak ${size(memPeak)}`}</span>
          <Spark data={memSeries} label={`${name} memory, last 24 hours`} />
        </div>
      </div>
    </Section>
  );
}

function LogTail({ name }: { name: string }) {
  const { lines, status, failure } = useLogStream(name, 150, 400);
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    if (stick.current && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);
  return (
    <div
      className="logs-out wrap log-tail"
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
    >
      {lines.map((l) => (
        <div key={l.n} className={lineClass(l)}>
          {l.text || ' '}
        </div>
      ))}
      {status === 'failed' && <p className="logs-note">Couldn't read logs: {failure}</p>}
      {status === 'ended' && lines.length === 0 && <p className="logs-note">No output. The container may not be running.</p>}
      {status === 'streaming' && lines.length === 0 && <p className="logs-note">Waiting for output.</p>}
    </div>
  );
}

function HealthLog({ log, now }: { log: ContainerDetail['healthLog']; now: number }) {
  return (
    <Section title="Health check output">
      <div className="logs-out wrap health-out">
        {log.map((l, i) => (
          <div key={i} className={`ll ${l.exitCode ? 'll-error' : ''}`}>
            {ago(l.at, now)} exit {l.exitCode}: {l.output || '(no output)'}
          </div>
        ))}
      </div>
    </Section>
  );
}

function Runbook({ sections, open = false }: { sections: RunbookSection[]; open?: boolean }) {
  return (
    <Section title="Runbook" className={open ? 'runbook runbook-urgent' : 'runbook'} count={sections.length > 1 ? `${sections.length} sections` : undefined}>
      {sections.map((s) => (
        <RunbookBlock key={s.title} section={s} open={open} />
      ))}
    </Section>
  );
}

function RunbookBlock({ section, open }: { section: RunbookSection; open: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => {
    const raw = marked.parse(section.markdown, { async: false, gfm: true }) as string;
    return DOMPurify.sanitize(raw);
  }, [section.markdown]);

  // A copy button on every code block: these are commands meant to be pasted.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    for (const pre of root.querySelectorAll('pre')) {
      if (pre.querySelector('.copy')) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy';
      btn.textContent = 'Copy';
      btn.addEventListener('click', async () => {
        const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
        try {
          await navigator.clipboard.writeText(code.replace(/\n$/, ''));
          btn.textContent = 'Copied';
        } catch {
          btn.textContent = 'Select and copy';
        }
        setTimeout(() => (btn.textContent = 'Copy'), 1600);
      });
      pre.appendChild(btn);
    }
  }, [html]);

  return (
    <details className="rb" open={open}>
      <summary>{section.title}</summary>
      <div className="prose rb-body" ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
    </details>
  );
}

function Wiring({ d }: { d: ContainerDetail }) {
  const empty = !d.ports.length && !d.mounts.length && !d.dependsOn.length && !d.usedBy.length;
  if (empty && !d.networks.length) return null;
  return (
    <Section title="Wiring">
      <dl className="ledger">
        {d.ports.length > 0 && (
          <Row k="Ports">
            <ul className="plain">
              {d.ports.map((p) => (
                <li key={p.container} className="mono">
                  {p.host ? `${p.host} → ${p.container}` : `${p.container}, not published`}
                </li>
              ))}
            </ul>
          </Row>
        )}
        {d.dependsOn.length > 0 && (
          <Row k="Depends on">
            <CtrLinks names={d.dependsOn} />
          </Row>
        )}
        {d.usedBy.length > 0 && (
          <Row k="Used by">
            <CtrLinks names={d.usedBy} />
          </Row>
        )}
        {d.networks.length > 0 && (
          <Row k="Networks">
            <span className="mono wrap">{d.networks.join(', ')}</span>
          </Row>
        )}
        {d.mounts.length > 0 && (
          <Row k="Mounts">
            <ul className="plain mounts">
              {d.mounts.map((m) => (
                <li key={m.target}>
                  <span className="mono">{m.target}</span>
                  {!m.rw && <span className="tag">read-only</span>}
                  <span className="mono mount-src">{m.source}</span>
                </li>
              ))}
            </ul>
          </Row>
        )}
      </dl>
    </Section>
  );
}

function CtrLinks({ names }: { names: string[] }) {
  const { snap } = useStore();
  const all = containerMap(snap);
  return (
    <ul className="plain">
      {names.map((n) => {
        const c = all.get(n);
        const st = c ? ctrState(c) : 'none';
        return (
          <li key={n}>
            <Link to={`/c/${n}`} className="ctr-link" data-state={st}>
              <span className="dot" aria-hidden />
              <span className="ident">{n}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function History({ name, now }: { name: string; now: number }) {
  const { snap } = useStore();
  const events = snap?.changes.filter((c) => c.subject === name) ?? [];
  if (!events.length) return <Empty>No state changes in the last 48 hours.</Empty>;
  return (
    <ul className="changes">
      {events.map((c) => (
        <li key={c.id} className={`change change-${c.kind.split('.')[1]}`}>
          <div>
            <span className="change-text">{c.kind === 'container.action' ? (actionWord[c.detail ?? ''] ?? changeText[c.kind]) : changeText[c.kind]}</span>
            <time>{ago(c.at, now)}</time>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** What the integration knows about this app, for the containers that have one. */
function AppPanel({ name }: { name: string }) {
  const sonarr = useSource<ArrData>('sonarr').data;
  const radarr = useSource<ArrData>('radarr').data;
  const { servers } = useMediaServers();
  const { clients } = useDownloadClients();
  const frigate = useSource<FrigateData>('frigate').data;
  const feeds = useSource<MinifluxData>('miniflux').data;

  const arr = name === 'sonarr' ? sonarr : name === 'radarr' ? radarr : null;
  if (arr) {
    const next = arr.upcoming.find((u) => Date.parse(u.when) > Date.now() && !u.hasFile);
    return (
      <Section title={name === 'sonarr' ? 'In Sonarr' : 'In Radarr'}>
        <dl className="ledger">
          <Row k="Queue">{plural(arr.queueTotal, 'item')}</Row>
          <Row k="Import problems">{arr.problems.length || 'None'}</Row>
          <Row k="Health">{arr.health.length ? arr.health.map((h) => h.message).join(' ') : 'No warnings'}</Row>
          {next && (
            <Row k="Next">
              {next.title} <span className="ledger-aside">{shortDate(Date.parse(next.when))}</span>
            </Row>
          )}
        </dl>
      </Section>
    );
  }
  const media = servers.find((m) => m.container === name || (m.id === 'tautulli' && name === 'tautulli'));
  if (media) {
    const d = media.data;
    const next = 'nextUp' in d ? d.nextUp : [];
    return (
      <Section title={`In ${media.label}`}>
        <dl className="ledger">
          <Row k="Streams">{d.streams.length ? d.streams.map((s) => `${s.user}: ${s.title}`).join(', ') : 'Nobody watching'}</Row>
          <Row k="Transcoding">{d.streams.filter((s) => s.transcode).length || 'None'}</Row>
          {d.recent[0] && <Row k="Last added">{d.recent[0].title}</Row>}
          {next.length > 0 && <Row k="Next up">{next.slice(0, 3).map((n) => n.title).join(', ')}</Row>}
        </dl>
      </Section>
    );
  }
  const dl = clients.find((d) => d.container === name);
  if (dl) {
    const q = dl.data;
    return (
      <Section title={`In ${dl.label}`}>
        <dl className="ledger">
          <Row k="State">
            {q.paused ? 'Paused' : q.downloading ? 'Downloading' : 'Idle'} <PauseButton client={dl} />
          </Row>
          <Row k={q.kind === 'usenet' ? 'In the queue' : 'Downloading'}>
            {q.downloading} <span className="ledger-aside">{speed(q.down)}</span>
          </Row>
          {q.kind !== 'usenet' && (
            <Row k="Seeding">
              {q.seeding} <span className="ledger-aside">{speed(q.up)}</span>
            </Row>
          )}
          {q.kind !== 'usenet' && <Row k="Stalled">{q.stalled}</Row>}
          <Row k={q.kind === 'usenet' ? 'Failed today' : 'Errored'}>{q.errored.length ? q.errored.join(', ') : 'None'}</Row>
        </dl>
      </Section>
    );
  }
  if (name === 'frigate' && frigate) {
    return (
      <Section title="Cameras">
        <dl className="ledger">
          {frigate.cameras.map((c) => (
            <Row key={c.name} k={c.name}>
              {c.online ? `${c.fps} fps` : <span className="crit-text">Offline</span>}
            </Row>
          ))}
        </dl>
      </Section>
    );
  }
  if (name === 'miniflux' && feeds) {
    return (
      <Section title="In Miniflux" action={{ label: 'Read', to: '/feeds' }}>
        <dl className="ledger">
          <Row k="Unread">{feeds.unread}</Row>
        </dl>
      </Section>
    );
  }
  return null;
}
