// Every built-in integration in one list: what it adds, what turns it on,
// where to find the key. Settings, Connections reads it to show what's on and
// how to turn the rest on; `npm run docs` writes the table in
// docs/INTEGRATIONS.md from it. Change an integration here and both follow.

export interface Integration {
  /** The snapshot source id it reports as, or a feature id (no polling of its own). */
  id: string;
  name: string;
  /** What it adds, in a user's words. */
  adds: string;
  /** Environment variables that turn it on (all needed). */
  env: string[];
  /** Optional variables. */
  optional?: string[];
  /** Where to get the key or value, in the app's own words. */
  where?: string;
  /** Polls and reports as a source (true), or a feature with no status of its own. */
  source: boolean;
}

export const INTEGRATIONS: Integration[] = [
  {
    id: 'docker',
    name: 'Docker',
    adds: 'Required. Containers, stacks, logs, stats, health, actions and updates.',
    env: [],
    optional: ['DOCKER_SOCKET', 'DOCKER_HOST'],
    where: 'Mount /var/run/docker.sock (read-only is fine), or point DOCKER_HOST at a socket proxy.',
    source: true,
  },
  {
    id: 'system',
    name: 'This host',
    adds: 'CPU, memory and uptime with 24 hours of history.',
    env: [],
    optional: ['POOL_PATH'],
    where: 'POOL_PATH shows a disk or pool’s usage when TrueNAS isn’t connected.',
    source: true,
  },
  {
    id: 'checks',
    name: 'Service checks',
    adds: 'Asks every app with a link once a minute; flags one that stops answering though its container runs.',
    env: [],
    optional: ['CHECK_DOMAINS'],
    where: 'Runs for links on private and Tailscale addresses. CHECK_DOMAINS adds your own domains.',
    source: true,
  },
  {
    id: 'truenas',
    name: 'TrueNAS',
    adds: 'Pools, datasets, disks and temperatures, scrubs, snapshots, TrueNAS alerts, cloud sync, a forecast of when the pool fills.',
    env: ['TRUENAS_API_KEY'],
    optional: ['TRUENAS_URL', 'TRUENAS_VERIFY_TLS'],
    where: 'In TrueNAS, create a user with the Read-Only Administrator role and an API key for it. Use wss://: TrueNAS revokes a key sent over ws://.',
    source: true,
  },
  {
    id: 'weather',
    name: 'Weather',
    adds: 'Now, the next 24 hours, the week, sunrise and sunset; US weather alerts. Free, no key.',
    env: ['WEATHER_LAT', 'WEATHER_LON'],
    optional: ['WEATHER_LABEL'],
    where: 'Your latitude and longitude. Open-Meteo provides the forecast and the National Weather Service the alerts.',
    source: true,
  },
  {
    id: 'sonarr',
    name: 'Sonarr',
    adds: 'Episodes on the calendar, the queue, stuck imports and health warnings.',
    env: ['SONARR_URL', 'SONARR_KEY'],
    where: 'Sonarr: Settings, General, API Key.',
    source: true,
  },
  {
    id: 'radarr',
    name: 'Radarr',
    adds: 'Films on the calendar (cinema, digital, physical), the queue, stuck imports and health warnings.',
    env: ['RADARR_URL', 'RADARR_KEY'],
    where: 'Radarr: Settings, General, API Key.',
    source: true,
  },
  {
    id: 'trakt',
    name: 'Trakt',
    adds: 'Your Trakt calendar for shows and films Sonarr and Radarr don’t track, merged without doubles.',
    env: ['TRAKT_CLIENT_ID'],
    where: 'Create an app at app.trakt.tv/settings/apps and copy its Client ID. Then connect from Settings, Connections with the code it shows.',
    source: true,
  },
  {
    id: 'tautulli',
    name: 'Tautulli (Plex)',
    adds: 'Who is watching Plex right now, and recently added posters.',
    env: ['TAUTULLI_URL', 'TAUTULLI_KEY'],
    where: 'Tautulli: Settings, Web Interface, API Key.',
    source: true,
  },
  {
    id: 'jellyfin',
    name: 'Jellyfin',
    adds: 'Who is watching, recently added and Next up, with posters that open the item in Jellyfin.',
    env: ['JELLYFIN_URL', 'JELLYFIN_KEY'],
    optional: ['JELLYFIN_USER'],
    where: 'Jellyfin: Dashboard, API Keys, +. JELLYFIN_USER picks whose Next up to show; blank uses the first admin.',
    source: true,
  },
  {
    id: 'emby',
    name: 'Emby',
    adds: 'Who is watching, recently added and Next up, with posters that open the item in Emby.',
    env: ['EMBY_URL', 'EMBY_KEY'],
    optional: ['EMBY_USER'],
    where: 'Emby: Settings, Advanced, API Keys, New API Key. EMBY_USER works as it does for Jellyfin.',
    source: true,
  },
  {
    id: 'qbit',
    name: 'qBittorrent',
    adds: 'Downloads in progress with time left, seeding and stalled torrents.',
    env: ['QBIT_URL', 'QBIT_USERNAME', 'QBIT_PASSWORD'],
    where: 'Your Web UI login. Patchboard signs in once and backs off on failure, so a wrong password never gets you banned.',
    source: true,
  },
  {
    id: 'miniflux',
    name: 'Miniflux',
    adds: 'A feed reader with keyboard navigation; read state syncs back to Miniflux.',
    env: ['MINIFLUX_URL', 'MINIFLUX_TOKEN'],
    where: 'Miniflux: Settings, API Keys, Create a new API key.',
    source: true,
  },
  {
    id: 'fastmail',
    name: 'Fastmail',
    adds: 'Unread count and the newest messages (read-only).',
    env: ['FASTMAIL_TOKEN'],
    optional: ['FASTMAIL_WEB_URL'],
    where: 'Fastmail: Settings, Privacy & Security, API tokens; give it read-only Mail access.',
    source: true,
  },
  {
    id: 'frigate',
    name: 'Frigate',
    adds: 'Cameras online and offline.',
    env: ['FRIGATE_URL'],
    where: 'Frigate’s address; its API needs no key on the local network.',
    source: true,
  },
  {
    id: 'backups',
    name: 'Backup logs',
    adds: 'Nightly backups as a grid of nights per job, and a one-line overnight summary on Home.',
    env: ['LOGS_PATH'],
    where: 'A read-only mount of the folder your backup scripts log to (see docs/CONFIGURATION.md for the format).',
    source: true,
  },
  {
    id: 'diun',
    name: 'Diun',
    adds: 'Marks containers with a newer image; the mark clears once the container runs it.',
    env: [],
    optional: ['HOOK_TOKEN'],
    where: 'Point Diun’s webhook notifier at http://<patchboard>/api/hooks/diun. With sign-in on, send HOOK_TOKEN.',
    source: false,
  },
  {
    id: 'updates',
    name: 'Updates from the UI',
    adds: 'Pull and recreate one compose service from its page, watch each step, roll back if it fails.',
    env: ['COMPOSE_ROOT'],
    where: 'Mount your compose folders read-only at the same path as on the host.',
    source: false,
  },
  {
    id: 'runbook',
    name: 'Runbook',
    adds: 'The matching section of your RUNBOOK.md on each container page, moved to the top when it’s in trouble.',
    env: ['DOCS_PATH'],
    where: 'A read-only mount of the folder holding RUNBOOK.md.',
    source: false,
  },
  {
    id: 'dozzle',
    name: 'Dozzle',
    adds: 'An “Open in Dozzle” hand-off from logs, for searching across containers.',
    env: ['DOZZLE_URL'],
    where: 'Dozzle’s address.',
    source: false,
  },
];
