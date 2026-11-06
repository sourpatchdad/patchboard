// DEMO=1 swaps every adapter for these. Same shapes, invented content, no
// network access. This is what the public portfolio build and screenshots run
// on, so it should look like a believable, slightly imperfect homelab.

import { pinnedEntities } from '../shared/ha.ts';
import { savedBoard } from './adapters/homeassistant.ts';
import { poster } from './demo-media.ts';
import { episodeKey } from './adapters/arr.ts';
import type {
  ArrData,
  Catalog,
  Container,
  DockerData,
  FastmailData,
  FeedEntry,
  FrigateData,
  DnsData,
  SeerrData,
  SpeedData,
  FeedFilter,
  ImmichData,
  ProxmoxData,
  KumaMonitor,
  UptimeKumaData,
  MinifluxData,
  QbitData,
  ReleaseItem,
  BackupsData,
  ChecksData,
  StatsData,
  SystemData,
  CarData,
  DownloadClientId,
  FeedsResponse,
  HaEntity,
  HomeAssistantData,
  MediaServerData,
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
        { name: 'Jellyfin', href: '#', icon: 'jellyfin.png', container: 'jellyfin' },
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
        { name: 'SABnzbd', href: '#', icon: 'sabnzbd.png', container: 'sabnzbd' },
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
        { name: 'Patchboard', label: 'Patch', href: '#', icon: '/icon-192.png', container: 'patchboard' },
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
    { name: 'Letterboxd', href: '#', icon: 'letterboxd.png' },
    { name: 'Hardcover', href: '#', icon: 'hardcover.png' },
    { name: 'Cloudflare', href: '#', icon: 'cloudflare.png' },
    { name: 'Tailscale', href: '#', icon: 'tailscale.png' },
    { name: 'Backblaze', href: '#', icon: 'backblaze.png' },
    { name: 'Router', href: '#', icon: 'ubiquiti-unifi.png' },
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
        labels: name === 'caddy' ? { name: 'Caddy', group: 'Tools', icon: 'caddy.png', href: '#' } : undefined,
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
  ep('Severance', 3, 6, dayAt(0, 21), false),
  ep('The Bear', 4, 4, dayAt(1, 20), false),
  ep('Slow Horses', 5, 1, dayAt(3, 21, 30), false),
  ep('Severance', 3, 7, dayAt(7, 21), false),
  ep('The Last of Us', 3, 2, dayAt(9, 21), false),
  ep('Silo', 3, 5, dayAt(8, 20), false),
  // A whole season dropped at once: one row on the calendar.
  ...[1, 2, 3, 4, 5, 6].map((e) => ep('Fallout', 2, e, dayAt(4, 3), false)),
];

function ep(show: string, s: number, e: number, when: string, hasFile: boolean): ReleaseItem {
  const sxe = `S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}`;
  return {
    id: `sonarr-${show}-${s}-${e}`,
    source: 'sonarr',
    kind: 'episode',
    title: show,
    subtitle: sxe,
    when,
    hasFile,
    url: '#',
    art: poster(show),
    key: episodeKey(show, s, e),
    alt: [episodeKey(show, s, e)],
  };
}

const radarrUpcoming = (): ReleaseItem[] => [
  { id: 'r1', source: 'radarr', kind: 'movie', title: 'Sinners', art: poster('Sinners'), subtitle: 'Digital release', when: dayAt(2, 0), url: '#', key: 'mv:1:d', alt: ['mv:1'] },
  { id: 'r2', source: 'radarr', kind: 'movie', title: 'Weapons', art: poster('Weapons'), subtitle: 'In cinemas', when: dayAt(4, 0), url: '#', key: 'mv:2:c' },
  { id: 'r3', source: 'radarr', kind: 'movie', title: 'One Battle After Another', art: poster('One Battle After Another'), subtitle: 'Digital release', when: dayAt(11, 0), url: '#', key: 'mv:3:d' },
];

