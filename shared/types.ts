// Types shared by the server and the web client. Keep this file free of runtime
// code so both sides can import it without pulling anything in.

export type SourceId =
  | 'docker'
  | 'system'
  | 'weather'
  | 'sonarr'
  | 'radarr'
  | 'tautulli'
  | 'qbit'
  | 'miniflux'
  | 'fastmail'
  | 'trakt'
  | 'frigate'
  | 'truenas'
  | 'stats'
  | 'checks'
  | 'backups';

export interface SourceState<T = unknown> {
  id: SourceId;
  label: string;
  ok: boolean;
  error?: string;
  updatedAt: number | null;
  data: T | null;
}

export interface Container {
  id: string;
  name: string;
  image: string;
  /** Short id of the image the container runs, to notice when an update was applied. */
  imageId?: string;
  state: string; // running | exited | restarting | paused | dead | created
  status: string; // Docker's human string, e.g. "Up 3 days (healthy)"
  health: 'healthy' | 'unhealthy' | 'starting' | null;
  /** Unix ms. */
  created?: number;
  /** Compose project and service, from Docker's own labels. */
  project?: string;
  service?: string;
  /** Container names this one depends on, resolved from compose's depends_on label. */
  dependsOn?: string[];
  /** patchboard.* and homepage.* catalog labels (name, group, href, icon...), prefix dropped. */
  labels?: Record<string, string>;
}

export interface DockerData {
  containers: Container[];
}

export interface SystemData {
  cpuPct: number;
  load: [number, number, number];
  cores: number;
  uptimeSec: number;
  pool: { path: string; usedPct: number; usedBytes: number; totalBytes: number } | null;
  /** Host memory. `arc` is the ZFS cache, which the kernel gives back under pressure. */
  mem: { total: number; available: number; arc: number } | null;
}

export interface ContainerStats {
  /** Share of the whole machine, 0-100 (not of one core). */
  cpu: number;
  memBytes: number;
}

export interface StatsData {
  containers: Record<string, ContainerStats>;
}

export interface PoolDisk {
  name: string;
  status: string;
  errors: number;
}

export interface Pool {
  name: string;
  status: string;
  healthy: boolean;
  sizeBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPct: number;
  layout: string; // e.g. "MIRROR"
  disks: PoolDisk[];
  scan: { kind: string; state: string; endedAt: number | null; startedAt: number | null; errors: number } | null;
}

export interface Disk {
  name: string;
  model: string;
  sizeBytes: number;
  type: string;
  pool: string | null;
  tempC: number | null;
}

export interface Dataset {
  name: string;
  usedBytes: number;
}

export interface NasAlert {
  id: string;
  level: string; // TrueNAS levels: INFO, NOTICE, WARNING, ERROR, CRITICAL, ALERT, EMERGENCY
  text: string;
  at: number | null;
}

export interface CloudSyncTask {
  name: string;
  enabled: boolean;
  state: string | null;
  finishedAt: number | null;
  error: string | null;
}

export interface TruenasData {
  hostname: string;
  version: string;
  pools: Pool[];
  disks: Disk[];
  datasets: Dataset[];
  snapshots: number | null;
  alerts: NasAlert[];
  cloudSync: CloudSyncTask[];
  /** Live interface rates in bytes/s, when the realtime feed is available. */
  net: { iface: string; rx: number; tx: number }[] | null;
}

export interface DiscoveredService {
  container: string;
  project?: string;
  name: string;
  icon: string;
  href?: string;
}

export interface CatalogAudit {
  /** Catalog entries whose container doesn't exist. */
  missing: { service: string; container: string }[];
  /** Running containers no entry covers, with a drafted entry. */
  discovered: DiscoveredService[];
  /** Drafted YAML for everything discovered. */
  yaml?: string;
}

export interface UpdateEligibility {
  ok: boolean;
  reason?: string;
}

export interface UpdateStep {
  key: string;
  label: string;
  status: 'waiting' | 'running' | 'done' | 'failed' | 'skipped';
  note?: string;
}

/** A pull-and-recreate (or rollback) run, streamed to the container page. */
export interface UpdateJob {
  id: string;
  container: string;
  kind: 'update' | 'rollback';
  status: 'running' | 'done' | 'failed';
  steps: UpdateStep[];
  log: string[];
  startedAt: number;
  finishedAt?: number;
  /** Short image ids before and after. */
  from?: string;
  to?: string;
  error?: string;
}

/** Detail for one container, from `docker inspect`. Never includes env. */
export interface ContainerDetail {
  name: string;
  id: string;
  image: string;
  imageId: string;
  imageCreated: number | null;
  created: number;
  startedAt: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  restartCount: number;
  restartPolicy: string;
  state: string;
  health: string | null;
  healthLog: { at: number; exitCode: number; output: string }[];
  project?: string;
  service?: string;
  workingDir?: string;
  ports: { container: string; host: string | null }[];
  mounts: { source: string; target: string; rw: boolean; type: string }[];
  networks: string[];
  dependsOn: string[];
  usedBy: string[];
  /** Whether Patchboard can update it, filled in by the route. */
  update?: UpdateEligibility;
}

export interface RunbookSection {
  title: string;
  markdown: string;
}

export type Series = [number, number][];

/** One service's last reachability check. */
/** An image update Diun reported for a running container. */
export interface ImageUpdate {
  image: string;
  at: number;
  link?: string;
}

export interface ServiceCheck {
  name: string;
  /** host:port only, never a path or query. */
  target: string;
  ok: boolean;
  status: number | null;
  ms: number | null;
  at: number;
  error?: string;
  /** Consecutive failures; alerts start at 2. */
  fails: number;
}

export interface ChecksData {
  services: Record<string, ServiceCheck>;
}

