// Configuration comes from the environment first, then from integration
// settings saved in the UI (Settings, Connections). An environment variable
// always wins, and the UI shows it as locked. An integration turns on only
// when every variable it needs is present.
//
// `config` reads through to the current settings. A connection test runs
// inside withConfig(), which hands that one call a candidate copy, so live
// polling never sees values that haven't been saved.

import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync } from 'node:fs';
import { parseDevices } from './wake.ts';

const env = process.env;

type Lookup = (key: string) => string | undefined;

/** Values saved from the UI, by variable name. Set by setSavedSettings. */
let saved: Record<string, string> = {};

const fromEnv = (key: string): string | undefined => {
  const v = env[key]?.trim();
  return v ? v : undefined;
};

function lookup(overlay: Record<string, string> = {}): Lookup {
  return (key) => fromEnv(key) ?? (overlay[key]?.trim() || undefined) ?? (saved[key]?.trim() || undefined);
}

/** The environment's value, for copying it into Patchboard's own store. Server side only. */
export const envValue = (key: string): string | undefined => fromEnv(key);

/** Sign-in comes from the environment, so Settings shows it and can't change it. */
export const authLocked = (): boolean => fromEnv('AUTH') !== undefined || fromEnv('PATCHBOARD_PASSWORD') !== undefined;

const AUTH_MODES = ['none', 'forward', 'password', 'oidc'] as const;
type AuthMode = (typeof AUTH_MODES)[number];

/**
 * The sign-in mode. AUTH in any case; a password set without AUTH means
 * password sign-in. An AUTH Patchboard doesn't know is refused at startup
 * (see authProblem), never read as "no sign-in".
 */
export function authMode(raw: string | undefined, password: string | undefined, hash: string | undefined): AuthMode {
  const asked = raw?.trim().toLowerCase();
  if (asked && (AUTH_MODES as readonly string[]).includes(asked)) return asked as AuthMode;
  if (asked) return 'password';
  return password || hash ? 'password' : 'none';
}

/** Why the sign-in settings can't be trusted, or null. The server won't start with one. */
export function authProblem(): string | null {
  const asked = fromEnv('AUTH')?.trim().toLowerCase();
  if (asked && !(AUTH_MODES as readonly string[]).includes(asked)) {
    return `AUTH=${fromEnv('AUTH')} isn't a sign-in mode. Use none, forward, password or oidc.`;
  }
  return null;
}

/** True when the environment sets this variable, so the UI can't change it. */
export const envHas = (key: string): boolean => fromEnv(key) !== undefined;

/** A folder mounted at its usual place inside the container, or nothing. */
const mounted = (path: string): string | undefined => (process.platform !== 'win32' && existsSync(path) ? path : undefined);

