import { createHash, randomBytes } from 'node:crypto';
import type { SeerrData } from '../shared/types.ts';
import { fieldLabel } from '../shared/setup.ts';
import { latestReleases, readFeeds } from './outside.ts';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { request } from './http.ts';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Adapter } from './adapters/adapter.ts';
import type { ArrData, ContainerDetail, ProxmoxData, QbitData } from '../shared/types.ts';
import { cleanBrand } from '../shared/brand.ts';
import { radarrAdapter, sonarrAdapter, arrControl, type ArrControl } from './adapters/arr.ts';
import { type ContainerAction, containerAction, dockerAdapter, followLogs, inspectContainer, statsAdapter } from './adapters/docker.ts';
import { fastmailAdapter } from './adapters/fastmail.ts';
import { frigateAdapter, frigateImage } from './adapters/frigate.ts';
import { listEntries, markAllRead, markRead, minifluxAdapter } from './adapters/miniflux.ts';
import { qbitClient } from './adapters/qbit.ts';
import { haCall, haEntityList, homeAssistantAdapter, pinnedAnywhere } from './adapters/homeassistant.ts';
import { boardList, exportExtras, getBoard, importExtras, putBoard, removeBoard, saveExtras, saveHome, sealSavedBoards } from './boards.ts';
import { tessieAdapter } from './adapters/tessie.ts';
import { uptimeKumaAdapter } from './adapters/uptimekuma.ts';
import { speedtestAdapter } from './adapters/speedtest.ts';
import { immichAdapter } from './adapters/immich.ts';
import { type GuestAction, proxmoxAdapter, proxmoxControl } from './adapters/proxmox.ts';
import { scrutinyAdapter } from './adapters/scrutiny.ts';
import { gatusAdapter, healthchecksAdapter } from './adapters/monitors.ts';
import { beszelAdapter } from './adapters/beszel.ts';
import { syncthingAdapter } from './adapters/syncthing.ts';
import { tracearrAdapter } from './adapters/tracearr.ts';
import { glancesAdapter } from './adapters/glances.ts';
import { nutAdapter } from './adapters/nut.ts';
import { unraidAdapter } from './adapters/unraid.ts';
import { synologyAdapter } from './adapters/synology.ts';
import { qnapAdapter } from './adapters/qnap.ts';
import { portainerAdapter } from './adapters/portainer.ts';
import { netdataAdapter, prometheusAdapter } from './adapters/monitoring.ts';
import { tailscaleAdapter, unifiAdapter } from './adapters/network.ts';
import { bazarrAdapter, giteaAdapter, nextcloudAdapter, paperlessAdapter, starrAdapter } from './adapters/apps.ts';
import { audiobookshelfAdapter, navidromeAdapter } from './adapters/listening.ts';
import { calendarAdapter } from './adapters/calendar.ts';
import { booksAdapter } from './adapters/books.ts';
import { send } from './notify.ts';
import { pendingIds, seerrClient } from './adapters/seerr.ts';
import { adguardClient, type DnsControl, PAUSE_MINUTES, piholeClient } from './adapters/dns.ts';
import { sendWake } from './wake.ts';
import { adoptEnvironment, candidate, checkThresholds, describeThresholds, saveThresholds, savedThresholds, checkValues, clearIntegration, describeSetup, loadSavedSettings, missing, saveValues, setupIntegration } from './setup.ts';
import { authLocked, envHas, withConfig } from './config.ts';
import { haActionFor } from '../shared/ha.ts';
import { systemAdapter } from './adapters/system.ts';
import { tautulliAdapter, tautulliImage } from './adapters/tautulli.ts';
import { mediaImage, mediaServerAdapter } from './adapters/mediaserver.ts';
import { delugeClient, DOWNLOAD_CLIENTS, type DownloadControl, type ItemAction, nzbgetClient, sabnzbdClient, transmissionClient } from './adapters/downloads.ts';
import type { DownloadClientId } from '../shared/types.ts';
import { traktAdapter } from './adapters/trakt.ts';
import { truenasAdapter } from './adapters/truenas.ts';
import { backupsAdapter } from './adapters/backups.ts';
import { checksAdapter } from './adapters/checks.ts';
import { weatherAdapter } from './adapters/weather.ts';
import { initCatalog } from './catalog.ts';
import { config } from './config.ts';
import { series } from './db.ts';
import { demoProxmoxAct, demoAdapters, demoDownloadControl, demoFeeds, demoFeedsResponse, demoHaAction, demoHaList, demoInspect, demoLogs, demoReadIds, demoRunbook, demoDnsControl, demoSeerrAct, demoItemControl, demoAltSpeed, demoArrControl, demoFeedItems, demoReleases, demoFrigateImage, demoContainerAction } from './demo.ts';
import { Hub, seedDemoHistory, seedDemoSamples } from './hub.ts';
import { runbookFor } from './notes.ts';
import { uptimeDays } from './uptime.ts';
import { boardId, validateBoard } from '../shared/board.ts';
import { type JsonField, validateJsonConfig } from '../shared/jsonwidget.ts';
import { cachedJsonWidget, fetchJsonWidget } from './jsonwidget.ts';
import { deleteSecret, listSecrets, SECRET_NAME, setSecret } from './secrets.ts';
import { PRESETS } from '../shared/presets.ts';
import { type Pages, validatePages } from '../shared/pages.ts';
import { demoAppStat, demoJson } from './demo-ops.ts';
import { kvGet, kvSet } from './db.ts';
import { type DiunNotice, recordDiunNotice } from './updates.ts';
import { listAudit, recordAudit, recordEvent } from './db.ts';
import { currentUser, endAllSessions, hashPassword, login, logout, passwordMatches, readOnlyGuard, requireAuth, securityHeaders, startSession } from './security.ts';
import * as oidc from './oidc.ts';
import { startDeviceFlow, traktDisconnect, traktStatus, whenTraktConnects } from './trakt-auth.ts';
import { checkSelfImage, eligibility, getJob, latestJobFor, selfCheckStatus, startDemoUpdate, startRollback, startUpdate, watchJob } from './updater.ts';
import { checkUrl } from './adapters/checks.ts';
import { getCatalog, getYamlCatalog, setCatalogOrder } from './catalog.ts';
import { catalogYaml } from '../shared/catalog-yaml.ts';
import { poster } from './art.ts';
import { clearUpdate } from './updates.ts';
import { adoptYaml, type AppOrder, validateOrder } from '../shared/order.ts';
import { fromHomepage } from './homepage.ts';
import { redact } from './redact.ts';
import { auditCatalog, draftYaml, visitorHost } from './catalog-audit.ts';

/** Pause and resume for each configured download client. */
const downloadControls = new Map<DownloadClientId, DownloadControl>();

type Made = {
  adapter: Adapter;
  control?: DownloadControl;
  item?: (id: string, action: ItemAction) => Promise<void>;
  altSpeed?: () => Promise<void>;
  arr?: ArrControl;
  dns?: DnsControl;
  seerr?: (id: number, action: 'approve' | 'decline') => Promise<void>;
};
const itemControls = new Map<DownloadClientId, (id: string, action: ItemAction) => Promise<void>>();
const altSpeedControls = new Map<DownloadClientId, () => Promise<void>>();
const arrControls = new Map<'sonarr' | 'radarr', ArrControl>();
const dnsControls = new Map<'pihole' | 'adguard', DnsControl>();
let seerrAct: ((id: number, action: 'approve' | 'decline') => Promise<void>) | null = null;

/**
 * One factory per integration you can turn on. Each reads config when called,
 * so the same factory builds the live adapter and, inside withConfig, a
 * connection test against values that aren't saved yet.
 */