const traktUpcoming = (): ReleaseItem[] => [
  // Duplicate of a Sonarr item; the client dedupes by key.
  { ...sonarrUpcoming()[0], id: 'trakt-dup', source: 'trakt' },
  // The same show under another name for it (a year in parentheses): matched by title.
  { id: 'trakt-us', source: 'trakt', kind: 'episode', title: 'Slow Horses (2022)', subtitle: 'S05E01', when: dayAt(3, 21, 30), url: '#', key: 'tv:0:5:1', alt: [episodeKey('Slow Horses (2022)', 5, 1)] },
  // A film Radarr has as a digital release, which Trakt calls just "Release".
  { id: 'trakt-mv', source: 'trakt', kind: 'movie', title: 'Sinners', subtitle: 'Release', when: dayAt(2, 12), url: '#', key: 'mv:1:Release', alt: ['mv:1'] },
  { id: 't1', source: 'trakt', kind: 'episode', title: 'Andor', subtitle: 'S03E02', when: dayAt(2, 20), url: '#', key: 'ep:andor:3:2' },
  { id: 't2', source: 'trakt', kind: 'episode', title: 'The Pitt', subtitle: 'S02E01', when: dayAt(5, 21), url: '#', key: 'ep:pitt:2:1' },
];

/** Entries marked read during this demo session. */
export const demoReadIds = new Set<number>();

// Demo article photos from Wikimedia Commons, under the licenses listed:
//   Hard disk head crash.jpg, CC BY-SA 3.0, https://commons.wikimedia.org/wiki/File:Hard_disk_head_crash.jpg
//   Tangled cables mrbill.jpg, CC BY 2.0, https://commons.wikimedia.org/wiki/File:Tangled_cables_mrbill.jpg
//   Carolina Chickadee feeding off of bird feeder.jpg, CC BY 4.0, https://commons.wikimedia.org/wiki/File:Carolina_Chickadee_feeding_off_of_bird_feeder.jpg
//   RaspberryPi.jpg, CC BY-SA 3.0, https://commons.wikimedia.org/wiki/File:RaspberryPi.jpg
//   HP Pavilion v72 17 inch CRT Monitor front view IMG 9419.JPG, CC BY 3.0, https://commons.wikimedia.org/wiki/File:HP_Pavilion_v72_17_inch_CRT_Monitor_front_view_IMG_9419.JPG
//   Smoked Brisket with smoke ring.jpg, CC BY-SA 4.0, https://commons.wikimedia.org/wiki/File:Smoked_Brisket_with_smoke_ring.jpg
//   Numerical Keys on a Vintage Typewriter.jpg, CC BY-SA 4.0, https://commons.wikimedia.org/wiki/File:Numerical_Keys_on_a_Vintage_Typewriter.jpg
//   Raised vegetable beds Harmony Gardens Broadwater Farm Estate Haringey London England 01.jpg, CC BY-SA 4.0, https://commons.wikimedia.org/wiki/File:Raised_vegetable_beds_Harmony_Gardens_Broadwater_Farm_Estate_Haringey_London_England_01.jpg
//   Shipping container - Port of Rotterdam - 2017 - 3.jpg, CC BY-SA 4.0, https://commons.wikimedia.org/wiki/File:Shipping_container_-_Port_of_Rotterdam_-_2017_-_3.jpg
//   India - Kolkata electricity meters - 3832.jpg, CC BY-SA 3.0, https://commons.wikimedia.org/wiki/File:India_-_Kolkata_electricity_meters_-_3832.jpg
//   Mechanical keyboard example.jpg, CC BY-SA 4.0, https://commons.wikimedia.org/wiki/File:Mechanical_keyboard_example.jpg
//   Desk with notebook pens and glasses.jpg, CC BY 2.0, https://commons.wikimedia.org/wiki/File:Desk_with_notebook_pens_and_glasses.jpg
const FEED_IMAGES: Record<number, string> = {
  1: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8f/Hard_disk_head_crash.jpg/960px-Hard_disk_head_crash.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail',
  2: 'https://upload.wikimedia.org/wikipedia/commons/f/f7/Tangled_cables_mrbill.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail_unscaled',
  3: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/06/Carolina_Chickadee_feeding_off_of_bird_feeder.jpg/960px-Carolina_Chickadee_feeding_off_of_bird_feeder.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail',
  4: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3d/RaspberryPi.jpg/960px-RaspberryPi.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail',
  5: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/16/HP_Pavilion_v72_17_inch_CRT_Monitor_front_view_IMG_9419.JPG/960px-HP_Pavilion_v72_17_inch_CRT_Monitor_front_view_IMG_9419.JPG?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail',
  6: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2d/Smoked_Brisket_with_smoke_ring.jpg/960px-Smoked_Brisket_with_smoke_ring.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail',
  7: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/12/Numerical_Keys_on_a_Vintage_Typewriter.jpg/960px-Numerical_Keys_on_a_Vintage_Typewriter.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail',
  8: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7c/Raised_vegetable_beds_Harmony_Gardens_Broadwater_Farm_Estate_Haringey_London_England_01.jpg/960px-Raised_vegetable_beds_Harmony_Gardens_Broadwater_Farm_Estate_Haringey_London_England_01.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail',
  9: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2d/Shipping_container_-_Port_of_Rotterdam_-_2017_-_3.jpg/960px-Shipping_container_-_Port_of_Rotterdam_-_2017_-_3.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail',
  10: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/ce/India_-_Kolkata_electricity_meters_-_3832.jpg/960px-India_-_Kolkata_electricity_meters_-_3832.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail',
  11: 'https://upload.wikimedia.org/wikipedia/commons/d/df/Mechanical_keyboard_example.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail_unscaled',
  12: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7b/Desk_with_notebook_pens_and_glasses.jpg/960px-Desk_with_notebook_pens_and_glasses.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail',
};
const CATEGORY_IDS: Record<string, number> = { Homelab: 1, Outdoors: 2, Dev: 3, Tech: 4, Food: 5, Productivity: 6 };

