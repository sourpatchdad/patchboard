// DEMO=1 swaps every adapter for these. Same shapes, invented content, no
// network access. This is what the public portfolio build and screenshots run
// on, so it should look like a believable, slightly imperfect homelab.

import type {
  ArrData,
  Catalog,
  Container,
  DockerData,
  FastmailData,
  FeedEntry,
  FrigateData,
  MinifluxData,
  QbitData,
  ReleaseItem,
  BackupsData,
  ChecksData,
  StatsData,
  SystemData,
  TautulliData,
  TraktData,
  TruenasData,
  WeatherData,
} from '../shared/types.ts';
import type { Adapter } from './adapters/adapter.ts';
import { MINUTE, SECOND } from './adapters/adapter.ts';
import { DEPENDS, demoBackups, demoChecks, demoMem, demoStats, demoTruenas, hash, IMAGES, PROJECTS } from './demo-ops.ts';

export { demoInspect, demoRunbook, demoSampleHistory } from './demo-ops.ts';

const H = 3_600_000;
const D = 24 * H;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const dayAt = (days: number, hour: number, min = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
};
const jitter = (base: number, spread: number) => base + (Math.random() - 0.5) * 2 * spread;

export const demoCatalog: Catalog = {
  groups: [
    {
      name: 'Watch & listen',
      services: [
        { name: 'Plex', href: '#', icon: 'plex.png', container: 'plex' },
        { name: 'Audiobookshelf', label: 'Books', href: '#', icon: 'audiobookshelf.png', container: 'audiobookshelf' },
        { name: 'Tautulli', href: '#', icon: 'tautulli.png', container: 'tautulli' },
        { name: 'Navidrome', href: '#', icon: 'navidrome.png', container: 'navidrome' },
      ],
    },
    {
      name: 'Acquire',
      services: [
        { name: 'Sonarr', href: '#', icon: 'sonarr.png', container: 'sonarr' },
        { name: 'Radarr', href: '#', icon: 'radarr.png', container: 'radarr' },
        { name: 'Prowlarr', href: '#', icon: 'prowlarr.png', container: 'prowlarr' },
        { name: 'Bazarr', href: '#', icon: 'bazarr.png', container: 'bazarr' },
        { name: 'qBittorrent', label: 'qBit', href: '#', icon: 'qbittorrent.png', container: 'qbittorrent' },
        { name: 'Unpackerr', icon: 'unpackerr.png', container: 'unpackerr' },
        { name: 'Recyclarr', icon: 'recyclarr.png', container: 'recyclarr', expectStopped: true },
      ],
    },
    {
      name: 'Home',
      services: [
        { name: 'Immich', href: '#', icon: 'immich.png', container: 'immich-server' },
        { name: 'Frigate', href: '#', icon: 'frigate.png', container: 'frigate' },
        { name: 'Home Assistant', label: 'HA', href: '#', icon: 'home-assistant.png', container: 'homeassistant' },
        { name: 'Nextcloud', href: '#', icon: 'nextcloud.png', container: 'nextcloud' },
        { name: 'Paperless', href: '#', icon: 'paperless-ngx.png', container: 'paperless' },
      ],
    },
    {
      name: 'Tools',
      services: [
        { name: 'Miniflux', href: '#', icon: 'miniflux.png', container: 'miniflux' },
        { name: 'Linkding', href: '#', icon: 'linkding.png', container: 'linkding' },
        { name: 'Dozzle', href: '#', icon: 'dozzle.png', container: 'dozzle' },
        { name: 'Diun', icon: 'diun.png', container: 'diun' },
        { name: 'Vaultwarden', label: 'Vault', href: '#', icon: 'vaultwarden.png', container: 'vaultwarden' },
        { name: 'Uptime Kuma', label: 'Kuma', href: '#', icon: 'uptime-kuma.png', container: 'uptime-kuma' },
        { name: 'Patchboard', label: 'Patch', href: '#', icon: 'homepage.png', container: 'patchboard' },
      ],
    },
  ],
  dock: [
    { name: 'Mail', href: '#', icon: 'fastmail.png' },
    { name: 'Calendar', href: '#', icon: 'google-calendar.png' },
    { name: 'GitHub', href: '#', icon: 'github.png' },
    { name: 'Home Assistant', href: '#', icon: 'home-assistant.png' },
    { name: 'Trakt', href: '#', icon: 'trakt.png' },
    { name: 'YouTube', href: '#', icon: 'youtube.png' },
  ],
};

