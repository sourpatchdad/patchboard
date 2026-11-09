// Types shared by the server and the web client. Keep this file free of runtime
// code so both sides can import it without pulling anything in.

export type SourceId =
  | 'docker'
  | 'system'
  | 'weather'
  | 'sonarr'
  | 'radarr'
  | 'tautulli'
  | 'jellyfin'
  | 'homeassistant'
  | 'tessie'
  | 'emby'
  | 'qbit'
  | 'transmission'
  | 'deluge'
  | 'sabnzbd'
  | 'nzbget'
  | 'miniflux'
  | 'fastmail'
  | 'trakt'
  | 'frigate'
  | 'uptimekuma'
  | 'gatus'
  | 'healthchecks'
  | 'beszel'
  | 'syncthing'
  | 'tracearr'
  | 'pihole'
  | 'adguard'
  | 'speedtest'
  | 'immich'
  | 'proxmox'
  | 'scrutiny'
  | 'glances'
  | 'nut'
  | 'unraid'
  | 'synology'
  | 'qnap'
  | 'portainer'
  | 'netdata'
  | 'prometheus'
  | 'unifi'
  | 'tailscale'
  | 'lidarr'
  | 'readarr'
  | 'prowlarr'
  | 'bazarr'
  | 'paperless'
  | 'nextcloud'
  | 'audiobookshelf'
  | 'navidrome'
  | 'gitea'
  | 'calendar'
  | 'books'
  | 'overseerr'
  | 'truenas'
  | 'stats'
  | 'checks'
  | 'backups';

export interface SourceState<T = unknown> {
  id: SourceId;
  label: string;
  ok: boolean;
  error?: string;
  /** When the current run of failures began; cleared by the next success. */
  failingSince?: number;
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
  /** The compose project's folder on the host. */
  workingDir?: string;
  /**
   * Its image tag now points at a newer image that is already downloaded:
   * someone pulled, but this container still runs the old copy.
   */
  staleImage?: boolean;
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
  /** services.yaml entries not yet copied into Patchboard. */
  yamlApps?: number;
  yamlLinks?: number;
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
  /** Local ISO times. */
  sunrise?: string;
  sunset?: string;
  uvMax?: number;
  /** km/h */
  windMax?: number;
}

export interface WeatherHour {
  /** Local ISO time. */
  time: string;
  temp: number;
  code: number;
  precipPct: number;
}

export interface WeatherAlert {
  event: string;
  headline: string;
  /** NWS severity: Extreme, Severe, Moderate, Minor, Unknown. */
  severity: string;
  until?: string;
}

export interface WeatherData {
  label: string;
  /** All temperatures in °C; the browser converts. */
  tempNow: number;
  codeNow: number;
  feelsNow?: number;
  /** km/h */
  windNow?: number;
  humidityNow?: number;
  isDay?: boolean;
  hours?: WeatherHour[];
  days: WeatherDay[];
  alerts?: WeatherAlert[];
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
  /** Other keys the same release may go by in another source (a title-based one, the film regardless of release type). */
  alt?: string[];
  /** Poster, through Patchboard's art proxy. */
  art?: string;
  /** Sonarr's episode id or Radarr's movie id, to search for it from Patchboard. */
  searchId?: number;
}

/** One item in Sonarr's or Radarr's download queue. */
export interface ArrQueueItem {
  id: number;
  title: string;
  /** 0 to 1. */
  progress: number;
  state: 'downloading' | 'queued' | 'paused' | 'importing' | 'warning' | 'failed';
  /** What's wrong, when it's stuck. */
  message?: string;
}

export interface ArrProblem {
  title: string;
  message: string;
}

export interface ArrData {
  upcoming: ReleaseItem[];
  queueTotal: number;
  /** The queue, stuck items first, up to 20. */
  queue?: ArrQueueItem[];
  problems: ArrProblem[];
  health: { level: 'warning' | 'error' | 'notice'; message: string }[];
}