export function demoFeedsResponse(status: 'unread' | 'all', categoryId?: number, filter: FeedFilter = {}): FeedsResponse {
  const unread = demoFeeds.filter((e) => !demoReadIds.has(e.id));
  const pool = status === 'all' ? demoFeeds : unread;
  const after = filter.withinHours ? Date.now() - filter.withinHours * 3_600_000 : 0;
  const needle = filter.search?.toLowerCase();
  const entries = pool.filter(
    (e) =>
      (!categoryId || e.categoryId === categoryId) &&
      (!filter.feedId || e.feedId === filter.feedId) &&
      Date.parse(e.publishedAt) >= after &&
      (!needle || e.title.toLowerCase().includes(needle)),
  );
  const categories = Object.entries(CATEGORY_IDS).map(([title, id]) => ({ id, title, unread: unread.filter((e) => e.categoryId === id).length }));
  const feeds = [...new Set(unread.map((e) => e.feed))]
    .map((title) => ({ id: feedIdOf(title), title, unread: unread.filter((e) => e.feed === title).length }))
    .sort((a, b) => b.unread - a.unread || a.title.localeCompare(b.title));
  return { total: status === 'unread' ? entries.length : unread.length, entries, categories, feeds };
}

const feedIds = new Map<string, number>();
const feedIdOf = (name: string) => {
  if (!feedIds.has(name)) feedIds.set(name, 100 + feedIds.size);
  return feedIds.get(name)!;
};

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
    feedId: feedIdOf(feedName),
    category,
    categoryId: CATEGORY_IDS[category],
    image: FEED_IMAGES[id],
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
    { id: 'm5', from: 'Riverside Library', subject: 'A hold is ready for pickup', preview: 'The item you placed on hold is waiting at the circulation desk until Nov 10.', receivedAt: ago(26 * H), unread: false },
    { id: 'm6', from: 'Alex Rivera', subject: 'Re: photos from the lake', preview: 'These came out great. Can you share the album link again? The old one expired.', receivedAt: ago(30 * H), unread: false },
  ],
});

