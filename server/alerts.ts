// "Needs attention" rules. Home lists only what needs a person, so these
// rules decide what earns space on the page. Keep them few and specific.

import { HOME_ID, type WidgetType } from '../shared/board.ts';
import { getBoard, savedBoards } from './boards.ts';
import { PSI, softTires } from '../shared/car.ts';
import { MINER_HOT_C, MINER_WARM_C } from '../shared/types.ts';
import type {
  GlancesData,
  NextcloudData,
  TailnetData,
  UnifiData,
  MonitorData,
  PortainerData,
  NasSystem,
  NutData,
  CarData,
  MinerData,
  ProxmoxData,
  ScrutinyData,
  SyncthingData,
  TracearrData,
  Alert,
  ArrData,
  BackupRun,
  BackupsData,
  ChecksData,
  Catalog,
  DockerData,
  FrigateData,
  ImageUpdate,
  QbitData,
  SourceId,
  SourceState,
  SystemData,
  TruenasData,
  UptimeKumaData,
  DnsData,
  SpeedData,
} from '../shared/types.ts';
import { config } from './config.ts';
import { NAS_SOURCES } from '../shared/types.ts';
import { INTEGRATIONS } from '../shared/integrations.ts';
import { kvGet, kvSet, lastEventAt } from './db.ts';
import { settling, sickening, type Track } from './transitions.ts';
import { hookTurnedAway, openToInternetAt } from './security.ts';

type Sources = Partial<Record<SourceId, SourceState>>;

const data = <T>(s: Sources, id: SourceId) => (s[id]?.ok ? (s[id]!.data as T) : null);

/** How long an integration fails before Patchboard mentions it. */
export const SOURCE_GRACE_MS = 2 * 60_000;

/** Sources that report monitors in Uptime Kuma's shape, and how alerts name them. */
const MONITORS = [
  ['uptimekuma', 'Uptime Kuma'],
  ['gatus', 'Gatus'],
  ['healthchecks', 'Healthchecks.io'],
  ['mailcow', 'Mailcow'],
] as const;

/** An integration's own web page, with an optional path, or nothing when it isn't set up. */
function appUrl(c: { url: string } | undefined, path = ''): string | undefined {
  return c?.url ? `${c.url.replace(/\/+$/, '')}${path}` : undefined;
}

/** The first board with a widget of this type, on that widget: where its alert is acted on. */
function boardWith(type: WidgetType): string | undefined {
  for (const { id, board } of [{ id: HOME_ID, board: getBoard(HOME_ID)!.board }, ...savedBoards().filter((b) => b.id !== HOME_ID)]) {
    const w = board.widgets.find((x) => x.type === type);
    if (w) return `${id === HOME_ID ? '/' : `/b/${id}`}#w-${w.id}`;
  }
  return undefined;
}

/**
 * A title in English, with its template and values, so a browser can say it
 * in its own language. Notifications and the API keep the English.
 */
function say(key: string, vars?: Record<string, string | number>): { title: string; say: { key: string; vars?: Record<string, string | number> } } {
  const title = vars ? key.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : key;
  return { title, say: vars ? { key, vars } : { key } };
}

