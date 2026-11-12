// One container, everything about it on one page: state, resources, live
// logs, how it's wired, what changed, and the runbook section that applies.
// When something is wrong, the runbook moves to the top.

import { useAppearance } from '../lib/appearance.ts';
import { Attention } from './Home.tsx';
import { QUEUE_NAMES } from '../board/HomeWidgets.tsx';
import { numberText, useAppNumbers } from '../lib/appstats.ts';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMediaServers } from '../lib/media.ts';
import { PauseButton, useDownloadClients } from '../lib/downloads.tsx';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type {
  ArrData,
  ContainerDetail,
  FrigateData,
  ImmichData,
  ListeningData,
  MinifluxData,
  NextcloudData,
  SeerrData,
  TracearrData,
  RunbookSection,
  StatsData,
  UptimeData,
} from '../../shared/types.ts';
import { HealthStrip } from '../components/Squares.tsx';
import { type Action, ContainerActions, VERB } from '../components/Actions.tsx';
import { UpdateButton, UpdateNotice, UpdatePanel, UpdateUndo, useUpdateJob } from '../components/Updater.tsx';
import { Spark } from '../components/Spark.tsx';
import { Empty, Icon, Ident, Section } from '../components/ui.tsx';
import { useHistory, useJson } from '../lib/api.ts';
import { ago, agoLong, pct, plural, shortDate, size, speed } from '../lib/format.ts';
import { lineClass, logTime, useLogStream } from '../lib/logs.ts';
import { checkFor, containerMap, ctrState, isExternal, serviceFor } from '../lib/services.ts';
import { useNow, useSource, useStore } from '../lib/store.tsx';
import { locale } from '../lib/region.ts';