const demoPlex = (): TautulliData => ({
  streams: [
    { user: 'Sam', title: 'Severance', subtitle: 'S02E05', progress: Math.round(jitter(48, 2)), state: 'playing', transcode: false },
    { user: 'Kit', title: 'Poor Things', progress: 81, state: 'paused', transcode: true },
  ],
  recent: [
    { id: 'p1', type: 'episode', title: 'The Bear', thumb: poster('The Bear'), subtitle: 'S04E03', addedAt: Date.now() - 3 * H },
    { id: 'p2', type: 'movie', title: 'Dune: Part Two', thumb: poster('Dune: Part Two'), subtitle: '2024', addedAt: Date.now() - 8 * H },
    { id: 'p3', type: 'episode', title: 'Shōgun', thumb: poster('Shōgun'), subtitle: 'S01E08', addedAt: Date.now() - 20 * H },
    { id: 'p4', type: 'movie', title: 'Past Lives', thumb: poster('Past Lives'), subtitle: '2023', addedAt: Date.now() - 30 * H },
    { id: 'p5', type: 'season', title: 'The White Lotus', thumb: poster('The White Lotus'), subtitle: 'Season 3', addedAt: Date.now() - 2 * D },
    { id: 'p6', type: 'movie', title: 'Oppenheimer', thumb: poster('Oppenheimer'), subtitle: '2023', addedAt: Date.now() - 3 * D },
    { id: 'p7', type: 'movie', title: 'The Holdovers', thumb: poster('The Holdovers'), subtitle: '2023', addedAt: Date.now() - 4 * D },
    { id: 'p8', type: 'season', title: 'Andor', thumb: poster('Andor'), subtitle: 'Season 2', addedAt: Date.now() - 5 * D },
    { id: 'p9', type: 'movie', title: 'Spider-Man: Across the Spider-Verse', thumb: poster('Spider-Man: Across the Spider-Verse'), subtitle: '2023', addedAt: Date.now() - 6 * D },
  ],
});

const demoJellyfin = (): MediaServerData => ({
  streams: [{ user: 'Jo', title: 'Slow Horses', subtitle: 'S05E02', progress: Math.round(jitter(22, 2)), state: 'playing', transcode: false, thumb: poster('Slow Horses') }],
  recent: [
    { id: 'j1', type: 'episode', title: 'Silo', thumb: poster('Silo'), subtitle: 'S02E10', addedAt: Date.now() - 5 * H },
    // The same file on Plex too: Home shows it once, labeled Plex + Jellyfin.
    { id: 'j4', type: 'movie', title: 'Dune: Part Two (2024)', thumb: poster('Dune: Part Two'), subtitle: '2024', addedAt: Date.now() - 8 * H - 4 * 60_000 },
    { id: 'j2', type: 'movie', title: 'Weapons', thumb: poster('Weapons'), subtitle: '2025', addedAt: Date.now() - 26 * H },
    { id: 'j3', type: 'series', title: 'Fallout', thumb: poster('Fallout'), subtitle: '8 new', addedAt: Date.now() - 2.5 * D },
  ],
  nextUp: [
    { id: 'n1', type: 'episode', title: 'Andor', thumb: poster('Andor'), subtitle: 'S02E07', addedAt: Date.now() - 6 * D },
    { id: 'n2', type: 'episode', title: 'The Pitt', thumb: poster('The Pitt'), subtitle: 'S01E12', addedAt: Date.now() - 9 * D },
    { id: 'n3', type: 'episode', title: 'Slow Horses', thumb: poster('Slow Horses'), subtitle: 'S05E02', addedAt: Date.now() - 2 * D },
    { id: 'n4', type: 'episode', title: 'Silo', thumb: poster('Silo'), subtitle: 'S02E04', addedAt: Date.now() - 5 * H },
    { id: 'n5', type: 'episode', title: 'Severance', thumb: poster('Severance'), subtitle: 'S02E06', addedAt: Date.now() - 12 * D },
    { id: 'n6', type: 'episode', title: 'The Last of Us', thumb: poster('The Last of Us'), subtitle: 'S02E03', addedAt: Date.now() - 20 * D },
    { id: 'n7', type: 'episode', title: 'Fallout', thumb: poster('Fallout'), subtitle: 'S01E01', addedAt: Date.now() - 2.5 * D },
  ],
  itemPath: '',
});