export function computeAlerts(sources: Sources, catalog: Catalog, updates: Record<string, ImageUpdate> = {}, now = Date.now()): Alert[] {
  const alerts: Alert[] = [];
  const expectStopped = new Set(
    catalog.groups.flatMap((g) => g.services.filter((s) => s.expectStopped && s.container).map((s) => s.container!)),
  );
  /** Stopped on purpose from Patchboard, and not started since. */
  const parked = new Set(kvGet<string[]>('parked') ?? []);

  const docker = data<DockerData>(sources, 'docker');
  const containers = docker?.containers ?? [];
  // Ignored by hand (switched off for good, say): no alert while it is stopped.
  // Once it runs again the ignore ends, so a later crash is reported.
  const ignored = kvGet<string[]>('ignored') ?? [];
  if (docker) {
    const kept = ignored.filter((n) => containers.find((x) => x.name === n)?.state !== 'running');
    if (kept.length !== ignored.length) kvSet('ignored', kept);
    for (const n of kept) expectStopped.add(n);
  }
  // Another Docker host that stopped answering: its containers are unknown, not down.
  for (const h of docker?.hosts ?? []) {
    if (!h.ok) alerts.push({ id: `dockerhost-${h.name}`, level: 'critical', subject: h.name, ...say('Docker host {name} is down', { name: h.name }), detail: h.error, href: '/settings?tab=connections&setup=dockerhosts', source: 'docker' });
  }
  // Stopped on purpose (scheduled, or from Patchboard) is not down: it never
  // absorbs a dependent's alert, so a real crash beside it still shows.
  const isDown = (name: string) => {
    const c = containers.find((x) => x.name === name);
    return !!c && c.state !== 'running' && c.state !== 'created' && !expectStopped.has(c.name) && !parked.has(c.name);
  };
  // Root-cause folding: a container whose dependency is also down isn't its
  // own alert; it's listed under the dependency, which is what to fix first.
  const rootOf = (name: string, seen = new Set<string>()): string => {
    const c = containers.find((x) => x.name === name);
    for (const dep of c?.dependsOn ?? []) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      if (isDown(dep)) return rootOf(dep, seen);
    }
    return name;
  };
  const folded = new Map<string, string[]>();
  for (const c of containers) {
    if (!isDown(c.name)) continue;
    const root = rootOf(c.name);
    if (root !== c.name) folded.set(root, [...(folded.get(root) ?? []), c.name]);
  }
  const foldedAway = new Set([...folded.values()].flat());

  // A container stopped moments ago is probably being updated or restarted.
  const track = kvGet<Track>('container-track');
  for (const c of containers) {
    const logs = `/c/${c.name}`;
    if (foldedAway.has(c.name)) continue;
    const deliberate = c.state !== 'running' && c.state !== 'created' && !expectStopped.has(c.name) && parked.has(c.name);
    // A stop from Patchboard is known at once; only an unexplained stop waits out the grace.
    if (!deliberate && c.state !== 'restarting' && track && settling(track, c.name, now)) continue;
    if (deliberate) {
      alerts.push({
        id: `ctr-parked-${c.name}`,
        subject: c.name,
        level: 'info',
        ...say('{name} is stopped', { name: c.name }),
        detail: 'You stopped it from Patchboard. Start it from its page when you want it back.',
        since: lastEventAt(c.name, 'container.stopped'),
        href: logs,
        source: 'docker',
      });
    } else if (c.state !== 'running' && c.state !== 'created' && !expectStopped.has(c.name)) {
      const dependents = folded.get(c.name);
      alerts.push({
        id: `ctr-down-${c.name}`,
        subject: c.name,
        level: 'critical',
        ...(c.state === 'restarting' ? say('{name} is restart-looping', { name: c.name }) : say('{name} is not running', { name: c.name })),
        detail: dependents
          ? `${stoppedDetail(c.status, c.image)} Also down because of it: ${dependents.join(', ')}.`
          : stoppedDetail(c.status, c.image),
        since: track?.pending[c.name]?.at ?? lastEventAt(c.name, 'container.stopped'),
        href: logs,
        source: 'docker',
      });
    } else if (c.health === 'unhealthy' && !sickening(track ?? undefined, c.name)) {
      // Held for its grace first (transitions.ts), so one slow check under load isn't an alert.
      alerts.push({
        id: `ctr-unhealthy-${c.name}`,
        subject: c.name,
        level: 'warn',
        ...say('{name} is failing its health check', { name: c.name }),
        detail: c.status,
        since: lastEventAt(c.name, 'container.unhealthy'),
        href: logs,
        source: 'docker',
      });
    }
  }

  const nas = data<TruenasData>(sources, 'truenas');
  for (const p of nas?.pools ?? []) {
    if (!p.healthy) {
      alerts.push({ id: `pool-health-${p.name}`, subject: p.name, level: 'critical', title: `${p.name} is ${p.status.toLowerCase()}`, detail: p.disks.filter((d) => d.status !== 'ONLINE' || d.errors).map((d) => `${d.name} ${d.status}${d.errors ? `, ${d.errors} errors` : ''}`).join('; ') || 'Open the Server page for the pool layout.', href: `/server#storage-${encodeURIComponent(p.name)}`, source: 'truenas' });
    } else if (p.disks.some((d) => d.errors > 0)) {
      alerts.push({ id: `pool-errors-${p.name}`, subject: p.name, level: 'warn', ...say('{name} has disk errors', { name: p.name }), detail: p.disks.filter((d) => d.errors).map((d) => `${d.name}: ${d.errors}`).join(', '), href: `/server#storage-${encodeURIComponent(p.name)}`, source: 'truenas' });
    }
    if (p.scan?.errors) {
      alerts.push({ id: `pool-scrub-${p.name}`, subject: p.name, level: 'warn', ...(p.scan.errors === 1 ? say('{name} scrub found {n} error', { name: p.name, n: 1 }) : say('{name} scrub found {n} errors', { name: p.name, n: p.scan.errors })), href: `/server#storage-${encodeURIComponent(p.name)}`, source: 'truenas' });
    }
    if (p.usedPct >= config.poolWarnPct) {
      alerts.push({ id: `pool-full-${p.name}`, level: p.usedPct >= config.poolCritPct ? 'critical' : 'warn', ...say('Storage is {pct}% full', { pct: Math.round(p.usedPct) }), detail: `${fmtTB(p.freeBytes)} free on ${p.name}`, href: `/server#storage-${encodeURIComponent(p.name)}`, source: 'truenas' });
    }
  }
  for (const d of nas?.disks ?? []) {
    if (d.tempC != null && d.tempC >= config.diskWarnC) {
      alerts.push({ id: `disk-temp-${d.name}`, subject: d.name, level: d.tempC >= config.diskCritC ? 'critical' : 'warn', ...say('{name} is running at {c}°C ({f}°F)', { name: d.name, c: Math.round(d.tempC), f: Math.round(d.tempC * 1.8 + 32) }), detail: d.model, href: '/server#disks', source: 'truenas' });
    }
  }
  for (const a of nas?.alerts ?? []) {
    const level = ['CRITICAL', 'ALERT', 'EMERGENCY', 'ERROR'].includes(a.level) ? 'critical' : a.level === 'WARNING' ? 'warn' : null;
    // Pool capacity is already its own alert above, with Patchboard's threshold.
    if (!level || /space usage for pool/i.test(a.text)) continue;
    const [first, ...rest] = a.text.split(/(?<=\.)\s+/);
    alerts.push({ id: `nas-${a.id}`, level, title: first.length > 110 ? `${first.slice(0, 107)}...` : first, detail: rest.join(' ') || undefined, since: a.at ?? undefined, href: '/server#nas-alerts', source: 'truenas' });
  }

  // Ad blocking switched off with no timer: someone paused it "for a minute"
  // from the app itself and it never came back. A timed pause stays quiet.
  for (const [id, name] of [['pihole', 'Pi-hole'], ['adguard', 'AdGuard Home']] as const) {
    const d = data<DnsData>(sources, id);
    if (d && !d.protecting && !d.resumesAt) {
      alerts.push({ id: `dns-off-${id}`, level: 'warn', ...say("{name} isn't blocking ads", { name }), detail: 'Blocking is off with no timer. Turn it back on from the Ad blocking widget.', href: boardWith('dns') ?? (id === 'pihole' ? appUrl(config.pihole, '/admin') : appUrl(config.adguard)), source: id });
    }
  }

  // Internet speed: Speedtest Tracker's own thresholds decide what is slow.
  const speed = data<SpeedData>(sources, 'speedtest');
  if (speed?.lastFailed && (!speed.latest || speed.lastFailed > speed.latest.at)) {
    alerts.push({ id: 'speed-failed', level: 'warn', ...say('The last speed test failed'), detail: 'Speedtest Tracker could not reach a test server. The connection may be down.', since: speed.lastFailed, href: appUrl(config.speedtest), source: 'speedtest' });
  } else if (speed?.latest && speed.latest.healthy === false) {
    const l = speed.latest;
    alerts.push({ id: 'speed-slow', level: 'warn', ...say('The internet is slower than your thresholds'), detail: `${l.down} Mbps down, ${l.up} up${l.ping != null ? `, ${l.ping} ms ping` : ''} in the last test.`, since: l.at, href: appUrl(config.speedtest), source: 'speedtest' });
  }

  // Monitors (Uptime Kuma, Gatus, Healthchecks.io): one that is down right
  // now. Pending (a retry window, a job running late) waits for the monitor
  // to decide, so a single slow check stays quiet.
  for (const [src, label] of MONITORS) {
    const mon = data<UptimeKumaData>(sources, src);
    for (const m of mon?.monitors ?? []) {
      if (m.status !== 'down') continue;
      // A stopped container with the same name already says why; one alert is enough.
      if (alerts.some((a) => a.subject?.toLowerCase() === m.name.toLowerCase())) continue;
      const job = src === 'healthchecks';
      alerts.push({
        id: src === 'uptimekuma' ? `kuma-${m.id}` : String(m.id),
        subject: m.name,
        level: 'critical',
        ...(job ? say('{name} missed its check-in', { name: m.name }) : say('{name} is down', { name: m.name })),
        detail: `${m.msg && !job ? `${m.msg.replace(/\.$/, '')}. ` : ''}Seen by ${label}.`,
        since: m.since,
        href: mon!.link,
        source: src,
      });
    }
  }

  // An app that doesn't answer while its container looks fine. Two misses in a
  // row first, so one slow minute doesn't raise anything.
  const checks = data<ChecksData>(sources, 'checks');
  const byName = new Map((docker?.containers ?? []).map((c) => [c.name, c]));
  for (const s of catalog.groups.flatMap((g) => g.services)) {
    const ck = checks?.services[s.name];
    if (!ck || ck.ok || ck.fails < 2) continue;
    const ctr = s.container ? byName.get(s.container) : undefined;
    if (ctr && ctr.state !== 'running') continue; // the container alert covers it
    if (alerts.some((a) => MONITORS.some(([m]) => m === a.source) && a.subject?.toLowerCase() === s.name.toLowerCase())) continue;
    alerts.push({
      id: `check-${s.name}`,
      subject: s.name,
      level: 'warn',
      ...say("{name} isn't answering", { name: s.name }),
      detail: `${ck.error ?? 'No answer'} from ${ck.target}${ctr ? ', though its container is running' : ''}.`,
      href: s.container ? `/c/${s.container}` : '/apps',
      source: 'checks',
    });
  }

  const backups = data<BackupsData>(sources, 'backups');
  if (backups) {
    const H = 3_600_000;
    const check = (runs: BackupRun[], what: string, id: string) => {
      const last = runs[runs.length - 1];
      if (!last) return;
      const failed = last.items.filter((i) => !i.ok).map((i) => i.label);
      if (failed.length) {
        alerts.push({ id: `bk-${id}-fail`, level: 'warn', ...(what === 'database' ? say("Last night's database backup failed for {names}", { names: failed.join(', ') }) : say("Last night's file backup failed for {names}", { names: failed.join(', ') })), detail: `${last.items.length - failed.length} of ${last.items.length} completed.`, since: last.startedAt, href: '/server#backups', source: 'backups' });
      }
      if (!last.finishedAt && Date.now() - last.startedAt > 2 * H) {
        alerts.push({ id: `bk-${id}-stuck`, level: 'warn', ...(what === 'database' ? say('The database backup started but never finished') : say('The file backup started but never finished')), since: last.startedAt, href: '/server#backups', source: 'backups' });
      }
      if (Date.now() - last.startedAt > 36 * H) {
        alerts.push({ id: `bk-${id}-stale`, level: 'warn', ...(what === 'database' ? say('No database backup in over a day and a half') : say('No file backup in over a day and a half')), detail: 'The nightly cron may have stopped.', since: last.startedAt, href: '/server#backups', source: 'backups' });
      }
    };
    check(backups.db, 'database', 'db');
    check(backups.files, 'file', 'files');
  }

  const sys = data<SystemData>(sources, 'system');
  if (!nas && sys?.pool && sys.pool.usedPct >= config.poolWarnPct) {
    alerts.push({
      id: 'pool-full',
      level: sys.pool.usedPct >= config.poolCritPct ? 'critical' : 'warn',
      ...say('Storage is {pct}% full', { pct: Math.round(sys.pool.usedPct) }),
      detail: `${fmtTB(sys.pool.totalBytes - sys.pool.usedBytes)} free on ${sys.pool.path}`,
      href: '/server#storage',
      source: 'system',
    });
  }

  const ARR_NAMES = { sonarr: 'Sonarr', radarr: 'Radarr', lidarr: 'Lidarr', readarr: 'Readarr', prowlarr: 'Prowlarr', bazarr: 'Bazarr' } as const;
  for (const id of Object.keys(ARR_NAMES) as (keyof typeof ARR_NAMES)[]) {
    const arr = data<ArrData>(sources, id);
    if (!arr) continue;
    const name = ARR_NAMES[id];
    for (const p of arr.problems) {
      alerts.push({ id: `${id}-q-${p.title}`, level: 'warn', ...say("{name} can't import a download", { name }), detail: `${p.message} (${p.title})`, href: appUrl(config[id], '/activity/queue') ?? `/c/${id}`, source: id });
    }
    for (const h of arr.health.filter((h) => h.level === 'error')) {
      alerts.push({ id: `${id}-h-${h.message}`, level: 'warn', ...say('{name} health check', { name }), detail: h.message, href: appUrl(config[id], '/system/status'), source: id });
    }
  }

  const qbit = data<QbitData>(sources, 'qbit');
  for (const name of qbit?.errored ?? []) {
    alerts.push({ id: `qbit-err-${name}`, level: 'warn', ...say('Torrent has errored'), detail: name, href: appUrl(config.qbit), source: 'qbit' });
  }

  const frigate = data<FrigateData>(sources, 'frigate');
  for (const cam of frigate?.cameras ?? []) {
    if (!cam.online) {
      alerts.push({ id: `cam-${cam.name}`, level: 'critical', subject: cam.name, ...say('{name} camera is offline', { name: cam.name }), detail: 'Frigate is receiving no frames', href: appUrl(config.frigate) ?? '/c/frigate', source: 'frigate' });
    }
  }

  // Nextcloud: app updates waiting, as a quiet note.
  const nc = data<NextcloudData>(sources, 'nextcloud');
  if (nc?.appUpdates) alerts.push({ id: 'nc-apps', level: 'info', ...(nc.appUpdates === 1 ? say('{n} Nextcloud app has an update', { n: 1 }) : say('{n} Nextcloud apps have updates', { n: nc.appUpdates })), href: `${nc.webUrl}/settings/apps/updates`, source: 'nextcloud' });

  // UniFi: a device that drops off. Tailscale: keys expiring or expired.
  const unifi = data<UnifiData>(sources, 'unifi');
  for (const d of unifi?.devices ?? []) {
    if (!d.online) alerts.push({ id: `unifi-${d.id}`, level: 'warn', subject: d.name, ...say('{name} is offline', { name: d.name }), detail: [d.model, unifi!.sites > 1 ? d.site : undefined].filter(Boolean).join(', ') || undefined, href: unifi!.webUrl, source: 'unifi' });
  }
  for (const d of data<TailnetData>(sources, 'tailscale')?.devices ?? []) {
    if (d.keyExpires == null) continue;
    const days = (d.keyExpires - now) / 86_400_000;
    if (days < 0) alerts.push({ id: `ts-exp-${d.id}`, level: 'critical', subject: d.name, ...say("{name}'s Tailscale key has expired", { name: d.name }), detail: 'It is off the tailnet until someone signs it in again.', href: 'https://login.tailscale.com/admin/machines', source: 'tailscale' });
    else if (days < 7) alerts.push({ id: `ts-soon-${d.id}`, level: 'warn', subject: d.name, ...(Math.max(1, Math.round(days)) === 1 ? say("{name}'s Tailscale key expires in {n} day", { name: d.name, n: 1 }) : say("{name}'s Tailscale key expires in {n} days", { name: d.name, n: Math.round(days) })), detail: 'Renew it, or turn off key expiry for this machine.', href: 'https://login.tailscale.com/admin/machines', source: 'tailscale' });
  }

  // Netdata and Prometheus: their firing alerts, as they rate them.
  for (const id of ['netdata', 'prometheus'] as const) {
    const m = data<MonitorData>(sources, id);
    for (const a of m?.alerts ?? []) {
      alerts.push({
        id: `${id}-${a.id}`,
        level: a.severity === 'critical' ? 'critical' : 'warn',
        subject: a.instance,
        title: a.instance && !a.name.includes(a.instance) ? `${a.name} on ${a.instance}` : a.name,
        detail: a.detail,
        since: a.since,
        href: m!.webUrl,
        source: id,
      });
    }
  }

  // Portainer: an environment that goes down, or unhealthy containers on one.
  const portainer = data<PortainerData>(sources, 'portainer');
  for (const e of portainer?.envs ?? []) {
    if (!e.up) alerts.push({ id: `pt-down-${e.id}`, level: 'critical', subject: e.name, ...say('Docker host {name} is down', { name: e.name }), detail: "Portainer can't reach it.", href: portainer!.webUrl, source: 'portainer' });
    else if (e.unhealthy) alerts.push({ id: `pt-sick-${e.id}`, level: 'warn', subject: e.name, ...(e.unhealthy === 1 ? say('{n} unhealthy container on {name}', { n: 1, name: e.name }) : say('{n} unhealthy containers on {name}', { n: e.unhealthy, name: e.name })), href: portainer!.webUrl, source: 'portainer' });
  }

  // Unraid, Synology, QNAP: one set of rules for every storage system.
  for (const id of NAS_SOURCES) {
    const n = data<NasSystem>(sources, id);
    if (!n) continue;
    if (n.state) alerts.push({ id: `nas-state-${id}`, level: 'critical', subject: n.name, title: `${n.state} on ${n.name}`, href: n.webUrl, source: id });
    for (const v of n.volumes) {
      const pct = v.total ? (v.used / v.total) * 100 : 0;
      if (v.status && v.status !== 'ok') {
        alerts.push({ id: `nas-vol-${id}-${v.name}`, level: v.status === 'failed' ? 'critical' : 'warn', subject: v.name, title: `${v.name} on ${n.name} is ${v.detail ?? (v.status === 'failed' ? 'failing' : 'degraded')}`, href: n.webUrl, source: id });
      } else if (pct >= config.poolWarnPct) {
        alerts.push({ id: `nas-full-${id}-${v.name}`, level: pct >= config.poolCritPct ? 'critical' : 'warn', subject: v.name, ...say('{name} on {host} is {pct}% full', { name: v.name, host: n.name, pct: Math.round(pct) }), detail: `${fmtTB(v.total - v.used)} free`, href: n.webUrl, source: id });
      }
    }
    for (const d of n.disks) {
      if (d.status !== 'ok') {
        alerts.push({ id: `nas-disk-${id}-${d.name}`, level: d.status === 'failed' ? 'critical' : 'warn', subject: d.name, title: `Disk ${d.name} on ${n.name} is ${d.detail ?? (d.status === 'failed' ? 'failing' : 'reporting trouble')}`, detail: d.model, href: n.webUrl, source: id });
      } else if (d.tempC != null && d.tempC >= config.diskWarnC) {
        alerts.push({ id: `nas-temp-${id}-${d.name}`, level: d.tempC >= config.diskCritC ? 'critical' : 'warn', subject: d.name, ...say('Disk {name} on {host} is running at {c}°C ({f}°F)', { name: d.name, host: n.name, c: Math.round(d.tempC), f: Math.round(d.tempC * 1.8 + 32) }), detail: d.model, href: n.webUrl, source: id });
      }
    }
  }

  // NUT: the power is out, the battery is low, or it wants replacing.
  for (const u of data<NutData>(sources, 'nut')?.ups ?? []) {
    const left = u.runtimeSec != null ? `${Math.round(u.runtimeSec / 60)} minutes of battery left` : undefined;
    if (u.onBattery || u.lowBattery) {
      alerts.push({
        id: `ups-power-${u.name}`,
        level: 'critical',
        subject: u.name,
        ...(u.lowBattery ? say("{name}'s battery is nearly empty", { name: u.name }) : say('The power is out: {name} is on battery', { name: u.name })),
        detail: [left, u.charge != null ? `${Math.round(u.charge)}% charged` : undefined].filter(Boolean).join(', ') || undefined,
        href: boardWith('power'),
        source: 'nut',
      });
    }
    if (u.replaceBattery) {
      alerts.push({ id: `ups-rb-${u.name}`, level: 'warn', subject: u.name, ...say('{name} needs a new battery', { name: u.name }), detail: u.model, href: boardWith('power'), source: 'nut' });
    }
  }

  // Hosts (Glances, Beszel): one that stops answering, and disks past the
  // storage thresholds.
  for (const src of ['glances', 'beszel'] as const)
  for (const h of data<GlancesData>(sources, src)?.hosts ?? []) {
    if (!h.ok) {
      alerts.push({ id: `host-down-${h.url}`, level: 'warn', subject: h.name, ...say("{name} isn't answering", { name: h.name }), detail: h.error, href: src === 'glances' ? h.url : appUrl(config.beszel), source: src });
      continue;
    }
    for (const d of h.disks) {
      if (d.pct < config.poolWarnPct) continue;
      alerts.push({
        id: `host-disk-${h.name}-${d.mount}`,
        level: d.pct >= config.poolCritPct ? 'critical' : 'warn',
        subject: h.name,
        ...(d.mount === '/' && !d.size ? say('The disk on {host} is {pct}% full', { host: h.name, pct: Math.round(d.pct) }) : say('{name} on {host} is {pct}% full', { name: d.mount, host: h.name, pct: Math.round(d.pct) })),
        detail: d.size ? `${fmtTB(d.size - d.used)} free` : undefined,
        href: src === 'glances' ? h.url : appUrl(config.beszel),
        source: src,
      });
    }
  }

  // Tracearr: a media server it sees as down, and violations waiting on
  // someone. High severity is a warning; the rest a quiet note.
  const tr = data<TracearrData>(sources, 'tracearr');
  for (const sv of tr?.servers ?? []) {
    if (sv.status !== 'down') continue;
    if (alerts.some((x) => x.subject?.toLowerCase() === sv.name.toLowerCase())) continue;
    alerts.push({ id: `tracearr-server-${sv.id}`, level: 'warn', subject: sv.name, ...say('{name} is down', { name: sv.name }), detail: `${sv.reason ? `${sv.reason.replace(/\.$/, '')}. ` : ''}Seen by Tracearr.`, href: tr!.webUrl, source: 'tracearr' });
  }
  for (const v of tr?.violations ?? []) {
    alerts.push({
      id: `tracearr-${v.id}`,
      level: v.severity === 'high' ? 'warn' : 'info',
      subject: v.user,
      title: `${v.rule}: ${v.user}`,
      detail: `${v.server ? `On ${v.server}. ` : ''}Seen by Tracearr.`,
      since: v.at,
      href: `${tr!.webUrl}/violations/${encodeURIComponent(v.id)}`,
      source: 'tracearr',
    });
  }

  // Syncthing: a folder with files it can't sync, or stopped on an error; a
  // device that hasn't checked in for a day. Syncing and paused stay quiet.
  const st = data<SyncthingData>(sources, 'syncthing');
  for (const f of st?.folders ?? []) {
    if (f.state !== 'error' && f.state !== 'failing') continue;
    alerts.push({
      id: `sync-folder-${f.id}`,
      level: 'warn',
      subject: f.label,
      ...(f.state === 'error' ? say('{name} stopped syncing', { name: f.label }) : f.failing === 1 ? say("{name} has {n} file it can't sync", { name: f.label, n: 1 }) : say("{name} has {n} files it can't sync", { name: f.label, n: f.failing })),
      detail: f.error ? `${f.error.replace(/\.$/, '')}. Seen by Syncthing.` : 'Seen by Syncthing.',
      href: st!.webUrl,
      source: 'syncthing',
    });
  }
  for (const d of st?.devices ?? []) {
    if (d.connected || d.paused || !d.lastSeen || now - d.lastSeen < 86_400_000) continue;
    alerts.push({
      id: `sync-device-${d.id}`,
      level: 'warn',
      subject: d.name,
      ...say("{name} hasn't synced in {n} days", { name: d.name, n: Math.floor((now - d.lastSeen) / 86_400_000) }),
      detail: 'Its last contact with Syncthing.',
      since: d.lastSeen,
      href: st!.webUrl,
      source: 'syncthing',
    });
  }

  // BitAxe: a miner running hot, or not answering.
  for (const m of data<MinerData>(sources, 'bitaxe')?.miners ?? []) {
    if (!m.ok) {
      alerts.push({ id: `miner-down-${m.name}`, level: 'warn', subject: m.name, ...say("Miner {name} isn't answering", { name: m.name }), detail: `${m.error ?? 'No answer'} from ${m.url}.`, href: m.url, source: 'bitaxe' });
    } else if (m.tempC != null && m.tempC >= MINER_WARM_C) {
      alerts.push({
        id: `miner-hot-${m.name}`,
        level: m.tempC >= MINER_HOT_C ? 'critical' : 'warn',
        subject: m.name,
        ...say('Miner {name} is running hot', { name: m.name }),
        detail: `The ASIC is at ${Math.round(m.tempC)} °C. Check its fan and airflow, or lower its frequency in AxeOS.`,
        href: m.url,
        source: 'bitaxe',
      });
    }
  }

  // Tessie: a tire going soft, named, so it's caught before the car's own warning.
  for (const car of data<CarData>(sources, 'tessie')?.cars ?? []) {
    const soft = softTires(car.tires, { tireLowPsi: config.tireLowPsi, tireSpreadPsi: config.tireSpreadPsi });
    if (!soft.length || !car.tires) continue;
    const names: Record<string, string> = { fl: 'front left', fr: 'front right', rl: 'rear left', rr: 'rear right' };
    alerts.push({
      id: `car-tire-${car.vin}`,
      level: 'warn',
      subject: car.name,
      ...(soft.length === 4 ? say("{name}'s tires are low", { name: car.name }) : soft.length > 1 ? say('{name} has {n} low tires', { name: car.name, n: soft.length }) : soft[0] === 'fl' ? say("{name}'s front left tire is low", { name: car.name }) : soft[0] === 'fr' ? say("{name}'s front right tire is low", { name: car.name }) : soft[0] === 'rl' ? say("{name}'s rear left tire is low", { name: car.name }) : say("{name}'s rear right tire is low", { name: car.name })),
      detail: tireDetail(soft, car.tires, names),
      source: 'tessie',
    });
  }

  // Scrutiny: a drive failing its own SMART check is an emergency; failing
  // Scrutiny's stricter thresholds is a warning to plan a replacement.
  for (const d of data<ScrutinyData>(sources, 'scrutiny')?.drives ?? []) {
    if (d.status === 'ok') continue;
    const where = [d.model, d.host].filter(Boolean).join(', ');
    alerts.push({
      id: `drive-${d.id}`,
      level: d.status === 'failed' ? 'critical' : 'warn',
      subject: d.name,
      ...(d.status === 'failed' ? say('Drive {name} is failing', { name: d.name }) : say('Drive {name} is wearing out', { name: d.name })),
      detail: `${d.status === 'failed' ? 'Its own SMART check failed. Back up what it holds and replace it.' : "It crossed Scrutiny's thresholds. Plan a replacement."}${where ? ` ${where}.` : ''}`,
      href: data<ScrutinyData>(sources, 'scrutiny')?.webUrl,
      source: 'scrutiny',
    });
  }

  // Proxmox: a node that drops out of the cluster.
  for (const n of data<ProxmoxData>(sources, 'proxmox')?.nodes ?? []) {
    if (!n.online) alerts.push({ id: `pve-${n.name}`, level: 'critical', subject: n.name, ...say('Proxmox node {name} is offline', { name: n.name }), detail: "The cluster can't reach it.", href: appUrl(config.proxmox), source: 'proxmox' });
  }

  // Image updates: one quiet line, not one per container.
  const pending = Object.keys(updates).filter((n) => containers.some((c) => c.name === n));
  if (pending.length) {
    alerts.push({
      id: 'image-updates',
      level: 'info',
      ...(pending.length === 1 ? say('An image update is available for {name}', { name: pending[0] }) : say('{n} containers have image updates', { n: pending.length })),
      detail: pending.length > 1 ? pending.slice(0, 6).join(', ') + (pending.length > 6 ? ', and more' : '') : undefined,
      href: '/stacks?updates=1',
      source: 'patchboard',
    });
  }

  // Sign-in off, and someone reached Patchboard from the internet.
  const open = openToInternetAt();
  // A demo is open to the internet on purpose, with nothing real behind it.
  if (config.auth.mode === 'none' && !config.demo && open && now - open < 24 * 3_600_000) {
    alerts.push({
      id: 'open-to-internet',
      level: 'critical',
      ...say('Patchboard is open to the internet with no sign-in'),
      detail: 'Someone reached it from a public address. Turn on a password in Settings, Connections, Sign-in and keys, or put it behind your proxy\'s sign-in.',
      href: '/settings?tab=connections&part=access',
      source: 'patchboard',
    });
  }

  // Diun posting without the token: its update marks never arrive, and nothing else would say so.
  const turned = hookTurnedAway();
  if (turned && config.auth.mode !== 'none' && now - turned.at < 7 * 24 * 3_600_000) {
    alerts.push({
      id: 'hook-turned-away',
      level: 'warn',
      ...say('Patchboard turned away a webhook from {name}', { name: turned.hook === 'diun' ? 'Diun' : turned.hook }),
      detail: turned.token === 'missing' ? 'It came without a token. Copy the address in Settings, Connections, Sign-in and keys into its webhook settings.' : 'Its token is wrong. Copy the address in Settings, Connections, Sign-in and keys into its webhook settings again.',
      since: turned.at,
      href: '/settings?tab=connections&part=access',
      source: 'patchboard',
    });
  }

  // Single sign-on that lets in anyone the provider knows, without saying so.
  if (config.auth.mode === 'oidc' && !config.auth.oidc.allowed.length && !config.auth.oidc.allowAnyone) {
    alerts.push({
      id: 'oidc-open',
      level: 'warn',
      ...say('Anyone your sign-in provider knows can open Patchboard'),
      detail: 'Set OIDC_ALLOWED to the people or groups who may, or OIDC_ALLOW_ANYONE=1 if your provider already decides.',
      href: '/settings?tab=connections&part=access',
      source: 'patchboard',
    });
  }

  // An integration we can't reach is worth knowing about, but quietly, and
  // only once it has failed for two minutes: restarting Jellyfin isn't news.
  // The link opens that integration's own settings, not the top of the list.
  for (const s of Object.values(sources)) {
    if (s && !s.ok && s.error && (!s.failingSince || now - s.failingSince >= SOURCE_GRACE_MS)) {
      const href = INTEGRATIONS.some((i) => i.id === s.id) ? `/settings?tab=connections&setup=${encodeURIComponent(s.id)}` : '/settings?tab=connections';
      alerts.push({ id: `src-${s.id}`, level: 'info', ...say("Can't reach {name}", { name: s.label }), detail: s.error, since: s.failingSince, href, source: s.id });
    }
  }

  const rank = { critical: 0, warn: 1, info: 2 };
  return alerts.sort((a, b) => rank[a.level] - rank[b.level]);
}

