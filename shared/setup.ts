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
  'pihole',
  'adguard',
  'speedtest',
  'immich',
  'overseerr',
  'ntfy',
  'gotify',
  'dozzle',
]);

export type FieldKind = 'url' | 'secret' | 'text' | 'flag' | 'choice';

/** Fields with a fixed set of values, shown as a menu. The first is the default. */
export const CHOICES: Record<string, [value: string, label: string][]> = {
  NOTIFY_LEVEL: [
    ['warn', 'Problems and warnings'],
    ['critical', 'Outages only'],
  ],
};

export function fieldKind(name: string): FieldKind {
  if (CHOICES[name]) return 'choice';
  if (/(KEY|TOKEN|PASSWORD|SECRET)$/.test(name)) return 'secret';
  if (/VERIFY_TLS$/.test(name)) return 'flag';
  if (/_URL$/.test(name)) return 'url';
  return 'text';
}

const LABELS: [RegExp, string][] = [
  [/^NTFY_URL$/, 'Topic address'],
  [/^PATCHBOARD_URL$/, 'Patchboard address'],
  [/WEB_URL$/, 'Web address'],
  [/_URL$/, 'Address'],
  [/API_KEY$|_KEY$/, 'API key'],
  [/CLIENT_ID$/, 'Client ID'],
  [/_TOKEN$/, 'Token'],
  [/_USERNAME$/, 'Username'],
  [/_PASSWORD$/, 'Password'],
  [/_USER$/, 'Whose library'],
  [/_VIN$/, 'VIN'],
  [/_LAT$/, 'Latitude'],
  [/_LON$/, 'Longitude'],
  [/_LABEL$/, 'Place name'],
  [/_DEVICES$/, 'Machines'],
  [/_SLUG$/, 'Status page'],
  [/_LEVEL$/, 'Send'],
  [/_BROADCAST$/, 'Broadcast address'],
  [/VERIFY_TLS$/, 'Check the certificate'],
];

export function fieldLabel(name: string): string {
  return LABELS.find(([re]) => re.test(name))?.[1] ?? name.replace(/_/g, ' ').toLowerCase();
}

const HINTS: Record<string, string> = {
  WOL_DEVICES: 'Name=MAC pairs, comma-separated: NAS=aa:bb:cc:dd:ee:ff,Desktop=00:11:22:33:44:55',
  TRUENAS_URL: 'wss://truenas.local/api/current',
  UPTIME_KUMA_SLUG: 'home, from /status/home',
  NTFY_URL: 'https://ntfy.sh/your-secret-topic',
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