// ---------- Speed tests and requests ----------

/** A test every hour for a day: a cable line, with one slow evening hour. */
function demoSpeed(): SpeedData {
  const now = Date.now();
  const runs = Array.from({ length: 24 }, (_, i) => {
    const at = now - (23 - i) * 60 * MINUTE - 7 * MINUTE;
    const slow = i === 17;
    const wobble = ((i * 53) % 37) - 18;
    return { at, down: slow ? 212.4 : Math.round((918 + wobble * 3) * 10) / 10, up: Math.round((41 + (wobble % 5)) * 10) / 10, ping: Math.round((11 + (i % 4) * 0.7) * 10) / 10, jitter: 1.2, loss: 0, healthy: true, server: 'Frontier, Dallas', isp: 'Spectrum' };
  });
  return { latest: runs[runs.length - 1], runs };
}

const demoRequests = [
  { id: 41, kind: 'movie' as const, title: 'Poor Things', year: 2023, by: 'Kit', at: Date.now() - 2 * H, is4k: false, art: poster('Poor Things') },
  { id: 40, kind: 'tv' as const, title: 'Andor', year: 2022, by: 'Sam', at: Date.now() - 9 * H, seasons: [1, 2], is4k: false, art: poster('Andor') },
  { id: 38, kind: 'movie' as const, title: 'Sinners', year: 2025, by: 'Jo', at: Date.now() - 30 * H, is4k: true, art: poster('Sinners') },
];
const demoDecided = new Set<number>();

export async function demoSeerrAct(id: number): Promise<void> {
  demoDecided.add(id);
}

function demoSeerr(): SeerrData {
  const requests = demoRequests.filter((r) => !demoDecided.has(r.id));
  return { pending: requests.length, processing: 2, requests };
}

// ---------- Ad blocking ----------

let demoDnsPausedUntil = 0;

export function demoDnsControl(id: string): ((minutes: number | null) => Promise<void>) | undefined {
  if (id !== 'pihole') return undefined;
  return async (minutes) => {
    demoDnsPausedUntil = minutes === null ? 0 : Date.now() + minutes * MINUTE;
  };
}

function demoPihole(): DnsData {
  const paused = demoDnsPausedUntil > Date.now();
  const queries = 48_213 + Math.floor((Date.now() / 60_000) % 400);
  const blocked = Math.round(queries * 0.183);
  return { kind: 'pihole', queries, blocked, pct: Math.round((blocked / queries) * 1000) / 10, protecting: !paused, resumesAt: paused ? demoDnsPausedUntil : undefined, listSize: 912_406 };
}

// ---------- Uptime Kuma ----------

/** Monitors on a status page: one retrying after a blip, the rest steady. */
function demoKuma(): UptimeKumaData {
  const up = Array<KumaMonitor['beats'][number]>(30).fill('up');
  const m = (id: number, name: string, group: string, extra: Partial<KumaMonitor> = {}): KumaMonitor => ({
    id, name, group, status: 'up', ping: 20 + ((id * 37) % 90), uptime24: 100, beats: up, ...extra,
  });
  return {
    link: '#',
    monitors: [
      m(1, 'Router', 'Network', { ping: 2 }),
      m(2, 'Cloudflare tunnel', 'Network', { uptime24: 99.3, beats: [...up.slice(0, 18), 'down', 'down', ...up.slice(0, 10)] }),
      m(3, 'Home Assistant', 'House', { status: 'pending', msg: 'timeout of 48000ms exceeded', since: Date.now() - 3 * MINUTE, uptime24: 99.8, beats: [...up.slice(0, 28), 'pending', 'pending'] }),
      m(4, 'Plex', 'Media'),
      m(5, 'Jellyfin', 'Media'),
      m(6, 'Immich', 'Photos'),
      m(7, 'Nextcloud', 'Files', { uptime24: 99.9 }),
      m(8, 'Vaultwarden', 'Files'),
      m(9, 'Public website', 'Web', { ping: 140 }),
      m(10, 'Mail (IMAP)', 'Web'),
    ],
  };
}

// ---------- Home Assistant and the car ----------

