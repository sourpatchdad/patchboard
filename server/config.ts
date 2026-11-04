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
  dataDir: str('DATA_DIR') ?? './data',
  catalogPath: str('CATALOG_PATH') ?? './config/services.yaml',
  staticDir: str('STATIC_DIR') ?? './dist/web',

  dockerSocket: str('DOCKER_SOCKET') ?? '/var/run/docker.sock',
  dozzleUrl: str('DOZZLE_URL') && trimSlash(str('DOZZLE_URL')!),

  poolPath: str('POOL_PATH'),
  poolWarnPct: Number(env.POOL_WARN_PCT ?? 85),
  diskWarnC: Number(env.DISK_WARN_C ?? 50),

  /** Domains whose service links get reachability checks, e.g. "nbnstack.com,ledger.fyi". */
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
  // Client ID plus either a secret (sign in from Settings) or a pasted token.
  trakt:
    traktId && (traktSecret || traktToken)
      ? { clientId: traktId, clientSecret: traktSecret, staticToken: traktToken, redirectUri: str('TRAKT_REDIRECT_URI') ?? 'http://localhost' }
      : undefined,
  frigate: str('FRIGATE_URL') ? { url: trimSlash(str('FRIGATE_URL')!) } : undefined,

  /** Days of releases to show in Upcoming. */
  upcomingDays: Number(env.UPCOMING_DAYS ?? 14),
};

export type Config = typeof config;
