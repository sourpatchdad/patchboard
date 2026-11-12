// The box itself: pool, datasets, disks, resources, and what TrueNAS has to
// say. Pool health and capacity come from the TrueNAS API; CPU and memory
// from the host; history from Patchboard's own samples.

import { Roll } from '../components/Roll.tsx';
import { Fragment, useEffect, useState } from 'react';
import { arrange } from '../../shared/pages.ts';
import { CustomizePage, type SectionDef, usePage } from '../components/PageCustomize.tsx';
import { Link, useLocation } from 'react-router-dom';
import { useLanding } from '../lib/landing.ts';
import type { BackupRun, BackupsData, Pool, Series, StatsData, SystemData, TruenasData } from '../../shared/types.ts';
import { Spark, Split } from '../components/Spark.tsx';
import { HourHeatmap } from '../components/Squares.tsx';
import { Empty, Led, Meter, Section } from '../components/ui.tsx';
import { useHistory } from '../lib/api.ts';
import { ago, agoLong, duration, pct, plural, shortDate, size, speed, temp, uptime } from '../lib/format.ts';
import { storageLevel, useLimits, useNow, useSource, useStore } from '../lib/store.tsx';
import { useAppearance } from '../lib/appearance.ts';

const DAY = 86_400_000;

const MAIN = ['storage', 'datasets', 'alerts', 'cloudsync', 'backups'];
const SIDE = ['resources', 'cpu', 'busiest', 'disks'];
const SERVER_SECTIONS: SectionDef[] = [
  { id: 'storage', label: 'Storage', group: 'Storage and backups' },
  { id: 'datasets', label: 'Datasets', group: 'Storage and backups' },
  { id: 'backups', label: 'Backups', group: 'Storage and backups' },
  { id: 'resources', label: 'Resources', group: 'The machine' },
  { id: 'cpu', label: 'CPU by hour', group: 'The machine' },
  { id: 'busiest', label: 'Busiest containers', group: 'The machine' },
  { id: 'disks', label: 'Disks', group: 'The machine' },
  { id: 'alerts', label: 'TrueNAS alerts', group: 'Storage and backups' },
  { id: 'cloudsync', label: 'Cloud sync', group: 'Storage and backups' },
];

// A short landscape screen, such as a wall tablet: the page packs into tight
// columns (styles.css, "Server at a glance") and the CPU week goes last, so
// everything else fits the first screen. Kept in step with that media query.
const GLANCE = '(min-width: 900px) and (max-height: 720px) and (orientation: landscape)';

function useGlance(): boolean {
  const [on, setOn] = useState(() => matchMedia(GLANCE).matches);
  useEffect(() => {
    const m = matchMedia(GLANCE);
    const change = () => setOn(m.matches);
    m.addEventListener('change', change);
    return () => m.removeEventListener('change', change);
  }, []);
  return on;
}

