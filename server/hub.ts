// The hub owns polling. Each adapter runs on its own timer; results are cached
// and pushed to every open browser over SSE. The browser never talks to an
// integration directly, so no key ever leaves the server.

import { emptyTrack, settle, type Track } from './transitions.ts';
import type { Adapter } from './adapters/adapter.ts';
import type {
  Alert,
  ChangeEvent,
  Container,
  DockerData,
  ServerEvent,
  Snapshot,
  SourceId,
  SourceState,
  ChecksData,
  StatsData,
  SystemData,
  TruenasData,
} from '../shared/types.ts';
import { computeAlerts } from './alerts.ts';
import { dockerCli } from './cli.ts';
import { notifyAlerts } from './notify.ts';
import { getCatalog, setCatalogContainers } from './catalog.ts';
import { config } from './config.ts';
import { firstEventAt, kvGet, kvSet, lastEventAt, latestSample, pruneAudit, listChanges, prune, pruneSamples, recordEvent, recordSamples } from './db.ts';
import { demoContainers, demoSampleHistory } from './demo.ts';
import { seedPoolHistoryFromAudits } from './notes.ts';
import { pendingUpdates, settleUpdates } from './updates.ts';
import { watchContainerEvents } from './adapters/docker.ts';

type Listener = (e: ServerEvent) => void;

const CHANGE_WINDOW = 48 * 3_600_000;

/** Always on: these keep their loops when integrations change. */
const CORE = new Set<SourceId>(['docker', 'stats', 'system', 'checks']);

export class Hub {
  private sources: Partial<Record<SourceId, SourceState>> = {};
  private alerts: Alert[] = [];
  private changes: ChangeEvent[] = [];
  private listeners = new Set<Listener>();
  private lastCatalog = '';
  private adapters: Adapter[];

  constructor(adapters: Adapter[]) {
    this.adapters = adapters;
    for (const a of adapters) {
      this.sources[a.id] = { id: a.id, label: a.label, ok: false, updatedAt: null, data: null };
    }
    this.changes = listChanges(CHANGE_WINDOW);
  }

  /** Bumped when the adapter set changes, so loops from the old set stop. */
  private generation = 0;

  /**
   * Swap the integrations after settings change in the UI. Old poll loops end
   * at their next tick; sources that went away leave every open tab.
   */
  replaceAdapters(next: Adapter[]): void {
    this.generation++;
    this.adapters = next;
    const keep = new Set(next.map((a) => a.id));
    for (const id of Object.keys(this.sources) as SourceId[]) if (!keep.has(id)) delete this.sources[id];
    for (const a of next) this.sources[a.id] ??= { id: a.id, label: a.label, ok: false, updatedAt: null, data: null };
    this.emit({ type: 'sources', sources: this.sources });
    for (const a of next) if (!CORE.has(a.id)) void this.loop(a);
  }

  start(): void {
    for (const a of this.adapters) void this.loop(a);
    // Docker pushes lifecycle events; refresh on them instead of waiting for
    // the next 10-second poll. Bursts (a compose up) collapse into one poll.
    if (!config.demo) {
      let t: NodeJS.Timeout | undefined;
      watchContainerEvents(() => {
        clearTimeout(t);
        t = setTimeout(() => void this.pollNow('docker'), 400);
      });
    }
    const H = 3_600_000;
    const housekeeping = () => {
      prune(30 * 24 * H);
      pruneAudit();
      pruneSamples('ctr.', 2 * 24 * H);
      pruneSamples('svc.', 8 * 24 * H);
      pruneSamples('cpu', 8 * 24 * H);
      pruneSamples('mem.', 8 * 24 * H);
      void seedPoolHistoryFromAudits();
    };
    housekeeping();
    setInterval(housekeeping, 6 * H).unref();
    setInterval(() => this.sample(), 60_000).unref();
    // A problem waits two minutes before it notifies; this tick sends it on time.
    setInterval(() => void notifyAlerts(this.alerts), 30_000).unref();
  }

