// Monitor: the whole server on one screen, made for a tablet on the wall.
// No nav bar. A status line; a row of live charts that move with every
// update; waffles for the fleet, the backups and the CPU week; disk
// temperatures; and one feed of container events and the warning and error
// lines from every container's log. Terminal-styled whatever the theme.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { BackupRun, BackupsData, ChangeEvent, Container, Series, StatsData, SystemData, TruenasData } from '../../shared/types.ts';
import { HourHeatmap } from '../components/Squares.tsx';
import { useHistory } from '../lib/api.ts';
import { setPageName, useAppearance } from '../lib/appearance.ts';
import { needsYou } from '../lib/attention.ts';
import { useFollowOpens, useNightDim } from '../lib/household.ts';
import { WallPages } from '../components/WallPages.tsx';
import { pct, size, speed, temp } from '../lib/format.ts';
import { useLimits, useNow, useSource, useStore } from '../lib/store.tsx';
import { locale } from '../lib/region.ts';

interface FeedLine {
  key: string;
  at: number;
  level: 'warn' | 'error' | 'event';
  who: string;
  text: string;
  /** The same message again: how many times, shown once. */
  count?: number;
}

const EVENT_WORDS: Record<ChangeEvent['kind'], string> = {
  'container.stopped': 'stopped',
  'container.started': 'started',
  'container.restarted': 'restarted',
  'container.unhealthy': 'failing its health check',
  'container.recovered': 'recovered',
  'container.action': 'changed',
};

const POINTS = 90;