export interface BackupRun {
  startedAt: number;
  finishedAt: number | null;
  items: { label: string; ok: boolean }[];
  stored?: number;
  size?: string;
}

export interface BackupsData {
  db: BackupRun[];
  files: BackupRun[];
}

/** One square in a health grid: a day's worst state, or none if not watched yet. */
export type DayState = 'up' | 'warn' | 'down' | 'none';

export interface UptimeData {
  /** Local midnight of each day, oldest first. */
  days: number[];
  /** When Patchboard started recording state changes. */
  since: number;
  containers: Record<string, DayState[]>;
}

export interface WeatherDay {
  date: string;
  high: number;
  low: number;
  code: number;
  precipPct: number;
}

export interface WeatherData {
  label: string;
  tempNow: number;
  codeNow: number;
  days: WeatherDay[];
}

export interface ReleaseItem {
  id: string;
  source: 'sonarr' | 'radarr' | 'trakt';
  kind: 'episode' | 'movie';
  title: string;
  subtitle?: string;
  when: string; // ISO timestamp
  hasFile?: boolean;
  url?: string;
  /** Dedupe key so the same episode from Sonarr and Trakt shows once. */
  key: string;
}

export interface ArrProblem {
  title: string;
  message: string;
}

export interface ArrData {
  upcoming: ReleaseItem[];
  queueTotal: number;
  problems: ArrProblem[];
  health: { level: 'warning' | 'error' | 'notice'; message: string }[];
}

export interface Stream {
  user: string;
  title: string;
  subtitle?: string;
  progress: number;
  state: 'playing' | 'paused' | 'buffering';
  transcode: boolean;
  thumb?: string;
}

export interface RecentItem {
  id: string;
  title: string;
  subtitle?: string;
  type: string;
  addedAt: number;
  thumb?: string;
}

export interface TautulliData {
  streams: Stream[];
  recent: RecentItem[];
}

export interface ActiveTorrent {
  name: string;
  progress: number;
  speed: number;
  etaSec: number;
}

export interface QbitData {
  down: number;
  up: number;
  downloading: number;
  seeding: number;
  stalled: number;
  errored: string[];
  active: ActiveTorrent[];
}

export interface FeedEntry {
  id: number;
  title: string;
  url: string;
  feed: string;
  category: string;
  publishedAt: string;
  readingTime: number;
  content?: string;
}

export interface MinifluxData {
  unread: number;
  entries: FeedEntry[];
}

export interface MailMessage {
  id: string;
  from: string;
  subject: string;
  preview: string;
  receivedAt: string;
  unread: boolean;
}

export interface FastmailData {
  unread: number;
  messages: MailMessage[];
  webUrl: string;
}

export interface TraktData {
  upcoming: ReleaseItem[];
}

export interface FrigateData {
  cameras: { name: string; fps: number; online: boolean }[];
}

export type AlertLevel = 'critical' | 'warn' | 'info';

export interface Alert {
  id: string;
  level: AlertLevel;
  title: string;
  /** Identifier the title starts with (a container or camera name), set in mono. */
  subject?: string;
  detail?: string;
  since?: number;
  href?: string;
  source: SourceId | 'patchboard';
}

export interface ChangeEvent {
  id: number;
  at: number;
  kind: 'container.stopped' | 'container.started' | 'container.unhealthy' | 'container.recovered' | 'container.action';
  subject: string;
  detail?: string;
}

export interface Service {
  name: string;
  /** Short name for the patch-row tape; defaults to a shortened name. */
  label?: string;
  href?: string;
  icon?: string;
  container?: string;
  description?: string;
  /** Containers that are meant to exit (one-shot jobs) never raise an alert. */
  expectStopped?: boolean;
  /**
   * Reachability check. By default Patchboard checks hrefs on private or
   * tailnet addresses and on CHECK_DOMAINS. `false` turns it off, `true`
   * forces it on, a URL checks that address instead of href.
   */
  check?: boolean | string;
  /** Where the entry came from: the YAML catalog (default), Docker labels, or added in the UI. */
  source?: 'yaml' | 'labels' | 'ui';
}

export interface Bookmark {
  name: string;
  href: string;
  icon?: string;
}

export interface Catalog {
  groups: { name: string; services: Service[] }[];
  dock: Bookmark[];
  /** True when someone rearranged the apps in the UI (see shared/order.ts). */
  ordered?: boolean;
  /** Catalog group name -> the name it was given in the UI. */
  renamed?: Record<string, string>;
  /** Hidden in the UI, with the group each would return to. */
  hiddenApps?: { group: string; service: Service }[];
  hiddenDock?: Bookmark[];
  /** App or bookmark name -> icon chosen in the UI. */
  iconOverrides?: Record<string, string>;
  /** Apps with a live number set up in the UI. */
  statApps?: string[];
}

export interface Links {
  dozzle?: string;
  fastmail?: string;
  miniflux?: string;
  sonarr?: string;
  radarr?: string;
}

export interface Snapshot {
  demo: boolean;
  generatedAt: number;
  sources: Partial<Record<SourceId, SourceState>>;
  alerts: Alert[];
  changes: ChangeEvent[];
  catalog: Catalog;
  links: Links;
  /** Container name -> pending image update. */
  updates: Record<string, ImageUpdate>;
  /** READ_ONLY=1: the UI hides every control that changes something. */
  readOnly: boolean;
}

export type ServerEvent =
  | { type: 'source'; state: SourceState }
  | { type: 'alerts'; alerts: Alert[] }
  | { type: 'changes'; changes: ChangeEvent[] }
  | { type: 'updates'; updates: Record<string, ImageUpdate> }
  | { type: 'catalog'; catalog: Catalog };