  /** The data every minute-by-minute chart is drawn from. */
  private sample(): void {
    const at = Date.now();
    const out: [string, number][] = [];
    const sys = this.sources.system?.ok ? (this.sources.system.data as SystemData) : null;
    if (sys) {
      out.push(['cpu', sys.cpuPct]);
      if (sys.mem) {
        out.push(['mem.used', Math.max(0, sys.mem.total - sys.mem.available - sys.mem.arc)]);
        out.push(['mem.arc', sys.mem.arc]);
      }
    }
    const stats = this.sources.stats?.ok ? (this.sources.stats.data as StatsData) : null;
    for (const [name, s] of Object.entries(stats?.containers ?? {})) {
      out.push([`ctr.cpu:${name}`, s.cpu], [`ctr.mem:${name}`, s.memBytes]);
    }
    const checks = this.sources.checks?.ok ? (this.sources.checks.data as ChecksData) : null;
    for (const c of Object.values(checks?.services ?? {})) {
      if (c.ms != null) out.push([`svc.ms:${c.name}`, c.ms]);
    }
    // Pool size changes slowly; one point every six hours is plenty.
    const last = latestSample('pool.used');
    if (!last || at - last.at >= 6 * 3_600_000) {
      const nas = this.sources.truenas?.ok ? (this.sources.truenas.data as TruenasData) : null;
      const pool = nas?.pools.slice().sort((a, b) => b.sizeBytes - a.sizeBytes)[0];
      if (pool) out.push(['pool.used', pool.usedBytes], ['pool.size', pool.sizeBytes]);
      else if (sys?.pool) out.push(['pool.used', sys.pool.usedBytes], ['pool.size', sys.pool.totalBytes]);
    }
    if (out.length) recordSamples(at, out);
  }

  /** Re-read recent changes after something was recorded outside a poll. */
  refreshChanges(): void {
    this.changes = listChanges(CHANGE_WINDOW);
    this.emit({ type: 'changes', changes: this.changes });
  }

  /** Current containers, for routes that need them (detail pages, runbook lookup). */
  containers(): Container[] {
    return (this.sources.docker?.data as DockerData | null)?.containers ?? [];
  }

  /** Poll one source out of schedule, e.g. after the user changed something. */
  async pollNow(id: SourceId): Promise<void> {
    const a = this.adapters.find((x) => x.id === id);
    if (a) await this.poll(a);
  }

  private async loop(a: Adapter, gen = this.generation): Promise<void> {
    if (gen !== this.generation && !CORE.has(a.id)) return;
    await this.poll(a);
    setTimeout(() => void this.loop(a, gen), a.intervalMs).unref();
  }

  private async poll(a: Adapter): Promise<void> {
    const prev = this.sources[a.id]!;
    let next: SourceState;
    try {
      const data = await a.fetch();
      next = { id: a.id, label: a.label, ok: true, updatedAt: Date.now(), data };
      if (a.id === 'docker') {
        setCatalogContainers((data as DockerData).containers);
        // A container gained or lost catalog labels: tabs get the new catalog now.
        const cat = JSON.stringify(getCatalog());
        if (cat !== this.lastCatalog) {
          if (this.lastCatalog) this.emit({ type: 'catalog', catalog: getCatalog() });
          this.lastCatalog = cat;
        }
        this.trackContainers((data as DockerData).containers);
      }
    } catch (err) {
      const error = (err as Error).message || 'Unknown error';
      if (prev.error !== error) console.warn(`${a.id}: ${error}`);
      // Keep the last good data so the page degrades instead of going blank.
      next = { ...prev, ok: false, error, failingSince: prev.ok || !prev.failingSince ? Date.now() : prev.failingSince };
    }
    this.sources[a.id] = next;
    this.emit({ type: 'source', state: next });
    this.refreshAlerts();
  }

  /** Record container state transitions so "since when" survives restarts. */
  private trackContainers(containers: Container[]): void {
    // Health grids show days before this as "not watched yet".
    if (kvGet('tracking-since') === undefined) kvSet('tracking-since', Math.min(firstEventAt() ?? Date.now(), Date.now()));
    // Brief stops (an update, a restart) settle into one event; see transitions.ts.
    const prev = kvGet<Track>('container-track') ?? { ...emptyTrack(), states: kvGet<Track['states']>('container-states') ?? {} };
    const { track, events } = settle(prev, containers, Date.now());
    for (const e of events) {
      // Restarted or updated from Patchboard: the command already says so.
      if (e.kind === 'container.restarted' && e.at - (lastEventAt(e.subject, 'container.action') ?? 0) < 5 * 60_000) continue;
      recordEvent(e.kind, e.subject, e.detail, e.at);
    }
    const changed = events.length > 0;
    kvSet('container-track', track);
    if (settleUpdates(containers)) this.emitUpdates();
    if (changed) {
      this.changes = listChanges(CHANGE_WINDOW);
      this.emit({ type: 'changes', changes: this.changes });
    }
  }

  /** Diun reported something, or an update was applied: tell every tab. */
  /** Page settings changed: tell every tab. */
  emitPages(pages: import('../shared/pages.ts').Pages): void {
    this.emit({ type: 'pages', pages });
  }

  /** The catalog changed outside a poll (e.g. a rearrange): tell every tab. */
  emitCatalog(): void {
    const cat = getCatalog();
    this.lastCatalog = JSON.stringify(cat);
    this.emit({ type: 'catalog', catalog: cat });
  }

  emitUpdates(): void {
    this.emit({ type: 'updates', updates: pendingUpdates() });
    this.refreshAlerts();
  }