export function Monitor() {
  const { snap, auth } = useStore();
  const now = useNow(1000);
  const { clock24, temp: unit } = useAppearance();
  const limits = useLimits();
  const sysState = useSource<SystemData>('system');
  const nasState = useSource<TruenasData>('truenas');
  const sys = sysState.data;
  const nas = nasState.data;
  const { data: backups } = useSource<BackupsData>('backups');
  const h = useHistory(['cpu', 'mem.used', 'net.rx', 'net.tx'], 2, POINTS, 5 * 60_000);
  const poolHistory = useHistory(['pool.used'], 24 * 30, 120, 30 * 60_000);
  const week = useHistory(['cpu'], 24 * 7, 1000, 10 * 60_000);
  const problems = useProblemFeed();

  useEffect(() => setPageName('Monitor'), []);
  useFollowOpens();
  useNightDim();
  // The Monitor's color: set per household device in Settings, or ?tint= in the address.
  const asked = new URLSearchParams(location.search).get('tint') ?? '';
  const tint = snap?.household?.tint ?? (['blue', 'color'].includes(asked) ? asked : 'gray');

  // Live lines: the last two hours from history, then every new reading on the end.
  const mem = sys?.mem;
  const memUsed = mem ? Math.max(0, mem.total - mem.available - mem.arc) : 0;
  const net = nas?.net?.reduce((t, n) => ({ rx: t.rx + n.rx, tx: t.tx + n.tx }), { rx: 0, tx: 0 });
  const cpuLine = useLive(h.cpu, sys ? sys.cpuPct : null, sysState.state?.updatedAt);
  const memLine = useLive(h['mem.used'], mem ? memUsed : null, sysState.state?.updatedAt);
  const rxLine = useLive(h['net.rx'], net ? net.rx : null, nasState.state?.updatedAt);
  const txLine = useLive(h['net.tx'], net ? net.tx : null, nasState.state?.updatedAt);

  const events = useMemo<FeedLine[]>(
    () =>
      (snap?.changes ?? []).map((c) => ({
        key: `c${c.id}`,
        at: c.at,
        level: c.kind === 'container.stopped' || c.kind === 'container.unhealthy' ? 'warn' : 'event',
        who: c.subject,
        text: c.detail ? `${EVENT_WORDS[c.kind]}: ${c.detail}` : EVENT_WORDS[c.kind],
      })),
    [snap?.changes],
  );
  const feed = useMemo(() => [...events, ...problems].sort((a, b) => a.at - b.at).slice(-120), [events, problems]);

  // Sign-in and the connecting state live in the regular page frame.
  if (auth && !snap) return <Navigate to="/" replace />;
  if (!snap) return <div className="monitor monitor-wait">connecting</div>;

  const containers = (snap.sources.docker?.data as { containers: Container[] } | null)?.containers ?? [];
  const running = containers.filter((c) => c.state === 'running').length;
  const trouble = needsYou(snap.alerts);
  const stats = (snap.sources.stats?.data as StatsData | null)?.containers ?? {};
  // As many as the column has room for; the rest stay off screen.
  const busiest = Object.entries(stats)
    .sort((a, b) => b[1].cpu - a[1].cpu)
    .slice(0, 12);
  const updating = Object.keys(snap.updates).sort();
  const host = nas?.hostname ?? snap.brand?.name ?? 'patchboard';
  const time = new Date(now).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: !clock24 });
  const pool = nas?.pools[0];
  const poolLevel = pool ? (pool.usedPct >= limits.poolCritPct ? 'is-crit' : pool.usedPct >= limits.poolWarnPct ? 'is-warn' : '') : '';
  const netMax = Math.max(1, ...rxLine.map((p) => p[1]), ...txLine.map((p) => p[1]));
  // While TrueNAS's live feed reconnects (after a restart), the last recorded reading stands in.
  const netIn = net ? net.rx : (rxLine[rxLine.length - 1]?.[1] ?? null);
  const netOut = net ? net.tx : (txLine[txLine.length - 1]?.[1] ?? null);

  return (
    <div className={`monitor tint-${tint}`}>
      <WallPages />
      <header className="mon-status">
        <Link to="/" className="mon-host" title="Back to Home">
          {host.toLowerCase()}
        </Link>
        <span className="mon-dim">{nas?.version ? nas.version.replace(/^TrueNAS-/, 'truenas ').toLowerCase() : ''}</span>
        {sys && <span className="mon-dim">up {ticking(sys.uptimeSec + Math.max(0, (now - (sysState.state?.updatedAt ?? now)) / 1000))}</span>}
        {sys && <span className="mon-dim">load {sys.load.map((l) => l.toFixed(2)).join(' ')}</span>}
        <span className={`mon-state ${trouble.some((a) => a.level === 'critical') ? 'is-crit' : trouble.length ? 'is-warn' : ''}`} role="status">
          {trouble.length ? `${trouble.length} need${trouble.length === 1 ? 's' : ''} you` : 'all quiet'}
        </span>
        <time className="mon-clock">{time}</time>
      </header>

      <section className="mon-charts" aria-label="Live">
        <Tile k="cpu" label="cpu" value={sys ? pct(sys.cpuPct) : '--'}>
          <LiveChart lines={[{ points: cpuLine }]} max={100} label="CPU, live" />
        </Tile>
        <Tile k="mem" label="memory" value={mem ? size(memUsed) : '--'} note={mem ? `of ${size(mem.total)}, ${size(mem.arc)} zfs cache` : undefined}>
          <LiveChart lines={[{ points: memLine }]} max={mem?.total} label="Memory in use, live" />
        </Tile>
        <Tile k="net" label="network" value={netIn != null ? speed(netIn) : '--'} note={netOut != null ? `in, ${speed(netOut)} out` : undefined}>
          <LiveChart lines={[{ points: rxLine }, { points: txLine, quiet: true }]} max={netMax} label="Network in and out, live" />
        </Tile>
        <Tile k="pool" label={pool ? `pool ${pool.name.toLowerCase()}` : 'pool'} value={pool ? `${Math.round(pool.usedPct)}%` : '--'} tone={poolLevel} note={pool ? `${size(pool.freeBytes)} free of ${size(pool.sizeBytes)}` : undefined}>
          {pool && (
            <div className={`mon-gauge ${poolLevel}`} role="img" aria-label={`${Math.round(pool.usedPct)}% used`}>
              <i style={{ width: `${Math.min(100, pool.usedPct)}%` }} />
              <b style={{ left: `${limits.poolWarnPct}%` }} />
              <b style={{ left: `${limits.poolCritPct}%` }} />
            </div>
          )}
          {pool && (poolHistory['pool.used']?.length ?? 0) > 2 && <LiveChart lines={[{ points: poolHistory['pool.used']!, quiet: true }]} label="Pool used, last 30 days" thin />}
        </Tile>
      </section>

      <section className="mon-col" aria-label="Load, the week and disks">
        {sys && (
          <div className="mon-waffles">
            <div className="k-cpu">
              <p className="mon-label">cpu now</p>
              <Waffle parts={[{ pct: sys.cpuPct, tone: 'is-hot' }]} label={`CPU ${pct(sys.cpuPct)}`} />
            </div>
            {mem && (
              <div className="k-mem">
                <p className="mon-label">memory</p>
                <Waffle
                  parts={[
                    { pct: (memUsed / mem.total) * 100, tone: 'is-hot' },
                    { pct: (mem.arc / mem.total) * 100, tone: 'is-up' },
                  ]}
                  label={`Memory: ${size(memUsed)} in use, ${size(mem.arc)} ZFS cache, ${size(Math.max(0, mem.available))} free`}
                />
              </div>
            )}
          </div>
        )}
        <div className="mon-block mon-week k-cpu">
          <p className="mon-label">cpu by hour, 7 days</p>
          <HourHeatmap series={week.cpu} label="CPU by hour over the last seven days" />
        </div>
        {nas && nas.disks.length > 0 && (
          <div className="mon-block">
            <p className="mon-label">disks</p>
            <ul className="mon-temps k-disk">
              {nas.disks.map((d) => {
                const level = d.tempC != null && d.tempC >= limits.diskCritC ? 'is-crit' : d.tempC != null && d.tempC >= limits.diskWarnC ? 'is-warn' : '';
                return (
                  <li key={d.name} className={level}>
                    <span>{d.name}</span>
                    <span className="mon-meter">
                      <i style={{ width: `${d.tempC != null ? Math.min(100, (d.tempC / limits.diskCritC) * 100) : 0}%` }} />
                    </span>
                    <span className="mon-num">{d.tempC != null ? temp(d.tempC, unit === 'both' ? 'f' : unit) : '--'}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {busiest.length > 0 && (
          <Fill>
            <p className="mon-label">busiest now</p>
            <ul className="mon-busy k-cpu">
              {busiest.map(([name, s]) => (
                <li key={name}>
                  <span className="mon-clip">{name}</span>
                  <span className="mon-meter">
                    <i style={{ width: `${Math.min(100, (s.cpu / Math.max(1, busiest[0][1].cpu)) * 100)}%` }} />
                  </span>
                  <span className="mon-num">{pct(s.cpu)}</span>
                  <span className="mon-dim">{size(s.memBytes)}</span>
                </li>
              ))}
            </ul>
          </Fill>
        )}
      </section>

      <section className="mon-col" aria-label="Backups, cloud sync and the fleet">
        {backups && (
          <div className="mon-block">
            <p className="mon-label">backups, 14 nights</p>
            <BackupWaffle runs={backups.db} />
            <BackupWaffle runs={backups.files} />
          </div>
        )}
        {nas && nas.cloudSync.length > 0 && (
          <div className="mon-block">
            <p className="mon-label">cloud sync</p>
            <ul className="mon-rows">
              {nas.cloudSync.map((t) => {
                const bad = !!t.error || (t.state ?? '').toUpperCase() === 'FAILED';
                return (
                  <li key={t.name}>
                    <span className="mon-clip">{t.name.toLowerCase()}</span>
                    <span className={bad ? 'is-crit' : 'mon-num'}>{(t.state ?? 'never').toLowerCase()}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <div className="mon-block">
          <p className="mon-label">
            fleet <span className="mon-num">{running}</span>
            <span className="mon-dim">/{containers.length} running</span>
          </p>
          <Fleet containers={containers} updates={snap.updates} />
        </div>
        {trouble.length > 0 && (
          <Fill grow={false}>
            <p className="mon-label">needs you {trouble.length}</p>
            <ul className="mon-list">
              {trouble.map((a) => (
                <li key={a.id} className={a.level === 'critical' ? 'is-crit' : 'is-warn'}>
                  {a.title}
                </li>
              ))}
            </ul>
          </Fill>
        )}
        {updating.length > 0 && (
          <Fill>
            <p className="mon-label">updates waiting {updating.length}</p>
            <ul className="mon-tags">
              {updating.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </Fill>
        )}
      </section>

      <section className="mon-feed" aria-label="Events and log problems">
        <p className="mon-label">feed</p>
        <ol className="mon-lines">
          {feed.map((l) => (
            <li key={l.key} className={`lvl-${l.level}`}>
              <time>{feedTime(l.at, now)}</time>
              <span className="mon-who">{l.who}</span>
              <span className="mon-text">
                <span className="mon-lvl">{l.level === 'error' ? 'err ' : l.level === 'warn' ? 'warn ' : ''}</span>
                {l.text}
              </span>
              <span className="mon-count">{l.count && l.count > 1 ? `×${l.count}` : ''}</span>
            </li>
          ))}
          <li className="mon-cursor" aria-hidden>
            _
          </li>
        </ol>
      </section>
    </div>
  );
}

/**
 * A column's last blocks: as many whole rows as fit (styles.css wraps the
 * rest out of sight). With room for no row at all, the block hides, heading
 * and all, rather than leaving a heading alone or cut. `grow` takes the space
 * that's left; without it the block takes what it needs first.
 */
function Fill({ children, grow = true }: { children: React.ReactNode; grow?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const box = el.getBoundingClientRect();
      const first = el.querySelector('li')?.getBoundingClientRect();
      setEmpty(!first || first.left >= box.right - 1 || first.bottom > box.bottom + 0.5);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  });
  return (
    <div ref={ref} className={`mon-block mon-fill ${grow ? '' : 'is-fit'} ${empty ? 'is-empty' : ''}`}>
      {children}
    </div>
  );
}

/**
 * A hundred squares, one per percent, filling from the bottom like a glass.
 * Each part takes the next squares in its tone; the rest stay dark.
 */
function Waffle({ parts, label }: { parts: { pct: number; tone: string }[]; label: string }) {
  const cells: string[] = [];
  for (const p of parts) for (let i = 0; i < Math.round(Math.max(0, Math.min(100, p.pct))) && cells.length < 100; i++) cells.push(p.tone);
  while (cells.length < 100) cells.push('');
  // Row 0 is the bottom row, so the first squares fill from the bottom left.
  const rows = Array.from({ length: 10 }, (_, r) => cells.slice(r * 10, r * 10 + 10)).reverse();
  return (
    <div className="mon-waffle100" role="img" aria-label={label}>
      {rows.flat().map((tone, i) => (
        <i key={i} className={tone} />
      ))}
    </div>
  );
}

/** Uptime down to the second: "68d 07:12:04". */
function ticking(sec: number): string {
  const s = Math.floor(sec);
  const d = Math.floor(s / 86_400);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d ? `${d}d ` : ''}${pad(Math.floor((s % 86_400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** `k` names what the tile shows, so a colored Monitor can give each its own hue. */
function Tile({ k, label, value, note, tone = '', children }: { k: string; label: string; value: string; note?: string; tone?: string; children?: React.ReactNode }) {
  return (
    <div className={`mon-tile k-${k}`}>
      <p className="mon-label">{label}</p>
      <p className={`mon-big ${tone}`}>{value}</p>
      {children}
      {note && <p className="mon-dim mon-note">{note}</p>}
    </div>
  );
}

/**
 * History, then each new reading on the end, keeping the last POINTS. A new
 * reading is one whose source updated since the last, so the line moves in
 * step with the server instead of the screen.
 */
function useLive(history: Series | undefined, value: number | null, updatedAt: number | null | undefined): Series {
  const [tail, setTail] = useState<Series>([]);
  useEffect(() => {
    if (value == null || !updatedAt) return;
    setTail((t) => (t.length && t[t.length - 1][0] >= updatedAt ? t : [...t, [updatedAt, value] as [number, number]].slice(-POINTS)));
  }, [updatedAt, value]);
  return useMemo(() => {
    const start = tail[0]?.[0] ?? Infinity;
    return [...(history ?? []).filter((p) => p[0] < start), ...tail].slice(-POINTS);
  }, [history, tail]);
}

/** A filled line, scaled to `max`; a second, quieter line for comparisons (network out). */
function LiveChart({ lines, max, label, thin }: { lines: { points: Series; quiet?: boolean }[]; max?: number; label: string; thin?: boolean }) {
  const W = 100;
  const H = 36;
  const top = max ?? Math.max(1, ...lines.flatMap((l) => l.points.map((p) => p[1])));
  const path = (pts: Series) => {
    if (pts.length < 2) return '';
    const t0 = pts[0][0];
    const span = pts[pts.length - 1][0] - t0 || 1;
    return pts.map((p, i) => `${i ? 'L' : 'M'}${(((p[0] - t0) / span) * W).toFixed(2)},${(H - Math.min(1, p[1] / top) * (H - 2) - 1).toFixed(2)}`).join(' ');
  };
  return (
    <svg className={`mon-chart ${thin ? 'is-thin' : ''}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      {lines.map((l, i) => {
        const d = path(l.points);
        if (!d) return null;
        return (
          <g key={i} className={l.quiet ? 'is-quiet' : ''}>
            {!l.quiet && <path className="mon-area" d={`${d} L${W},${H} L0,${H} Z`} />}
            <path className="mon-line" d={d} vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}
    </svg>
  );
}

/** One square per container, grouped by stack: running, stopped, restarting or unhealthy, and a ring when an update waits. */
function Fleet({ containers, updates }: { containers: Container[]; updates: Record<string, unknown> }) {
  const sorted = [...containers].sort((a, b) => (a.project ?? '~').localeCompare(b.project ?? '~') || a.name.localeCompare(b.name));
  return (
    <div className="mon-fleet" role="img" aria-label={`${containers.length} containers: ${containers.filter((c) => c.state === 'running').length} running`}>
      {sorted.map((c) => {
        const state = c.health === 'unhealthy' || c.state === 'restarting' || c.state === 'dead' ? 'is-crit' : c.state === 'running' ? 'is-up' : 'is-off';
        return <i key={c.name} className={`${state} ${updates[c.name] ? 'has-update' : ''}`} title={`${c.name}: ${c.health ?? c.state}${updates[c.name] ? ', update waiting' : ''}`} />;
      })}
    </div>
  );
}

/** Every item in a backup set across the last 14 nights. */
function BackupWaffle({ runs }: { runs: BackupRun[] }) {
  if (!runs.length) return null;
  const nights = runs.slice(-14);
  const labels = [...new Set(runs.flatMap((r) => r.items.map((i) => i.label)))];
  const last = runs[runs.length - 1];
  const failed = last.items.filter((i) => !i.ok).length;
  return (
    <ul className="mon-waffle">
      {labels.map((label) => (
        <li key={label}>
          <span className="mon-clip">{label.toLowerCase()}</span>
          <span className="mon-squares" role="img" aria-label={`${label}: ${nights.filter((r) => r.items.some((i) => i.label === label && !i.ok)).length} failures in ${nights.length} nights`}>
            {nights.map((r) => {
              const it = r.items.find((i) => i.label === label);
              return <i key={r.startedAt} className={!it ? 'is-none' : it.ok ? 'is-up' : 'is-crit'} />;
            })}
          </span>
        </li>
      ))}
      <li className="mon-dim">
        {last.items.length - failed} of {last.items.length} last night{failed ? `, ${failed} failed` : ''}
      </li>
    </ul>
  );
}

/** Warning and error lines from every container, as the server streams them. */
function useProblemFeed(): FeedLine[] {
  const [lines, setLines] = useState<FeedLine[]>([]);
  const n = useRef(0);
  useEffect(() => {
    const es = new EventSource('/api/monitor/feed');
    es.onmessage = (m) => {
      const l = JSON.parse(m.data as string) as { at: number; container: string; level: 'warn' | 'error'; text: string };
      const text = plainLine(l.text, l.container);
      const same = shape(l.container, text);
      setLines((prev) => {
        // The same message again within ten minutes: one line, counted, moved to now.
        const i = prev.findIndex((p) => p.at > l.at - 10 * 60_000 && shape(p.who, p.text) === same);
        if (i >= 0) {
          const hit = prev[i];
          return [...prev.slice(0, i), ...prev.slice(i + 1), { ...hit, at: l.at, text, count: (hit.count ?? 1) + 1 }];
        }
        return [...prev, { key: `p${n.current++}`, at: l.at, level: l.level, who: l.container, text }].slice(-120);
      });
    };
    return () => es.close();
  }, []);
  return lines;
}

const DATE = /^\s*\[?\d{4}[-/]\d\d[-/]\d\d[ T][\d:.,]+(?:Z|[+-]\d\d:?\d\d)?\]?\s*/;
const TIME = /^\[?\d\d:\d\d:\d\d(?:[.,]\d+)?\]?\s*/;
const LEVEL = /^\[?(?:warn(?:ing)?|wrn|err(?:or)?|fatal|crit(?:ical)?|inf(?:o)?|dbg|debug)\]?:?\s+/i;
const PID = /^\[\d+\]\s*/;
// nginx: "23#23: *1234 "
const NGINX = /^\d+#\d+:\s*(?:\*\d+\s*)?/;
// NestJS (Immich): "[Nest] 32  - 11/11/2026, 9:10:00 PM "
const NEST = /^\[Nest\]\s+\d+\s+-\s+[\d/.-]+,?\s+[\d:]+(?:\s*[AP]M)?\s*/i;

/** A JSON log line (autobrr, Go and Node apps): its message, plus the error when there is one. */
function fromJson(text: string): string {
  const t = text.trim();
  if (!t.startsWith('{')) return text;
  try {
    const o = JSON.parse(t) as Record<string, unknown>;
    const msg = [o.message, o.msg, o.Message].find((v): v is string => typeof v === 'string');
    const err = [o.error, o.err].find((v): v is string => typeof v === 'string');
    if (!msg && !err) return text;
    return [msg, err].filter(Boolean).join(': ');
  } catch {
    return text;
  }
}

/** Today's lines by time; older ones say the day too ("tue 22:13"), so the order reads right. */
function feedTime(at: number, now: number): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  if (d.toDateString() === new Date(now).toDateString()) return time;
  return `${d.toLocaleDateString(locale(), { weekday: 'short' }).toLowerCase()} ${time.slice(0, 5)}`;
}

/** Apps open their lines with their own time, name, level and process numbers; the feed has columns for those. */
function plainLine(text: string, container: string): string {
  const name = new RegExp(`^\\[?${container.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]?:?\\s*`, 'i');
  let t = fromJson(text);
  // Prefixes come in any order and some apps stack them, so peel until nothing changes.
  for (let pass = 0; pass < 5; pass++) {
    const before = t;
    t = t.replace(DATE, '').replace(TIME, '').replace(name, '').replace(LEVEL, '').replace(PID, '').replace(NGINX, '').replace(NEST, '');
    if (t === before) break;
  }
  return t.trim();
}

/** A message without its numbers, ids and quoted values: two lines with the same shape are the same news. */
function shape(who: string, text: string): string {
  const bare = text
    .toLowerCase()
    .replace(/"[^"]*"|'[^']*'/g, '"')
    .replace(/[0-9a-f]{8,}|\d+(?:[.,:]\d+)*/g, '#')
    .slice(0, 90);
  return `${who}|${bare}`;
}
