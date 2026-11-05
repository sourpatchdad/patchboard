// "Needs attention" rules. Home shows exceptions, not inventory, so these
// rules decide what earns space on the page. Keep them few and specific.

import type {
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
import { lastEventAt } from './db.ts';

type Sources = Partial<Record<SourceId, SourceState>>;

const data = <T>(s: Sources, id: SourceId) => (s[id]?.ok ? (s[id]!.data as T) : null);

/** How long an integration fails before Patchboard mentions it. */
export const SOURCE_GRACE_MS = 2 * 60_000;

export function computeAlerts(sources: Sources, catalog: Catalog, updates: Record<string, ImageUpdate> = {}, now = Date.now()): Alert[] {
  const alerts: Alert[] = [];
  const expectStopped = new Set(
    catalog.groups.flatMap((g) => g.services.filter((s) => s.expectStopped && s.container).map((s) => s.container!)),
  );

  const docker = data<DockerData>(sources, 'docker');
  const containers = docker?.containers ?? [];
  const isDown = (name: string) => {
    const c = containers.find((x) => x.name === name);
    return !!c && c.state !== 'running' && c.state !== 'created' && !expectStopped.has(c.name);
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

  for (const c of containers) {
    const logs = `/c/${c.name}`;
    if (foldedAway.has(c.name)) continue;
    if (c.state !== 'running' && c.state !== 'created' && !expectStopped.has(c.name)) {
      const dependents = folded.get(c.name);
      alerts.push({
        id: `ctr-down-${c.name}`,
        subject: c.name,
        level: 'critical',
        title: `${c.name} is ${c.state === 'restarting' ? 'restart-looping' : 'not running'}`,
        detail: dependents
          ? `${stoppedDetail(c.status, c.image)} Also down because of it: ${dependents.join(', ')}.`
          : stoppedDetail(c.status, c.image),
        since: lastEventAt(c.name, 'container.stopped'),
        href: logs,
        source: 'docker',
      });
    } else if (c.health === 'unhealthy') {
      alerts.push({
        id: `ctr-unhealthy-${c.name}`,
        subject: c.name,
        level: 'warn',
        title: `${c.name} is failing its health check`,
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
      alerts.push({ id: `pool-health-${p.name}`, subject: p.name, level: 'critical', title: `${p.name} is ${p.status.toLowerCase()}`, detail: p.disks.filter((d) => d.status !== 'ONLINE' || d.errors).map((d) => `${d.name} ${d.status}${d.errors ? `, ${d.errors} errors` : ''}`).join('; ') || 'Open the Server page for the pool layout.', href: '/server', source: 'truenas' });
    } else if (p.disks.some((d) => d.errors > 0)) {
      alerts.push({ id: `pool-errors-${p.name}`, subject: p.name, level: 'warn', title: `${p.name} has disk errors`, detail: p.disks.filter((d) => d.errors).map((d) => `${d.name}: ${d.errors}`).join(', '), href: '/server', source: 'truenas' });
    }
    if (p.scan?.errors) {
      alerts.push({ id: `pool-scrub-${p.name}`, subject: p.name, level: 'warn', title: `${p.name} scrub found ${p.scan.errors} errors`, href: '/server', source: 'truenas' });
    }
    if (p.usedPct >= config.poolWarnPct) {
      alerts.push({ id: `pool-full-${p.name}`, level: p.usedPct >= 95 ? 'critical' : 'warn', title: `Storage is ${Math.round(p.usedPct)}% full`, detail: `${fmtTB(p.freeBytes)} free on ${p.name}`, href: '/server', source: 'truenas' });
    }
  }
  for (const d of nas?.disks ?? []) {
    if (d.tempC != null && d.tempC >= config.diskWarnC) {
      alerts.push({ id: `disk-temp-${d.name}`, subject: d.name, level: d.tempC >= config.diskWarnC + 8 ? 'critical' : 'warn', title: `${d.name} is running at ${Math.round(d.tempC)}°C (${Math.round(d.tempC * 1.8 + 32)}°F)`, detail: d.model, href: '/server', source: 'truenas' });
    }
  }
  for (const a of nas?.alerts ?? []) {
    const level = ['CRITICAL', 'ALERT', 'EMERGENCY', 'ERROR'].includes(a.level) ? 'critical' : a.level === 'WARNING' ? 'warn' : null;
    // Pool capacity is already its own alert above, with Patchboard's threshold.
    if (!level || /space usage for pool/i.test(a.text)) continue;
    const [first, ...rest] = a.text.split(/(?<=\.)\s+/);
    alerts.push({ id: `nas-${a.id}`, level, title: first.length > 110 ? `${first.slice(0, 107)}...` : first, detail: rest.join(' ') || undefined, since: a.at ?? undefined, href: '/server', source: 'truenas' });
  }

  // Ad blocking switched off with no timer: someone paused it "for a minute"
  // from the app itself and it never came back. A timed pause stays quiet.
  for (const [id, name] of [['pihole', 'Pi-hole'], ['adguard', 'AdGuard Home']] as const) {
    const d = data<DnsData>(sources, id);
    if (d && !d.protecting && !d.resumesAt) {
      alerts.push({ id: `dns-off-${id}`, level: 'warn', title: `${name} isn't blocking ads`, detail: 'Blocking is off with no timer. Turn it back on from the Ad blocking widget.', href: '/', source: id });
    }
  }

  // Internet speed: Speedtest Tracker's own thresholds decide what is slow.
  const speed = data<SpeedData>(sources, 'speedtest');
  if (speed?.lastFailed && (!speed.latest || speed.lastFailed > speed.latest.at)) {
    alerts.push({ id: 'speed-failed', level: 'warn', title: 'The last speed test failed', detail: 'Speedtest Tracker could not reach a test server. The connection may be down.', since: speed.lastFailed, href: '/', source: 'speedtest' });
  } else if (speed?.latest && speed.latest.healthy === false) {
    const l = speed.latest;
    alerts.push({ id: 'speed-slow', level: 'warn', title: 'The internet is slower than your thresholds', detail: `${l.down} Mbps down, ${l.up} up${l.ping != null ? `, ${l.ping} ms ping` : ''} in the last test.`, since: l.at, href: '/', source: 'speedtest' });
  }

  // Uptime Kuma: a monitor that is down right now. Pending (Kuma's retry
  // window) waits for Kuma to decide, so a single slow check stays quiet.
  const kuma = data<UptimeKumaData>(sources, 'uptimekuma');
  for (const m of kuma?.monitors ?? []) {
    if (m.status !== 'down') continue;
    // A stopped container with the same name already says why; one alert is enough.
    if (alerts.some((a) => a.subject?.toLowerCase() === m.name.toLowerCase())) continue;
    alerts.push({
      id: `kuma-${m.id}`,
      subject: m.name,
      level: 'critical',
      title: `${m.name} is down`,
      detail: `${m.msg ? `${m.msg.replace(/\.$/, '')}. ` : ''}Seen by Uptime Kuma.`,
      since: m.since,
      href: kuma!.link,
      source: 'uptimekuma',
    });
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
    if (alerts.some((a) => a.source === 'uptimekuma' && a.subject?.toLowerCase() === s.name.toLowerCase())) continue;
    alerts.push({
      id: `check-${s.name}`,
      subject: s.name,
      level: 'warn',
      title: `${s.name} isn't answering`,
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
        alerts.push({ id: `bk-${id}-fail`, level: 'warn', title: `Last night's ${what} backup failed for ${failed.join(', ')}`, detail: `${last.items.length - failed.length} of ${last.items.length} completed.`, since: last.startedAt, href: '/server#backups', source: 'backups' });
      }
      if (!last.finishedAt && Date.now() - last.startedAt > 2 * H) {
        alerts.push({ id: `bk-${id}-stuck`, level: 'warn', title: `The ${what} backup started but never finished`, since: last.startedAt, href: '/server#backups', source: 'backups' });
      }
      if (Date.now() - last.startedAt > 36 * H) {
        alerts.push({ id: `bk-${id}-stale`, level: 'warn', title: `No ${what} backup in over a day and a half`, detail: 'The nightly cron may have stopped.', since: last.startedAt, href: '/server#backups', source: 'backups' });
      }
    };
    check(backups.db, 'database', 'db');
    check(backups.files, 'file', 'files');
  }

  const sys = data<SystemData>(sources, 'system');
  if (!nas && sys?.pool && sys.pool.usedPct >= config.poolWarnPct) {
    alerts.push({
      id: 'pool-full',
      level: sys.pool.usedPct >= 95 ? 'critical' : 'warn',
      title: `Storage is ${Math.round(sys.pool.usedPct)}% full`,
      detail: `${fmtTB(sys.pool.totalBytes - sys.pool.usedBytes)} free on ${sys.pool.path}`,
      source: 'system',
    });
  }

  for (const id of ['sonarr', 'radarr'] as const) {
    const arr = data<ArrData>(sources, id);
    if (!arr) continue;
    const name = id === 'sonarr' ? 'Sonarr' : 'Radarr';
    for (const p of arr.problems) {
      alerts.push({ id: `${id}-q-${p.title}`, level: 'warn', title: `${name} can't import a download`, detail: `${p.message} (${p.title})`, source: id });
    }
    for (const h of arr.health.filter((h) => h.level === 'error')) {
      alerts.push({ id: `${id}-h-${h.message}`, level: 'warn', title: `${name} health check`, detail: h.message, source: id });
    }
  }

  const qbit = data<QbitData>(sources, 'qbit');
  for (const name of qbit?.errored ?? []) {
    alerts.push({ id: `qbit-err-${name}`, level: 'warn', title: 'Torrent has errored', detail: name, source: 'qbit' });
  }

  const frigate = data<FrigateData>(sources, 'frigate');
  for (const cam of frigate?.cameras ?? []) {
    if (!cam.online) {
      alerts.push({ id: `cam-${cam.name}`, level: 'critical', subject: cam.name, title: `${cam.name} camera is offline`, detail: 'Frigate is receiving no frames', source: 'frigate' });
    }
  }

  // Image updates: one quiet line, not one per container.
  const pending = Object.keys(updates).filter((n) => containers.some((c) => c.name === n));
  if (pending.length) {
    alerts.push({
      id: 'image-updates',
      level: 'info',
      title: pending.length === 1 ? `An image update is available for ${pending[0]}` : `${pending.length} containers have image updates`,
      detail: pending.length > 1 ? pending.slice(0, 6).join(', ') + (pending.length > 6 ? ', and more' : '') : undefined,
      href: '/stacks?updates=1',
      source: 'patchboard',
    });
  }

  // An integration we can't reach is worth knowing about, but quietly, and
  // only once it has failed for two minutes: restarting Jellyfin isn't news.
  for (const s of Object.values(sources)) {
    if (s && !s.ok && s.error && (!s.failingSince || now - s.failingSince >= SOURCE_GRACE_MS)) {
      alerts.push({ id: `src-${s.id}`, level: 'info', title: `Can't reach ${s.label}`, detail: s.error, since: s.failingSince, href: '/settings?tab=connections', source: s.id });
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
      : code === '0'
        ? 'Exited cleanly'
        : `Exited with code ${code}`;
  return `${what}. ${image}`;
}

function fmtTB(bytes: number): string {
  return bytes >= 1e12 ? `${(bytes / 1e12).toFixed(1)} TB` : `${Math.round(bytes / 1e9)} GB`;
}