export interface Stream {
  /** The library item, when the source can open its own title. */
  itemId?: string;
  user: string;
  title: string;
  subtitle?: string;
  progress: number;
  /** Playback timing supplied by the source, in seconds. */
  positionSec?: number;
  durationSec?: number;
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

/** One play on a media server, newest first in a list. */
export interface Play {
  user: string;
  title: string;
  subtitle?: string;
  /** When it was played, ms. */
  at: number;
  itemId?: string;
  thumb?: string;
}

/** What a media server holds. */
export interface LibraryCounts {
  movies: number;
  shows: number;
  episodes: number;
  songs?: number;
}

export interface TautulliData {
  streams: Stream[];
  recent: RecentItem[];
  /** The last plays, newest first. */
  watched?: Play[];
  library?: LibraryCounts;
  /** Plex: after the web app's address, then the item id, opens that title. Missing until Plex's server id is known. */
  itemPath?: string;
}

/** Jellyfin and Emby: the Plex shape plus the episodes you watch next. */
export interface MediaServerData extends TautulliData {
  nextUp: RecentItem[];
  /** Appended to the app's address, then the item id, to open it in the server's web app. */
  itemPath: string;
}

/** One entry from an RSS or Atom feed. */
export interface FeedItem {
  title: string;
  link?: string;
  at: number;
  /** The feed's own name. */
  source: string;
}

/** A GitHub project's newest release. */
export interface ReleaseInfo {
  repo: string;
  version: string;
  name?: string;
  at: number;
  url: string;
  prerelease?: boolean;
  /** The project has no releases. */
  none?: boolean;
}

export interface ActiveTorrent {
  name: string;
  progress: number;
  speed: number;
  etaSec: number;
}

export interface HaEntity {
  id: string;
  name: string;
  state: string;
  unit?: string;
  deviceClass?: string;
  changedAt: number;
}

export interface HomeAssistantData {
  /** Only the entities pinned to a Home Assistant widget. */
  entities: HaEntity[];
  /** How many entities Home Assistant has in all. */
  total: number;
}

export interface Car {
  vin: string;
  name: string;
  battery: number;
  rangeMi: number;
  /** Tesla's own word: Charging, Complete, Disconnected, Stopped, Starting, NoPower. */
  charging: string;
  minutesToFull?: number;
  chargeKw?: number;
  limit: number;
  insideC?: number;
  outsideC?: number;
  climateOn: boolean;
  locked: boolean;
  sentry: boolean;
  odometerMi: number;
  driving: boolean;
  asleep: boolean;
  updatedAt: number;
}

/** One internet speed test, in megabits per second and milliseconds. */
export interface SpeedRun {
  at: number;
  down: number;
  up: number;
  ping?: number;
  jitter?: number;
  /** Percent of packets lost. */
  loss?: number;
  /** Speedtest Tracker's verdict against your thresholds, when you set some. */
  healthy?: boolean;
  server?: string;
  isp?: string;
}

/** One Immich job queue: thumbnails, face detection and so on. */
export interface ImmichQueue {
  name: string;
  active: number;
  /** Waiting plus delayed. */
  waiting: number;
  failed: number;
  paused: boolean;
}

export interface ImmichData {
  photos: number;
  videos: number;
  /** Bytes the library takes. */
  usage: number;
  version?: string;
  /** Empty when the key can't read queues. */
  queues: ImmichQueue[];
  webUrl: string;
}

export interface SpeedData {
  latest: SpeedRun | null;
  /** When the newest test failed, if it did. */
  lastFailed?: number;
  /** The last 24 hours, oldest first. */
  runs: SpeedRun[];
}

/** A request waiting in Overseerr or Jellyseerr. */
export interface SeerrRequest {
  id: number;
  kind: 'movie' | 'tv';
  title: string;
  year?: number;
  by: string;
  at: number;
  seasons?: number[];
  is4k: boolean;
  /** Poster through Patchboard's art proxy. */
  art?: string;
}

export interface SeerrData {
  pending: number;
  processing: number;
  requests: SeerrRequest[];
}

/** Pi-hole or AdGuard Home: the last day's queries and whether blocking is on. */
export interface DnsData {
  kind: 'pihole' | 'adguard';
  queries: number;
  blocked: number;
  /** Percent of queries blocked. */
  pct: number;
  protecting: boolean;
  /** When a timed pause ends. Unset while blocking is on, or when it is off with no timer. */
  resumesAt?: number;
  /** Domains on the blocklists (Pi-hole). */
  listSize?: number;
}

export type KumaState = 'up' | 'down' | 'pending' | 'maintenance' | 'unknown';

export interface KumaMonitor {
  id: number | string;
  name: string;
  group: string;
  status: KumaState;
  ping?: number;
  /** Percent up over the last 24 hours. */
  uptime24?: number;
  /** When the current state began, as far back as the beats go. */
  since?: number;
  /** Kuma's message for the last beat, when it isn't up. */
  msg?: string;
  /** The last beats, oldest first. */
  beats: Exclude<KumaState, 'unknown'>[];
}

export interface UptimeKumaData {
  /** The status page, to open from the widget. */
  link: string;
  monitors: KumaMonitor[];
}

/** Tracearr: media servers it watches, and violations nobody has handled. */
export interface TracearrData {
  webUrl: string;
  servers: { id: string; name: string; type: string; status: 'up' | 'down' | 'unknown'; reason?: string; streams: number }[];
  violations: { id: string; severity: 'high' | 'warning'; rule: string; user: string; server: string; at: number }[];
}

/** A Syncthing folder. failing counts files it can't sync. */
export interface SyncFolder {
  id: string;
  label: string;
  state: 'idle' | 'syncing' | 'failing' | 'error' | 'paused';
  bytes: number;
  /** Percent in sync. */
  pct: number;
  failing: number;
  error?: string;
}

export interface SyncDevice {
  id: string;
  name: string;
  connected: boolean;
  paused: boolean;
  lastSeen?: number;
}

export interface SyncthingData {
  webUrl: string;
  folders: SyncFolder[];
  devices: SyncDevice[];
}

/** A Proxmox VE node. CPU is a 0 to 1 share of its cores. */
export interface ProxmoxNode {
  name: string;
  online: boolean;
  cpu: number;
  cores: number;
  mem: number;
  maxmem: number;
  uptime: number;
}

/** A VM or LXC container on Proxmox. */
export interface ProxmoxGuest {
  vmid: number;
  name: string;
  kind: 'vm' | 'lxc';
  node: string;
  running: boolean;
  cpu: number;
  mem: number;
  maxmem: number;
  uptime: number;
}

export interface ProxmoxData {
  nodes: ProxmoxNode[];
  guests: ProxmoxGuest[];
  webUrl: string;
}

/** One drive as Scrutiny sees it. */
export interface DriveHealth {
  id: string;
  /** Device name without /dev/: sda, nvme0n1. */
  name: string;
  model: string;
  capacity: number;
  /** Scrutiny's collector host, when several machines report. */
  host?: string;
  /** failed: the drive's own SMART check failed. warn: Scrutiny's thresholds did. */
  status: 'ok' | 'warn' | 'failed';
  temp?: number;
  hours?: number;
  checkedAt?: number;
}

export interface ScrutinyData {
  drives: DriveHealth[];
  webUrl: string;
}

export interface GlancesDisk {
  mount: string;
  used: number;
  size: number;
  pct: number;
}

/** One machine running Glances. */
export interface GlancesHost {
  url: string;
  ok: boolean;
  error?: string;
  name: string;
  os: string;
  cpuPct: number;
  cores?: number;
  /** Five-minute load average. */
  load?: number;
  memPct: number;
  memUsed: number;
  memTotal: number;
  /** Fullest first. */
  disks: GlancesDisk[];
  /** Bytes per second across the physical interfaces. */
  rx: number;
  tx: number;
  /** The hottest temperature sensor. */
  tempC?: number;
  uptime?: string;
}

export interface GlancesData {
  hosts: GlancesHost[];
}

/** One UPS from NUT. */
export interface Ups {
  name: string;
  model: string;
  /** The power is out and it runs on battery. */
  onBattery: boolean;
  lowBattery: boolean;
  /** The UPS asks for a new battery. */
  replaceBattery: boolean;
  charging: boolean;
  /** Percent. */
  charge?: number;
  runtimeSec?: number;
  loadPct?: number;
  watts?: number;
  inputVolts?: number;
}

export interface NutData {
  ups: Ups[];
}

/**
 * A storage system in one shape, whatever runs it: Unraid, Synology or QNAP.
 * One Storage widget and one set of alert rules read them all.
 */
export interface NasVolume {
  name: string;
  used: number;
  total: number;
  /** A volume the system itself reports as degraded or crashed. */
  status?: 'ok' | 'warn' | 'failed';
  detail?: string;
}

export interface NasDisk {
  name: string;
  model?: string;
  role?: 'parity' | 'data' | 'cache';
  status: 'ok' | 'warn' | 'failed';
  /** The system's own word for a problem, when there is one. */
  detail?: string;
  /** Missing while a disk is spun down. */
  tempC?: number;
}

export interface NasSystem {
  platform: 'Unraid' | 'Synology' | 'QNAP';
  name: string;
  webUrl: string;
  /** Set when the system as a whole is not in service, e.g. a stopped array. */
  state?: string;
  volumes: NasVolume[];
  disks: NasDisk[];
}

export interface Limits {
  poolWarnPct: number;
  poolCritPct: number;
  diskWarnC: number;
  diskCritC: number;
}

/** The sources that report a NasSystem. */
export const NAS_SOURCES = ['unraid', 'synology', 'qnap'] as const;

/** One Docker environment in Portainer. */
export interface PortainerEnv {
  id: number;
  name: string;
  up: boolean;
  running: number;
  stopped: number;
  unhealthy: number;
  stacks: number;
  docker?: string;
  snapshotAt?: number;
}

export interface PortainerData {
  envs: PortainerEnv[];
  webUrl: string;
}

/** A firing alert from Netdata or Prometheus. */
export interface MonitorAlert {
  id: string;
  name: string;
  severity: 'critical' | 'warn';
  detail?: string;
  instance?: string;
  since?: number;
}

export interface MonitorData {
  alerts: MonitorAlert[];
  webUrl: string;
}

export interface UnifiDevice {
  id: string;
  name: string;
  model?: string;
  online: boolean;
  site: string;
}

export interface UnifiData {
  clients: number;
  devices: UnifiDevice[];
  sites: number;
  webUrl: string;
}

export interface TailnetDevice {
  id: string;
  name: string;
  os?: string;
  online: boolean;
  lastSeen?: number;
  /** When its node key expires; missing when expiry is off. */
  keyExpires?: number;
  update: boolean;
}

export interface TailnetData {
  devices: TailnetDevice[];
}

/** Who is listening: Audiobookshelf or Navidrome. Progress -1 means unknown. */
/** An audiobook started and not finished. */
export interface BookProgress {
  id: string;
  title: string;
  author?: string;
  /** 0 to 1. */
  progress: number;
  /** Last listened, ms. */
  at: number;
}

/** An album played lately. */
export interface AlbumPlay {
  title: string;
  artist?: string;
  at?: number;
}

export interface ListeningData {
  streams: Stream[];
  /** Audiobookshelf: books in progress, most recent first. */
  inProgress?: BookProgress[];
  /** Navidrome: albums played lately. */
  albums?: AlbumPlay[];
}

export interface Book {
  title: string;
  author?: string;
  /** Through Patchboard's image proxy. */
  cover?: string;
}

export interface BooksData {
  books: Book[];
  source: 'Hardcover' | 'Goodreads';
  webUrl: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: number;
  end?: number;
  allDay: boolean;
  location?: string;
  /** The calendar's own name, when it gives one. */
  calendar?: string;
}

export interface CalendarData {
  events: CalendarEvent[];
  /** Calendar addresses that could not be read this time. */
  failed: number;
}

export interface GiteaData {
  unread: number;
  repos: number;
  webUrl: string;
}

export interface PaperlessData {
  total: number;
  /** Documents still carrying the inbox tag. */
  inbox: number;
  webUrl: string;
}

export interface NextcloudData {
  version?: string;
  files: number;
  users: number;
  activeToday?: number;
  freeBytes?: number;
  appUpdates: number;
  webUrl: string;
}

export interface CarData {
  cars: Car[];
}

export type DownloadClientId = 'qbit' | 'transmission' | 'deluge' | 'sabnzbd' | 'nzbget';

/** Any download client. Usenet clients report no seeding or upload. */
/** One unfinished download a client can pause, resume or remove. */
export interface QueueItem {
  /** The client's own id: a torrent's hash. */
  id: string;
  name: string;
  /** 0 to 1. */
  progress: number;
  speed: number;
  etaSec: number;
  state: 'downloading' | 'stalled' | 'queued' | 'paused' | 'errored';
}

export interface QbitData {
  kind?: 'torrent' | 'usenet';
  /** Unfinished downloads with their ids, errored first, up to 20. Clients that can act on one item report these. */
  items?: QueueItem[];
  /** qBittorrent's alternative speed limits are on. */
  altSpeed?: boolean;
  /** Everything is paused, by Patchboard or by hand. */
  paused?: boolean;
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
  feedId?: number;
  category: string;
  categoryId?: number;
  publishedAt: string;
  readingTime: number;
  /** A picture for the card: an image enclosure or the article's first image. */
  image?: string;
  content?: string;
}

export interface FeedCategory {
  id: number;
  title: string;
  unread: number;
}

export interface FeedsResponse {
  /** Unread in Miniflux for this view (all, or one category), not just what loaded. */
  total: number;
  entries: FeedEntry[];
  categories: FeedCategory[];
  /** Feeds with unread articles, for the feed filter. */
  feeds?: FeedCategory[];
}

/** Narrowing the Feeds page beyond a category. */
export interface FeedFilter {
  feedId?: number;
  /** Only articles published within this many hours. */
  withinHours?: number;
  search?: string;
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
  kind: 'container.stopped' | 'container.started' | 'container.restarted' | 'container.unhealthy' | 'container.recovered' | 'container.action';
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
  /** Added in the UI, or from services.yaml (default). */
  source?: 'yaml' | 'ui';
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
  /** Settings, Alerts thresholds, so meters turn amber and red where alerts do. */
  limits?: Limits;
  /** What each page shows (its Customize button). */
  pages?: import('./pages.ts').Pages;
  /** This Patchboard: its version, and its own container's name when it runs in Docker. */
  self?: { version: string; container: string | null; check?: SelfCheck };
  /** The name in the header and the tab, and whether the otter sits beside it. */
  brand?: Brand;
  /** The boards, Home first, for the tabs over the board. */
  boards?: import('./board.ts').BoardRef[];
  /** The board saved last since this tab opened, so a wall display redraws it. */
  boardSaved?: { id: string; at: number };
  /** Features turned on by configuration alone (no polling): updates, runbook, dozzle, diun. */
  features?: string[];
  /** Wake-on-LAN device names, from WOL_DEVICES. */
  wake?: string[];
}

export type ServerEvent =
  | { type: 'source'; state: SourceState }
  | { type: 'sources'; sources: Snapshot['sources'] }
  | { type: 'alerts'; alerts: Alert[] }
  | { type: 'changes'; changes: ChangeEvent[] }
  | { type: 'updates'; updates: Record<string, ImageUpdate> }
  | { type: 'catalog'; catalog: Catalog }
  | { type: 'pages'; pages: import('./pages.ts').Pages }
  | { type: 'brand'; brand: Brand }
  | { type: 'boards'; boards: import('./board.ts').BoardRef[]; changed?: string };

/** The last time Patchboard asked its registry about its own image, and what it heard. */
export interface SelfCheck {
  at: number;
  state: 'current' | 'newer' | 'unknown';
  /** Why it couldn't tell, in a sentence. */
  reason?: string;
}

export interface Brand {
  /** Empty means Patchboard. */
  name?: string;
  /** true puts the otter beside the name in the header. Off by default: Home's status line has one. */
  otter?: boolean;
}