function build(str: Lookup) {

  function trimSlash(url: string): string {
    return url.replace(/\/+$/, '');
  }

  function pair(urlKey: string, keyKey: string): { url: string; key: string } | undefined {
    const url = str(urlKey);
    const key = str(keyKey);
    return url && key ? { url: trimSlash(url), key } : undefined;
  }

  /** Jellyfin and Emby: whose library and Next up to show. Blank picks the first admin. */
  function withUser(p: { url: string; key: string } | undefined, userKey: string) {
    return p ? { ...p, user: str(userKey) } : undefined;
  }

  const qbitUrl = str('QBIT_URL');
  const qbitUser = str('QBIT_USERNAME');
  const qbitPass = str('QBIT_PASSWORD');

  const lat = str('WEATHER_LAT');
  const lon = str('WEATHER_LON');

  const truenasKey = str('TRUENAS_API_KEY');

  const traktId = str('TRAKT_CLIENT_ID');
  const traktToken = str('TRAKT_ACCESS_TOKEN');
  const traktSecret = str('TRAKT_CLIENT_SECRET');

  return {
    port: Number(env.PORT ?? 3200),
    /** The address to answer on. Blank means every interface, which inside a container is what ports: maps. */
    listenHost: str('LISTEN_HOST'),
    demo: env.DEMO === '1' || env.DEMO === 'true',
    /** Demo as a fresh install: no catalog, so the first-run welcome shows. */
    demoEmpty: env.DEMO_EMPTY === '1',
    dataDir: str('DATA_DIR') ?? './data',
    catalogPath: str('CATALOG_PATH') ?? './config/services.yaml',
    staticDir: str('STATIC_DIR') ?? './dist/web',

    dockerSocket: str('DOCKER_SOCKET') ?? '/var/run/docker.sock',
    /** tcp://host:port of a Docker socket proxy, used instead of the socket when set. */
    dockerHost: str('DOCKER_HOST'),

    /** Refuse every change to the server: actions, updates, board edits. */
    readOnly: env.READ_ONLY === '1' || env.READ_ONLY === 'true',

    auth: {
      mode: authMode(str('AUTH'), str('PATCHBOARD_PASSWORD'), str('PATCHBOARD_PASSWORD_HASH')),
      userHeader: (str('TRUSTED_USER_HEADER') ?? 'Remote-User').toLowerCase(),
      password: str('PATCHBOARD_PASSWORD'),
      /** A password set in Settings, stored as an scrypt hash, never in the clear. */
      passwordHash: str('PATCHBOARD_PASSWORD_HASH'),
      hookToken: str('HOOK_TOKEN'),
      oidc: {
        issuer: str('OIDC_ISSUER') ?? '',
        clientId: str('OIDC_CLIENT_ID') ?? '',
        clientSecret: str('OIDC_CLIENT_SECRET'),
        scopes: str('OIDC_SCOPES') ?? 'openid email profile',
        allowed: (str('OIDC_ALLOWED') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
        /** Without OIDC_ALLOWED, anyone the provider signs in gets in: say so, unless this says it's meant. */
        allowAnyone: str('OIDC_ALLOW_ANYONE') === '1',
        /** Where the provider sends people back. Set it when Patchboard sits behind a proxy. */
        redirectUrl: str('OIDC_REDIRECT_URL'),
        /** The button says "Sign in with <name>". */
        name: str('OIDC_NAME') ?? 'your identity provider',
      },
    },
    dozzleUrl: str('DOZZLE_URL') && trimSlash(str('DOZZLE_URL')!),

    // Each folder turns on when it's mounted at its usual place; a variable
    // points somewhere else.
    poolPath: str('POOL_PATH') ?? mounted('/pool'),
    poolWarnPct: Number(str('POOL_WARN_PCT') ?? 85),
    poolCritPct: Number(str('POOL_CRIT_PCT') ?? 95),
    diskWarnC: Number(str('DISK_WARN_C') ?? 50),
    diskCritC: Number(str('DISK_CRIT_C') ?? 58),

    /**
     * Hostnames the API answers to besides IP addresses and localhost, e.g. the
     * name a reverse proxy serves Patchboard on. Protects against DNS rebinding.
     */
    allowedHosts: (str('ALLOWED_HOSTS') ?? '')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),

    /** Domains whose service links get reachability checks, e.g. "example.com,example.org". */
    checkDomains: (str('CHECK_DOMAINS') ?? '')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),

    /**
     * Compose stacks under this folder can be updated from the UI. It must be
     * mounted read-only at the same path as on the host, so compose files and
     * relative paths resolve the same way inside the container.
     */
    composeRoot: str('COMPOSE_ROOT'),

    /** Read-only mounts of the server's own notes and logs (see docker-compose). */
    docsPath: str('DOCS_PATH') ?? mounted('/docs'),
    logsPath: str('LOGS_PATH') ?? mounted('/logs'),

    // TrueNAS 25.04+ revokes an API key that is ever sent over plain ws://, so
    // only wss:// is accepted. Its certificate is self-signed by default.
    truenas: truenasKey
      ? {
          url: (str('TRUENAS_URL') ?? 'wss://localhost/api/current').replace(/^ws:\/\//, 'wss://'),
          apiKey: truenasKey,
          verifyTls: str('TRUENAS_VERIFY_TLS') === '1',
        }
      : undefined,

    weather:
      lat && lon
        ? { lat: Number(lat), lon: Number(lon), label: str('WEATHER_LABEL') ?? 'Weather' }
        : undefined,

    sonarr: pair('SONARR_URL', 'SONARR_KEY'),
    radarr: pair('RADARR_URL', 'RADARR_KEY'),
    tautulli: pair('TAUTULLI_URL', 'TAUTULLI_KEY'),
    jellyfin: withUser(pair('JELLYFIN_URL', 'JELLYFIN_KEY'), 'JELLYFIN_USER'),
    emby: withUser(pair('EMBY_URL', 'EMBY_KEY'), 'EMBY_USER'),
    miniflux: pair('MINIFLUX_URL', 'MINIFLUX_TOKEN'),
    qbit:
      qbitUrl && qbitUser && qbitPass
        ? { url: trimSlash(qbitUrl), username: qbitUser, password: qbitPass }
        : undefined,
    homeassistant: str('HA_URL') && str('HA_TOKEN') ? { url: trimSlash(str('HA_URL')!), token: str('HA_TOKEN')! } : undefined,
    tessie: str('TESSIE_TOKEN') ? { token: str('TESSIE_TOKEN')!, vin: str('TESSIE_VIN') } : undefined,
    wake: {
      devices: parseDevices(str('WOL_DEVICES')),
      broadcast: str('WOL_BROADCAST') ?? '255.255.255.255',
    },
    transmission: str('TRANSMISSION_URL')
      ? { url: trimSlash(str('TRANSMISSION_URL')!), username: str('TRANSMISSION_USERNAME'), password: str('TRANSMISSION_PASSWORD') }
      : undefined,
    deluge: str('DELUGE_URL') && str('DELUGE_PASSWORD') ? { url: trimSlash(str('DELUGE_URL')!), password: str('DELUGE_PASSWORD')! } : undefined,
    sabnzbd: pair('SABNZBD_URL', 'SABNZBD_KEY'),
    nzbget: str('NZBGET_URL')
      ? { url: trimSlash(str('NZBGET_URL')!), username: str('NZBGET_USERNAME'), password: str('NZBGET_PASSWORD') }
      : undefined,
    fastmail: str('FASTMAIL_TOKEN')
      ? {
          token: str('FASTMAIL_TOKEN')!,
          webUrl: str('FASTMAIL_WEB_URL') ?? 'https://app.fastmail.com/mail/Inbox/',
        }
      : undefined,
    // A Client ID is enough: sign in from Settings with a code. Trakt no longer
    // issues secrets to new apps; one is still sent if you have it.
    trakt: traktId
      ? { clientId: traktId, clientSecret: traktSecret, staticToken: traktToken, redirectUri: str('TRAKT_REDIRECT_URI') ?? 'http://localhost' }
      : undefined,
    frigate: str('FRIGATE_URL') ? { url: trimSlash(str('FRIGATE_URL')!) } : undefined,
    pihole: str('PIHOLE_URL') ? { url: trimSlash(str('PIHOLE_URL')!), password: str('PIHOLE_PASSWORD') } : undefined,
    adguard: str('ADGUARD_URL')
      ? { url: trimSlash(str('ADGUARD_URL')!), username: str('ADGUARD_USERNAME'), password: str('ADGUARD_PASSWORD') }
      : undefined,
    speedtest: pair('SPEEDTEST_URL', 'SPEEDTEST_TOKEN'),
    immich: pair('IMMICH_URL', 'IMMICH_KEY'),
    unraid: pair('UNRAID_URL', 'UNRAID_KEY'),
    portainer: pair('PORTAINER_URL', 'PORTAINER_KEY'),
    lidarr: pair('LIDARR_URL', 'LIDARR_KEY'),
    readarr: pair('READARR_URL', 'READARR_KEY'),
    prowlarr: pair('PROWLARR_URL', 'PROWLARR_KEY'),
    bazarr: pair('BAZARR_URL', 'BAZARR_KEY'),
    paperless: pair('PAPERLESS_URL', 'PAPERLESS_TOKEN'),
    gitea: pair('GITEA_URL', 'GITEA_TOKEN'),
    books: str('HARDCOVER_TOKEN') || str('GOODREADS_USER') ? { hardcoverToken: str('HARDCOVER_TOKEN'), goodreadsUser: str('GOODREADS_USER') } : undefined,
    calendar: str('CALENDAR_URLS')
      ? { urls: str('CALENDAR_URLS')!.split(/[\s,]+/).map((u) => u.trim()).filter((u) => /^(https?|webcal):\/\//i.test(u)).slice(0, 20) }
      : undefined,
    audiobookshelf: pair('AUDIOBOOKSHELF_URL', 'AUDIOBOOKSHELF_TOKEN'),
    navidrome:
      str('NAVIDROME_URL') && str('NAVIDROME_USERNAME') && str('NAVIDROME_PASSWORD')
        ? { url: trimSlash(str('NAVIDROME_URL')!), username: str('NAVIDROME_USERNAME')!, password: str('NAVIDROME_PASSWORD')! }
        : undefined,
    nextcloud:
      str('NEXTCLOUD_URL') && str('NEXTCLOUD_USERNAME') && str('NEXTCLOUD_PASSWORD')
        ? { url: trimSlash(str('NEXTCLOUD_URL')!), username: str('NEXTCLOUD_USERNAME')!, password: str('NEXTCLOUD_PASSWORD')! }
        : undefined,
    netdata: str('NETDATA_URL') ? { url: trimSlash(str('NETDATA_URL')!) } : undefined,
    unifi: str('UNIFI_URL') && str('UNIFI_KEY') ? { url: trimSlash(str('UNIFI_URL')!), key: str('UNIFI_KEY')!, verifyTls: str('UNIFI_VERIFY_TLS') === '1' } : undefined,
    tailscale: str('TAILSCALE_KEY') ? { key: str('TAILSCALE_KEY')!, tailnet: str('TAILSCALE_TAILNET') ?? '-' } : undefined,
    prometheus: str('PROMETHEUS_URL') ? { url: trimSlash(str('PROMETHEUS_URL')!), key: str('PROMETHEUS_TOKEN') } : undefined,
    synology:
      str('SYNOLOGY_URL') && str('SYNOLOGY_USERNAME') && str('SYNOLOGY_PASSWORD')
        ? { url: trimSlash(str('SYNOLOGY_URL')!), username: str('SYNOLOGY_USERNAME')!, password: str('SYNOLOGY_PASSWORD')!, verifyTls: str('SYNOLOGY_VERIFY_TLS') === '1' }
        : undefined,
    qnap:
      str('QNAP_URL') && str('QNAP_USERNAME') && str('QNAP_PASSWORD')
        ? { url: trimSlash(str('QNAP_URL')!), username: str('QNAP_USERNAME')!, password: str('QNAP_PASSWORD')!, verifyTls: str('QNAP_VERIFY_TLS') === '1' }
        : undefined,
    scrutiny: str('SCRUTINY_URL') ? { url: trimSlash(str('SCRUTINY_URL')!) } : undefined,
    nut: str('NUT_HOST')
      ? { host: str('NUT_HOST')!.replace(/^nut:\/\//, '').split(':')[0], port: Number(str('NUT_HOST')!.replace(/^nut:\/\//, '').split(':')[1] ?? 3493) || 3493 }
      : undefined,
    glances: str('GLANCES_URL')
      ? { urls: str('GLANCES_URL')!.split(',').map((u) => trimSlash(u.trim())).filter(Boolean).slice(0, 50) }
      : undefined,
    proxmox:
      str('PROXMOX_URL') && str('PROXMOX_TOKEN_ID') && str('PROXMOX_SECRET')
        ? { url: trimSlash(str('PROXMOX_URL')!), tokenId: str('PROXMOX_TOKEN_ID')!, secret: str('PROXMOX_SECRET')!, verifyTls: str('PROXMOX_VERIFY_TLS') === '1' }
        : undefined,
    overseerr: pair('OVERSEERR_URL', 'OVERSEERR_KEY'),
    notify: {
      ntfy: str('NTFY_URL') ? { url: trimSlash(str('NTFY_URL')!), token: str('NTFY_TOKEN') } : undefined,
      gotify: str('GOTIFY_URL') && str('GOTIFY_TOKEN') ? { url: trimSlash(str('GOTIFY_URL')!), token: str('GOTIFY_TOKEN')! } : undefined,
      pushover: str('PUSHOVER_TOKEN') && str('PUSHOVER_USER_KEY') ? { token: str('PUSHOVER_TOKEN')!, user: str('PUSHOVER_USER_KEY')! } : undefined,
      // Only Discord's own webhook addresses, so a typo can't post alerts somewhere else.
      discord: /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(str('DISCORD_WEBHOOK') ?? '') ? { url: str('DISCORD_WEBHOOK')! } : undefined,
      webhook: /^https?:\/\//.test(str('WEBHOOK_URL') ?? '') ? { url: str('WEBHOOK_URL')!, token: str('WEBHOOK_TOKEN') } : undefined,
      email:
        str('SMTP_HOST') && str('SMTP_FROM') && str('SMTP_TO')
          ? {
              host: str('SMTP_HOST')!.split(':')[0],
              port: Number(str('SMTP_HOST')!.split(':')[1] ?? 587) || 587,
              username: str('SMTP_USERNAME'),
              password: str('SMTP_PASSWORD'),
              from: str('SMTP_FROM')!,
              to: str('SMTP_TO')!.split(',').map((a) => a.trim()).filter(Boolean),
              verifyTls: str('SMTP_VERIFY_TLS') !== '0',
            }
          : undefined,
      level: (str('NOTIFY_LEVEL') === 'critical' ? 'critical' : 'warn') as 'critical' | 'warn',
      /** Where a tap on a notification opens Patchboard. */
      publicUrl: str('PATCHBOARD_URL') ? trimSlash(str('PATCHBOARD_URL')!) : undefined,
    },
    tracearr: pair('TRACEARR_URL', 'TRACEARR_KEY'),
    syncthing: str('SYNCTHING_URL') && str('SYNCTHING_KEY') ? { url: trimSlash(str('SYNCTHING_URL')!), key: str('SYNCTHING_KEY')!, verifyTls: str('SYNCTHING_VERIFY_TLS') === '1' } : undefined,
    gatus: str('GATUS_URL') ? { url: trimSlash(str('GATUS_URL')!) } : undefined,
    healthchecks: str('HEALTHCHECKS_KEY') ? { url: trimSlash(str('HEALTHCHECKS_URL') ?? 'https://healthchecks.io'), key: str('HEALTHCHECKS_KEY')! } : undefined,
    beszel:
      str('BESZEL_URL') && str('BESZEL_USERNAME') && str('BESZEL_PASSWORD')
        ? { url: trimSlash(str('BESZEL_URL')!), username: str('BESZEL_USERNAME')!, password: str('BESZEL_PASSWORD')! }
        : undefined,
    uptimekuma: str('UPTIME_KUMA_URL') ? { url: trimSlash(str('UPTIME_KUMA_URL')!), slug: str('UPTIME_KUMA_SLUG') ?? 'default' } : undefined,

    /** Days of releases to show in Upcoming. */
    upcomingDays: Number(str('UPCOMING_DAYS') ?? 14),
  };
}

export type Config = ReturnType<typeof build>;

let current: Config = build(lookup());
const scoped = new AsyncLocalStorage<Config>();

export const config: Config = new Proxy({} as Config, {
  get: (_t, k) => Reflect.get(scoped.getStore() ?? current, k),
  has: (_t, k) => Reflect.has(scoped.getStore() ?? current, k),
  ownKeys: () => Reflect.ownKeys(scoped.getStore() ?? current),
  getOwnPropertyDescriptor: (_t, k) => Reflect.getOwnPropertyDescriptor(scoped.getStore() ?? current, k),
});

/** Replace the UI-saved values and rebuild the live configuration. */
export function setSavedSettings(values: Record<string, string>): void {
  saved = { ...values };
  current = build(lookup());
}

/** Run fn against the saved settings plus candidate values, without touching the live ones. */
export function withConfig<T>(candidate: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  return scoped.run(build(lookup(candidate)), fn);
}


/** Where Docker API requests go: the unix socket, or a socket proxy over TCP. */
export function dockerTarget(): { socketPath: string } | { host: string; port: number } {
  const h = config.dockerHost;
  if (h && /^tcp:\/\//.test(h)) {
    const u = new URL(h.replace(/^tcp:/, 'http:'));
    return { host: u.hostname, port: Number(u.port || 2375) };
  }
  return { socketPath: config.dockerSocket };
}