const FACTORIES: Record<string, () => Made | null> = {
  truenas: () => (config.truenas ? { adapter: truenasAdapter() } : null),
  backups: () => (config.logsPath ? { adapter: backupsAdapter() } : null),
  weather: () => (config.weather ? { adapter: weatherAdapter() } : null),
  sonarr: () => (config.sonarr ? { adapter: sonarrAdapter(), arr: arrControl('sonarr') } : null),
  radarr: () => (config.radarr ? { adapter: radarrAdapter(), arr: arrControl('radarr') } : null),
  trakt: () => (config.trakt ? { adapter: traktAdapter() } : null),
  tautulli: () => (config.tautulli ? { adapter: tautulliAdapter() } : null),
  jellyfin: () => (config.jellyfin ? { adapter: mediaServerAdapter('jellyfin') } : null),
  emby: () => (config.emby ? { adapter: mediaServerAdapter('emby') } : null),
  homeassistant: () => (config.homeassistant ? { adapter: homeAssistantAdapter() } : null),
  tessie: () => (config.tessie ? { adapter: tessieAdapter() } : null),
  qbit: () => (config.qbit ? qbitClient() : null),
  transmission: () => (config.transmission ? transmissionClient() : null),
  deluge: () => (config.deluge ? delugeClient() : null),
  sabnzbd: () => (config.sabnzbd ? sabnzbdClient() : null),
  nzbget: () => (config.nzbget ? nzbgetClient() : null),
  miniflux: () => (config.miniflux ? { adapter: minifluxAdapter() } : null),
  fastmail: () => (config.fastmail ? { adapter: fastmailAdapter() } : null),
  frigate: () => (config.frigate ? { adapter: frigateAdapter() } : null),
  uptimekuma: () => (config.uptimekuma ? { adapter: uptimeKumaAdapter() } : null),
  pihole: () => (config.pihole ? piholeClient() : null),
  adguard: () => (config.adguard ? adguardClient() : null),
  speedtest: () => (config.speedtest ? { adapter: speedtestAdapter() } : null),
  immich: () => (config.immich ? { adapter: immichAdapter() } : null),
  proxmox: () => (config.proxmox ? { adapter: proxmoxAdapter() } : null),
  scrutiny: () => (config.scrutiny ? { adapter: scrutinyAdapter() } : null),
  gatus: () => (config.gatus ? { adapter: gatusAdapter() } : null),
  healthchecks: () => (config.healthchecks ? { adapter: healthchecksAdapter() } : null),
  beszel: () => (config.beszel ? { adapter: beszelAdapter() } : null),
  syncthing: () => (config.syncthing ? { adapter: syncthingAdapter() } : null),
  tracearr: () => (config.tracearr ? { adapter: tracearrAdapter() } : null),
  glances: () => (config.glances ? { adapter: glancesAdapter() } : null),
  nut: () => (config.nut ? { adapter: nutAdapter() } : null),
  unraid: () => (config.unraid ? { adapter: unraidAdapter() } : null),
  synology: () => (config.synology ? { adapter: synologyAdapter() } : null),
  qnap: () => (config.qnap ? { adapter: qnapAdapter() } : null),
  portainer: () => (config.portainer ? { adapter: portainerAdapter() } : null),
  netdata: () => (config.netdata ? { adapter: netdataAdapter() } : null),
  prometheus: () => (config.prometheus ? { adapter: prometheusAdapter() } : null),
  unifi: () => (config.unifi ? { adapter: unifiAdapter() } : null),
  tailscale: () => (config.tailscale ? { adapter: tailscaleAdapter() } : null),
  lidarr: () => (config.lidarr ? { adapter: starrAdapter('lidarr', 'Lidarr') } : null),
  readarr: () => (config.readarr ? { adapter: starrAdapter('readarr', 'Readarr') } : null),
  prowlarr: () => (config.prowlarr ? { adapter: starrAdapter('prowlarr', 'Prowlarr') } : null),
  bazarr: () => (config.bazarr ? { adapter: bazarrAdapter() } : null),
  paperless: () => (config.paperless ? { adapter: paperlessAdapter() } : null),
  nextcloud: () => (config.nextcloud ? { adapter: nextcloudAdapter() } : null),
  gitea: () => (config.gitea ? { adapter: giteaAdapter() } : null),
  calendar: () => (config.calendar?.urls.length ? { adapter: calendarAdapter() } : null),
  books: () => (config.books ? { adapter: booksAdapter() } : null),
  audiobookshelf: () => (config.audiobookshelf ? { adapter: audiobookshelfAdapter() } : null),
  navidrome: () => (config.navidrome ? { adapter: navidromeAdapter() } : null),
  overseerr: () => {
    if (!config.overseerr) return null;
    const c = seerrClient();
    return { adapter: c.adapter, seerr: c.act };
  },
};

function realAdapters(): Adapter[] {
  const list: Adapter[] = [dockerAdapter(), statsAdapter(), systemAdapter(), checksAdapter()];
  downloadControls.clear();
  itemControls.clear();
  altSpeedControls.clear();
  arrControls.clear();
  dnsControls.clear();
  seerrAct = null;
  for (const [id, make] of Object.entries(FACTORIES)) {
    const m = make();
    if (!m) continue;
    list.push(m.adapter);
    if (m.control) downloadControls.set(id as DownloadClientId, m.control);
    if (m.item) itemControls.set(id as DownloadClientId, m.item);
    if (m.altSpeed) altSpeedControls.set(id as DownloadClientId, m.altSpeed);
    if (m.arr) arrControls.set(id as 'sonarr' | 'radarr', m.arr);
    if (m.dns) dnsControls.set(id as 'pihole' | 'adguard', m.dns);
    if (m.seerr) seerrAct = m.seerr;
  }
  return list;
}

loadSavedSettings();
if (config.demo) {
  seedDemoHistory();
  seedDemoSamples();
}
const adapters = config.demo ? demoAdapters() : realAdapters();
const hub = new Hub(adapters);
{
  const saved = kvGet<AppOrder>('app-order');
  const v = saved ? validateOrder(saved) : null;
  setCatalogOrder(v && 'order' in v ? v.order : null);
}
initCatalog(() => hub.refreshAlerts());
hub.start();
whenTraktConnects(() => void hub.pollNow('trakt'));
// Keys typed into API widgets before they moved to the key store.
sealSavedBoards();
console.log(`patchboard: ${config.demo ? 'DEMO mode, ' : ''}${adapters.map((a) => a.id).join(', ')}`);

const app = new Hono();
const indexPathForCsp = join(config.staticDir, 'index.html');
app.use('*', securityHeaders(existsSync(indexPathForCsp) ? readFileSync(indexPathForCsp, 'utf8') : null));

// DNS rebinding: a hostile page can point its own hostname at this server's
// address and then call the API from a visitor's browser as same-origin. The
// attacker's hostname still arrives in the Host header, so the API only
// answers requests addressed to an IP literal, localhost, or a hostname listed
// in ALLOWED_HOSTS. Changes must also carry a matching Origin when one is sent.
// (Homepage's CVE-2024-42364 was this attack.)
// Names nobody can register on the public internet, so a hostile page can't
// point one at Patchboard: nas, nas.local, server.lan, box.home.arpa.
const HOME_NAME = /^(localhost|[a-z0-9-]+|[a-z0-9.-]+\.(local|lan|home|home\.arpa|internal|localdomain|localhost))$/;
function hostAllowed(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  return isIP(host) !== 0 || HOME_NAME.test(host) || config.allowedHosts.includes(host);
}
app.use('/api/*', async (c, next) => {
  const host = c.req.header('host');
  if (!hostAllowed(host)) {
    return c.json({ error: `Requests to ${host ?? 'an unknown host'} are refused. Open Patchboard by its IP address and add it in Settings, Sign-in.` }, 403);
  }
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const origin = c.req.header('origin');
    if (origin) {
      let originHost = '';
      try {
        originHost = new URL(origin).host.toLowerCase();
      } catch {
        // fall through to the refusal
      }
      if (originHost !== (host ?? '').toLowerCase()) return c.json({ error: 'Cross-origin request refused' }, 403);
    }
  }
  await next();
});

app.use('/api/*', requireAuth());
app.use('/api/*', readOnlyGuard());
const who = (c: Parameters<typeof currentUser>[0]) => currentUser(c) ?? '?';

// Who's here, how sign-in works, and whether changes are allowed.
app.get('/api/session', (c) => c.json({ auth: config.auth.mode, user: currentUser(c), readOnly: config.readOnly, provider: config.auth.mode === 'oidc' ? config.auth.oidc.name : undefined }));

// OIDC: send the browser to the provider, then take it back.
const oidcRedirect = (c: Parameters<typeof currentUser>[0]) => {
  if (config.auth.oidc.redirectUrl) return config.auth.oidc.redirectUrl;
  const u = new URL(c.req.url);
  const proto = c.req.header('x-forwarded-proto') ?? u.protocol.replace(':', '');
  return `${proto}://${c.req.header('host') ?? u.host}/api/oidc/callback`;
};

app.get('/api/oidc/login', async (c) => {
  if (config.auth.mode !== 'oidc') return c.json({ error: 'OIDC sign-in is not enabled' }, 400);
  try {
    return c.redirect(await oidc.start(config.auth.oidc, oidcRedirect(c)));
  } catch (e) {
    return c.redirect(`/?signin_error=${encodeURIComponent((e as Error).message)}`);
  }
});

app.get('/api/oidc/callback', async (c) => {
  if (config.auth.mode !== 'oidc') return c.json({ error: 'OIDC sign-in is not enabled' }, 400);
  const err = c.req.query('error_description') ?? c.req.query('error');
  if (err) return c.redirect(`/?signin_error=${encodeURIComponent(err.slice(0, 200))}`);
  try {
    const { user } = await oidc.finish(config.auth.oidc, c.req.query('code') ?? '', c.req.query('state') ?? '');
    startSession(c, user);
    return c.redirect('/');
  } catch (e) {
    recordAudit('?', 'auth.failed', 'oidc', (e as Error).message.slice(0, 200));
    return c.redirect(`/?signin_error=${encodeURIComponent((e as Error).message)}`);
  }
});

app.post('/api/login', async (c) => {
  if (config.auth.mode !== 'password') return c.json({ error: 'Password sign-in is not enabled' }, 400);
  const body = await c.req.json<{ password?: string }>().catch(() => ({ password: undefined }));
  const r = login(c, typeof body.password === 'string' ? body.password.slice(0, 500) : '');
  return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
});