export function Server() {
  const { snap } = useStore();
  const now = useNow(30_000);
  const { state: nasState, data: nas } = useSource<TruenasData>('truenas');
  const { data: sys } = useSource<SystemData>('system');
  const page = usePage('server');
  const glance = useGlance();
  useLanding(!!snap);
  const { hash } = useLocation();
  if (!snap) return null;
  // Arriving at a section you've hidden (the header's CPU graph, say): say so, instead of landing nowhere.
  const wanted = decodeURIComponent(hash.slice(1)).replace(/^storage-.*/, 'storage');
  const hiddenHere = (page.hidden ?? []).includes(wanted) ? SERVER_SECTIONS.find((x) => x.id === wanted)?.label : undefined;

  const part = (id: string) => {
    switch (id) {
      case 'storage':
        return nas ? (
          nas.pools.map((p) => <PoolSection key={p.name} pool={p} snapshots={nas.snapshots} now={now} />)
        ) : (
          <FallbackStorage sys={sys} configured={!!nasState} error={nasState?.error} />
        );
      case 'datasets':
        return nas && nas.datasets.length > 0 ? <Datasets nas={nas} /> : null;
      case 'backups':
        return <Backups now={now} />;
      case 'resources':
        return <Resources sys={sys} nas={nas} />;
      case 'cpu':
        return <CpuWeek />;
      case 'busiest':
        return <Busiest />;
      case 'disks':
        return nas && nas.disks.length > 0 ? <Disks nas={nas} /> : null;
      case 'alerts':
        return nas ? <NasAlerts nas={nas} now={now} /> : null;
      case 'cloudsync':
        return nas && nas.cloudSync.length > 0 ? <CloudSync nas={nas} now={now} /> : null;
    }
    return null;
  };

  const title = nas?.hostname ?? 'Server';
  const facts = [
    nas?.version && nas.version.replace(/^TrueNAS-/, 'TrueNAS '),
    sys && `up ${uptime(sys.uptimeSec)}`,
    sys && `${sys.cores} cores`,
    sys?.mem && `${size(sys.mem.total)} memory`,
  ].filter(Boolean);

  return (
    <div className="page server">
      <header className="detail-head">
        <div className="detail-titles">
          <h1 className="page-title">Server</h1>
          <p className="detail-ident">{[title !== 'Server' ? title : null, ...facts].filter(Boolean).join(', ')}</p>
        </div>
        <CustomizePage page="server" title="Server" sections={SERVER_SECTIONS} />
      </header>

      {hiddenHere && <p className="update-notice">{hiddenHere} is hidden on this page. Customize shows it again.</p>}
      <div className="detail-grid">
        <div className="detail-main">{arrange(MAIN, page).map((id) => <Fragment key={id}>{part(id)}</Fragment>)}</div>
        <aside className="detail-side">
          {arrange(SIDE, page)
            .sort((a, b) => (glance ? Number(a === 'cpu') - Number(b === 'cpu') : 0))
            .map((id) => (
              <Fragment key={id}>{part(id)}</Fragment>
            ))}
        </aside>
      </div>
    </div>
  );
}

function PoolSection({ pool, snapshots, now }: { pool: Pool; snapshots: number | null; now: number }) {
  const limits = useLimits();
  const h = useHistory(['pool.used', 'pool.size'], 24 * 90, 120, 15 * 60_000);
  const level = storageLevel(pool.usedPct, limits);
  const errors = pool.disks.reduce((n, d) => n + d.errors, 0);
  const scan = pool.scan;
  return (
    <Section title="Storage" count={pool.name} id={`storage-${pool.name}`}>
      <div className="pool-figure">
        <span className="big-num">{Math.round(pool.usedPct)}%</span>
        <span className="pool-words">
          {size(pool.usedBytes)} used of {size(pool.sizeBytes)}.
          <br />
          {size(pool.freeBytes)} free.
        </span>
      </div>
      <Meter label={`Storage used on ${pool.name}`} value={pool.usedPct} level={level} />
      <p className="forecast-line">{forecast(h['pool.used'], pool, now)}</p>
      <Spark data={h['pool.used']} height={40} min={Math.min(...(h['pool.used'] ?? [[0, 0]]).map((p) => p[1])) * 0.98} label="Pool used, last 90 days" />
      <dl className="ledger">
        <Row k="Health">
          <span className={pool.healthy ? '' : 'crit-text'}>
            {pool.healthy ? 'Online' : pool.status.toLowerCase()}
          </span>
          <span className="ledger-aside">
            {layoutText(pool)}
            {errors ? `, ${plural(errors, 'error')}` : ', no errors'}
          </span>
        </Row>
        <Row k="Disks">
          <span className="mono">{pool.disks.map((d) => d.name).join(' ')}</span>
        </Row>
        {scan && (
          <Row k={scan.kind === 'RESILVER' ? 'Resilver' : 'Last scrub'}>
            {scan.state === 'SCANNING'
              ? 'Running now'
              : scan.endedAt
                ? `${shortDate(scan.endedAt)}, ${agoLong(scan.endedAt, now)}`
                : scan.state.toLowerCase()}
            <span className="ledger-aside">
              {scan.startedAt && scan.endedAt ? `took ${duration(scan.endedAt - scan.startedAt)}, ` : ''}
              {scan.errors ? <span className="crit-text">{plural(scan.errors, 'error')}</span> : 'no errors'}
            </span>
          </Row>
        )}
        {snapshots != null && (
          <Row k="Snapshots">
            <span className="mono">{snapshots}</span>
          </Row>
        )}
      </dl>
    </Section>
  );
}

