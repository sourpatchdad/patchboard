// Ready-made live numbers for popular self-hosted apps: where the number is,
// how the app wants its key, and which values are worth a tile. Data only, so
// adding an app is one entry. Each endpoint is a documented, read-only API.
//
// auth: 'header' sends the key in a header (value may wrap it, e.g. "Token
// {key}"); 'query' adds it as a URL parameter; 'basic' expects the key to be
// "username:password"; none means the endpoint needs no key.

import type { FieldFormat } from './jsonwidget.ts';

export interface PresetValue {
  label: string;
  path: string;
  format: FieldFormat;
  scale?: number;
}

export interface Preset {
  id: string;
  name: string;
  /** Lowercase words matched against an app's name, container and icon. */
  match: string[];
  path: string;
  auth?: { kind: 'header'; header: string; value: string } | { kind: 'query'; param: string } | { kind: 'basic' } | { kind: 'pihole6' };
  /** Where to find the key, in the app's own words. */
  keyHelp?: string;
  values: PresetValue[];
}

export const PRESETS: Preset[] = [
  {
    id: 'jellyfin',
    name: 'Jellyfin',
    match: ['jellyfin'],
    path: '/Items/Counts',
    auth: { kind: 'header', header: 'X-Emby-Token', value: '{key}' },
    keyHelp: 'Dashboard, API Keys, +',
    values: [
      { label: 'movies', path: 'MovieCount', format: 'number' },
      { label: 'series', path: 'SeriesCount', format: 'number' },
      { label: 'episodes', path: 'EpisodeCount', format: 'number' },
      { label: 'songs', path: 'SongCount', format: 'number' },
    ],
  },
  {
    id: 'immich',
    name: 'Immich',
    match: ['immich'],
    path: '/api/server/statistics',
    auth: { kind: 'header', header: 'x-api-key', value: '{key}' },
    keyHelp: 'An admin account: Account Settings, API Keys, New API Key',
    values: [
      { label: 'photos', path: 'photos', format: 'number' },
      { label: 'videos', path: 'videos', format: 'number' },
      { label: 'stored', path: 'usage', format: 'bytes' },
    ],
  },
  {
    id: 'paperless',
    name: 'Paperless-ngx',
    match: ['paperless'],
    path: '/api/statistics/',
    auth: { kind: 'header', header: 'Authorization', value: 'Token {key}' },
    keyHelp: 'Your profile (top right), Auth token, Create',
    values: [
      { label: 'documents', path: 'documents_total', format: 'number' },
      { label: 'in the inbox', path: 'documents_inbox', format: 'number' },
    ],
  },
  {
    id: 'seerr',
    name: 'Overseerr or Jellyseerr',
    match: ['overseerr', 'jellyseerr', 'seerr'],
    path: '/api/v1/request/count',
    auth: { kind: 'header', header: 'X-Api-Key', value: '{key}' },
    keyHelp: 'Settings, General, API Key',
    values: [
      { label: 'pending', path: 'pending', format: 'number' },
      { label: 'processing', path: 'processing', format: 'number' },
      { label: 'requests', path: 'total', format: 'number' },
    ],
  },
  {
    id: 'tautulli',
    name: 'Tautulli',
    match: ['tautulli'],
    path: '/api/v2?cmd=get_activity',
    auth: { kind: 'query', param: 'apikey' },
    keyHelp: 'Settings, Web Interface, API Key',
    values: [
      { label: 'streams', path: 'response.data.stream_count', format: 'number' },
      { label: 'Mbps out', path: 'response.data.total_bandwidth', format: 'number', scale: 0.001 },
    ],
  },
  {
    id: 'arr3',
    name: 'Sonarr or Radarr',
    match: ['sonarr', 'radarr'],
    path: '/api/v3/queue/status',
    auth: { kind: 'header', header: 'X-Api-Key', value: '{key}' },
    keyHelp: 'Settings, General, API Key',
    values: [
      { label: 'queued', path: 'totalCount', format: 'number' },
      { label: 'with errors', path: 'errors', format: 'text' },
    ],
  },
  {
    id: 'arr1',
    name: 'Lidarr, Readarr or Prowlarr',
    match: ['lidarr', 'readarr', 'prowlarr'],
    path: '/api/v1/health',
    auth: { kind: 'header', header: 'X-Api-Key', value: '{key}' },
    keyHelp: 'Settings, General, API Key',
    values: [{ label: 'health warnings', path: 'length', format: 'number' }],
  },
  {
    id: 'bazarr',
    name: 'Bazarr',
    match: ['bazarr'],
    path: '/api/badges',
    auth: { kind: 'header', header: 'X-API-KEY', value: '{key}' },
    keyHelp: 'Settings, General, Security, API Key',
    values: [
      { label: 'episodes missing subtitles', path: 'episodes', format: 'number' },
      { label: 'movies missing subtitles', path: 'movies', format: 'number' },
    ],
  },
  {
    id: 'audiobookshelf',
    name: 'Audiobookshelf',
    match: ['audiobookshelf', 'abs'],
    path: '/api/me/listening-stats',
    auth: { kind: 'header', header: 'Authorization', value: 'Bearer {key}' },
    keyHelp: 'Settings, Users, your user, API token',
    values: [{ label: 'listened', path: 'totalTime', format: 'duration' }],
  },
  {
    id: 'linkding',
    name: 'Linkding',
    match: ['linkding'],
    path: '/api/bookmarks/?limit=1',
    auth: { kind: 'header', header: 'Authorization', value: 'Token {key}' },
    keyHelp: 'Settings, Integrations, REST API token',
    values: [{ label: 'bookmarks', path: 'count', format: 'number' }],
  },
  {
    id: 'nextcloud',
    name: 'Nextcloud',
    match: ['nextcloud'],
    path: '/ocs/v2.php/apps/serverinfo/api/v1/info?format=json',
    auth: { kind: 'header', header: 'NC-Token', value: '{key}' },
    keyHelp: 'Set one with occ config:app:set serverinfo token --value <token>',
    values: [
      { label: 'files', path: 'ocs.data.nextcloud.storage.num_files', format: 'number' },
      { label: 'active today', path: 'ocs.data.activeUsers.last24hours', format: 'number' },
    ],
  },
  {
    id: 'homeassistant',
    name: 'Home Assistant',
    match: ['home assistant', 'homeassistant', 'home-assistant', 'hass'],
    path: '/api/states',
    auth: { kind: 'header', header: 'Authorization', value: 'Bearer {key}' },
    keyHelp: 'Your profile, Security, Long-lived access tokens, Create token',
    values: [{ label: 'entities', path: 'length', format: 'number' }],
  },
  {
    id: 'adguard',
    name: 'AdGuard Home',
    match: ['adguard'],
    path: '/control/stats',
    auth: { kind: 'basic' },
    keyHelp: 'Your AdGuard login, typed as username:password',
    values: [
      { label: 'blocked', path: 'num_blocked_filtering', format: 'number' },
      { label: 'queries', path: 'num_dns_queries', format: 'number' },
    ],
  },
  {
    id: 'pihole6',
    name: 'Pi-hole 6',
    match: ['pihole', 'pi-hole'],
    path: '/api/stats/summary',
    auth: { kind: 'pihole6' },
    keyHelp: 'Settings, Web interface / API, Configure app password (or your admin password)',
    values: [
      { label: 'blocked today', path: 'queries.blocked', format: 'number' },
      { label: 'blocked', path: 'queries.percent_blocked', format: 'percent' },
      { label: 'queries today', path: 'queries.total', format: 'number' },
      { label: 'active clients', path: 'clients.active', format: 'number' },
    ],
  },
  {
    id: 'pihole5',
    name: 'Pi-hole 5',
    match: ['pihole', 'pi-hole'],
    path: '/admin/api.php?summaryRaw',
    auth: { kind: 'query', param: 'auth' },
    keyHelp: 'Settings, API, Show API token',
    values: [
      { label: 'blocked today', path: 'ads_blocked_today', format: 'number' },
      { label: 'blocked', path: 'ads_percentage_today', format: 'percent' },
      { label: 'queries today', path: 'dns_queries_today', format: 'number' },
    ],
  },
  {
    id: 'glances',
    name: 'Glances',
    match: ['glances'],
    path: '/api/4/quicklook',
    values: [
      { label: 'CPU', path: 'cpu', format: 'percent' },
      { label: 'memory', path: 'mem', format: 'percent' },
    ],
  },
];

