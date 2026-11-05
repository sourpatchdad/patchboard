// All configuration comes from the environment. Secrets arrive via `env_file:`
// in compose and are never written to disk by Patchboard. An integration turns
// on only when every variable it needs is present.

const env = process.env;

function str(key: string): string | undefined {
  const v = env[key]?.trim();
  return v ? v : undefined;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function pair(urlKey: string, keyKey: string): { url: string; key: string } | undefined {
  const url = str(urlKey);
  const key = str(keyKey);
  return url && key ? { url: trimSlash(url), key } : undefined;
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

export const config = {
  port: Number(env.PORT ?? 3200),
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
    mode: (['forward', 'password'].includes(str('AUTH') ?? '') ? str('AUTH') : 'none') as 'none' | 'forward' | 'password',
    userHeader: (str('TRUSTED_USER_HEADER') ?? 'Remote-User').toLowerCase(),
    password: str('PATCHBOARD_PASSWORD'),
    hookToken: str('HOOK_TOKEN'),
  },
  dozzleUrl: str('DOZZLE_URL') && trimSlash(str('DOZZLE_URL')!),

  poolPath: str('POOL_PATH'),
  poolWarnPct: Number(env.POOL_WARN_PCT ?? 85),
  diskWarnC: Number(env.DISK_WARN_C ?? 50),

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
  docsPath: str('DOCS_PATH'),
  logsPath: str('LOGS_PATH'),

  // TrueNAS 25.04+ revokes an API key that is ever sent over plain ws://, so
  // only wss:// is accepted. Its certificate is self-signed by default.
  truenas: truenasKey
    ? {
        url: (str('TRUENAS_URL') ?? 'wss://localhost/api/current').replace(/^ws:\/\//, 'wss://'),
        apiKey: truenasKey,
        verifyTls: env.TRUENAS_VERIFY_TLS === '1',
      }
    : undefined,

  weather:
    lat && lon
      ? { lat: Number(lat), lon: Number(lon), label: str('WEATHER_LABEL') ?? 'Weather' }
      : undefined,

  sonarr: pair('SONARR_URL', 'SONARR_KEY'),
  radarr: pair('RADARR_URL', 'RADARR_KEY'),
  tautulli: pair('TAUTULLI_URL', 'TAUTULLI_KEY'),
  miniflux: pair('MINIFLUX_URL', 'MINIFLUX_TOKEN'),
  qbit:
    qbitUrl && qbitUser && qbitPass
      ? { url: trimSlash(qbitUrl), username: qbitUser, password: qbitPass }
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

  /** Days of releases to show in Upcoming. */
  upcomingDays: Number(env.UPCOMING_DAYS ?? 14),
};

export type Config = typeof config;

/** Where Docker API requests go: the unix socket, or a socket proxy over TCP. */
export function dockerTarget(): { socketPath: string } | { host: string; port: number } {
  const h = config.dockerHost;
  if (h && /^tcp:\/\//.test(h)) {
    const u = new URL(h.replace(/^tcp:/, 'http:'));
    return { host: u.hostname, port: Number(u.port || 2375) };
  }
  return { socketPath: config.dockerSocket };
}
