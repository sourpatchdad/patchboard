// Which integrations you can set up from Settings, and what each field is.
// The environment still wins: a variable set there shows as locked.

import type { Integration } from './integrations.ts';

/**
 * Set up from the UI. Left out on purpose: Docker and the folder-based ones
 * (a path needs a matching volume mount in compose anyway), and Diun's
 * webhook token, which guards a door into Patchboard.
 */
export const UI_SETUP = new Set([
  'truenas',
  'weather',
  'sonarr',
  'radarr',
  'trakt',
  'tautulli',
  'jellyfin',
  'emby',
  'qbit',
  'transmission',
  'deluge',
  'sabnzbd',
  'nzbget',
  'miniflux',
  'fastmail',
  'homeassistant',
  'tessie',
  'wake',
  'frigate',
  'uptimekuma',
  'tracearr',
  'syncthing',
  'gatus',
  'healthchecks',
  'beszel',
  'pihole',
  'adguard',
  'speedtest',
  'immich',
  'proxmox',
  'scrutiny',
  'glances',
  'nut',
  'unraid',
  'synology',
  'qnap',
  'portainer',
  'netdata',
  'prometheus',
  'unifi',
  'tailscale',
  'lidarr',
  'readarr',
  'prowlarr',
  'bazarr',
  'paperless',
  'nextcloud',
  'audiobookshelf',
  'navidrome',
  'gitea',
  'calendar',
  'hardcover',
  'goodreads',
  'overseerr',
  'ntfy',
  'gotify',
  'pushover',
  'email',
  'discord',
  'webhook',
  'dozzle',
]);

/** url is one address; urls is several, comma-separated, each checked on its own. */
export type FieldKind = 'url' | 'urls' | 'secret' | 'text' | 'flag' | 'choice';

/** Fields with a fixed set of values, shown as a menu. The first is the default. */
export const CHOICES: Record<string, [value: string, label: string][]> = {
  NOTIFY_LEVEL: [
    ['warn', 'Problems and warnings'],
    ['critical', 'Outages only'],
  ],
};

export function fieldKind(name: string): FieldKind {
  if (CHOICES[name]) return 'choice';
  // Calendar addresses carry private keys (Google's secret address), so they are secrets too.
  if (/(KEY|TOKEN|PASSWORD|SECRET)$/.test(name) || name === 'CALENDAR_URLS' || name === 'DISCORD_WEBHOOK') return 'secret';
  if (/VERIFY_TLS$/.test(name)) return 'flag';
  if (name === 'GLANCES_URL') return 'urls';
  if (/_URL$/.test(name)) return 'url';
  return 'text';
}

const LABELS: [RegExp, string][] = [
  // Specific names before the general rules below, which match them too.
  [/^PUSHOVER_TOKEN$/, 'Application token'],
  [/^PUSHOVER_USER_KEY$/, 'User key'],
  [/^NTFY_URL$/, 'Topic address'],
  [/^DISCORD_WEBHOOK$/, 'Webhook address'],
  [/^PATCHBOARD_URL$/, 'Patchboard address'],
  [/^GLANCES_URL$/, 'Addresses'],
  [/^NUT_HOST$/, 'NUT server'],
  [/^CALENDAR_URLS$/, 'Calendar addresses'],
  [/^GOODREADS_USER$/, 'Goodreads user ID'],
  [/^HARDCOVER_TOKEN$/, 'API token'],
  [/WEB_URL$/, 'Web address'],
  [/_URL$/, 'Address'],
  [/API_KEY$|_KEY$/, 'API key'],
  [/CLIENT_ID$/, 'Client ID'],
  [/_TOKEN$/, 'Token'],
  [/_TOKEN_ID$/, 'API token ID'],
  [/^SMTP_HOST$/, 'Mail server'],
  [/^SMTP_FROM$/, 'From address'],
  [/^SMTP_TO$/, 'Send to'],
  [/_SECRET$/, 'Token secret'],
  [/_USERNAME$/, 'Username'],
  [/_PASSWORD$/, 'Password'],
  [/_USER$/, 'Whose library'],
  [/_VIN$/, 'VIN'],
  [/_LAT$/, 'Latitude'],
  [/_LON$/, 'Longitude'],
  [/_LABEL$/, 'Place name'],
  [/_DEVICES$/, 'Machines'],
  [/_SLUG$/, 'Status page'],
  [/_TAILNET$/, 'Tailnet'],
  [/_LEVEL$/, 'Send'],
  [/_BROADCAST$/, 'Broadcast address'],
  [/VERIFY_TLS$/, 'Check the certificate'],
];

/** Yes/No settings the server treats as Yes when nothing is set; the form shows them that way. */
export const DEFAULT_ON = new Set(['SMTP_VERIFY_TLS']);

export function fieldLabel(name: string): string {
  return LABELS.find(([re]) => re.test(name))?.[1] ?? name.replace(/_/g, ' ').toLowerCase();
}