// Sign-in from Settings: off, or one password. A reverse proxy or OIDC stays
// in the environment, where a mistake can't lock anyone out of the fix.
app.get('/api/auth/settings', (c) =>
  c.json({
    mode: config.auth.mode,
    locked: authLocked(),
    hookToken: config.auth.mode === 'none' ? undefined : (config.auth.hookToken ?? null),
    hosts: config.allowedHosts,
    hostsLocked: envHas('ALLOWED_HOSTS'),
  }),
);

// Other names Patchboard answers to, like the domain a reverse proxy serves.
app.put('/api/auth/hosts', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  if (envHas('ALLOWED_HOSTS')) return c.json({ error: 'Set in the environment (ALLOWED_HOSTS). Change it there.' }, 409);
  if (config.demo) return c.json({ error: "Demo mode doesn't change this." }, 400);
  const body = (await c.req.json().catch(() => null)) as { hosts?: unknown } | null;
  const hosts = (typeof body?.hosts === 'string' ? body.hosts : '').split(/[\s,]+/).map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[:/].*$/, '')).filter(Boolean);
  const bad = hosts.find((h) => !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h) || h.length > 253);
  if (bad) return c.json({ error: `${bad} isn't a host name.` }, 400);
  if (hosts.length > 20) return c.json({ error: 'Twenty names at most.' }, 400);
  saveValues({ ALLOWED_HOSTS: hosts.length ? [...new Set(hosts)].join(',') : null });
  recordAudit(who(c), 'auth.hosts', 'sign-in', hosts.join(', ') || 'none');
  return c.json({ hosts: config.allowedHosts });
});

app.put('/api/auth/settings', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  if (authLocked()) return c.json({ error: 'Sign-in is set in the environment. Change it there.' }, 409);
  if (config.demo) return c.json({ error: "Demo mode doesn't change sign-in." }, 400);
  const body = (await c.req.json().catch(() => null)) as { mode?: unknown; password?: unknown; current?: unknown } | null;
  const password = typeof body?.password === 'string' ? body.password : '';
  const current = typeof body?.current === 'string' ? body.current.slice(0, 500) : '';
  const was = config.auth.mode;
  if (was === 'password' && !passwordMatches(current)) return c.json({ error: 'The current password is wrong.' }, 403);
  if (body?.mode === 'none') {
    saveValues({ AUTH: null, PATCHBOARD_PASSWORD_HASH: null });
    endAllSessions();
    recordAudit(who(c), 'auth.off', 'sign-in');
    return c.json({ mode: 'none' });
  }
  if (body?.mode !== 'password') return c.json({ error: 'Choose no sign-in or a password.' }, 400);
  if (password.length < 8 || password.length > 200) return c.json({ error: 'Use at least 8 characters.' }, 400);
  saveValues({ AUTH: 'password', PATCHBOARD_PASSWORD_HASH: hashPassword(password), HOOK_TOKEN: config.auth.hookToken ?? randomBytes(24).toString('base64url') });
  // A new password signs everyone else out; whoever set it stays in.
  endAllSessions();
  startSession(c, 'admin');
  recordAudit(who(c), was === 'password' ? 'auth.password-changed' : 'auth.on', 'sign-in');
  return c.json({ mode: 'password' });
});

app.post('/api/logout', (c) => {
  logout(c);
  return c.json({ ok: true });
});

app.get('/api/audit', (c) => c.json(listAudit(200)));

// Feeds and Releases widgets: the server reads the addresses saved in the
// board; the browser names only the board and the widget.
app.get('/api/rss/:board/:id', async (c) => {
  const found = getBoard(c.req.param('board'));
  const w = found?.custom ? found.board.widgets.find((x) => x.id === c.req.param('id') && x.type === 'rss') : undefined;
  const feeds = w?.config?.feeds?.split('\n').filter(Boolean) ?? [];
  if (!feeds.length) return c.json({ items: [], failed: [] });
  if (config.demo) return c.json(demoFeedItems());
  return c.json(await readFeeds(feeds));
});

app.get('/api/releases/:board/:id', async (c) => {
  const found = getBoard(c.req.param('board'));
  const w = found?.custom ? found.board.widgets.find((x) => x.id === c.req.param('id') && x.type === 'releases') : undefined;
  const repos = w?.config?.repos?.split('\n').filter(Boolean) ?? [];
  if (!repos.length) return c.json({ releases: [] });
  if (config.demo) return c.json({ releases: demoReleases(repos) });
  return c.json({ releases: await latestReleases(repos) });
});

// API numbers widgets. The server only ever fetches URLs saved in a board:
// the browser asks for a widget by board and id, never for a URL.
app.get('/api/widgets/:board/:id', async (c) => {
  const board = c.req.param('board');
  const found = getBoard(board);
  const w = found?.custom ? found.board.widgets.find((x) => x.id === c.req.param('id') && x.type === 'json') : undefined;
  if (!w?.config?.json) return c.json({ error: 'No such widget' }, 404);
  const v = validateJsonConfig(JSON.parse(w.config.json));
  if ('error' in v) return c.json({ error: v.error }, 400);
  return c.json(config.demo ? demoJson(v.config) : await cachedJsonWidget(`${board}/${w.id}`, v.config));
});

// Try a configuration before saving it. A change-level request: it needs the
// action header and is refused in read-only mode, like saving the board.
app.post('/api/widgets/preview', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const v = validateJsonConfig(await c.req.json().catch(() => null));
  if ('error' in v) return c.json({ error: v.error }, 400);
  // Demo: app live numbers (presets) get made-up values; widgets map the demo document.
  if (config.demo) return c.json(v.config.title === 'custom' || PRESETS.some((p) => p.id === v.config.title) ? demoAppStat('preview', v.config) : demoJson(v.config, true));
  return c.json(await fetchJsonWidget(v.config, true));
});

app.get('/api/snapshot', (c) => c.json(hub.snapshot()));

app.get('/api/events', (c) =>
  streamSSE(c, async (stream) => {
    const unsubscribe = hub.subscribe((e) => {
      void stream.writeSSE({ data: JSON.stringify(e) });
    });
    // Comment pings keep proxies from closing an idle connection.
    const ping = setInterval(() => void stream.write(': ping\n\n'), 25_000);
    await new Promise<void>((resolve) => stream.onAbort(resolve));
    clearInterval(ping);
    unsubscribe();
  }),
);