const changeText = {
  'container.stopped': 'Stopped',
  'container.started': 'Started',
  'container.restarted': 'Restarted',
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
  const upd = useUpdateJob(name);
  // Refetched when Docker reports a new state or a job ends, so start and stop times stay true.
  const jobEnd = upd.last && upd.last.status !== 'running' ? upd.last.id : '';
  const detail = useJson<ContainerDetail>(`/api/containers/${encodeURIComponent(name)}?s=${encodeURIComponent(ctr?.status ?? '')}&j=${jobEnd}`, 30_000);
  // Start, stop or restart sent: the state line says so until Docker reports it done.
  const [pending, setPending] = useState<{ action: Action; status: string; stuck: boolean } | null>(null);
  // Sent from Jump to: pick it up here and follow it the same way.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const sent = params.get('sent') as Action | null;
    if (!sent || !ctr || !(sent in VERB)) return;
    setPending({ action: sent, status: ctr.status, stuck: false });
    params.delete('sent');
    setParams(params, { replace: true });
  }, [params.get('sent'), !!ctr]);
  useEffect(() => {
    if (pending && ctr && ctr.status !== pending.status) setPending(null);
  }, [ctr?.status]);
  useEffect(() => {
    if (!pending || pending.stuck) return;
    const t = setTimeout(() => setPending((p) => (p ? { ...p, stuck: true } : p)), 30_000);
    return () => clearTimeout(t);
  }, [pending?.action, pending?.stuck]);
  const runbook = useJson<{ available: boolean; sections: RunbookSection[] }>(`/api/runbook/${encodeURIComponent(name)}`);
  const { data: stats } = useSource<StatsData>('stats');
  const uptime = useJson<UptimeData>('/api/uptime?days=30', 5 * 60_000).data;
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
  const jobRunning = upd.job?.status === 'running';
  const problem = state === 'down' || state === 'warn';
  const d = detail.data;
  const live = stats?.containers[name];
  const sections = runbook.data?.sections ?? [];
  const dozzle = snap.links.dozzle;
  // This app's alerts, from the same list as Home's Needs attention.
  // The state line already says stopped or unhealthy; the rest (a failing check, an app's own alert) still shows.
  const mine = snap.alerts.filter(
    (a) => a.id !== `ctr-down-${name}` && a.id !== `ctr-unhealthy-${name}` && (a.subject === name || a.href === `/c/${name}` || (svc && (a.subject === svc.name || a.title.includes(svc.name)))),
  );
  const number = svc ? numberText(nums[svc.name]) : null;

  // Calm: no trouble, no update running. Then the logs keep the side to
  // themselves and the details balance the main column. In trouble, the
  // container's facts sit under the fix, Wiring and History beside the logs,
  // so neither column runs empty.
  const calm = !problem && mine.length === 0 && !upd.job;
  const facts = (
    <>
            <AppPanel name={name} />
            <Section title="Container">
              {d ? (
                <dl className="ledger">
                  {svc && checkFor(snap, svc.name) && <AnswersRow name={svc.name} now={now} />}
                  <Row k="Image">
                    <span className="mono wrap">{d.image}</span>
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

    </>
  );
  const history = (
    <>
      {d && <Wiring d={d} />}
      <Section title="History" count="48 hours">
        <History name={name} now={now} />
      </Section>
    </>
  );
  return (
    <div className="page detail">
      <Crumbs project={ctr.project} />
      <header className="detail-head">
        {/* On a phone the header opens up: name, then state and Start, then these links. */}
        <div className="detail-id">
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
        </div>
        <div className="detail-actions">
          {svc?.href && isExternal(svc.href) && (
            <a className="button" href={svc.href} target="_blank" rel="noreferrer">
              Open {svc.name}
            </a>
          )}
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
        <p className={`detail-state tone-${pending || jobRunning ? 'busy' : problem ? (state === 'down' ? 'crit' : 'warn') : 'ok'}`} aria-live="polite" tabIndex={-1} id="ctr-state">
          <span className="status-led" aria-hidden />
          <span>
            {jobRunning
              ? upd.job!.kind === 'rollback'
                ? `Rolling back to ${upd.job!.to ?? 'the previous image'}...`
                : 'Updating...'
              : pending
              ? pending.stuck
                ? `${VERB[pending.action][0]} sent, and Docker still reports it ${ctr.state === 'running' ? 'running' : 'stopped'} after 30 seconds.`
                : `${VERB[pending.action][1]}...`
              : stateSentence(ctr.state, ctr.health, d, now, svc?.expectStopped)}
          </span>
          {number && <span className={`detail-number tone-${number.tone}`}>{number.text}</span>}
        </p>
        {/* Stopped: Start comes first, before Update. */}
        {/* Stopped: Start leads as the main action, except for a job that runs on a schedule. */}
        <div className={`ctr-actions-wrap ${ctr.state === 'running' || ctr.state === 'restarting' || svc?.expectStopped ? '' : 'is-stopped'}`}>
          {(() => {
            const update = !snap.readOnly && detail.data?.update?.ok && (
              <UpdateButton key="update" name={name} busy={jobRunning} busyLabel={upd.job?.kind === 'rollback' ? 'Rolling back...' : undefined} locked={!!pending && !pending.stuck} waiting={!!snap.updates[name] || !!ctr.staleImage} onStart={() => void upd.start()} />
            );
            const running = ctr.state === 'running' || ctr.state === 'restarting';
            const actions = !snap.readOnly && <ContainerActions key="actions" name={name} running={running} self={name === (snap.self?.container ?? 'patchboard')} onSent={(action) => {
                setPending({ action, status: ctr.status, stuck: false });
                // The button you pressed is about to be swapped for another: hold focus on the state line.
                document.getElementById('ctr-state')?.focus();
              }} locked={upd.job?.status === 'running' || (!!pending && !pending.stuck)} />;
            // In reading and tab order too: a stopped container leads with Start.
            return running ? [update, actions] : [actions, update];
          })()}
        </div>
      </div>

      <UpdateNotice name={name} stale={ctr.staleImage} busy={jobRunning} />
      {!upd.job && <UpdateUndo job={upd.last} onRollback={(id) => void upd.rollback(id)} />}

      <div className="health-row">
        <HealthStrip states={uptime?.containers[name]} days={uptime?.days ?? []} label={`${name}, last 30 days`} large />
        <span className="health-caption">{healthCaption(uptime, name)}</span>
      </div>

      <div className={`detail-grid ${problem ? 'has-problem' : ''} ${problem && sections.length ? 'has-runbook' : ''} ${calm ? '' : 'is-trouble'}`}>
        <div className="detail-main">
          <UpdatePanel job={upd.job} error={upd.error} onRollback={(id) => void upd.rollback(id)} onDismiss={upd.dismiss} />
          {mine.length > 0 && <Attention alerts={mine} now={now} />}
          {problem && sections.length > 0 && <Runbook sections={sections} open />}
          {d?.health === 'unhealthy' && d.healthLog.length > 0 && <HealthLog log={d.healthLog} now={now} />}
          {ctr.state === 'running' && <Resources name={name} cpu={live?.cpu} mem={live?.memBytes} />}
          {!problem && sections.length > 0 && <Runbook sections={sections} />}
          {runbook.data && !runbook.data.available && sections.length === 0 && problem && (
            <p className="detail-note">Mount the folder holding RUNBOOK.md at /docs and the matching section shows up here.</p>
          )}
          {calm ? facts : <div className="detail-facts">{facts}</div>}
          {calm && history}
        </div>

        {/* The live logs sit beside the fix, so 2 AM needs no scrolling. */}
        <aside className="detail-side">
          <Section title="Logs" action={{ label: 'Full logs', to: `/logs/${name}` }} className="side-logs">
            <LogTail key={ctr.state} name={name} />
          </Section>
          {!calm && <div className="detail-later">{history}</div>}
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
    const since = !d?.startedAt ? 'Running.' : now - d.startedAt < 60_000 ? 'Just started.' : `Running for ${agoLong(d.startedAt, now).replace(/ ago$/, '')}.`;
    const h = health === 'healthy' ? ' Healthy.' : health === 'unhealthy' ? ' Failing its health check.' : health === 'starting' ? ' Health check starting.' : '';
    return `${since}${h}${restarts}`;
  }
  if (state === 'restarting') return `Restart-looping.${restarts}`;
  if (state === 'paused') return 'Paused.';
  const when = d?.finishedAt ? ` ${agoLong(d.finishedAt, now)}` : '';
  // 143 and 137 are Docker's own stop (SIGTERM) and kill (SIGKILL): a stop, not a crash.
  const code = d?.exitCode == null ? '' : d.exitCode === 0 || d.exitCode === 143 ? ', cleanly' : d.exitCode === 137 ? ', killed when it didn\'t stop in time' : ` with exit code ${d.exitCode}`;
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
  const { clock24 } = useAppearance();
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    if (stick.current && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);
  return (
    <div
      className="logs-out wrap log-tail"
      role="log"
      // New lines arrive every few seconds; a screen reader reads the tail on request, not each line.
      aria-live="off"
      aria-label={`${name} logs, newest last`}
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
    >
      {lines.map((l) => (
        <div key={l.n} className={lineClass(l)}>
          {l.at && <time className="ll-time" dateTime={new Date(l.at).toISOString()} title={l.own}>{logTime(l.at, clock24)}</time>}
          {l.text || ' '}
        </div>
      ))}
      {status === 'failed' && <p className="logs-note">Couldn't read logs: {failure}</p>}
      {status === 'ended' && lines.length === 0 && <p className="logs-note">It has written nothing yet.</p>}
      {status === 'ended' && lines.length > 0 && <p className="logs-note">It stopped here. These are its last lines.</p>}
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
  // As on Home: a stop is red only while it's unexplained (not a scheduled job, not over).
  const ctr = containerMap(snap).get(name);
  const over = !ctr || ctrState(ctr, serviceFor(snap, name)) !== 'down';
  if (!events.length) return <Empty>No state changes in the last 48 hours.</Empty>;
  return (
    <ul className="changes">
      {events.map((c) => (
        <li key={c.id} className={`change change-${c.kind.split('.')[1]} ${c.kind === 'container.stopped' && over ? 'is-over' : ''}`}>
          <div>
            <span className="change-text">{c.kind === 'container.action' ? (actionWord[c.detail ?? ''] ?? changeText[c.kind]) : c.kind === 'container.restarted' && c.detail === 'updated' ? 'Updated' : changeText[c.kind]}</span>
            <time>{ago(c.at, now)}</time>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** What the integration knows about this app, for the containers that have one. */
function AppPanel({ name }: { name: string }) {
  const readOnly = !!useStore().snap?.readOnly;
  const sonarr = useSource<ArrData>('sonarr').data;
  const radarr = useSource<ArrData>('radarr').data;
  const { servers } = useMediaServers();
  const { clients } = useDownloadClients();
  const frigate = useSource<FrigateData>('frigate').data;
  const feeds = useSource<MinifluxData>('miniflux').data;
  const immich = useSource<ImmichData>('immich').data;
  const nextcloud = useSource<NextcloudData>('nextcloud').data;
  const bazarr = useSource<ArrData>('bazarr').data;
  const prowlarr = useSource<ArrData>('prowlarr').data;
  const abs = useSource<ListeningData>('audiobookshelf').data;
  const navi = useSource<ListeningData>('navidrome').data;
  const seerr = useSource<SeerrData>('overseerr').data;
  const tracearr = useSource<TracearrData>('tracearr').data;

  const arr = name === 'sonarr' ? sonarr : name === 'radarr' ? radarr : null;
  if (arr) {
    const next = arr.upcoming.find((u) => Date.parse(u.when) > Date.now() && !u.hasFile);
    return (
      <Section title={name === 'sonarr' ? 'In Sonarr' : 'In Radarr'}>
        <dl className="ledger">
          <Row k="Queue">{plural(arr.queueTotal, 'item')}</Row>
          <Row k="Import problems">{arr.problems.length || 'None'}</Row>
          {!readOnly && <SearchMissing app={name as 'sonarr' | 'radarr'} />}
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
          {d.library && (
            <Row k="Library">
              {[
                plural(d.library.movies, 'film'),
                plural(d.library.shows, 'show'),
                plural(d.library.episodes, 'episode'),
                d.library.songs ? plural(d.library.songs, 'song') : '',
              ]
                .filter(Boolean)
                .join(', ')}
            </Row>
          )}
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
  if ((name === 'immich-server' || name === 'immich') && immich) {
    const busy = immich.queues.filter((q) => q.active + q.waiting > 0);
    const failed = immich.queues.reduce((n, q) => n + q.failed, 0);
    return (
      <Section title="In Immich" action={{ label: 'Open Immich', href: immich.webUrl }}>
        <dl className="ledger">
          <Row k="Library">
            {immich.photos.toLocaleString(locale())} photos, {immich.videos.toLocaleString(locale())} videos <span className="ledger-aside">{size(immich.usage)}</span>
          </Row>
          <Row k="Working on">{busy.length ? busy.map((q) => `${QUEUE_NAMES[q.name] ?? q.name} ${(q.active + q.waiting).toLocaleString(locale())}`).join(', ') : 'Nothing'}</Row>
          {failed > 0 && <Row k="Failed jobs"><span className="warn-text">{failed}</span></Row>}
          {immich.version && <Row k="Version">{immich.version}</Row>}
        </dl>
      </Section>
    );
  }
  if ((name === 'nextcloud' || name === 'nextcloud-app') && nextcloud) {
    return (
      <Section title="In Nextcloud" action={{ label: 'Open Nextcloud', href: nextcloud.webUrl }}>
        <dl className="ledger">
          <Row k="Files">{nextcloud.files.toLocaleString(locale())}</Row>
          <Row k="Users">
            {nextcloud.users} {nextcloud.activeToday != null && <span className="ledger-aside">{nextcloud.activeToday} active today</span>}
          </Row>
          {nextcloud.freeBytes != null && <Row k="Free space">{size(nextcloud.freeBytes)}</Row>}
          <Row k="App updates">{nextcloud.appUpdates ? <a href={`${nextcloud.webUrl}/settings/apps/updates`} target="_blank" rel="noreferrer">{nextcloud.appUpdates}</a> : 'None'}</Row>
          {nextcloud.version && <Row k="Version">{nextcloud.version}</Row>}
        </dl>
      </Section>
    );
  }
  const other = name === 'bazarr' ? bazarr : name === 'prowlarr' ? prowlarr : null;
  if (other) {
    return (
      <Section title={name === 'bazarr' ? 'In Bazarr' : 'In Prowlarr'}>
        <dl className="ledger">
          {name === 'bazarr' && <Row k="Missing subtitles">{other.queueTotal ? other.queueTotal.toLocaleString(locale()) : 'None'}</Row>}
          <Row k="Health">{other.health.length ? other.health.map((h) => h.message).join(' ') : 'No warnings'}</Row>
        </dl>
      </Section>
    );
  }
  const listening = name === 'audiobookshelf' ? { label: 'Audiobookshelf', d: abs } : name === 'navidrome' ? { label: 'Navidrome', d: navi } : null;
  if (listening?.d) {
    return (
      <Section title={`In ${listening.label}`}>
        <dl className="ledger">
          <Row k="Listening">{listening.d.streams.length ? listening.d.streams.map((s) => `${s.user}: ${s.title}`).join(', ') : 'Nobody right now'}</Row>
        </dl>
      </Section>
    );
  }
  if (['overseerr', 'jellyseerr', 'seerr'].includes(name) && seerr) {
    return (
      <Section title="Requests">
        <dl className="ledger">
          <Row k="Waiting">{seerr.pending ? seerr.requests.slice(0, 5).map((r) => r.title).join(', ') : 'Nothing'}</Row>
          <Row k="On the way">{seerr.processing || 'None'}</Row>
        </dl>
      </Section>
    );
  }
  if (name === 'tracearr' && tracearr) {
    return (
      <Section title="In Tracearr" className="tracearr-panel" action={{ label: 'Open Tracearr', href: tracearr.webUrl }}>
        <dl className="ledger">
          {tracearr.servers.map((s) => (
            <Row key={s.id} k={s.name}>
              {s.status === 'down' ? <span className="crit-text">Down{s.reason ? `: ${s.reason}` : ''}</span> : s.status === 'up' ? `Up, ${plural(s.streams, 'stream')}` : 'Unknown'}
            </Row>
          ))}
          <Row k="To review">
            {tracearr.violations.length ? (
              <a href={`${tracearr.webUrl}/violations`} target="_blank" rel="noreferrer">
                {plural(tracearr.violations.length, 'violation')}
              </a>
            ) : (
              'Nothing'
            )}
          </Row>
        </dl>
      </Section>
    );
  }
  if (name === 'miniflux' && feeds) {
    return (
      <Section title="In Miniflux" action={{ label: 'Read', to: '/reading' }}>
        <dl className="ledger">
          <Row k="Unread">{feeds.unread}</Row>
        </dl>
      </Section>
    );
  }
  return null;
}

/** Ask Sonarr or Radarr to search for everything monitored that has no file. */
function SearchMissing({ app }: { app: 'sonarr' | 'radarr' }) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'failed'>('idle');
  return (
    <Row k="Missing">
      <button
        type="button"
        className="text-button"
        disabled={state === 'busy' || state === 'sent'}
        onClick={async () => {
          setState('busy');
          const res = await fetch(`/api/arr/${app}/search-missing`, { method: 'POST', headers: { 'X-Patchboard': 'action' } }).catch(() => null);
          setState(res?.ok ? 'sent' : 'failed');
        }}
      >
        {state === 'sent' ? `${app === 'sonarr' ? 'Sonarr' : 'Radarr'} is searching` : state === 'failed' ? 'Try again' : 'Search for everything missing'}
      </button>
    </Row>
  );
}
