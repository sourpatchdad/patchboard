// The one line under each app tile: the most useful thing to know about that
// app right now. Trouble always wins; otherwise the app's own integration
// speaks (streams, queue, unread), and failing that, how fast it answers or
// how long it has been up.

import type {
  ArrData,
  ChecksData,
  Container,
  FrigateData,
  MinifluxData,
  QbitData,
  Service,
  Snapshot,
  StatsData,
  TautulliData,
} from '../../shared/types.ts';
import { plural, speed } from './format.ts';
import { shortStatus } from './services.ts';

export type Tone = 'ok' | 'warn' | 'crit' | 'idle' | 'none';

export interface AppStat {
  tone: Tone;
  /** The line under the name. */
  text: string;
  /** Longer explanation for the tooltip and screen readers. */
  title: string;
  /** Short identifier when the line is a number, rendered in mono. */
  mono?: boolean;
  /** Diun reported a newer image. Shown as a marker, not in the line. */
  update?: boolean;
}

const data = <T>(snap: Snapshot, id: keyof Snapshot['sources']) => (snap.sources[id]?.ok ? (snap.sources[id]!.data as T) : null);

/** What the app's own integration can say, keyed by container name. */
function integrationLine(snap: Snapshot, s: Service): string | null {
  const c = s.container ?? '';
  if (c === 'plex') {
    const p = data<TautulliData>(snap, 'tautulli');
    if (!p) return null;
    return p.streams.length ? plural(p.streams.length, 'stream') : 'Nobody watching';
  }
  if (c === 'sonarr' || c === 'radarr') {
    const a = data<ArrData>(snap, c);
    if (!a) return null;
    if (a.problems.length) return `${a.problems.length} stuck`;
    return a.queueTotal ? `${a.queueTotal} queued` : 'Queue empty';
  }
  if (c === 'qbittorrent') {
    const q = data<QbitData>(snap, 'qbit');
    if (!q) return null;
    return q.downloading ? `↓ ${speed(q.down)}` : `${q.seeding} seeding`;
  }
  if (c === 'miniflux') {
    const m = data<MinifluxData>(snap, 'miniflux');
    return m ? (m.unread ? `${m.unread} unread` : 'All read') : null;
  }
  if (c === 'frigate') {
    const f = data<FrigateData>(snap, 'frigate');
    if (!f) return null;
    const off = f.cameras.filter((x) => !x.online).length;
    return off ? `${off} of ${f.cameras.length} cameras offline` : plural(f.cameras.length, 'camera');
  }
  return null;
}

export function appStat(s: Service, snap: Snapshot, containers: Map<string, Container>, custom?: { text: string; tone: 'ok' | 'warn' | 'crit' } | null): AppStat {
  const ctr = s.container ? containers.get(s.container) : undefined;
  const ck = (snap.sources.checks?.data as ChecksData | null)?.services[s.name];
  const update = s.container ? snap.updates[s.container] : undefined;
  const withUpdate = (st: AppStat): AppStat => (update ? { ...st, update: true, title: `${st.title}. An image update is available.` } : st);

  // 1. Catalog says a container exists that Docker doesn't know.
  if (s.container && snap.sources.docker?.ok && !ctr) {
    return { tone: 'warn', text: `No container “${s.container}”`, title: `The catalog names a container called ${s.container}, but Docker has none. Check config/services.yaml.` };
  }

  // 2. The container itself.
  if (ctr && ctr.state !== 'running') {
    if (s.expectStopped) return { tone: 'idle', text: 'Scheduled job', title: `${s.name} finished its last run: ${ctr.status}` };
    const exited = /Exited \((\d+)\)/.exec(ctr.status)?.[1];
    // "Exited (1) 2 hours ago" -> "2h ago", short enough for a phone tile.
    const since = ctr.status
      .replace(/^Exited \(\d+\)\s*/, '')
      .replace(/^About an? /i, '1 ')
      .replace(/(\d+) (second|minute|hour|day|week|month)s?/i, (_m, n: string, u: string) => `${n}${u === 'month' ? 'mo' : u[0]}`);
    return {
      tone: 'crit',
      text: ctr.state === 'restarting' ? 'Restart-looping' : `Stopped${since ? ` ${since}` : ''}`,
      title: `${s.name}: ${ctr.status}${exited ? ` (exit code ${exited})` : ''}`,
    };
  }
  if (ctr?.health === 'unhealthy') return withUpdate({ tone: 'warn', text: 'Failing its health check', title: `${s.name}: ${ctr.status}` });

  // 3. The app doesn't answer though the container runs.
  if (ck && !ck.ok && ck.fails >= 2) {
    return withUpdate({ tone: 'warn', text: ck.error ?? 'No answer', title: `${s.name} didn't answer at ${ck.target}: ${ck.error}` });
  }

  // 4. The app's own numbers: one set up in Edit apps first, then built-in ones.
  if (custom) {
    const t = [s.name, ctr ? `Up ${shortStatus(ctr)}` : '', ck?.ok ? `answers in ${ck.ms} ms` : ''].filter(Boolean).join(', ');
    return withUpdate({ tone: custom.tone, text: custom.text, title: t });
  }
  const line = integrationLine(snap, s);
  if (line && / stuck$/.test(line)) return withUpdate({ tone: 'warn', text: line, title: `${s.name} has downloads it can't import` });
  const up = ctr ? `Up ${shortStatus(ctr)}` : '';
  const answers = ck?.ok ? `answers in ${ck.ms} ms` : '';
  const title = [s.name, up, answers].filter(Boolean).join(', ');
  if (line) return withUpdate({ tone: 'ok', text: line, title });

  // 5. Fallbacks: speed, then uptime.
  if (ck?.ok) return withUpdate({ tone: 'ok', text: `${ck.ms} ms`, title, mono: true });
  if (ctr) {
    const cpu = (snap.sources.stats?.data as StatsData | null)?.containers[ctr.name]?.cpu;
    return withUpdate({ tone: 'ok', text: up, title: cpu != null ? `${title}, ${cpu.toFixed(1)}% CPU` : title });
  }
  if (s.href) return { tone: 'none', text: new URL(s.href, 'http://x').host, title: s.href, mono: true };
  return { tone: 'none', text: '', title: s.name };
}