// Feeds: the reader needs full content, which the snapshot leaves out.
app.get('/api/feeds', async (c) => {
  const status = c.req.query('status') === 'all' ? 'all' : 'unread';
  const categoryId = Number(c.req.query('cat')) || undefined;
  const filter = {
    feedId: Number(c.req.query('feed')) || undefined,
    withinHours: ({ day: 24, week: 168 } as Record<string, number>)[c.req.query('since') ?? ''],
    search: (c.req.query('q') ?? '').trim().slice(0, 100) || undefined,
  };
  if (config.demo) return c.json(demoFeedsResponse(status, categoryId, filter));
  if (!config.miniflux) return c.json({ error: 'Miniflux is not configured' }, 404);
  try {
    return c.json(await listEntries({ status, limit: 150, categoryId, ...filter }));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

// Mark a whole category read, or everything. The header guards it like any action.
app.post('/api/feeds/read-all', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const { category } = await c.req.json<{ category?: unknown }>().catch(() => ({ category: undefined }));
  const categoryId = Number.isInteger(category) && (category as number) > 0 ? (category as number) : undefined;
  try {
    if (config.demo) demoFeeds.filter((e) => !categoryId || e.categoryId === categoryId).forEach((e) => demoReadIds.add(e.id));
    else if (config.miniflux) await markAllRead(categoryId);
    else return c.json({ error: 'Miniflux is not configured' }, 404);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
  recordAudit(who(c), 'feeds.read-all', categoryId ? `category ${categoryId}` : 'all');
  void hub.pollNow('miniflux');
  return c.json({ ok: true });
});

app.post('/api/feeds/read', async (c) => {
  const body = await c.req.json<{ ids: unknown; unread?: unknown }>();
  const ids = Array.isArray(body.ids) ? body.ids.filter((n): n is number => Number.isInteger(n)) : [];
  if (!ids.length) return c.json({ ok: true });
  // { unread: true } puts them back: Keep unread in the reader.
  const unread = body.unread === true;
  if (config.demo) ids.forEach((id) => (unread ? demoReadIds.delete(id) : demoReadIds.add(id)));
  else if (config.miniflux) await markRead(ids, unread ? 'unread' : 'read');
  // Refresh the unread count on Home and in the nav without waiting 5 minutes.
  void hub.pollNow('miniflux');
  return c.json({ ok: true });
});

app.get('/api/logs/:name', (c) => {
  const name = c.req.param('name');
  if (!NAME.test(name)) return c.json({ error: 'Bad container name' }, 400);
  const tail = Math.min(Number(c.req.query('tail') ?? 300) || 300, 2000);
  return streamSSE(c, async (stream) => {
    const ac = new AbortController();
    stream.onAbort(() => ac.abort());
    const follow = config.demo ? demoLogs : followLogs;
    try {
      // Keys an app writes into its own logs are masked before they leave the server.
      // A stopped container's logs arrive all at once and the stream ends: wait for every
      // line to go out before closing, or the last ones are lost.
      const writes: Promise<void>[] = [];
      await follow(name, tail, (line) => void writes.push(stream.writeSSE({ data: JSON.stringify({ ...line, text: redact(line.text) }) })), ac.signal);
      await Promise.all(writes);
    } catch (err) {
      await stream.writeSSE({ event: 'failure', data: JSON.stringify({ message: (err as Error).message }) });
    }
  });
});

const NAME = /^[\w.-]+$/;

// One container's detail: inspect (without env), plus who depends on it.
app.get('/api/containers/:name', async (c) => {
  const name = c.req.param('name');
  if (!NAME.test(name)) return c.json({ error: 'Bad container name' }, 400);
  if (config.demo) {
    const d = demoInspect(name, hub.containers());
    if (d) d.update = { ok: true };
    return d ? c.json(d) : c.json({ error: 'No such container' }, 404);
  }
  try {
    const ctr = hub.containers().find((x) => x.name === name);
    const detail = await inspectContainer(name, hub.containers());
    detail.update = ctr ? await eligibility(ctr) : { ok: false, reason: 'Not in the container list.' };
    return c.json(detail);
  } catch (err) {
    const msg = (err as Error).message;
    return c.json({ error: msg.includes('404') ? 'No such container' : msg }, msg.includes('404') ? 404 : 502);
  }
});

// Start, stop or restart. The custom header can't be sent by a cross-site form
// or a plain link, so another page can't trigger this through the browser.
app.post('/api/containers/:name/action', async (c) => {
  const name = c.req.param('name');
  if (!NAME.test(name)) return c.json({ error: 'Bad container name' }, 400);
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const { action } = await c.req.json<{ action?: string }>().catch(() => ({ action: undefined }));
  if (action !== 'start' && action !== 'stop' && action !== 'restart') return c.json({ error: 'Unknown action' }, 400);
  if (!hub.containers().some((x) => x.name === name)) return c.json({ error: 'No such container' }, 404);
  recordEvent('container.action', name, action);
  recordAudit(who(c), `container.${action}`, name);
  if (config.demo) demoContainerAction(name, action);
  else {
    try {
      await containerAction(name, action as ContainerAction);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502);
    }
  }
  void hub.pollNow('docker');
  hub.refreshChanges();
  return c.json({ ok: true });
});

// qBittorrent's alternative speed limits, on or off. Registered before the
// pause-everything route below, whose :action would otherwise catch it.
app.post('/api/downloads/:id/altspeed', async (c) => {
  const id = c.req.param('id') as DownloadClientId;
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const control = config.demo ? demoAltSpeed(id) : altSpeedControls.get(id);
  if (!control) return c.json({ error: 'That client has no alternative speed limits' }, 404);
  try {
    await control();
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
  recordAudit(who(c), 'downloads.altspeed', id);
  void hub.pollNow(id);
  return c.json({ ok: true });
});

// Pause or resume every download in one client. Same action header as
// container actions; READ_ONLY blocks it with every other write.
app.post('/api/downloads/:id/:action', async (c) => {
  const id = c.req.param('id') as DownloadClientId;
  const action = c.req.param('action');
  if (!DOWNLOAD_CLIENTS.includes(id)) return c.json({ error: 'Unknown client' }, 404);
  if (action !== 'pause' && action !== 'resume') return c.json({ error: 'Unknown action' }, 400);
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const control = config.demo ? demoDownloadControl(id) : downloadControls.get(id);
  if (!control) return c.json({ error: 'That client is not configured' }, 404);
  try {
    await control(action);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
  recordAudit(who(c), `downloads.${action}`, id);
  void hub.pollNow(id);
  return c.json({ ok: true });
});

// One download: pause, resume or remove (the files stay). Only an item the
// client reported in its last poll, so a request can't name anything else.
app.post('/api/downloads/:id/items/:item/:action', async (c) => {
  const id = c.req.param('id') as DownloadClientId;
  const item = c.req.param('item');
  const action = c.req.param('action') as ItemAction;
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  if (!['pause', 'resume', 'remove'].includes(action)) return c.json({ error: 'Unknown action' }, 400);
  const control = config.demo ? demoItemControl(id) : itemControls.get(id);
  if (!control) return c.json({ error: "That client can't act on one download" }, 404);
  const items = (hub.snapshot().sources[id]?.data as QbitData | undefined)?.items ?? [];
  const found = items.find((i) => i.id === item);
  if (!found) return c.json({ error: 'That download is gone' }, 404);
  try {
    await control(item, action);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
  recordAudit(who(c), `downloads.item.${action}`, id, found.name);
  void hub.pollNow(id);
  return c.json({ ok: true });
});

// Sonarr and Radarr: try another release for a stuck download, search for
// everything missing, or search for one episode or film. Queue items and
// releases must be ones Patchboard last saw.
app.post('/api/arr/:id/:action/:item?', async (c) => {
  const id = c.req.param('id');
  const action = c.req.param('action');
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  if (id !== 'sonarr' && id !== 'radarr') return c.json({ error: 'Unknown app' }, 404);
  const control = config.demo ? demoArrControl() : arrControls.get(id);
  if (!control) return c.json({ error: `${id === 'sonarr' ? 'Sonarr' : 'Radarr'} is not set up` }, 404);
  const data = hub.snapshot().sources[id]?.data as ArrData | undefined;
  const n = Number(c.req.param('item'));
  let what = '';
  try {
    if (action === 'retry') {
      const q = data?.queue?.find((x) => x.id === n);
      if (!q) return c.json({ error: 'That download left the queue' }, 404);
      what = q.title;
      await control.retry(n);
    } else if (action === 'search-missing') {
      what = 'missing';
      await control.searchMissing();
    } else if (action === 'search') {
      const r = data?.upcoming.find((x) => x.searchId === n);
      if (!r) return c.json({ error: 'That release is no longer on the calendar' }, 404);
      what = r.title;
      await control.search(n);
    } else {
      return c.json({ error: 'Unknown action' }, 400);
    }
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
  recordAudit(who(c), `arr.${action}`, id, what);
  void hub.pollNow(id);
  return c.json({ ok: true });
});

// Ad blocking: pause for 5, 30 or 60 minutes, or turn it back on. A pause
// always has a timer, so blocking comes back on its own.
app.post('/api/dns/:id/:action', async (c) => {
  const id = c.req.param('id');
  const action = c.req.param('action');
  if (id !== 'pihole' && id !== 'adguard') return c.json({ error: 'Unknown blocker' }, 404);
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const minutes = action === 'resume' ? null : Number(/^pause-(\d+)$/.exec(action)?.[1]);
  if (minutes !== null && !PAUSE_MINUTES.includes(minutes)) return c.json({ error: 'Pause for 5, 30 or 60 minutes' }, 400);
  const control = config.demo ? demoDnsControl(id) : dnsControls.get(id);
  if (!control) return c.json({ error: 'That blocker is not configured' }, 404);
  try {
    await control(minutes);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
  recordAudit(who(c), minutes === null ? 'dns.resume' : `dns.pause.${minutes}m`, id);
  void hub.pollNow(id);
  return c.json({ ok: true });
});

// Overseerr or Jellyseerr: approve or decline a request. Only requests
// Patchboard last read as pending, so the route can't touch anything else.
app.post('/api/requests/:id/:action', async (c) => {
  const id = Number(c.req.param('id'));
  const action = c.req.param('action');
  if (action !== 'approve' && action !== 'decline') return c.json({ error: 'Unknown action' }, 400);
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const act = config.demo ? demoSeerrAct : seerrAct;
  if (!act) return c.json({ error: 'Overseerr is not configured' }, 404);
  if (!config.demo && !pendingIds.has(id)) return c.json({ error: 'That request is not waiting for approval' }, 404);
  try {
    await act(id, action);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
  pendingIds.delete(id);
  const asked = (hub.snapshot().sources.overseerr?.data as SeerrData | null)?.requests.find((r) => r.id === id)?.title;
  recordAudit(who(c), `requests.${action}`, String(id), asked);
  void hub.pollNow('overseerr');
  return c.json({ ok: true });
});

// Proxmox: start, shut down or reboot a guest Proxmox itself reported.
app.post('/api/proxmox/:vmid/:action', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const vmid = Number(c.req.param('vmid'));
  const action = c.req.param('action') as GuestAction;
  if (!['start', 'shutdown', 'reboot'].includes(action)) return c.json({ error: 'Unknown action' }, 400);
  const guest = (hub.snapshot().sources.proxmox?.data as ProxmoxData | null)?.guests.find((g) => g.vmid === vmid);
  if (!guest) return c.json({ error: 'Proxmox has no guest with that ID' }, 404);
  try {
    if (config.demo) demoProxmoxAct(vmid, action);
    else await proxmoxControl(guest.node, guest.kind, vmid, action);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
  recordAudit(who(c), `proxmox.${action}`, `${guest.name} (${vmid})`);
  setTimeout(() => void hub.pollNow('proxmox'), 3000);
  return c.json({ ok: true });
});

// Home Assistant: every entity, for the widget's picker.
app.get('/api/ha/entities', async (c) => {
  if (config.demo) return c.json({ entities: demoHaList() });
  if (!config.homeassistant) return c.json({ error: 'Home Assistant is not configured' }, 404);
  try {
    return c.json({ entities: await haEntityList() });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

// Toggle a light or run a scene. Only entities pinned on the saved board, and
// only the domains shared/ha.ts allows, so a stolen session can't open a lock.
app.post('/api/ha/:entity/:action', async (c) => {
  const entity = c.req.param('entity');
  const action = c.req.param('action');
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  if (action !== 'toggle' && action !== 'run') return c.json({ error: 'Unknown action' }, 400);
  if (!pinnedAnywhere().has(entity)) return c.json({ error: 'Pin that entity to a Home Assistant widget first' }, 403);
  if (haActionFor(entity) !== action) return c.json({ error: 'Patchboard does not change that kind of entity' }, 403);
  try {
    if (config.demo) demoHaAction(entity, action);
    else if (config.homeassistant) await haCall(entity, action);
    else return c.json({ error: 'Home Assistant is not configured' }, 404);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
  recordAudit(who(c), `ha.${action}`, entity);
  void hub.pollNow('homeassistant');
  return c.json({ ok: true });
});

// Wake-on-LAN by device name. The MAC never leaves the server.
app.post('/api/wake/:name', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const name = c.req.param('name');
  if (config.demo) {
    recordAudit(who(c), 'wake', name);
    return c.json({ ok: true });
  }
  const device = config.wake.devices.find((d) => d.name === name);
  if (!device) return c.json({ error: 'No such device in WOL_DEVICES' }, 404);
  try {
    await sendWake(device.mac, config.wake.broadcast);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
  recordAudit(who(c), 'wake', name);
  return c.json({ ok: true });
});

// ---------- Integration setup from the UI ----------
// Saving and testing need sign-in (when it's on) and the action header, like
// every other change. READ_ONLY refuses both. Secret values go in and never
// come back out; tests run on a scoped copy of the settings.

app.get('/api/setup/integrations', (c) => c.json({ integrations: describeSetup(), demo: config.demo }));

const lastTest = new Map<string, number>();

app.post('/api/setup/integrations/:id/test', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const i = setupIntegration(c.req.param('id'));
  if (!i) return c.json({ error: 'That integration is set up in the environment only' }, 404);
  // One test per integration every two seconds: enough for a person, useless for a port scan.
  if (Date.now() - (lastTest.get(i.id) ?? 0) < 2000) return c.json({ error: 'One test at a time. Try again in a moment.' }, 429);
  const checked = checkValues(i, (await c.req.json().catch(() => null))?.values ?? {});
  if ('error' in checked) return c.json({ ok: false, error: checked.error });
  const gaps = missing(i, checked.values);
  if (gaps.length) return c.json({ ok: false, error: fillIn(gaps) });
  // Only a test that reaches out counts toward the pause between tests.
  lastTest.set(i.id, Date.now());
  recordAudit(who(c), 'setup.test', i.id);
  if (config.demo) return c.json({ ok: true, summary: 'Demo mode: nothing to connect to, so this always passes.' });
  try {
    const summary = await withConfig(candidate(checked.values), () => testIntegration(i.id));
    return c.json({ ok: true, summary });
  } catch (err) {
    return c.json({ ok: false, error: (err as Error).message });
  }
});

/** "Fill in the address and API key first.": the fields' own names, not environment variables. */
function fillIn(gaps: string[]): string {
  const names = [...new Set(gaps.map((g) => fieldLabel(g).replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())))];
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  return `Fill in the ${list} first.`;
}

app.put('/api/setup/integrations/:id', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const i = setupIntegration(c.req.param('id'));
  if (!i) return c.json({ error: 'That integration is set up in the environment only' }, 404);
  if (config.demo) return c.json({ error: "Demo mode doesn't save integration settings." }, 400);
  const checked = checkValues(i, (await c.req.json().catch(() => null))?.values ?? {});
  if ('error' in checked) return c.json({ error: checked.error }, 400);
  const gaps = missing(i, checked.values);
  if (gaps.length) return c.json({ error: fillIn(gaps) }, 400);
  saveValues(checked.values);
  recordAudit(who(c), 'setup.save', i.id, Object.keys(checked.values).join(', '));
  hub.replaceAdapters(realAdapters());
  return c.json({ integrations: describeSetup() });
});

// Copy every integration value from the environment into Patchboard, so the
// .env lines can be removed. Values never leave the server.
app.post('/api/setup/adopt-env', (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  if (config.demo) return c.json({ error: "Demo mode doesn't save integration settings." }, 400);
  const copied = adoptEnvironment();
  recordAudit(who(c), 'setup.adopt-env', 'integrations', copied.join(', ') || 'nothing new');
  return c.json({ copied, integrations: describeSetup() });
});

// Copy services.yaml into Patchboard's own app list, so the file can go.
// Groups, order, links, icons and checks come along; the file isn't touched.
app.post('/api/catalog/adopt', (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  if (config.demo) return c.json({ error: "Demo mode doesn't save apps." }, 400);
  const v = validateOrder(adoptYaml(getYamlCatalog(), kvGet<AppOrder>('app-order')));
  if ('error' in v) return c.json({ error: v.error }, 400);
  kvSet('app-order', v.order);
  setCatalogOrder(v.order);
  hub.emitCatalog();
  const n = getYamlCatalog().groups.reduce((k, g) => k + g.services.length, 0);
  recordAudit(who(c), 'apps.adopt-yaml', 'apps', `${n} apps, ${getYamlCatalog().dock.length} links`);
  return c.json({ apps: n, links: getYamlCatalog().dock.length });
});

// Homepage's services.yaml and bookmarks.yaml, pasted in: preview what would
// come over, then add it beside the apps already saved. Nothing saved is replaced.
app.post('/api/catalog/import-homepage', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  if (Number(c.req.header('content-length') ?? 0) > 1_000_000) return c.json({ error: 'That is more than 1 MB of YAML.' }, 413);
  const body = (await c.req.json().catch(() => null)) as { services?: unknown; bookmarks?: unknown; apply?: unknown } | null;
  if (typeof body?.services !== 'string' || !body.services.trim()) return c.json({ error: "Paste Homepage's services.yaml first." }, 400);
  let found;
  try {
    found = fromHomepage(body.services, typeof body.bookmarks === 'string' ? body.bookmarks : '');
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
  const prev = kvGet<AppOrder>('app-order');
  const next = adoptYaml(found.catalog, prev);
  const apps = (next.added?.length ?? 0) - (prev?.added?.length ?? 0);
  const links = (next.addedLinks?.length ?? 0) - (prev?.addedLinks?.length ?? 0);
  const all = found.catalog.groups.reduce((k, g) => k + g.services.length, 0);
  const summary = { groups: found.catalog.groups.map((g) => g.name), apps, links, already: all - apps, integrations: found.integrations };
  if (body.apply !== true) return c.json(summary);
  if (config.demo) return c.json({ error: "Demo mode doesn't save apps." }, 400);
  const v = validateOrder(next);
  if ('error' in v) return c.json({ error: v.error }, 400);
  kvSet('app-order', v.order);
  setCatalogOrder(v.order);
  hub.emitCatalog();
  recordAudit(who(c), 'apps.import-homepage', 'apps', `${apps} apps, ${links} links`);
  return c.json({ ...summary, saved: true });
});

app.delete('/api/setup/integrations/:id', (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const i = setupIntegration(c.req.param('id'));
  if (!i) return c.json({ error: 'That integration is set up in the environment only' }, 404);
  if (config.demo) return c.json({ error: "Demo mode doesn't save integration settings." }, 400);
  clearIntegration(i);
  recordAudit(who(c), 'setup.remove', i.id);
  hub.replaceAdapters(realAdapters());
  return c.json({ integrations: describeSetup() });
});

/** One fetch with the candidate settings, summed up in a line. Runs inside withConfig. */
async function testIntegration(id: string): Promise<string> {
  if (id === 'wake') {
    const n = config.wake.devices.length;
    if (!n) throw new Error('No machine parsed. Use Name=aa:bb:cc:dd:ee:ff, comma-separated.');
    return `${n} machine${n === 1 ? '' : 's'} ready: ${config.wake.devices.map((d) => d.name).join(', ')}.`;
  }
  if (id === 'ntfy' || id === 'gotify' || id === 'pushover' || id === 'email' || id === 'discord' || id === 'webhook') {
    if (!config.notify[id]) throw new Error('Those settings are incomplete.');
    // Only the one being tested, so a broken Gotify doesn't fail an ntfy test.
    await send({ title: 'Patchboard can reach you here', body: 'Problems that last two minutes will show up like this, and again when they clear.', level: 'test' }, id);
    return id === 'email'
      ? 'Sent a test email. Check your inbox (and spam).'
      : id === 'discord'
        ? 'Sent a test message. Check the channel.'
        : id === 'webhook'
          ? 'Your webhook took the test.'
          : 'Sent a test notification. Check your phone.';
  }
  if (id === 'dozzle') {
    await request(config.dozzleUrl!, {}, 8000);
    return 'Dozzle answered.';
  }
  // Hardcover and Goodreads share one source.
  const made = FACTORIES[id === 'hardcover' || id === 'goodreads' ? 'books' : id]?.();
  if (!made) throw new Error('Those settings are incomplete.');
  const data = await Promise.race([
    made.adapter.fetch(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('No answer in 15 seconds')), 15_000)),
  ]);
  return summarize(data);
}

function summarize(data: unknown): string {
  const d = (data ?? {}) as Record<string, unknown>;
  const n = (k: string) => (Array.isArray(d[k]) ? (d[k] as unknown[]).length : undefined);
  const bits: string[] = [];
  if (n('streams') !== undefined) bits.push(`${n('streams')} streaming`);
  if (n('recent') !== undefined) bits.push(`${n('recent')} recently added`);
  if (n('upcoming') !== undefined) bits.push(`${n('upcoming')} upcoming`);
  if (typeof d.unread === 'number') bits.push(`${d.unread} unread`);
  if (typeof d.total === 'number' && n('entities') !== undefined) bits.push(`${d.total} entities`);
  if (n('cars') !== undefined) bits.push(`${n('cars')} car${n('cars') === 1 ? '' : 's'}`);
  if (typeof d.downloading === 'number') bits.push(`${d.downloading} downloading`);
  if (n('cameras') !== undefined) bits.push(`${n('cameras')} cameras`);
  if (typeof d.queries === 'number') bits.push(`${(d.queries as number).toLocaleString('en-US')} queries today`);
  if (n('runs') !== undefined) bits.push(`${n('runs')} speed tests today`);
  if (n('requests') !== undefined) bits.push(`${typeof d.pending === 'number' ? d.pending : n('requests')} waiting for approval`);
  if (n('monitors') !== undefined) bits.push(`${n('monitors')} monitor${n('monitors') === 1 ? '' : 's'}`);
  if (n('pools') !== undefined) bits.push(`${n('pools')} pools`);
  if (n('days') !== undefined) bits.push('forecast loaded');
  return bits.length ? `Connected: ${bits.join(', ')}.` : 'Connected.';
}

// Trakt sign-in (device flow). Same action header as container actions.
app.get('/api/trakt', (c) =>
  c.json(config.demo ? { configured: true, canConnect: true, connected: true, user: 'demo' } : traktStatus()),
);
app.post('/api/trakt/connect', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  if (config.demo) return c.json({ error: 'Not available in the demo' }, 400);
  recordAudit(who(c), 'trakt.connect', 'trakt');
  try {
    return c.json(await startDeviceFlow());
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});
app.post('/api/trakt/disconnect', (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  if (!config.demo) traktDisconnect();
  recordAudit(who(c), 'trakt.disconnect', 'trakt');
  return c.json({ ok: true });
});

// Updates: pull and recreate one service, streamed as a job.
app.post('/api/containers/:name/update', async (c) => {
  const name = c.req.param('name');
  if (!NAME.test(name)) return c.json({ error: 'Bad container name' }, 400);
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const ctr = hub.containers().find((x) => x.name === name);
  if (!ctr) return c.json({ error: 'No such container' }, 404);
  const done = () => {
    hub.emitUpdates();
    void hub.pollNow('docker');
    void hub.pollNow('checks');
    hub.refreshChanges();
  };
  if (config.demo) return c.json(startDemoUpdate(name, done));
  // "Answering" is checked live during the wait, not from the last minute's result.
  const svc = getCatalog().groups.flatMap((g) => g.services).find((s) => s.container === name);
  const url = svc ? checkUrl(svc) : null;
  const answering = async () => {
    if (!url) return null;
    try {
      const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
      void res.body?.cancel();
      return res.status < 500;
    } catch {
      return false;
    }
  };
  recordAudit(who(c), 'container.update', name);
  try {
    return c.json(await startUpdate(ctr, answering, done));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 409);
  }
});

app.post('/api/jobs/:id/rollback', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  if (config.demo) return c.json({ error: 'Not available in the demo' }, 400);
  recordAudit(who(c), 'container.rollback', c.req.param('id'));
  try {
    return c.json(
      await startRollback(c.req.param('id'), () => {
        void hub.pollNow('docker');
        hub.refreshChanges();
      }),
    );
  } catch (err) {
    return c.json({ error: (err as Error).message }, 409);
  }
});

app.get('/api/containers/:name/job', (c) => c.json(latestJobFor(c.req.param('name')) ?? null));

app.get('/api/jobs/:id', (c) => {
  const id = c.req.param('id');
  if (!getJob(id)) return c.json({ error: 'No such job' }, 404);
  return streamSSE(c, async (stream) => {
    let finished = false;
    const stop = watchJob(id, (j) => {
      void stream.writeSSE({ data: JSON.stringify(j) });
      if (j.status !== 'running') finished = true;
    });
    await new Promise<void>((resolve) => {
      const t = setInterval(() => finished && resolve(), 500);
      stream.onAbort(() => {
        clearInterval(t);
        resolve();
      });
    });
    stop();
  });
});

// Check for a newer Patchboard now, instead of waiting for the six-hourly look.
app.post('/api/self/check', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  if (config.demo) return c.json({ check: { at: Date.now(), state: 'current' } });
  if (await checkSelfImage(hub.containers())) hub.emitUpdates();
  return c.json({ check: selfCheckStatus() });
});

// Diun's webhook notifier posts here (see compose/diun). Tailnet-only, like
// the rest of the API; the body is matched to containers and stored.
app.post('/api/hooks/diun', async (c) => {
  const body = await c.req.json<DiunNotice>().catch(() => null);
  if (!body?.image) return c.json({ error: 'Expected a Diun notification' }, 400);
  const flagged = recordDiunNotice(body, hub.containers());
  if (flagged.length) hub.emitUpdates();
  return c.json({ ok: true, flagged });
});

// The last look saved on any device. A browser or home-screen app with no
// saved look of its own starts from it (iOS keeps a home-screen app's
// storage apart from Safari's, so without this a fresh install forgets).
app.get('/api/appearance', (c) => c.json({ appearance: kvGet<unknown>('appearance') ?? null }));

app.put('/api/appearance', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const text = await c.req.text();
  if (text.length > 16_000) return c.json({ error: 'Too large' }, 413);
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return c.json({ error: 'Not JSON' }, 400);
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return c.json({ error: 'Expected an object' }, 400);
  kvSet('appearance', v);
  return c.json({ ok: true });
});

// The Home board. Stored on the server so every device shows the same one.
app.get('/api/boards', (c) => c.json({ boards: boardList() }));

app.get('/api/boards/:id', (c) => {
  const found = getBoard(c.req.param('id'));
  return found ? c.json(found) : c.json({ error: 'No such board' }, 404);
});

// Add a board. The server picks its address from its name.
app.post('/api/boards', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const v = validateBoard(await c.req.json().catch(() => null));
  if ('error' in v) return c.json({ error: v.error }, 400);
  if (!v.board.name) return c.json({ error: 'Give it a name' }, 400);
  const id = boardId(v.board.name, boardList().map((b) => b.id));
  const put = putBoard(id, v.board);
  if ('error' in put) return c.json({ error: put.error }, 400);
  recordAudit(who(c), 'board.add', id, v.board.name);
  hub.emitBoards();
  return c.json({ id, board: put.board });
});

// Save a board.
app.put('/api/boards/:id', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const id = c.req.param('id');
  const v = validateBoard(await c.req.json().catch(() => null));
  if ('error' in v) return c.json({ error: v.error }, 400);
  if (!getBoard(id)) return c.json({ error: 'No such board' }, 404);
  const put = putBoard(id, v.board);
  if ('error' in put) return c.json({ error: put.error }, 400);
  recordAudit(who(c), 'board.save', id, `${v.board.widgets.length} widgets`);
  hub.emitBoards(id);
  // Newly pinned Home Assistant entities show up without waiting for the next poll.
  if (config.homeassistant || config.demo) void hub.pollNow('homeassistant');
  return c.json({ board: put.board, custom: true });
});

// Home goes back to the default; any other board is deleted.
app.delete('/api/boards/:id', (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const id = c.req.param('id');
  if (!removeBoard(id)) return c.json({ error: 'No such board' }, 404);
  recordAudit(who(c), id === 'home' ? 'board.reset' : 'board.delete', id);
  hub.emitBoards(id);
  return c.json(getBoard(id) ?? { deleted: true });
});

// Dismiss an image-update mark you know is wrong (a re-published tag).
app.delete('/api/updates/:name', (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const name = c.req.param('name');
  if (!clearUpdate(name)) return c.json({ error: 'No update mark for that container' }, 404);
  hub.emitUpdates();
  recordAudit(who(c), 'update.dismiss', name);
  return c.json({ ok: true });
});

// The order apps appear in, when rearranged in the UI. Applied to the catalog
// on the server so every view and every device agrees.
app.put('/api/app-order', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const v = validateOrder(await c.req.json().catch(() => null));
  if ('error' in v) return c.json({ error: v.error }, 400);
  kvSet('app-order', v.order);
  setCatalogOrder(v.order);
  hub.emitCatalog();
  recordAudit(who(c), 'apps.order', 'apps', `${v.order.added?.length ?? 0} added, ${v.order.hidden?.length ?? 0} hidden`);
  return c.json({ ok: true });
});