function layoutText(p: Pool): string {
  const kind = p.layout.toLowerCase();
  const n = p.disks.length;
  if (kind === 'mirror') return `mirror of ${n} disks`;
  if (kind.startsWith('raidz')) return `${p.layout} of ${n} disks`;
  if (kind === 'stripe' || kind === 'disk') return plural(n, 'disk');
  return `${p.layout}, ${plural(n, 'disk')}`;
}

/**
 * A plain sentence from a straight line through the last 30 days of samples:
 * how fast the pool grows, and when it crosses the next threshold.
 */
function forecast(series: Series | undefined, pool: Pool, now: number): string {
  const recent = (series ?? []).filter(([t]) => t >= now - 30 * DAY);
  if (recent.length < 3 || recent[recent.length - 1][0] - recent[0][0] < 5 * DAY) {
    return 'Collecting history. A growth forecast appears after a few days of samples.';
  }
  const n = recent.length;
  const mt = recent.reduce((s, p) => s + p[0], 0) / n;
  const mv = recent.reduce((s, p) => s + p[1], 0) / n;
  let num = 0;
  let den = 0;
  for (const [t, v] of recent) {
    num += (t - mt) * (v - mv);
    den += (t - mt) ** 2;
  }
  const perDay = den ? (num / den) * DAY : 0;
  const spanDays = Math.round((recent[n - 1][0] - recent[0][0]) / DAY);
  if (perDay < 1 * 2 ** 30) {
    return perDay < -1 * 2 ** 30
      ? `Shrinking over the last ${spanDays} days, by about ${size(-perDay * 7)} a week.`
      : `Holding steady: under 1 GB a day over the last ${spanDays} days.`;
  }
  const target = [80, 90, 95].find((x) => x > pool.usedPct);
  const rate = `Growing about ${size(perDay * 7)} a week.`;
  if (!target) return `${rate} The pool is past 95%.`;
  const days = ((target / 100) * pool.sizeBytes - pool.usedBytes) / perDay;
  if (days > 3650) return `${rate} At this rate it won't reach ${target}% for over ten years.`;
  const when = new Date(now + days * DAY).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return `${rate} At this rate it reaches ${target}% around ${when}.`;
}

function FallbackStorage({ sys, configured, error }: { sys: SystemData | null; configured: boolean; error?: string }) {
  return (
    <Section title="Storage" id="storage">
      {sys?.pool && (
        <div className="pool-figure">
          <span className="big-num">{Math.round(sys.pool.usedPct)}%</span>
          <span className="pool-words">of {sys.pool.path}, which may be one dataset rather than the whole pool.</span>
        </div>
      )}
      <p className="detail-note">
        {configured
          ? `Can't reach TrueNAS: ${error ?? 'no answer yet'}.`
          : 'Connect your NAS for real pool capacity, health, disks and alerts.'}{' '}
        <Link to={configured ? '/settings?tab=connections&setup=truenas' : '/settings?tab=connections#integrations'}>{configured ? 'Check TrueNAS' : 'Connect it'}</Link>
      </p>
    </Section>
  );
}

const TONES = ['ink', 'mid', 'faint'] as const;

function Datasets({ nas }: { nas: TruenasData }) {
  const total = nas.datasets.reduce((n, d) => n + d.usedBytes, 0) || 1;
  const top = nas.datasets.slice(0, 3);
  const rest = nas.datasets.slice(3).reduce((n, d) => n + d.usedBytes, 0);
  return (
    <Section title="Datasets" count={`${nas.datasets.length} top-level`} id="datasets">
      <Split
        label="Space by dataset"
        parts={[
          ...top.map((d, i) => ({ value: d.usedBytes, tone: TONES[i], title: d.name })),
          ...(rest ? [{ value: rest, tone: 'faint' as const, title: 'Everything else' }] : []),
        ]}
      />
      <dl className="ledger ledger-num">
        {nas.datasets.map((d) => (
          <Row key={d.name} k={d.name.split('/').slice(1).join('/')} mono>
            <span className="mono">{size(d.usedBytes)}</span>
            <span className="ledger-aside mono">{Math.round((d.usedBytes / total) * 100)}%</span>
          </Row>
        ))}
      </dl>
    </Section>
  );
}

function Backups({ now }: { now: number }) {
  const { state, data } = useSource<BackupsData>('backups');
  if (!state) return null;
  return (
    <Section title="Backups" count="nightly" source={state} className="backups-sec" id="backups">
      {data ? (
        <>
          <BackupSet title="Databases" runs={data.db} now={now} />
          <BackupSet title="Files" runs={data.files} now={now} />
        </>
      ) : (
        <Empty>Reading the backup logs.</Empty>
      )}
    </Section>
  );
}