const HINTS: Record<string, string> = {
  WOL_DEVICES: 'Name=MAC pairs, comma-separated: NAS=aa:bb:cc:dd:ee:ff,Desktop=00:11:22:33:44:55',
  TRUENAS_URL: 'wss://truenas.local/api/current',
  PROXMOX_URL: 'https://pve.local:8006',
  SCRUTINY_URL: 'http://192.168.1.10:8080',
  GLANCES_URL: 'http://192.168.1.10:61208, http://192.168.1.11:61208',
  NUT_HOST: '192.168.1.10, or 192.168.1.10:3493',
  SMTP_HOST: 'smtp.fastmail.com:465, or smtp.gmail.com:587',
  SMTP_TO: 'you@example.com, partner@example.com',
  GOODREADS_USER: '12345678, from goodreads.com/user/show/12345678',
  UNRAID_URL: 'http://tower.local',
  SYNOLOGY_URL: 'https://192.168.1.20:5001',
  QNAP_URL: 'https://192.168.1.30',
  PORTAINER_URL: 'https://192.168.1.10:9443',
  NETDATA_URL: 'http://192.168.1.10:19999',
  PROMETHEUS_URL: 'http://192.168.1.10:9090',
  UNIFI_URL: 'https://192.168.1.1',
  TAILSCALE_TAILNET: 'leave empty for your default tailnet',
  PROXMOX_TOKEN_ID: 'patchboard@pve!dash',
  UPTIME_KUMA_SLUG: 'home, from /status/home',
  GATUS_URL: 'http://192.168.1.10:8080',
  SYNCTHING_URL: 'http://192.168.1.10:8384',
  TRACEARR_URL: 'http://192.168.1.10:3000',
  HEALTHCHECKS_URL: 'https://healthchecks.io, or your own',
  BESZEL_URL: 'http://192.168.1.10:8090',
  NTFY_URL: 'https://ntfy.sh/your-secret-topic',
  DISCORD_WEBHOOK: 'https://discord.com/api/webhooks/…',
  WEBHOOK_URL: 'http://homeassistant.local:8123/api/webhook/patchboard',
  PATCHBOARD_URL: 'https://patchboard.home.example',
  WEATHER_LAT: '40.71',
  WEATHER_LON: '-74.01',
};

export const fieldHint = (name: string): string | undefined => HINTS[name];

export const fieldsOf = (i: Integration): string[] => [...i.env, ...(i.optional ?? [])];

/** What GET /api/setup/integrations returns per field. Secret values never leave the server. */
export interface SetupField {
  name: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  /** Set in the environment: shown, not editable. */
  locked: boolean;
  /** Set in the environment and also saved in Patchboard, so the environment line can be removed. */
  savedToo?: boolean;
  /** Has a value from the environment or the UI. */
  set: boolean;
  /** The value, for anything that isn't a secret. */
  value?: string;
  hint?: string;
}

export interface SetupIntegration {
  id: string;
  /** Saved from the UI (some or all fields). */
  fromUi: boolean;
  fields: SetupField[];
}

/**
 * Alert thresholds and other server-wide numbers, set in Settings, Alerts.
 * Every one has a default that suits most setups; a variable of the same
 * name in the environment wins and shows as locked.
 */
export interface Threshold {
  name: string;
  label: string;
  hint: string;
  kind: 'number' | 'list';
  default: string;
  unit?: string;
  min?: number;
  max?: number;
  group: 'Storage' | 'Drives' | 'Checks' | 'Calendar';
}

export const THRESHOLDS: Threshold[] = [
  { name: 'POOL_WARN_PCT', group: 'Storage', label: 'Warn when storage is', unit: '% full', kind: 'number', default: '85', min: 50, max: 99, hint: 'For every pool, volume or array.' },
  { name: 'POOL_CRIT_PCT', group: 'Storage', label: 'Alarm when storage is', unit: '% full', kind: 'number', default: '95', min: 50, max: 100, hint: 'Shown in red, and sent as an outage if you get notifications.' },
  { name: 'DISK_WARN_C', group: 'Drives', label: 'Warn when a drive reaches', unit: '°C', kind: 'number', default: '50', min: 30, max: 90, hint: 'Hard drives run cooler than SSDs; 45 to 50 suits most hard drives.' },
  { name: 'DISK_CRIT_C', group: 'Drives', label: 'Alarm when a drive reaches', unit: '°C', kind: 'number', default: '58', min: 30, max: 100, hint: 'Above this, drives wear fast. Check the airflow.' },
  { name: 'CHECK_DOMAINS', group: 'Checks', label: 'Also check links on', kind: 'list', default: '', hint: 'Your own domains, comma-separated, e.g. example.com. Links on private and Tailscale addresses are always checked.' },
  { name: 'UPCOMING_DAYS', group: 'Calendar', label: 'Look ahead', unit: 'days', kind: 'number', default: '14', min: 7, max: 60, hint: 'How far Upcoming and This week fetch releases.' },
];

export interface ThresholdState {
  name: string;
  /** The value in effect: saved, from the environment, or the default. */
  value: string;
  /** Set in the environment, so it can't change here. */
  locked: boolean;
  /** Saved in Patchboard (not the default). */
  saved: boolean;
}