const SLUG = /[^A-Z0-9]+/g;

/** The secret name an app's key is stored under: APP_JELLYFIN. */
export function secretName(app: string): string {
  return `APP_${app.toUpperCase().replace(SLUG, '_').replace(/^_|_$/g, '').slice(0, 36) || 'KEY'}`;
}

/** The preset an app most likely wants, by its name, container or icon. */
export function presetFor(app: { name: string; container?: string; icon?: string }): Preset | undefined {
  const hay = [app.name, app.container ?? '', app.icon ?? ''].join(' ').toLowerCase();
  return PRESETS.find((p) => p.match.some((m) => hay.includes(m)));
}

/** URL and headers for a preset, with the key as a server-side secret reference. */
export function presetRequest(p: Preset, base: string, secret: string): { url: string; headers: Record<string, string>; login?: { kind: 'pihole6'; secret: string } } {
  const url = base.replace(/\/+$/, '') + p.path;
  const ref = `\${secret:${secret}}`;
  if (!p.auth) return { url, headers: {} };
  if (p.auth.kind === 'pihole6') return { url, headers: {}, login: { kind: 'pihole6', secret } };
  if (p.auth.kind === 'query') return { url: `${url}${url.includes('?') ? '&' : '?'}${p.auth.param}=${ref}`, headers: {} };
  if (p.auth.kind === 'basic') return { url, headers: { Authorization: `Basic \${secret64:${secret}}` } };
  if (p.auth.kind === 'header') return { url, headers: { [p.auth.header]: p.auth.value.replace('{key}', ref) } };
  return { url, headers: {} };
}