app.get('/api/app-order', (c) => c.json(kvGet<AppOrder>('app-order') ?? null));

app.delete('/api/app-order', (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  kvSet('app-order', null);
  setCatalogOrder(null);
  hub.emitCatalog();
  recordAudit(who(c), 'apps.order.reset', 'apps');
  return c.json({ ok: true });
})

// What each page shows. One page at a time, so two tabs editing different
// pages don't overwrite each other.
app.put('/api/pages/:id', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const id = c.req.param('id');
  const v = validatePages({ [id]: await c.req.json().catch(() => null) });
  if ('error' in v) return c.json({ error: v.error }, 400);
  const pages = { ...(kvGet<Pages>('pages') ?? {}), ...v.pages };
  kvSet('pages', pages);
  hub.emitPages(pages);
  recordAudit(who(c), 'pages.save', id);
  return c.json({ ok: true });
});

// The catalog as arranged in the UI, as a services.yaml to keep in git.
app.get('/api/catalog/yaml', (c) =>
  c.body(catalogYaml(getCatalog()), 200, {
    'Content-Type': 'text/yaml; charset=utf-8',
    'Content-Disposition': 'attachment; filename="services.yaml"',
  }),
);

// The whole setup as one file: board, app layout, page settings. Keys stay
// out; setups refer to them by name, so you paste them again after a move.
// Notes widgets: one text per widget, keyed by board and widget (noteKey).
const NOTE_KEY = /^[\w.-]{1,80}$/;