function BackupSet({ title, runs, now }: { title: string; runs: BackupRun[]; now: number }) {
  if (!runs.length) return null;
  const last = runs[runs.length - 1];
  const recent = runs.slice(-14);
  const labels = [...new Set(runs.flatMap((r) => r.items.map((i) => i.label)))];
  const failed = last.items.filter((i) => !i.ok).length;
  const when = new Date(last.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return (
    <div className="backup-set">
      <p className="backup-summary">
        <strong>{title}</strong>{' '}
        {failed
          ? <span className="crit-text">{failed} of {last.items.length} failed</span>
          : `${last.items.length} of ${last.items.length} complete`}
        , {dayWord(last.startedAt, now)} at {when}
        {last.finishedAt && last.finishedAt > last.startedAt ? `, took ${duration(last.finishedAt - last.startedAt)}` : ''}
        {last.size ? `. ${last.stored} files kept, ${last.size}.` : '.'}
      </p>
      <ul className="backup-grid">
        {labels.map((label) => {
          // Failures said in words too, not only as red squares.
          const fails = recent.filter((r) => r.items.find((i) => i.label === label && !i.ok));
          const dates = fails.map((r) => new Date(r.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })).join(', ');
          return (
          <li key={label}>
            <span className="backup-label">
              {label}
              {fails.length > 0 && <span className="crit-text">, {fails.length} failed</span>}
            </span>
            <span className="squares" role="img" aria-label={`${label}, last ${recent.length} nights${fails.length ? `: ${fails.length} failed, ${dates}` : ', all complete'}`}>
              {recent.map((r) => {
                const it = r.items.find((i) => i.label === label);
                const cls = !it ? 'sq-none' : it.ok ? 'sq-up' : 'sq-down';
                const day = new Date(r.startedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                return <i key={r.startedAt} className={`sq ${cls}`} title={`${day}: ${!it ? 'not in this run' : it.ok ? 'complete' : 'failed'}`} />;
              })}
            </span>
          </li>
          );
        })}
      </ul>
    </div>
  );
}

function dayWord(t: number, now: number): string {
  const a = new Date(t);
  const b = new Date(now);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  const diff = Math.round((b.getTime() - a.getTime()) / DAY);
  return diff === 0 ? 'today' : diff === 1 ? 'yesterday' : shortDate(t);
}

function Disks({ nas }: { nas: TruenasData }) {
  const { temp: unit } = useAppearance();
  const limits = useLimits();
  return (
    <Section title="Disks" count={plural(nas.disks.length, 'disk')} id="disks">
      <ul className="disks">
        {nas.disks.map((d) => {
          const hot = d.tempC != null && d.tempC >= limits.diskWarnC;
          return (
            <li key={d.name}>
              <span className="ident">{d.name}</span>
              <span className="disk-model" title={d.model}>{d.model}</span>
              <span className="mono disk-size">{d.sizeBytes ? size(d.sizeBytes) : ''}</span>
              <span className={`mono disk-temp ${hot ? 'warn-text' : ''}`}>{d.tempC != null ? temp(d.tempC, unit) : ''}</span>
              <span className="disk-pool">{d.pool ?? 'Not in a pool'}</span>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function Resources({ sys, nas }: { sys: SystemData | null; nas: TruenasData | null }) {
  const h = useHistory(['cpu', 'mem.used'], 24, 200);
  if (!sys) return null;
  const m = sys.mem;
  const used = m ? Math.max(0, m.total - m.available - m.arc) : 0;
  return (
    <Section title="Resources" count="last 24 hours" id="resources">
      <div className="metric">
        <Roll className="metric-num" value={pct(sys.cpuPct)} />
        <span className="metric-label">
          CPU, load {sys.load.map((l) => l.toFixed(2)).join(' ')}
        </span>
        <Spark data={h.cpu} max={100} label="CPU, last 24 hours" />
      </div>
      {m && (
        <div className="metric">
          <Roll className="metric-num" value={size(used)} />
          <span className="metric-label">
            Memory in use by apps and the system. {size(m.arc)} is ZFS cache, which the system hands back when needed. {size(Math.max(0, m.available))} free.
          </span>
          <Split
            label="Memory: in use, ZFS cache, free"
            parts={[
              { value: used, tone: 'ink', title: `In use ${size(used)}` },
              { value: m.arc, tone: 'mid', title: `ZFS cache ${size(m.arc)}` },
              { value: Math.max(0, m.available), tone: 'faint', title: `Free ${size(m.available)}` },
            ]}
          />
          <Spark data={h['mem.used']} label="Memory in use, last 24 hours" />
        </div>
      )}
      {nas?.net && (
        <dl className="ledger">
          {nas.net.map((n) => (
            <Row key={n.iface} k={n.iface} mono>
              <span className="mono">↓ {speed(n.rx)}</span>
              <span className="ledger-aside mono">↑ {speed(n.tx)}</span>
            </Row>
          ))}
        </dl>
      )}
    </Section>
  );
}

function CpuWeek() {
  const h = useHistory(['cpu'], 24 * 7, 1000, 10 * 60_000);
  return (
    <Section title="CPU by hour" count="last 7 days" id="cpu">
      <HourHeatmap series={h.cpu} label="CPU by hour over the last seven days" />
    </Section>
  );
}

function Busiest() {
  const { data: stats } = useSource<StatsData>('stats');
  if (!stats) return null;
  const list = Object.entries(stats.containers);
  if (!list.length) return null;
  const byCpu = [...list].sort((a, b) => b[1].cpu - a[1].cpu).slice(0, 5);
  const byMem = [...list].sort((a, b) => b[1].memBytes - a[1].memBytes).slice(0, 5);
  return (
    <Section title="Busiest containers" action={{ label: 'All stacks', to: '/stacks' }} id="busiest">
      <div className="busiest">
        <div>
          <h3>CPU</h3>
          <ol>
            {byCpu.map(([n, s]) => (
              <li key={n}>
                <Link to={`/c/${n}`} className="ident">{n}</Link>
                <span className="mono">{pct(s.cpu)}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h3>Memory</h3>
          <ol>
            {byMem.map(([n, s]) => (
              <li key={n}>
                <Link to={`/c/${n}`} className="ident">{n}</Link>
                <span className="mono">{size(s.memBytes)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Section>
  );
}

const LEVEL_TONE: Record<string, string> = { WARNING: 'warn', ERROR: 'crit', CRITICAL: 'crit', ALERT: 'crit', EMERGENCY: 'crit' };

function NasAlerts({ nas, now }: { nas: TruenasData; now: number }) {
  return (
    <Section title="TrueNAS alerts" count={nas.alerts.length ? String(nas.alerts.length) : undefined} id="nas-alerts">
      {nas.alerts.length ? (
        <ul className="nas-alerts">
          {nas.alerts.map((a) => (
            <li key={a.id} data-tone={LEVEL_TONE[a.level] ?? 'info'}>
              <Led state={LEVEL_TONE[a.level] === 'crit' ? 'crit' : LEVEL_TONE[a.level] === 'warn' ? 'warn' : 'idle'} />
              <span className="nas-level mono">{a.level.toLowerCase()}</span>
              <span className="nas-text">{a.text}</span>
              {a.at && <time>{ago(a.at, now)}</time>}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>None. TrueNAS has nothing to report.</Empty>
      )}
    </Section>
  );
}

function CloudSync({ nas, now }: { nas: TruenasData; now: number }) {
  return (
    <Section title="Cloud sync" id="cloudsync">
      <ul className="task-list">
        {nas.cloudSync.map((t) => {
          const bad = t.state === 'FAILED' || t.state === 'ERROR';
          const state = !t.enabled ? 'Disabled' : t.state === 'RUNNING' ? 'Running now' : t.state ? t.state.charAt(0) + t.state.slice(1).toLowerCase() : 'Never run';
          return (
            <li key={t.name}>
              <span className="task-name">{t.name}</span>
              <span className={`task-state ${bad ? 'crit-text' : ''}`}>
                {state}
                {t.finishedAt && <span className="ledger-aside"> {agoLong(t.finishedAt, now)}</span>}
              </span>
              {t.error && <span className="ledger-note">{t.error}</span>}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function Row({ k, children, mono }: { k: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="ledger-row">
      <dt className={mono ? 'mono' : undefined}>{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}