/**
 * "Exited (1) 2 hours ago" becomes "Exited with code 1. golift/unpackerr";
 * the alert already shows how long ago, so the status's own time is dropped.
 */
export function stoppedDetail(status: string, image: string): string {
  const code = /Exited \((\d+)\)/.exec(status)?.[1];
  const what =
    code === undefined
      ? status.replace(/\s+(about\s+)?(an?|\d+)\s+\w+\s+ago$/i, '')
      : code === '0' || code === '143'
        ? 'Exited cleanly'
        : code === '137'
          ? "Killed when it didn't stop in time"
          : `Exited with code ${code}`;
  return `${what}. ${image}`;
}

function fmtTB(bytes: number): string {
  return bytes >= 1e12 ? `${(bytes / 1e12).toFixed(1)} TB` : `${Math.round(bytes / 1e9)} GB`;
}

/** "All four at 36 psi. Add air." or "Front left 33 psi, rear right 34 psi. Add air." */
export function tireDetail(soft: string[], tires: Record<string, number>, names: Record<string, string>): string {
  const psi = soft.map((t) => Math.round(tires[t] * PSI));
  if (soft.length === 4 && psi.every((p) => p === psi[0])) return `All four at ${psi[0]} psi. Add air.`;
  const list = soft.map((t, i) => `${names[t]} ${psi[i]} psi`).join(', ');
  return `${list[0].toUpperCase()}${list.slice(1)}. Add air.`;
}