/** Notes from a setup file: every key and text checked, or the reason not. */
function cleanNotes(raw: unknown): { notes: Record<string, { text: string; at: number }> } | { error: string } {
  if (raw == null) return { notes: {} };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Expected a map of notes' };
  const out: Record<string, { text: string; at: number }> = {};
  const entries = Object.entries(raw as Record<string, { text?: unknown; at?: unknown }>);
  if (entries.length > 200) return { error: 'At most 200 notes' };
  for (const [k, v] of entries) {
    if (!NOTE_KEY.test(k) || typeof v?.text !== 'string' || v.text.length > 20_000) return { error: `Bad note ${k.slice(0, 40)}` };
    out[k] = { text: v.text, at: typeof v.at === 'number' ? v.at : Date.now() };
  }
  return { notes: out };
}

app.get('/api/notes', (c) => c.json(kvGet<Record<string, { text: string; at: number }>>('board-notes') ?? {}));

app.put('/api/notes/:id', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const id = c.req.param('id');
  if (!NOTE_KEY.test(id)) return c.json({ error: 'Bad note id' }, 400);
  const body = await c.req.json<{ text?: unknown }>().catch(() => ({}) as { text?: unknown });
  if (typeof body.text !== 'string' || body.text.length > 20_000) return c.json({ error: 'A note is text, up to 20,000 characters' }, 400);
  const all = kvGet<Record<string, { text: string; at: number }>>('board-notes') ?? {};
  all[id] = { text: body.text, at: Date.now() };
  kvSet('board-notes', all);
  return c.json(all[id]);
});