const HA_DEMO: HaEntity[] = [
  { id: 'light.living_room', name: 'Living room', state: 'on', changedAt: Date.now() - 2 * H },
  { id: 'light.kitchen', name: 'Kitchen', state: 'off', changedAt: Date.now() - 40 * 60_000 },
  { id: 'light.porch', name: 'Porch', state: 'on', changedAt: Date.now() - 3 * H },
  { id: 'switch.coffee_maker', name: 'Coffee maker', state: 'off', changedAt: Date.now() - 9 * H },
  { id: 'fan.bedroom', name: 'Bedroom fan', state: 'off', changedAt: Date.now() - 11 * H },
  { id: 'input_boolean.guest_mode', name: 'Guest mode', state: 'off', changedAt: Date.now() - 4 * D },
  { id: 'automation.night_lights', name: 'Night lights', state: 'on', changedAt: Date.now() - 6 * D },
  { id: 'scene.movie_night', name: 'Movie night', state: 'scening', changedAt: Date.now() - D },
  { id: 'script.goodnight', name: 'Goodnight', state: 'off', changedAt: Date.now() - 20 * H },
  { id: 'sensor.living_room_temperature', name: 'Living room', state: '71.2', unit: '°F', deviceClass: 'temperature', changedAt: Date.now() - 5 * 60_000 },
  { id: 'sensor.outdoor_humidity', name: 'Outside humidity', state: '58', unit: '%', deviceClass: 'humidity', changedAt: Date.now() - 9 * 60_000 },
  { id: 'sensor.house_power', name: 'House power', state: '1.84', unit: 'kW', deviceClass: 'power', changedAt: Date.now() - 60_000 },
  { id: 'sensor.washer_status', name: 'Washer', state: 'Rinse', changedAt: Date.now() - 22 * 60_000 },
  { id: 'binary_sensor.front_door', name: 'Front door', state: 'off', deviceClass: 'door', changedAt: Date.now() - 2 * H },
  { id: 'binary_sensor.back_door', name: 'Back door', state: 'on', deviceClass: 'door', changedAt: Date.now() - 6 * 60_000 },
  { id: 'lock.front_door', name: 'Front door lock', state: 'locked', changedAt: Date.now() - 2 * H },
  { id: 'cover.garage_door', name: 'Garage door', state: 'closed', deviceClass: 'garage', changedAt: Date.now() - 5 * H },
  { id: 'person.sam', name: 'Sam', state: 'home', changedAt: Date.now() - 7 * H },
];
const haState = new Map(HA_DEMO.map((e) => [e.id, { ...e }]));

export const demoHaList = (): HaEntity[] => [...haState.values()];

export function demoHaAction(id: string, action: 'toggle' | 'run'): void {
  const e = haState.get(id);
  if (!e) throw new Error('No such entity');
  if (action === 'toggle') e.state = e.state === 'on' ? 'off' : 'on';
  e.changedAt = Date.now();
}

/** The demo pins the board's Home Assistant entities, like the real adapter. */
function demoHa(pinned: () => Set<string>): HomeAssistantData {
  const want = pinned();
  return { total: 412, entities: [...haState.values()].filter((e) => want.has(e.id)) };
}

function demoCar(): CarData {
  return {
    cars: [
      {
        vin: 'DEMO',
        name: 'Model Y',
        battery: Math.min(90, 72 + Math.floor((Date.now() / 600_000) % 18)),
        rangeMi: 231,
        charging: 'Charging',
        minutesToFull: 85,
        chargeKw: 11,
        limit: 90,
        insideC: 19,
        outsideC: 14,
        climateOn: false,
        locked: true,
        sentry: false,
        odometerMi: 23418,
        driving: false,
        asleep: false,
        updatedAt: Date.now() - 4 * 60_000,
      },
    ],
  };
}

/** Demo pause and resume: flips a flag the demo clients read. */
const demoPaused = new Set<DownloadClientId>();
export function demoDownloadControl(id: DownloadClientId): ((action: 'pause' | 'resume') => Promise<void>) | undefined {
  if (id !== 'qbit' && id !== 'sabnzbd') return undefined;
  return async (action) => {
    if (action === 'pause') demoPaused.add(id);
    else demoPaused.delete(id);
  };
}