export function demoContainers(): Container[] {
  const names = demoCatalog.groups.flatMap((g) => g.services.map((s) => s.container!)).filter(Boolean);
  names.push('immich-postgres', 'immich-redis', 'cloudflared', 'mosquitto', 'caddy');
  return names
    .map((name): Container => {
      const meta = {
        project: PROJECTS[name],
        service: name.replace(/^immich-/, ''),
        dependsOn: DEPENDS[name],
        created: Date.now() - (name === 'plex' ? 4 * H : 6 * D),
      };
      if (name === 'unpackerr')
        return { id: 'a1b2c3d4e5f6', name, image: `golift/${name}:latest`, state: 'exited', status: 'Exited (1) 2 hours ago', health: null, ...meta };
      if (name === 'recyclarr')
        return { id: 'f6e5d4c3b2a1', name, image: `recyclarr/${name}:7`, state: 'exited', status: 'Exited (0) 9 hours ago', health: null, ...meta };
      const healthy = ['immich-server', 'immich-postgres', 'vaultwarden', 'paperless', 'plex', 'frigate'].includes(name);
      return {
        id: Math.abs(hash(name)).toString(16).padStart(12, '0').slice(0, 12),
        name,
        image: IMAGES[name] ?? `lscr.io/linuxserver/${name}:latest`,
        state: 'running',
        status: `Up ${name === 'plex' ? '4 hours' : '6 days'}${healthy ? ' (healthy)' : ''}`,
        health: healthy ? ('healthy' as const) : null,
        ...meta,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const sonarrUpcoming = (): ReleaseItem[] => [
  ep('The Long Meridian', 2, 6, 'Dead Reckoning', dayAt(0, 21), false),
  ep('Salt & Cinder', 1, 4, 'The Kiln', dayAt(1, 20), false),
  ep('Night Ferry', 3, 1, 'Crossing', dayAt(3, 21, 30), false),
  ep('The Long Meridian', 2, 7, 'Doldrums', dayAt(7, 21), false),
  ep('Field Notes', 5, 9, 'Lichen', dayAt(9, 19), false),
  ep('Salt & Cinder', 1, 5, 'Annealing', dayAt(8, 20), false),
];

function ep(show: string, s: number, e: number, title: string, when: string, hasFile: boolean): ReleaseItem {
  const sxe = `S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}`;
  return {
    id: `sonarr-${show}-${s}-${e}`,
    source: 'sonarr',
    kind: 'episode',
    title: show,
    subtitle: `${sxe} ${title}`,
    when,
    hasFile,
    url: '#',
    key: `ep:${show.toLowerCase().replace(/[^a-z0-9]/g, '')}:${s}:${e}`,
  };
}

const radarrUpcoming = (): ReleaseItem[] => [
  { id: 'r1', source: 'radarr', kind: 'movie', title: 'Quiet Harbor', subtitle: 'Digital release', when: dayAt(2, 0), url: '#', key: 'mv:1:d' },
  { id: 'r2', source: 'radarr', kind: 'movie', title: 'The Glass Orchard', subtitle: 'In cinemas', when: dayAt(4, 0), url: '#', key: 'mv:2:c' },
  { id: 'r3', source: 'radarr', kind: 'movie', title: 'Low Tide Hotel', subtitle: 'Digital release', when: dayAt(11, 0), url: '#', key: 'mv:3:d' },
];

const traktUpcoming = (): ReleaseItem[] => [
  // Duplicate of a Sonarr item; the client dedupes by key.
  { ...sonarrUpcoming()[0], id: 'trakt-dup', source: 'trakt' },
  { id: 't1', source: 'trakt', kind: 'episode', title: 'Copper Valley', subtitle: 'S04E02 Assay', when: dayAt(2, 20), url: '#', key: 'ep:coppervalley:4:2' },
  { id: 't2', source: 'trakt', kind: 'episode', title: 'Wren & Pike', subtitle: 'S01E01 Pilot', when: dayAt(5, 21), url: '#', key: 'ep:wrenpike:1:1' },
];

/** Entries marked read during this demo session. */
export const demoReadIds = new Set<number>();

export const demoFeeds: FeedEntry[] = [
  feed(1, 'Running ZFS special vdevs for metadata: a year of numbers', 'Disk Pressure', 'Homelab', 40 * MINUTE, 7),
  feed(2, 'Why my reverse proxy config finally fits on one screen', 'Small Servers', 'Homelab', 2 * H, 5),
  feed(3, 'A field guide to the birds that ignore your feeder', 'Backyard Ledger', 'Outdoors', 3 * H, 4),
  feed(4, 'SQLite as the default, Postgres as the exception', 'Plain Text Engineering', 'Dev', 5 * H, 9),
  feed(5, 'The quiet return of the 4:3 monitor', 'Desk Setup Weekly', 'Tech', 7 * H, 3),
  feed(6, 'Smoked brisket on a pellet grill without the stall panic', 'Low & Slow', 'Food', 9 * H, 6),
  feed(7, 'Writing release notes people actually read', 'Plain Text Engineering', 'Dev', 13 * H, 4),
  feed(8, 'North Texas fall planting calendar', 'Backyard Ledger', 'Outdoors', 20 * H, 5),
  feed(9, 'Container image updates without surprises', 'Small Servers', 'Homelab', 26 * H, 8),
  feed(10, 'What 400 days of power monitoring taught me about idle draw', 'Disk Pressure', 'Homelab', 30 * H, 11),
  feed(11, 'Keyboard-first interfaces, revisited', 'Interface Notes', 'Tech', 36 * H, 6),
  feed(12, 'A better weekly review in 15 minutes', 'Calm Systems', 'Productivity', 44 * H, 4),
];

function feed(id: number, title: string, feedName: string, category: string, age: number, mins: number): FeedEntry {
  return {
    id,
    title,
    url: '#',
    feed: feedName,
    category,
    publishedAt: ago(age),
    readingTime: mins,
    content: `<p>This is demo content for <em>${title}</em>. In a real install, Patchboard shows the full article that Miniflux fetched, cleaned and sanitized, right here in the reader.</p>
<p>The reader keeps lines short, uses the same type as the rest of the dashboard, and marks the entry read in Miniflux as soon as you open it. Press <kbd>j</kbd> and <kbd>k</kbd> to move between entries, <kbd>o</kbd> to open the original.</p>
<h3>Why it lives here</h3>
<p>Feeds are one of the few things on a home server that change every hour. Putting a proper reader on the start page means the first thing you see each morning is what is actually new.</p>
<blockquote>Everything on this page is invented for the demo.</blockquote>`,
  };
}

const demoMail = (): FastmailData => ({
  unread: 4,
  webUrl: '#',
  messages: [
    { id: 'm1', from: 'Ridgeline Credit Union', subject: 'Your November statement is ready', preview: 'Your statement for the period ending October 31 is now available to view online.', receivedAt: ago(9 * MINUTE), unread: true },
    { id: 'm2', from: 'Jordan Ames', subject: 'Saturday plans', preview: 'Still on for the farmers market? I can grab coffee on the way if you want.', receivedAt: ago(52 * MINUTE), unread: true },
    { id: 'm3', from: 'Northside Vet Clinic', subject: 'Reminder: annual checkup on the 14th', preview: 'This is a reminder that Biscuit is due for an annual exam. Reply to confirm.', receivedAt: ago(3 * H), unread: true },
    { id: 'm4', from: 'Hollis Hardware', subject: 'Order shipped', preview: 'Good news: your order #20418 has shipped and should arrive Thursday.', receivedAt: ago(6 * H), unread: true },
    { id: 'm5', from: 'Denton Library', subject: 'A hold is ready for pickup', preview: 'The item you placed on hold is waiting at the circulation desk until Nov 10.', receivedAt: ago(26 * H), unread: false },
    { id: 'm6', from: 'Alex Rivera', subject: 'Re: photos from the lake', preview: 'These came out great. Can you share the album link again? The old one expired.', receivedAt: ago(30 * H), unread: false },
  ],
});

const demoPlex = (): TautulliData => ({
  streams: [
    { user: 'Sam', title: 'The Long Meridian', subtitle: 'S02E05 Trade Winds', progress: Math.round(jitter(48, 2)), state: 'playing', transcode: false },
    { user: 'Kit', title: 'Quiet Harbor', progress: 81, state: 'paused', transcode: true },
  ],
  recent: [
    { id: 'p1', type: 'episode', title: 'Salt & Cinder', subtitle: 'S01E03 Slag', addedAt: Date.now() - 3 * H },
    { id: 'p2', type: 'movie', title: 'Paper Lanterns', subtitle: '2025', addedAt: Date.now() - 8 * H },
    { id: 'p3', type: 'episode', title: 'Field Notes', subtitle: 'S05E08 Moss', addedAt: Date.now() - 20 * H },
    { id: 'p4', type: 'movie', title: 'The Cartographer', subtitle: '2024', addedAt: Date.now() - 30 * H },
    { id: 'p5', type: 'season', title: 'Night Ferry', subtitle: 'Season 2', addedAt: Date.now() - 2 * D },
    { id: 'p6', type: 'movie', title: 'Winter Range', subtitle: '2025', addedAt: Date.now() - 3 * D },
    { id: 'p7', type: 'movie', title: 'Small Hours', subtitle: '2023', addedAt: Date.now() - 4 * D },
  ],
});

function demoQbit(): QbitData {
  const s1 = jitter(28e6, 6e6);
  const s2 = jitter(9e6, 3e6);
  return {
    down: s1 + s2,
    up: jitter(2.4e6, 0.8e6),
    downloading: 2,
    seeding: 41,
    stalled: 1,
    errored: [],
    active: [
      { name: 'Salt.and.Cinder.S01E04.1080p.WEB.h264', progress: (Date.now() / 1000 / 600) % 1, speed: s1, etaSec: 340 },
      { name: 'Low.Tide.Hotel.2025.2160p.WEB-DL', progress: 0.37, speed: s2, etaSec: 2900 },
    ],
  };
}

function demo<T>(id: Adapter['id'], label: string, intervalMs: number, make: () => T): Adapter<T> {
  return { id, label, intervalMs, fetch: async () => make() };
}

export function demoAdapters(): Adapter[] {
  return [
    demo<DockerData>('docker', 'Docker', 10 * SECOND, () => ({ containers: demoContainers() })),
    demo<SystemData>('system', 'System', 5 * SECOND, () => ({
      cpuPct: jitter(14, 6),
      load: [jitter(1.6, 0.4), 1.4, 1.2],
      cores: 12,
      uptimeSec: 19 * 86400 + 4 * 3600,
      pool: { path: '/mnt/tank', usedPct: 87.2, usedBytes: 34.9e12, totalBytes: 40e12 },
      mem: demoMem(),
    })),
    demo<StatsData>('stats', 'Container stats', 15 * SECOND, () => demoStats(demoContainers())),
    demo<TruenasData>('truenas', 'TrueNAS', MINUTE, demoTruenas),
    demo<ChecksData>('checks', 'Service checks', MINUTE, () => demoChecks(demoCatalog)),
    demo<BackupsData>('backups', 'Backups', 5 * MINUTE, demoBackups),
    demo<WeatherData>('weather', 'Weather', 15 * MINUTE, () => ({
      label: 'Denton',
      tempNow: 62,
      codeNow: 1,
      days: [0, 1, 2, 3].map((i) => ({
        date: dayAt(i, 12).slice(0, 10),
        high: [74, 71, 66, 69][i],
        low: [52, 55, 49, 47][i],
        code: [1, 3, 61, 0][i],
        precipPct: [0, 10, 70, 0][i],
      })),
    })),
    demo<ArrData>('sonarr', 'Sonarr', 5 * MINUTE, () => ({
      upcoming: sonarrUpcoming(),
      queueTotal: 3,
      problems: [],
      health: [],
    })),
    demo<ArrData>('radarr', 'Radarr', 5 * MINUTE, () => ({
      upcoming: radarrUpcoming(),
      queueTotal: 2,
      problems: [{ title: 'Low.Tide.Hotel.2025.2160p.WEB-DL', message: 'No files found are eligible for import' }],
      health: [],
    })),
    demo<TraktData>('trakt', 'Trakt', 30 * MINUTE, () => ({ upcoming: traktUpcoming() })),
    demo<TautulliData>('tautulli', 'Plex', 15 * SECOND, demoPlex),
    demo<QbitData>('qbit', 'qBittorrent', 5 * SECOND, demoQbit),
    demo<MinifluxData>('miniflux', 'Feeds', 5 * MINUTE, () => ({
      unread: demoFeeds.filter((e) => !demoReadIds.has(e.id)).length,
      entries: demoFeeds.filter((e) => !demoReadIds.has(e.id)).slice(0, 10).map(({ content: _c, ...e }) => e),
    })),
    demo<FastmailData>('fastmail', 'Mail', 2 * MINUTE, demoMail),
    demo<FrigateData>('frigate', 'Frigate', 30 * SECOND, () => ({
      cameras: [
        { name: 'driveway', fps: 5, online: true },
        { name: 'backyard', fps: 5, online: true },
        { name: 'porch', fps: 5, online: true },
      ],
    })),
  ];
}

const LOG_LINES = [
  'INFO  Scheduled task "RSS Sync" completed',
  'INFO  Checking for new releases',
  'DEBUG Cache hit for /api/v3/series (12ms)',
  'INFO  GET /health 200 3ms',
  'WARN  Indexer returned no results for query, backing off 60s',
  'INFO  Import complete: 1 file',
  'INFO  Housekeeping: removed 3 orphaned records',
];

/** Fake log stream for the Logs view in demo mode. */
export function demoLogs(
  name: string,
  tail: number,
  onLine: (l: { stream: 'out' | 'err'; text: string }) => void,
  signal: AbortSignal,
): Promise<void> {
  const stamp = (offsetMs = 0) => new Date(Date.now() - offsetMs).toISOString().replace('T', ' ').slice(0, 19);
  const n = Math.min(tail, 60);
  for (let i = n; i > 0; i--) {
    onLine({ stream: 'out', text: `${stamp(i * 41_000)} [${name}] ${LOG_LINES[(i * 3 + i * i) % LOG_LINES.length]}` });
    if (name === 'unpackerr' && i === Math.ceil(n / 3)) {
      onLine({ stream: 'err', text: `${stamp(i * 41_000 - 5_000)} [unpackerr] ERROR open /downloads/complete: permission denied` });
    }
  }
  return new Promise((resolve) => {
    const t = setInterval(() => {
      const line = LOG_LINES[Math.floor(Math.random() * LOG_LINES.length)];
      onLine({ stream: line.startsWith('WARN') ? 'err' : 'out', text: `${stamp()} [${name}] ${line}` });
    }, 2200);
    signal.addEventListener('abort', () => {
      clearInterval(t);
      resolve();
    });
  });
}