  refreshAlerts(): void {
    const next = computeAlerts(this.sources, getCatalog(), pendingUpdates());
    if (JSON.stringify(next) !== JSON.stringify(this.alerts)) {
      this.alerts = next;
      this.emit({ type: 'alerts', alerts: next });
    }
    void notifyAlerts(this.alerts);
  }

  snapshot(): Snapshot {
    return {
      demo: config.demo,
      generatedAt: Date.now(),
      sources: this.sources,
      alerts: this.alerts,
      changes: this.changes,
      catalog: getCatalog(),
      updates: pendingUpdates(),
      readOnly: config.readOnly,
      limits: { poolWarnPct: config.poolWarnPct, poolCritPct: config.poolCritPct, diskWarnC: config.diskWarnC, diskCritC: config.diskCritC },
      pages: kvGet('pages') ?? {},
      features: [
        'diun',
        ...((config.composeRoot && dockerCli) || config.demo ? ['updates'] : []),
        ...(config.docsPath || config.demo ? ['runbook'] : []),
        ...(config.dozzleUrl || config.demo ? ['dozzle'] : []),
        ...(config.wake.devices.length || config.demo ? ['wake'] : []),
        ...(config.notify.ntfy || config.demo ? ['ntfy'] : []),
        ...(config.notify.gotify ? ['gotify'] : []),
        ...(config.notify.pushover ? ['pushover'] : []),
        ...(config.notify.email ? ['email'] : []),
        // The slim image: Settings says why updates are off.
        ...(!dockerCli && !config.demo ? ['no-docker-cli'] : []),
      ],
      wake: config.demo ? ['Desktop', 'Media PC', 'Backup NAS'] : config.wake.devices.map((d) => d.name),
      links: config.demo
        ? { dozzle: '#', fastmail: '#', miniflux: '#', sonarr: '#', radarr: '#' }
        : {
            dozzle: config.dozzleUrl,
            fastmail: config.fastmail?.webUrl,
            miniflux: config.miniflux?.url,
            sonarr: config.sonarr?.url,
            radarr: config.radarr?.url,
          },
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: ServerEvent): void {
    for (const fn of this.listeners) fn(e);
  }
}

/** Demo installs start with a little history so the Changes list isn't empty. */
export function seedDemoHistory(): void {
  if (kvGet('demo-seeded')) return;
  const H = 3_600_000;
  const t = Date.now();
  recordEvent('container.started', 'plex', 'Up 4 hours', t - 4 * H);
  recordEvent('container.restarted', 'sonarr', 'updated', t - 1.5 * H);
  recordEvent('container.stopped', 'plex', 'Exited (0)', t - 4 * H - 40_000);
  recordEvent('container.unhealthy', 'immich-server', 'Up 6 days (unhealthy)', t - 11 * H);
  recordEvent('container.recovered', 'immich-server', undefined, t - 10.6 * H);
  recordEvent('container.stopped', 'recyclarr', 'Exited (0)', t - 9 * H);
  recordEvent('container.stopped', 'unpackerr', 'Exited (1)', t - 2 * H);
  // Older history, so the health grids have something to show.
  const D = 24 * H;
  recordEvent('container.stopped', 'unpackerr', 'Exited (1)', t - 9 * D);
  recordEvent('container.started', 'unpackerr', 'Up', t - 9 * D + 3 * H);
  recordEvent('container.unhealthy', 'immich-server', 'Up (unhealthy)', t - 4 * D);
  recordEvent('container.recovered', 'immich-server', undefined, t - 4 * D + 40 * 60_000);
  recordEvent('container.stopped', 'plex', 'Exited (0)', t - 16 * D);
  recordEvent('container.started', 'plex', 'Up', t - 16 * D + 25 * 60_000);
  recordEvent('container.stopped', 'nextcloud', 'Exited (137)', t - 12 * D);
  recordEvent('container.started', 'nextcloud', 'Up', t - 12 * D + 2 * H);
  recordEvent('container.unhealthy', 'frigate', 'Up (unhealthy)', t - 6 * D);
  recordEvent('container.recovered', 'frigate', undefined, t - 6 * D + 20 * 60_000);
  kvSet('tracking-since', t - 24 * D);
  kvSet('image-updates', {
    sonarr: { image: 'lscr.io/linuxserver/sonarr:latest', at: t - 5 * H, link: '#' },
    'immich-server': { image: 'ghcr.io/immich-app/immich-server:release', at: t - 29 * H, link: '#' },
    caddy: { image: 'caddy:2', at: t - 3 * D, link: '#' },
  });
  kvSet('demo-seeded', true);
}

/** Demo charts start with a day of history instead of a single point. */
export function seedDemoSamples(): void {
  if (kvGet('demo-samples-seeded')) return;
  demoSampleHistory(demoContainers(), recordSamples);
  kvSet('demo-samples-seeded', true);
}