function demoSab(): QbitData {
  const paused = demoPaused.has('sabnzbd');
  const rate = paused ? 0 : jitter(61e6, 8e6);
  return {
    kind: 'usenet',
    paused,
    down: rate,
    up: 0,
    downloading: 2,
    seeding: 0,
    stalled: 0,
    errored: [],
    active: [
      { name: 'Silo.S02E10.2160p.ATVP.WEB-DL', progress: (Date.now() / 1000 / 300) % 1, speed: rate, etaSec: paused ? -1 : 95 },
      { name: 'Andor.S02E08.1080p.DSNP.WEB-DL', progress: 0, speed: 0, etaSec: -1 },
    ],
  };
}

function demoQbit(): QbitData {
  const paused = demoPaused.has('qbit');
  const s1 = paused ? 0 : jitter(28e6, 6e6);
  const s2 = paused ? 0 : jitter(9e6, 3e6);
  return {
    kind: 'torrent',
    paused,
    down: s1 + s2,
    up: jitter(2.4e6, 0.8e6),
    downloading: paused ? 0 : 2,
    seeding: paused ? 0 : 41,
    stalled: 1,
    errored: [],
    active: [
      { name: 'The.Bear.S04E04.1080p.WEB.h264', progress: (Date.now() / 1000 / 600) % 1, speed: s1, etaSec: 340 },
      { name: 'One.Battle.After.Another.2025.2160p.WEB-DL', progress: 0.37, speed: s2, etaSec: 2900 },
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
    demo<WeatherData>('weather', 'Weather', 15 * MINUTE, () => {
      const h0 = new Date();
      h0.setMinutes(0, 0, 0);
      const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
      return {
        label: 'Riverside',
        tempNow: 17,
        codeNow: 1,
        feelsNow: 16,
        windNow: 14,
        humidityNow: 58,
        isDay: true,
        hours: Array.from({ length: 24 }, (_, i) => {
          const t = new Date(h0.getTime() + i * 3_600_000);
          const hr = t.getHours();
          return {
            time: local(t),
            temp: Math.round(14 + 8 * Math.sin(((hr - 9) / 24) * 2 * Math.PI)),
            code: hr >= 18 && hr <= 21 ? 61 : hr >= 6 && hr <= 18 ? 1 : 0,
            precipPct: hr >= 17 && hr <= 22 ? [20, 45, 60, 55, 35, 15][hr - 17] : 0,
          };
        }),
        days: [0, 1, 2, 3, 4, 5, 6].map((i) => ({
          date: dayAt(i, 12).slice(0, 10),
          high: [23, 22, 19, 21, 25, 24, 18][i],
          low: [11, 13, 9, 8, 12, 14, 7][i],
          code: [1, 3, 61, 0, 2, 95, 3][i],
          precipPct: [0, 10, 70, 0, 5, 80, 20][i],
          sunrise: `${dayAt(i, 12).slice(0, 10)}T07:${String(14 + i).padStart(2, '0')}`,
          sunset: `${dayAt(i, 12).slice(0, 10)}T17:${String(32 - i).padStart(2, '0')}`,
          uvMax: [5, 4, 2, 6, 6, 3, 4][i],
          windMax: [18, 22, 30, 12, 15, 41, 20][i],
        })),
        alerts: [{ event: 'Wind Advisory', headline: 'Wind Advisory until Thursday evening: gusts up to 45 mph', severity: 'Moderate', until: `${dayAt(1, 12).slice(0, 10)}T19:00` }],
      };
    }),
    demo<ArrData>('sonarr', 'Sonarr', 5 * MINUTE, () => ({
      upcoming: sonarrUpcoming(),
      queueTotal: 3,
      problems: [],
      health: [],
    })),
    demo<ArrData>('radarr', 'Radarr', 5 * MINUTE, () => ({
      upcoming: radarrUpcoming(),
      queueTotal: 2,
      problems: [{ title: 'One.Battle.After.Another.2025.2160p.WEB-DL', message: 'No files found are eligible for import' }],
      health: [],
    })),
    demo<TraktData>('trakt', 'Trakt', 30 * MINUTE, () => ({ upcoming: traktUpcoming() })),
    demo<TautulliData>('tautulli', 'Plex', 15 * SECOND, demoPlex),
    demo<MediaServerData>('jellyfin', 'Jellyfin', 15 * SECOND, demoJellyfin),
    demo<QbitData>('qbit', 'qBittorrent', 5 * SECOND, demoQbit),
    demo<QbitData>('sabnzbd', 'SABnzbd', 5 * SECOND, demoSab),
    demo<HomeAssistantData>('homeassistant', 'Home Assistant', 15 * SECOND, () => demoHa(() => pinnedEntities(savedBoard()))),
    demo<CarData>('tessie', 'Tesla', 2 * MINUTE, demoCar),
    demo<UptimeKumaData>('uptimekuma', 'Uptime Kuma', 30 * SECOND, demoKuma),
    demo<DnsData>('pihole', 'Pi-hole', 30 * SECOND, demoPihole),
    demo<SpeedData>('speedtest', 'Speedtest Tracker', 5 * MINUTE, demoSpeed),
    demo<ProxmoxData>('proxmox', 'Proxmox', 30 * SECOND, () => {
      const wave = (base: number, amp: number, period: number) => Math.max(0.005, base + amp * Math.sin(Date.now() / period));
      const G = 1024 ** 3;
      return {
        webUrl: 'https://pve.local:8006',
        nodes: [
          { name: 'pve1', online: true, cpu: wave(0.18, 0.06, 40_000), cores: 16, mem: 41 * G, maxmem: 64 * G, uptime: 34 * 86_400 },
          { name: 'pve2', online: true, cpu: wave(0.07, 0.03, 55_000), cores: 8, mem: 12 * G, maxmem: 32 * G, uptime: 34 * 86_400 },
        ],
        guests: [
          { vmid: 100, name: 'truenas', kind: 'vm', node: 'pve1', running: true, cpu: wave(0.09, 0.03, 30_000), mem: 24 * G, maxmem: 32 * G, uptime: 34 * 86_400 },
          { vmid: 101, name: 'home-assistant', kind: 'vm', node: 'pve1', running: true, cpu: wave(0.04, 0.02, 25_000), mem: 3.1 * G, maxmem: 4 * G, uptime: 12 * 86_400 },
          { vmid: 102, name: 'docker', kind: 'vm', node: 'pve1', running: true, cpu: wave(0.22, 0.08, 35_000), mem: 11 * G, maxmem: 16 * G, uptime: 6 * 86_400 },
          { vmid: 200, name: 'pihole', kind: 'lxc', node: 'pve2', running: true, cpu: wave(0.01, 0.005, 20_000), mem: 0.2 * G, maxmem: 0.5 * G, uptime: 34 * 86_400 },
          { vmid: 201, name: 'unifi', kind: 'lxc', node: 'pve2', running: true, cpu: wave(0.03, 0.01, 22_000), mem: 1.4 * G, maxmem: 2 * G, uptime: 9 * 86_400 },
          { vmid: 202, name: 'windows-11', kind: 'vm', node: 'pve2', running: false, cpu: 0, mem: 0, maxmem: 8 * G, uptime: 0 },
        ],
      };
    }),
    demo<ImmichData>('immich', 'Immich', MINUTE, () => ({
      photos: 48_213,
      videos: 2_311,
      usage: 1_910_000_000_000,
      version: '2.3.1',
      webUrl: 'http://immich.local',
      queues: [
        { name: 'faceDetection', active: 1, waiting: 36, failed: 0, paused: false },
        { name: 'metadataExtraction', active: 0, waiting: 0, failed: 3, paused: false },
        { name: 'thumbnailGeneration', active: 2, waiting: 148, failed: 0, paused: false },
        { name: 'videoConversion', active: 0, waiting: 0, failed: 0, paused: false },
      ],
    })),
    demo<SeerrData>('overseerr', 'Requests', 2 * MINUTE, demoSeerr),
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
