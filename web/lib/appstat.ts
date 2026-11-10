// The one line under each app tile: the most useful thing to know about that
// app right now. Trouble comes first; otherwise the app's own integration's
// number (streams, queue, unread), and failing that, how fast it answers or
// how long it has been up.

import type {
  SourceId,
  ArrData,
  ChecksData,
  Container,
  FrigateData,
  MinifluxData,
  ImmichData,
  NextcloudData,
  GiteaData,
  PaperlessData,
  QbitData,
  Service,
  Snapshot,
  StatsData,
  TautulliData,
  DnsData,
  HomeAssistantData,
  ListeningData,
  PortainerData,
  ScrutinyData,
  SeerrData,
  SpeedData,
  SyncthingData,
  TracearrData,
  UptimeKumaData,
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
  if (c === 'plex' || c === 'jellyfin' || c === 'emby') {
    const p = data<TautulliData>(snap, c === 'plex' ? 'tautulli' : c);
    if (!p) return null;
    return p.streams.length ? plural(p.streams.length, 'stream') : 'Nobody watching';
  }
  if (c === 'sonarr' || c === 'radarr' || c === 'lidarr' || c === 'readarr') {
    const a = data<ArrData>(snap, c);
    if (!a) return null;
    if (a.problems.length) return `${a.problems.length} stuck`;
    return a.queueTotal ? `${a.queueTotal} queued` : 'Queue empty';
  }
  if (c === 'prowlarr') {
    const a = data<ArrData>(snap, 'prowlarr');
    if (!a) return null;
    const bad = a.health.filter((h) => h.level !== 'notice').length;
    return bad ? `${bad} ${bad === 1 ? 'warning' : 'warnings'}` : 'Indexers OK';
  }
  if (c === 'bazarr') {
    const a = data<ArrData>(snap, 'bazarr');
    return a ? (a.queueTotal ? `${a.queueTotal.toLocaleString()} missing subs` : 'Subtitles complete') : null;
  }
  if (c === 'paperless' || c === 'paperless-ngx' || c === 'paperless-webserver') {
    const p = data<PaperlessData>(snap, 'paperless');
    return p ? (p.inbox ? `${p.inbox} in inbox` : `${p.total.toLocaleString()} documents`) : null;
  }
  if (c === 'gitea' || c === 'forgejo') {
    const g = data<GiteaData>(snap, 'gitea');
    return g ? (g.unread ? `${g.unread} unread` : `${g.repos} repos`) : null;
  }
  if (c === 'nextcloud' || c === 'nextcloud-app') {
    const n = data<NextcloudData>(snap, 'nextcloud');
    return n ? (n.appUpdates ? `${n.appUpdates} app ${n.appUpdates === 1 ? 'update' : 'updates'}` : `${n.files.toLocaleString()} files`) : null;
  }
  const dl = { qbittorrent: 'qbit', transmission: 'transmission', deluge: 'deluge', sabnzbd: 'sabnzbd', nzbget: 'nzbget' }[c] as SourceId | undefined;
  if (dl) {
    const q = data<QbitData>(snap, dl);
    if (!q) return null;
    if (q.paused) return 'Paused';
    if (q.downloading) return `↓ ${speed(q.down)}`;
    return q.kind === 'usenet' ? 'Queue empty' : `${q.seeding} seeding`;
  }
  if (c === 'immich' || c === 'immich-server') {
    const im = data<ImmichData>(snap, 'immich');
    if (!im) return null;
    const busy = im.queues.reduce((n, q) => n + q.active + q.waiting, 0);
    return busy ? `Processing ${busy.toLocaleString()}` : `${im.photos.toLocaleString()} photos`;
  }
  if (c === 'miniflux') {
    const m = data<MinifluxData>(snap, 'miniflux');
    return m ? (m.unread ? `${m.unread} unread` : 'All read') : null;
  }
  if (c === 'audiobookshelf' || c === 'navidrome') {
    const l = data<ListeningData>(snap, c);
    return l ? (l.streams.length ? `${l.streams.length} listening` : 'Nobody listening') : null;
  }
  if (c === 'overseerr' || c === 'jellyseerr' || c === 'seerr') {
    const r = data<SeerrData>(snap, 'overseerr');
    return r ? (r.pending ? `${r.pending} waiting` : r.processing ? `${r.processing} on the way` : 'Nothing waiting') : null;
  }
  if (c === 'homeassistant' || c === 'home-assistant') {
    const h = data<HomeAssistantData>(snap, 'homeassistant');
    return h ? `${h.total.toLocaleString()} entities` : null;
  }
  if (c === 'tracearr') {
    const t = data<TracearrData>(snap, 'tracearr');
    if (!t) return null;
    const down = t.servers.filter((x) => x.status === 'down').length;
    return down ? `${down} ${down === 1 ? 'server' : 'servers'} down` : t.violations.length ? `${t.violations.length} to review` : `${t.servers.reduce((n, x) => n + x.streams, 0)} streaming`;
  }
  if (c === 'uptime-kuma' || c === 'uptimekuma' || c === 'gatus') {
    const u = data<UptimeKumaData>(snap, c === 'gatus' ? 'gatus' : 'uptimekuma');
    if (!u) return null;
    const down = u.monitors.filter((m) => m.status === 'down').length;
    return down ? `${down} down` : `${u.monitors.filter((m) => m.status === 'up').length} up`;
  }
  if (c === 'pihole' || c === 'adguard' || c === 'adguardhome') {
    const d = data<DnsData>(snap, c === 'pihole' ? 'pihole' : 'adguard');
    return d ? (d.protecting ? `${d.pct.toFixed(1)}% blocked` : 'Blocking paused') : null;
  }
  if (c === 'speedtest-tracker' || c === 'speedtest') {
    const sp = data<SpeedData>(snap, 'speedtest');
    return sp?.latest ? `↓ ${Math.round(sp.latest.down)} Mbps` : null;
  }
  if (c === 'scrutiny') {
    const sc = data<ScrutinyData>(snap, 'scrutiny');
    if (!sc) return null;
    const bad = sc.drives.filter((d) => d.status !== 'ok').length;
    return bad ? `${bad} ${bad === 1 ? 'drive' : 'drives'} failing` : `${sc.drives.length} drives healthy`;
  }
  if (c === 'portainer') {
    const pt = data<PortainerData>(snap, 'portainer');
    return pt ? plural(pt.envs.reduce((n, e) => n + e.running, 0), 'container') + ' running' : null;
  }
  if (c === 'syncthing') {
    const st = data<SyncthingData>(snap, 'syncthing');
    if (!st) return null;
    const bad = st.folders.filter((f) => f.state === 'error' || f.state === 'failing').length;
    const busy = st.folders.filter((f) => f.state === 'syncing').length;
    return bad ? `${bad} can't sync` : busy ? `${busy} syncing` : 'In sync';
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