// Alert thresholds, shared by every device.
app.get('/api/setup/thresholds', (c) => c.json({ thresholds: describeThresholds() }));

app.put('/api/setup/thresholds', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  if (config.demo) return c.json({ error: "Demo mode doesn't save settings." }, 400);
  const r = saveThresholds(await c.req.json().catch(() => null));
  if ('error' in r) return c.json({ error: r.error }, 400);
  recordAudit(who(c), 'setup.thresholds', 'alerts');
  hub.refreshAlerts();
  return c.json({ thresholds: describeThresholds() });
});

// The name in the header and tab, for every device.
app.put('/api/brand', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const b = cleanBrand(await c.req.json().catch(() => null));
  if ('error' in b) return c.json({ error: b.error }, 400);
  kvSet('brand', b);
  hub.emitBrand(b);
  recordAudit(who(c), 'brand.save', 'look', b.name ?? 'Patchboard');
  return c.json({ brand: b });
});

app.get('/api/setup', (c) => {
  const body = {
    patchboard: 'setup',
    version: 1,
    exportedAt: new Date().toISOString(),
    board: kvGet('board') ?? null,
    boards: exportExtras(),
    apps: kvGet('app-order') ?? null,
    pages: kvGet('pages') ?? {},
    brand: kvGet('brand') ?? {},
    notes: kvGet('board-notes') ?? {},
    thresholds: savedThresholds(),
  };
  return c.body(JSON.stringify(body, null, 2), 200, {
    'Content-Type': 'application/json',
    'Content-Disposition': `attachment; filename="patchboard-setup-${new Date().toISOString().slice(0, 10)}.json"`,
  });
});

app.put('/api/setup', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const raw = (await c.req.json().catch(() => null)) as { patchboard?: string; board?: unknown; boards?: unknown; apps?: unknown; pages?: unknown; brand?: unknown; notes?: unknown; thresholds?: unknown } | null;
  if (!raw || raw.patchboard !== 'setup') return c.json({ error: "That isn't a Patchboard setup file." }, 400);
  // Check everything before changing anything.
  const board = raw.board ? validateBoard(raw.board) : null;
  if (board && 'error' in board) return c.json({ error: `Board: ${board.error}` }, 400);
  const boards = importExtras(raw.boards);
  if ('error' in boards) return c.json({ error: `Boards: ${boards.error}` }, 400);
  const apps = raw.apps ? validateOrder(raw.apps) : null;
  if (apps && 'error' in apps) return c.json({ error: `Apps: ${apps.error}` }, 400);
  const pages = raw.pages ? validatePages(raw.pages) : null;
  if (pages && 'error' in pages) return c.json({ error: `Pages: ${pages.error}` }, 400);
  const brand = raw.brand ? cleanBrand(raw.brand) : {};
  if ('error' in brand) return c.json({ error: `Name: ${brand.error}` }, 400);
  const notes = cleanNotes(raw.notes);
  if ('error' in notes) return c.json({ error: `Notes: ${notes.error}` }, 400);
  // Thresholds set in the environment win, so a file's own are only checked against the rest.
  const thresholds = raw.thresholds && !config.demo ? checkThresholds(raw.thresholds) : null;
  if (thresholds && 'error' in thresholds) return c.json({ error: `Alerts: ${thresholds.error}` }, 400);
  saveHome(board ? board.board : null);
  saveExtras(boards.boards);
  hub.emitBoards('*');
  kvSet('app-order', apps ? apps.order : null);
  setCatalogOrder(apps ? apps.order : null);
  kvSet('pages', pages ? pages.pages : {});
  hub.emitCatalog();
  hub.emitPages(pages ? pages.pages : {});
  kvSet('brand', brand);
  hub.emitBrand(brand);
  // An older file has no notes; leave the ones here alone.
  if (raw.notes != null) kvSet('board-notes', notes.notes);
  if (thresholds) {
    saveThresholds(raw.thresholds);
    hub.refreshAlerts();
  }
  recordAudit(who(c), 'setup.import', 'setup');
  return c.json({ ok: true });
});

// Keys pasted in the UI. Names and dates go out; values never do.
app.get('/api/secrets', (c) => c.json(listSecrets()));

app.put('/api/secrets/:name', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const name = c.req.param('name');
  if (!SECRET_NAME.test(name)) return c.json({ error: 'Names use A to Z, 0 to 9 and _' }, 400);
  const body = (await c.req.json().catch(() => null)) as { value?: unknown } | null;
  const value = typeof body?.value === 'string' ? body.value.trim() : '';
  if (!value || value.length > 4000) return c.json({ error: 'Paste the key' }, 400);
  setSecret(name, value);
  recordAudit(who(c), 'secret.set', name);
  return c.json({ ok: true });
});

app.delete('/api/secrets/:name', (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const name = c.req.param('name');
  if (!deleteSecret(name)) return c.json({ error: 'No such key' }, 404);
  recordAudit(who(c), 'secret.delete', name);
  return c.json({ ok: true });
});

// Live numbers for apps, set up in Edit apps. Only configurations saved in
// the layout are fetched; each is cached for its own interval.
app.get('/api/appstats', async (c) => {
  const saved = kvGet<AppOrder>('app-order');
  const v = saved ? validateOrder(saved) : null;
  const stats = v && 'order' in v ? (v.order.stats ?? {}) : {};
  const out: Record<string, { value: unknown; field: JsonField; at: number; error?: string }> = {};
  await Promise.all(
    Object.entries(stats).map(async ([name, cfg]) => {
      const r = config.demo ? demoAppStat(name, cfg) : await cachedJsonWidget(`app:${name}`, cfg);
      out[name] = { value: r.values[0]?.value ?? null, field: cfg.fields[0], at: r.at, ...(r.error ? { error: r.error } : {}) };
    }),
  );
  return c.json(out);
});

// Posters for the calendar (see server/art.ts).
app.get('/api/art/:src/:id', async (c) => {
  if (config.demo) return c.body(null, 404);
  const got = await poster(c.req.param('src'), c.req.param('id'));
  return got ? c.body(got.body, 200, { 'Content-Type': got.type, 'Cache-Control': 'private, max-age=86400' }) : c.body(null, 404);
});

// Uploaded icons. Named by content hash, so the same file uploads once and
// can be cached forever. Served with a sandboxing CSP: an SVG opened directly
// can't run script.
const ICON_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/gif': 'gif', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico' };
const ICON_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', gif: 'image/gif', ico: 'image/x-icon' };
const iconDir = join(config.dataDir, 'icons');

app.post('/api/icons', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const ext = ICON_TYPES[(c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase()];
  if (!ext) return c.json({ error: 'Use a PNG, JPEG, WebP, SVG, GIF or ICO image' }, 415);
  if (Number(c.req.header('content-length') ?? 0) > 512 * 1024) return c.json({ error: 'Icons can be up to 512 KB' }, 413);
  const body = Buffer.from(await c.req.arrayBuffer());
  if (!body.length || body.length > 512 * 1024) return c.json({ error: 'Icons can be up to 512 KB' }, 413);
  const name = `${createHash('sha256').update(body).digest('hex').slice(0, 16)}.${ext}`;
  mkdirSync(iconDir, { recursive: true });
  writeFileSync(join(iconDir, name), body);
  recordAudit(who(c), 'icon.upload', name);
  return c.json({ icon: `/api/icons/${name}` });
});

app.get('/api/icons/:file', (c) => {
  const m = /^([a-f0-9]{16})\.(png|jpg|webp|svg|gif|ico)$/.exec(c.req.param('file'));
  if (!m) return c.json({ error: 'No such icon' }, 404);
  try {
    const data = readFileSync(join(iconDir, m[0]));
    return c.body(data, 200, {
      'Content-Type': ICON_MIME[m[2]],
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    });
  } catch {
    return c.json({ error: 'No such icon' }, 404);
  }
});

// Catalog audit: entries pointing at nothing, and running apps not listed.
app.get('/api/catalog/audit', async (c) => {
  const containers = hub.containers();
  // Hidden apps still count as listed: hiding one shouldn't make it "new".
  const full = getCatalog();
  const catalog = { ...full, groups: [...full.groups, { name: 'Hidden', services: (full.hiddenApps ?? []).map((h) => h.service) }] };
  const hrefHost = catalog.groups
    .flatMap((g) => g.services)
    .map((s) => (s.href ? /^https?:\/\/(\d+\.\d+\.\d+\.\d+)/.exec(s.href)?.[1] : undefined))
    .find(Boolean);
  // With no app addresses yet, the address this browser used to reach
  // Patchboard is the server's: links built from it work from a phone too.
  const hostGuess = hrefHost ?? visitorHost(c.req.header('host'));
  // Ports need an inspect per container; only fetch them for candidates.
  const first = auditCatalog(catalog, containers, () => undefined, hostGuess);
  const ports = new Map<string, ContainerDetail['ports']>();
  await Promise.all(
    first.discovered.map(async (d) => {
      try {
        const detail = config.demo ? demoInspect(d.container, containers) : await inspectContainer(d.container, containers);
        if (detail) ports.set(d.container, detail.ports);
      } catch {
        // Gone since the list was taken.
      }
    }),
  );
  const audit = auditCatalog(catalog, containers, (n) => ports.get(n), hostGuess);
  // What services.yaml still holds that Patchboard hasn't copied in.
  const saved = kvGet<AppOrder>('app-order');
  const savedApps = new Set((saved?.added ?? []).map((a) => a.name));
  const savedLinks = new Set((saved?.addedLinks ?? []).map((b) => b.name));
  const yamlCat = getYamlCatalog();
  const yamlApps = yamlCat.groups.flatMap((g) => g.services).filter((s) => !savedApps.has(s.name)).length;
  const yamlLinks = yamlCat.dock.filter((b) => !savedLinks.has(b.name)).length;
  return c.json({ ...audit, yaml: draftYaml(audit.discovered), yamlApps, yamlLinks });
});

// Runbook sections that name this container's app or compose stack.
app.get('/api/runbook/:name', async (c) => {
  const name = c.req.param('name');
  if (!NAME.test(name)) return c.json({ error: 'Bad container name' }, 400);
  if (config.demo) return c.json({ available: true, sections: demoRunbook(name) });
  const ctr = hub.containers().find((x) => x.name === name);
  const svc = hub.snapshot().catalog.groups.flatMap((g) => g.services).find((s) => s.container === name);
  return c.json({ available: !!config.docsPath, sections: await runbookFor([name, ctr?.project, svc?.name]) });
});

// Daily health squares per container: /api/uptime?days=30
app.get('/api/uptime', (c) => {
  const days = Math.min(Math.max(Number(c.req.query('days') ?? 30) || 30, 1), 30);
  const snap = hub.snapshot();
  const expect = new Set(snap.catalog.groups.flatMap((g) => g.services.filter((s) => s.expectStopped && s.container).map((s) => s.container!)));
  return c.json(uptimeDays(hub.containers(), days, expect));
});

// Time series for charts: /api/history?key=cpu&key=ctr.mem:plex&hours=24
app.get('/api/history', (c) => {
  const keys = c.req.queries('key') ?? [];
  const hours = Math.min(Math.max(Number(c.req.query('hours') ?? 24) || 24, 1), 24 * 120);
  const points = Math.min(Math.max(Number(c.req.query('points') ?? 240) || 240, 10), 1000);
  const out: Record<string, [number, number][]> = {};
  for (const k of keys.slice(0, 12)) {
    if (/^[\w.:-]+$/.test(k)) out[k] = series(k, hours * 3_600_000, points);
  }
  return c.json(out);
});

app.get('/api/img/:kind{jellyfin|emby}', async (c) => {
  const kind = c.req.param('kind') as 'jellyfin' | 'emby';
  if (config.demo || !config[kind]) return c.body(null, 404);
  try {
    const res = await mediaImage(kind, c.req.query('id') ?? '');
    return new Response(res.body, {
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return c.body(null, 404);
  }
});

// Frigate pictures: a camera's newest frame (?camera=) or an event's
// thumbnail (?event=). Frames change, so they're cached for seconds.
app.get('/api/img/frigate', async (c) => {
  const q = { camera: c.req.query('camera'), event: c.req.query('event') };
  if (config.demo) {
    const svg = demoFrigateImage(q);
    return svg ? c.body(svg, 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }) : c.body(null, 404);
  }
  if (!config.frigate) return c.body(null, 404);
  try {
    const res = await frigateImage(q);
    return new Response(res.body, {
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': q.camera ? 'private, max-age=10' : 'private, max-age=86400',
      },
    });
  } catch {
    return c.body(null, 404);
  }
});

app.get('/api/img/tautulli', async (c) => {
  if (config.demo || !config.tautulli) return c.body(null, 404);
  try {
    const res = await tautulliImage(c.req.query('path') ?? '');
    return new Response(res.body, {
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return c.body(null, 404);
  }
});

app.get('/healthz', (c) => c.text('ok'));

// Static client and SPA fallback.
const indexPath = join(config.staticDir, 'index.html');
// Icon files from before the otter art, still named in older services.yaml
// files and bookmarks.
const MOVED_ICONS: Record<string, string> = { '/icon.svg': '/icon-192.png', '/icon-light.svg': '/icon-light-192.png', '/favicon.svg': '/favicon.png', '/favicon-dark.svg': '/favicon.png', '/favicon-light.svg': '/favicon.png' };
for (const [from, to] of Object.entries(MOVED_ICONS)) app.get(from, (c) => c.redirect(to, 301));

app.use('/*', serveStatic({ root: config.staticDir }));
app.get('*', (c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ error: 'Not found' }, 404);
  if (!existsSync(indexPath)) return c.text('Client not built. Run `npm run build`, or use `npm run dev`.', 503);
  return c.html(readFileSync(indexPath, 'utf8'));
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

serve({ fetch: app.fetch, port: config.port, ...(config.listenHost ? { hostname: config.listenHost } : {}) }, (info) => {
  console.log(`patchboard: listening on :${info.port}`);
});
