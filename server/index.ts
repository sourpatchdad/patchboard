import { createHash, randomBytes } from 'node:crypto';
import type { DnsLists, DnsLog, DownloadEntry, FilePriority, HistoryItem, IndexerList, ShowDetail, TorrentChange, TorrentDetail, MediaLibraries, SubtitleItem, SubtitleKind, SubtitleList, MediaServerId, SeerrData, Stream } from '../shared/types.ts';
import { fieldLabel } from '../shared/setup.ts';
import { latestReleases, readFeeds } from './outside.ts';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { getJson, request } from './http.ts';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { type Context, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Adapter } from './adapters/adapter.ts';
import type { ArrData, CarData, ContainerDetail, HaEntity, ProxmoxData, QbitData } from '../shared/types.ts';
import { cleanBrand } from '../shared/brand.ts';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { appIconFor, clearAppIcon, saveAppIcon } from './appicon.ts';
import { apiRoutes } from './api.ts';
import { findPlaces, finishFirstRun, markExistingInstall } from './firstrun.ts';
import { iconIndex } from './icon-index.ts';
import { createKey, listKeys, revokeKey } from './apikeys.ts';
import { radarrAdapter, sonarrAdapter, arrControl, type ArrControl } from './adapters/arr.ts';
import { type ContainerAction, containerAction, dockerAdapter, followLogs, inspectContainer, statsAdapter } from './adapters/docker.ts';
import { fastmailAdapter } from './adapters/fastmail.ts';
import { frigateAdapter, frigateImage, frigateLive, LIVE_MAX } from './adapters/frigate.ts';
import { listEntries, markAllRead, markRead, minifluxAdapter } from './adapters/miniflux.ts';
import { qbitClient } from './adapters/qbit.ts';
import { haCall, haEntity, haEntityList, haHistory, haPrinterCover, haTodoChange, haTodoItems, homeAssistantAdapter, pinnedAnywhere } from './adapters/homeassistant.ts';
import { boardList, exportExtras, getBoard, importExtras, putBoard, removeBoard, saveExtras, saveHome, sealSavedBoards } from './boards.ts';
import { tessieAdapter, tessieCommand } from './adapters/tessie.ts';
import { checkLimit, isCarCommand, OPENS_CAR } from '../shared/car-commands.ts';
import { uptimeKumaAdapter } from './adapters/uptimekuma.ts';
import { speedtestAdapter } from './adapters/speedtest.ts';
import { immichAdapter } from './adapters/immich.ts';
import { type GuestAction, proxmoxAdapter, proxmoxControl } from './adapters/proxmox.ts';
import { scrutinyAdapter } from './adapters/scrutiny.ts';
import { gatusAdapter, healthchecksAdapter, mailcowAdapter } from './adapters/monitors.ts';
import { beszelAdapter, beszelHostDetail } from './adapters/beszel.ts';
import { syncthingAdapter } from './adapters/syncthing.ts';
import { tracearrAdapter } from './adapters/tracearr.ts';
import { glancesAdapter } from './adapters/glances.ts';
import { bitaxeAdapter } from './adapters/bitaxe.ts';
import { nutAdapter } from './adapters/nut.ts';
import { unraidAdapter } from './adapters/unraid.ts';
import { synologyAdapter } from './adapters/synology.ts';
import { qnapAdapter } from './adapters/qnap.ts';
import { portainerAdapter } from './adapters/portainer.ts';
import { netdataAdapter, prometheusAdapter } from './adapters/monitoring.ts';
import { tailscaleAdapter, unifiAdapter } from './adapters/network.ts';
import { bazarrAdapter, giteaAdapter, nextcloudAdapter, paperlessAdapter, starrAdapter } from './adapters/apps.ts';
import { audiobookshelfAdapter, audiobookshelfCover, navidromeAdapter } from './adapters/listening.ts';
import { calendarAdapter } from './adapters/calendar.ts';
import { booksAdapter } from './adapters/books.ts';
import { anyNotifier, channels, send } from './notify.ts';
import { pendingIds, type SeerrClient, seerrClient } from './adapters/seerr.ts';
import { mediaControl, plexSections } from './adapters/media-control.ts';
import { prowlarrControl } from './adapters/indexers.ts';
import { bazarrControl } from './adapters/subtitles.ts';
import { adguardClient, cleanDomain, type DnsControl, type DnsDomains, PAUSE_MINUTES, piholeClient } from './adapters/dns.ts';
import { sendWake } from './wake.ts';
import { adoptEnvironment, candidate, checkThresholds, describeThresholds, saveThresholds, savedThresholds, checkValues, clearIntegration, describeSetup, loadSavedSettings, missing, saveValues, setupIntegration } from './setup.ts';
import { authLocked, authProblem, envHas, withConfig } from './config.ts';
import { type HaAction, haActionFor, haAllows, pinnedEntities } from '../shared/ha.ts';
import { parseChores } from '../shared/fields.ts';
import { systemAdapter } from './adapters/system.ts';
import { tautulliAdapter, tautulliImage } from './adapters/tautulli.ts';
import { plexAdapter, plexImage } from './adapters/plex.ts';
import { mediaImage, mediaServerAdapter } from './adapters/mediaserver.ts';
import { delugeClient, DOWNLOAD_CLIENTS, type DownloadControl, type DownloadManager, type ItemAction, type NewDownload, nzbgetClient, sabnzbdClient, transmissionClient } from './adapters/downloads.ts';
import type { ArrApp, ArrOptions, ArrQueueItem, DownloadClientId, DownloadList, EntryAction, LibraryItem, WantedList } from '../shared/types.ts';
import { arrLibrary, type ArrLibrary } from './adapters/library.ts';
import { demoLibrary } from './demo-library.ts';
import { traktAdapter } from './adapters/trakt.ts';
import { truenasAdapter } from './adapters/truenas.ts';
import { backupsAdapter } from './adapters/backups.ts';
import { checksAdapter } from './adapters/checks.ts';
import { weatherAdapter } from './adapters/weather.ts';
import { initCatalog } from './catalog.ts';
import { config } from './config.ts';
import { series } from './db.ts';
import { demoDigestInput, demoNotes, demoProxmoxAct, demoAdapters, demoDownloadControl, demoFeeds, demoFeedsResponse, demoHaAction, demoHaHistory, demoHaList, demoTodo, demoTodoChange, demoInspect, demoLogs, demoReadIds, demoRunbook, demoDnsControl, demoDnsDomains, demoIndexers, demoSubtitles, demoRequestsApi, demoMediaControl, demoItemControl, demoAltSpeed, demoManager, demoArrControl, demoFeedItems, demoReleases, demoFrigateImage, demoContainerAction, demoHostDetail, demoCarCommand, DEMO_PRINT_SVG } from './demo.ts';
import { APP_VERSION, Hub, seedDemoHistory, seedDemoSamples } from './hub.ts';
import { seedDemoCar } from './demo-car.ts';
import { demoSelfReleases, selfReleases } from './self-releases.ts';
import { runbookFor } from './notes.ts';
import { uptimeDays } from './uptime.ts';
import { boardId, NUMBERS, validateBoard, type Widget, WIDGET_INFO } from '../shared/board.ts';
import { type JsonField, validateJsonConfig } from '../shared/jsonwidget.ts';
import { cachedJsonWidget, fetchJsonWidget } from './jsonwidget.ts';
import { deleteSecret, listSecrets, SECRET_NAME, setSecret } from './secrets.ts';
import { sealOrder } from './sealwidgets.ts';
import { PRESETS } from '../shared/presets.ts';
import { type Pages, validatePages } from '../shared/pages.ts';
import { demoAppStat, demoJson } from './demo-ops.ts';
import { kvGet, kvSet } from './db.ts';
import { type DiunNotice, recordDiunNotice } from './updates.ts';
import { listAudit, recordAudit, recordEvent } from './db.ts';
import { ProblemFeed } from './problems.ts';
import { MAX_PAGES } from '../shared/wall.ts';
import { demoQuotes, quotes } from './markets.ts';
import { samples } from './samples.ts';
import { canFindKey, findKey, keyAddresses, keyContainer } from './keyfind.ts';
import { releaseNotes, repoOf, since } from './release-notes.ts';
import { composeDigest, digestSettings, gatherDigest, saveDigest } from './digest.ts';
import { bmp, drawPanel, png, drawNumberPanel, PANEL_FORMAT } from './panel.ts';
import { historyFor, type Reading, readingOf } from '../shared/reading.ts';
import { addHouseholdDevice, cleanLook, deviceByPanelToken, householdDevices, householdGuard, householdOf, joinHousehold, newJoinToken, newPanelToken, removeHouseholdDevice, setHouseholdView } from './household.ts';
import { checkPassword, noteVisitor, currentUser, endAllSessions, hashPassword, hasSession, login, logout, passwordMatches, readOnlyGuard, requireAuth, securityHeaders, startSession } from './security.ts';
import * as oidc from './oidc.ts';
import { startDeviceFlow, traktDisconnect, traktStatus, whenTraktConnects } from './trakt-auth.ts';
import { checkSelfImage, eligibility, getJob, latestJobFor, selfCheckStatus, startDemoRollback, startDemoUpdate, startRollback, startUpdate, watchJob } from './updater.ts';
import { checkUrl } from './adapters/checks.ts';
import { getCatalog, getYamlCatalog, setCatalogOrder } from './catalog.ts';
import { catalogYaml } from '../shared/catalog-yaml.ts';
import { poster } from './art.ts';
import { clearUpdate } from './updates.ts';
import { adoptYaml, type AppOrder, validateOrder } from '../shared/order.ts';
import { fromHomepage } from './homepage.ts';
import { redact } from './redact.ts';
import { auditCatalog, draftYaml, visitorHost } from './catalog-audit.ts';
import { iconCache, urlIconCache } from './icon-cache.ts';
import { CAR_ART } from '../shared/car-art.ts';
import { feedPicture } from './feed-images.ts';

/** Pause and resume for each configured download client. */
const downloadControls = new Map<DownloadClientId, DownloadControl>();

type Made = {
  adapter: Adapter;
  control?: DownloadControl;
  item?: (id: string, action: ItemAction) => Promise<void>;
  altSpeed?: () => Promise<void>;
  manage?: DownloadManager;
  arr?: ArrControl;
  dns?: DnsControl;
  domains?: DnsDomains;
  seerr?: Omit<SeerrClient, 'adapter'>;
};
const itemControls = new Map<DownloadClientId, (id: string, action: ItemAction) => Promise<void>>();
const altSpeedControls = new Map<DownloadClientId, () => Promise<void>>();
const downloadManagers = new Map<DownloadClientId, DownloadManager>();
const arrControls = new Map<'sonarr' | 'radarr', ArrControl>();
const dnsControls = new Map<'pihole' | 'adguard', DnsControl>();
const dnsDomains = new Map<'pihole' | 'adguard', DnsDomains>();
let seerrApi: Omit<SeerrClient, 'adapter'> | null = null;

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
  // Plex's place: Tautulli when it's set up, else Plex itself.
  tautulli: () => (config.tautulli ? { adapter: tautulliAdapter() } : config.plex ? { adapter: plexAdapter() } : null),
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
  mailcow: () => (config.mailcow ? { adapter: mailcowAdapter() } : null),
  beszel: () => (config.beszel ? { adapter: beszelAdapter() } : null),
  syncthing: () => (config.syncthing ? { adapter: syncthingAdapter() } : null),
  tracearr: () => (config.tracearr ? { adapter: tracearrAdapter() } : null),
  glances: () => (config.glances ? { adapter: glancesAdapter() } : null),
  bitaxe: () => (config.bitaxe?.urls.length ? { adapter: bitaxeAdapter() } : null),
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
    return { adapter: c.adapter, seerr: c };
  },
};

function realAdapters(): Adapter[] {
  const list: Adapter[] = [dockerAdapter(), statsAdapter(), systemAdapter(), checksAdapter()];
  downloadControls.clear();
  itemControls.clear();
  altSpeedControls.clear();
  downloadManagers.clear();
  arrControls.clear();
  dnsControls.clear();
  dnsDomains.clear();
  seerrApi = null;
  for (const [id, make] of Object.entries(FACTORIES)) {
    const m = make();
    if (!m) continue;
    list.push(m.adapter);
    if (m.control) downloadControls.set(id as DownloadClientId, m.control);
    if (m.item) itemControls.set(id as DownloadClientId, m.item);
    if (m.altSpeed) altSpeedControls.set(id as DownloadClientId, m.altSpeed);
    if (m.manage) downloadManagers.set(id as DownloadClientId, m.manage);
    if (m.arr) arrControls.set(id as 'sonarr' | 'radarr', m.arr);
    if (m.dns) dnsControls.set(id as 'pihole' | 'adguard', m.dns);
    if (m.domains) dnsDomains.set(id as 'pihole' | 'adguard', m.domains);
    if (m.seerr) seerrApi = m.seerr;
  }
  return list;
}

loadSavedSettings();
if (config.demo) {
  seedDemoHistory();
  seedDemoSamples();
  seedDemoCar();
}
const adapters = config.demo ? demoAdapters() : realAdapters();
const hub = new Hub(adapters);
{
  const saved = kvGet<AppOrder>('app-order');
  const v = saved ? validateOrder(saved) : null;
  // Keys typed into an app's live number before they moved to the key store.
  const order = v && 'order' in v ? sealOrder(v.order) : null;
  if (order && v && 'order' in v && order !== v.order) kvSet('app-order', order);
  setCatalogOrder(order);
}
initCatalog(() => hub.refreshAlerts());
hub.start();
whenTraktConnects(() => void hub.pollNow('trakt'));
// Keys typed into API widgets before they moved to the key store.
sealSavedBoards();
markExistingInstall();
console.log(`patchboard: ${config.demo ? 'DEMO mode, ' : ''}${adapters.map((a) => a.id).join(', ')}`);

const app = new Hono();
const indexPathForCsp = join(config.staticDir, 'index.html');
app.use('*', securityHeaders(existsSync(indexPathForCsp) ? readFileSync(indexPathForCsp, 'utf8') : null));

// DNS rebinding: a hostile page can point its own hostname at this server's
// address and then call the API from a visitor's browser as same-origin. The
// attacker's hostname still arrives in the Host header, so the API only
// answers requests addressed to an IP literal, localhost, or a hostname listed
// in ALLOWED_HOSTS. Changes must also carry a matching Origin when one is sent.
// (CVE-2024-42364 describes this attack.)
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
    return c.json({ error: `Patchboard refuses requests addressed to ${host ?? 'an unknown host'}. Open Patchboard by its IP address and add the name in Settings, Connections, Sign-in and keys.` }, 403);
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

app.use('/api/*', async (c, next) => {
  noteVisitor(c);
  await next();
});
app.use('/api/*', householdGuard());
app.use('/api/*', requireAuth());
app.use('/api/*', readOnlyGuard());
const who = (c: Parameters<typeof currentUser>[0]) => currentUser(c) ?? '?';

// First run (server/firstrun.ts): towns for the place search, and the sheet done.
app.get('/api/places', async (c) => {
  try {
    return c.json({ places: await findPlaces(c.req.query('q') ?? '', c.req.query('lang') ?? 'en', config.demo) });
  } catch {
    return c.json({ error: "Can't search places right now. Try again, or set it later in Settings." }, 502);
  }
});
app.post('/api/first-run/done', (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  finishFirstRun();
  hub.emitBrand(kvGet('brand') ?? {});
  recordAudit(who(c), 'setup.first-run', 'patchboard');
  return c.json({ ok: true });
});

// The read-only API for scripts and AI tools (server/api.ts), and its keys.
app.route('/api/v1', apiRoutes({ snapshot: () => hub.snapshot(), reading: (w, unit) => panelReading(w, unit) }));
app.get('/api/keys', (c) => c.json({ keys: listKeys() }));
app.post('/api/keys', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const r = createKey(((await c.req.json().catch(() => ({}))) as { name?: unknown }).name);
  if ('error' in r) return c.json({ error: r.error }, 400);
  recordAudit(who(c), 'api-key.add', r.info.name);
  return c.json(r);
});
app.delete('/api/keys/:id', (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const gone = revokeKey(c.req.param('id'));
  if (!gone) return c.json({ error: 'No such key' }, 404);
  recordAudit(who(c), 'api-key.revoke', gone.name);
  return c.json({ ok: true });
});

// Who's here, how sign-in works, and whether changes are allowed.
app.get('/api/session', (c) => c.json({ auth: config.auth.mode, user: currentUser(c), readOnly: config.readOnly, household: householdOf(c)?.name, provider: config.auth.mode === 'oidc' ? config.auth.oidc.name : undefined }));

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
  const r = await login(c, typeof body.password === 'string' ? body.password.slice(0, 500) : '');
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
  // Counted like a sign-in: a stolen session can't guess the password here either.
  if (was === 'password') {
    const r = await checkPassword(c, current);
    if (!r.ok) return c.json({ error: r.status === 429 ? r.error : 'The current password is wrong.' }, r.status === 429 ? 429 : 403);
  }
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

// Household devices: a link per device, made and removed here.
app.get('/api/household', (c) => c.json(householdDevices()));
app.post('/api/household', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
  const made = addHouseholdDevice(typeof body.name === 'string' ? body.name : '');
  if ('error' in made) return c.json(made, 400);
  recordAudit(who(c), 'household.add', made.id, typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '');
  return c.json({ id: made.id, path: `/join/${made.token}`, panel: `/panel/${newPanelToken(made.id)}.png` });
});

// A fresh link for a device; the old one stops working on the next request.
app.post('/api/household/:id/link', (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const token = newJoinToken(c.req.param('id'));
  if (!token) return c.json({ error: 'No such device' }, 404);
  recordAudit(who(c), 'household.link', c.req.param('id'), '');
  return c.json({ path: `/join/${token}` });
});

// A fresh panel address for a device; the old one stops working.
app.post('/api/household/:id/panel', (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const token = newPanelToken(c.req.param('id'));
  if (!token) return c.json({ error: 'No such device' }, 404);
  recordAudit(who(c), 'household.panel', c.req.param('id'), '');
  return c.json({ panel: `/panel/${token}.png` });
});
// Where a device opens, the pages it swipes through, the Monitor's color and
// its night hours, from Settings; the device follows at once.
const OPENS = new Set(['/', '/server', '/monitor', '/upcoming', '/reading', '/weather']);
const isPlace = (v: unknown): v is string => {
  if (typeof v !== 'string') return false;
  if (OPENS.has(v) || (/^\/b\/[\w-]+$/.test(v) && !!getBoard(v.slice(3)))) return true;
  // One widget on its own: /w/<board>/<widget>, for a widget that's on that board.
  const one = /^\/w\/([\w-]+)\/([\w-]+)$/.exec(v);
  return !!one && !!getBoard(one[1])?.board.widgets.some((w) => w.id === one[2]);
};
app.put('/api/household/:id', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown; opens?: unknown; pages?: unknown; rotate?: unknown; tint?: unknown; dim?: unknown; screen?: unknown; look?: unknown };
  let name: string | undefined;
  if (body.name !== undefined) {
    name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
    if (!name || name.length > 40) return c.json({ error: 'Give the device a name of up to 40 characters.' }, 400);
  }
  let opens: string | null | undefined;
  if (body.opens !== undefined) {
    if (body.opens === null || body.opens === '') opens = null;
    else if (isPlace(body.opens)) opens = body.opens;
    else return c.json({ error: 'Pick a page or a board that exists' }, 400);
  }
  const tint = body.tint === undefined ? undefined : body.tint === 'blue' || body.tint === 'color' ? body.tint : null;
  let pages: string[] | null | undefined;
  if (body.pages !== undefined) {
    if (body.pages === null) pages = null;
    else if (Array.isArray(body.pages) && body.pages.length <= MAX_PAGES && body.pages.every(isPlace)) pages = body.pages;
    else return c.json({ error: 'Pick pages and boards that exist' }, 400);
  }
  const rotate = body.rotate === undefined ? undefined : typeof body.rotate === 'number' ? body.rotate : null;
  const dim = body.dim === undefined ? undefined : typeof body.dim === 'string' ? body.dim : null;
  const screen = body.screen === undefined ? undefined : body.screen === 'eink' || body.screen === 'eink-color' ? body.screen : null;
  const look = body.look === undefined ? undefined : (cleanLook(body.look) ?? null);
  const view = setHouseholdView(c.req.param('id'), { name, opens, pages, rotate, tint, dim, screen, look });
  if (!view) return c.json({ error: 'No such device' }, 404);
  recordAudit(who(c), 'household.view', c.req.param('id'), [[view.opens ?? 'wherever', ...(view.pages ?? [])].join(' > '), view.rotate ? `turns every ${view.rotate}s` : '', view.tint ?? 'gray', view.dim ? `dims ${view.dim}` : 'never dims', view.screen === 'eink' ? 'e-ink' : '', name ? `named ${name}` : '', view.look ? `look ${Object.entries(view.look).map(([k, v]) => `${k} ${v}`).join(' ')}` : ''].filter(Boolean).join(', '));
  hub.emitHousehold(c.req.param('id'), view);
  return c.json(view);
});
app.delete('/api/household/:id', (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  if (!removeHouseholdDevice(c.req.param('id'))) return c.json({ error: 'No such device' }, 404);
  recordAudit(who(c), 'household.remove', c.req.param('id'), '');
  return c.json({ ok: true });
});

// Feeds and Releases widgets: the server reads the addresses saved in the
// board; the browser names only the board and the widget.
app.get('/api/rss/:board/:id', async (c) => {
  if (c.req.param('board') === SAMPLE_BOARD) return c.json(demoFeedItems());
  const found = getBoard(c.req.param('board'));
  const w = found?.custom ? found.board.widgets.find((x) => x.id === c.req.param('id') && x.type === 'rss') : undefined;
  const feeds = w?.config?.feeds?.split('\n').filter(Boolean) ?? [];
  // Nothing saved yet: the widget says to save the board, not that the feeds are quiet.
  if (!feeds.length) return c.json({ items: [], failed: [], unsaved: true });
  if (config.demo) return c.json(demoFeedItems());
  return c.json(await readFeeds(feeds));
});

app.get('/api/releases/:board/:id', async (c) => {
  if (c.req.param('board') === SAMPLE_BOARD) return c.json({ releases: demoReleases(['immich-app/immich', 'home-assistant/core', 'jellyfin/jellyfin']) });
  const found = getBoard(c.req.param('board'));
  const w = found?.custom ? found.board.widgets.find((x) => x.id === c.req.param('id') && x.type === 'releases') : undefined;
  const repos = w?.config?.repos?.split('\n').filter(Boolean) ?? [];
  if (!repos.length) return c.json({ releases: [], unsaved: true });
  if (config.demo) return c.json({ releases: demoReleases(repos) });
  return c.json({ releases: await latestReleases(repos) });
});

/** The widget gallery's previews ask for this board: they get made-up items. */
const SAMPLE_BOARD = 'sample';

const CURRENCY_CODES = new Set(Intl.supportedValuesOf('currency'));
// Markets widgets: prices for the lines saved in the board, never for a
// symbol the browser names. Coins are priced in the currency asked for.
app.get('/api/markets/:board/:id', async (c) => {
  if (c.req.param('board') === SAMPLE_BOARD) return c.json({ quotes: demoQuotes(['AAPL', 'VTI', 'BTC'], 'USD') });
  const found = getBoard(c.req.param('board'));
  const w = found?.custom ? found.board.widgets.find((x) => x.id === c.req.param('id') && x.type === 'markets') : undefined;
  const lines = w?.config?.symbols?.split('\n').filter(Boolean) ?? [];
  const asked = (c.req.query('currency') ?? '').toUpperCase();
  // A real currency only: each one is its own request to CoinGecko.
  const currency = CURRENCY_CODES.has(asked) ? asked : 'USD';
  if (!lines.length) return c.json({ quotes: [], unsaved: true });
  return c.json({ quotes: config.demo ? demoQuotes(lines, currency) : await quotes(lines, currency) });
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

// One widget as its own app on a phone's home screen: the install manifest
// for /w/<board>/<widget>, named after the widget, opening it and nothing
// else. Behind sign-in like the rest of the API (the page asks for it with
// credentials), and built from one of the four shipped manifests, so the
// icon matches the one picked in Look.
const MANIFESTS = new Set(['manifest', 'manifest-light', 'manifest-mono', 'manifest-mono-dark']);
app.get('/api/manifest/w/:board/:widget', (c) => {
  const found = getBoard(c.req.param('board'));
  const w = found?.board.widgets.find((x) => x.id === c.req.param('widget'));
  if (!found || !w) return c.json({ error: 'No such widget' }, 404);
  const base = MANIFESTS.has(c.req.query('base') ?? '') ? c.req.query('base')! : 'manifest';
  let shipped: Record<string, unknown> = {};
  try {
    shipped = JSON.parse(readFileSync(join(config.staticDir, `${base}.webmanifest`), 'utf8'));
  } catch {
    // Not built yet (dev): the fields below are enough to install.
  }
  const name = (w.config?.title || WIDGET_INFO[w.type]?.name || 'Widget').slice(0, 40);
  const at = `/w/${encodeURIComponent(c.req.param('board'))}/${encodeURIComponent(w.id)}`;
  const brand = kvGet<{ name?: string }>('brand')?.name || 'Patchboard';
  return c.body(JSON.stringify({ ...shipped, id: at, name: `${name}, ${brand}`, short_name: name, description: WIDGET_INFO[w.type]?.about ?? '', start_url: at, scope: at }), 200, {
    'Content-Type': 'application/manifest+json',
    'Cache-Control': 'no-cache',
  });
});

// The widget gallery's previews: what a widget looks like before its app is
// connected. Made-up data, the same demo mode shows, and never a request to
// anything real; the gallery labels it Sample.
app.get('/api/samples', async (c) => c.json({ sources: await samples((c.req.query('sources') ?? '').split(',').filter(Boolean)) }));

// A household device gets the same picture with every control turned off,
// except the lights and scenes it may still switch.
// What a household device never receives: the inbox is yours, not the family's.
const HOUSEHOLD_HIDDEN = new Set<string>(['fastmail']);
const withoutHidden = <T extends Record<string, unknown>>(sources: T): T => Object.fromEntries(Object.entries(sources).filter(([id]) => !HOUSEHOLD_HIDDEN.has(id))) as T;

app.get('/api/snapshot', (c) => {
  const device = householdOf(c);
  const snap = hub.snapshot();
  return c.json(
    device ? { ...snap, sources: withoutHidden(snap.sources), readOnly: true, household: { ...device, lights: !config.readOnly } } : snap,
  );
});

app.get('/api/events', (c) =>
  streamSSE(c, async (stream) => {
    // A household device's own view changes reach that device and no one else.
    const device = householdOf(c);
    const unsubscribe = hub.subscribe((e) => {
      if (e.type === 'household' && e.id !== device?.id) return;
      if (device && e.type === 'source' && HOUSEHOLD_HIDDEN.has(e.state.id)) return;
      const sent = device && e.type === 'sources' ? { ...e, sources: withoutHidden(e.sources) } : e;
      void stream.writeSSE({ data: JSON.stringify(sent) });
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
    const r = await listEntries({ status, limit: 150, categoryId, ...filter });
    // The reader sees Miniflux as it is now: if the badge's count differs, fetch it again.
    const unread = r.categories.reduce((n, cat) => n + cat.unread, 0);
    if ((hub.snapshot().sources.miniflux?.data as { unread?: number } | null)?.unread !== unread) void hub.pollNow('miniflux');
    return c.json(r);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

// A picture from an article Patchboard handed out; see feed-images.ts.
app.get('/api/feed-img/:entry/:n', async (c) => {
  const got = await feedPicture(c.req.param('entry'), c.req.param('n'));
  if (!got) return c.body(null, 404);
  return c.body(got.body, 200, {
    'Content-Type': got.type,
    'Cache-Control': 'private, max-age=86400',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  });
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
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
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

// A container, or one on another Docker host: pihole@pi.
const NAME = /^[\w.-]{1,128}(@[a-z0-9][a-z0-9-]{0,29})?$/;

// The Monitor page's feed: warning and error lines from every running
// container, one shared set of followers for every screen watching.
const problems = new ProblemFeed(
  () => hub.containers().filter((c) => c.state === 'running').map((c) => c.name),
  config.demo ? demoLogs : followLogs,
);
app.get('/api/monitor/feed', (c) =>
  streamSSE(c, async (stream) => {
    const queue: Promise<void>[] = [];
    const { backlog, unsubscribe } = problems.subscribe((l) => void queue.push(stream.writeSSE({ data: JSON.stringify(l) })));
    for (const l of backlog) await stream.writeSSE({ data: JSON.stringify(l) });
    await new Promise<void>((resolve) => stream.onAbort(() => resolve()));
    unsubscribe();
  }),
);

// One container's detail: inspect (without env), plus who depends on it.
// What an update to this container brings: the releases of the project its
// image names as its source, newer than the version it runs. GitHub only.
app.get('/api/containers/:name/notes', async (c) => {
  const name = c.req.param('name');
  if (!NAME.test(name)) return c.json({ error: 'Bad container name' }, 400);
  if (config.demo) return c.json(demoNotes(name));
  let detail: ContainerDetail;
  try {
    detail = await inspectContainer(name, hub.containers());
  } catch {
    return c.json({ error: 'No such container' }, 404);
  }
  const repo = repoOf(detail.source);
  if (!repo) return c.json({ repo: null, running: detail.version ?? null, releases: [] });
  const notes = await releaseNotes(repo);
  return c.json({ repo, running: detail.version ?? null, releases: notes ? since(notes, detail.version) : null });
});

app.get('/api/containers/:name', async (c) => {
  const name = c.req.param('name');
  if (!NAME.test(name)) return c.json({ error: 'Bad container name' }, 400);
  if (config.demo) {
    const d = demoInspect(name, hub.containers());
    if (d) d.update = name.includes('@') ? { ok: false, reason: "Updates run on Patchboard's own host." } : { ok: true };
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

// Ignore a stopped container, or stop ignoring it: Needs attention leaves it
// out until it runs again (server/alerts.ts). Same action header as below.
app.post('/api/containers/:name/ignore', async (c) => {
  const name = c.req.param('name');
  if (!NAME.test(name)) return c.json({ error: 'Bad container name' }, 400);
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  if (config.readOnly) return c.json({ error: 'Read-only' }, 403);
  const { ignore } = await c.req.json<{ ignore?: boolean }>().catch(() => ({ ignore: undefined }));
  if (typeof ignore !== 'boolean') return c.json({ error: 'Say ignore: true or false' }, 400);
  const list = new Set(kvGet<string[]>('ignored') ?? []);
  if (ignore) list.add(name);
  else list.delete(name);
  kvSet('ignored', [...list]);
  recordAudit(who(c), ignore ? 'container.ignore' : 'container.unignore', name);
  hub.refreshAlerts(true);
  return c.json({ ok: true });
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
  // Stopped on purpose here: Needs attention treats it as a note until it runs again.
  const parked = new Set(kvGet<string[]>('parked') ?? []);
  if (action === 'stop') parked.add(name);
  else parked.delete(name);
  kvSet('parked', [...parked]);
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

// The Downloads page: everything in one client, fetched only while the page
// is open. The snapshot keeps its short summary.
const lastLists = new Map<DownloadClientId, { at: number; list: DownloadList }>();
const managerOf = (id: string): DownloadManager | undefined => (config.demo ? demoManager(id as DownloadClientId) : downloadManagers.get(id as DownloadClientId));

app.get('/api/downloads/:id/list', async (c) => {
  const id = c.req.param('id') as DownloadClientId;
  const m = managerOf(id);
  if (!m) return c.json({ error: 'That client is not set up' }, 404);
  try {
    const list = await m.list();
    lastLists.set(id, { at: Date.now(), list });
    return c.json(list);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

// One download: pause, resume, remove, or remove with its files. Only one
// the client listed, so a request can't name anything else.
app.post('/api/downloads/:id/entries/:entry/:action', async (c) => {
  const id = c.req.param('id') as DownloadClientId;
  const action = c.req.param('action') as EntryAction;
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  if (!['pause', 'resume', 'remove', 'delete'].includes(action)) return c.json({ error: 'Unknown action' }, 400);
  const m = managerOf(id);
  if (!m) return c.json({ error: 'That client is not set up' }, 404);
  try {
    let seen = lastLists.get(id);
    if (!seen || Date.now() - seen.at > 60_000) seen = { at: Date.now(), list: await m.list() };
    const entry = seen.list.entries.find((e) => e.id === c.req.param('entry'));
    if (!entry) return c.json({ error: 'That download is gone' }, 404);
    await m.act(entry, action);
    lastLists.delete(id);
    recordAudit(who(c), `downloads.entry.${action}`, id, entry.name);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
  void hub.pollNow(id);
  return c.json({ ok: true });
});

// One torrent opened up: its files with their priority, its own speed limits
// and its category. Only a download the client listed, and only files,
// categories and limits that are really there.
async function listedEntry(id: DownloadClientId, m: DownloadManager, entryId: string): Promise<DownloadEntry | undefined> {
  let seen = lastLists.get(id);
  if (!seen || Date.now() - seen.at > 60_000) seen = { at: Date.now(), list: await m.list() };
  return seen.list.entries.find((e) => e.id === entryId);
}
const PRIORITIES: FilePriority[] = ['skip', 'normal', 'high'];
// qBittorrent keeps a torrent's limit in 32 bits: past this it wraps around.
const MAX_LIMIT = 2_147_483_647;

app.get('/api/downloads/:id/entries/:entry/detail', async (c) => {
  const id = c.req.param('id') as DownloadClientId;
  const m = managerOf(id);
  if (!m?.detail) return c.json({ error: 'That client can’t open a download' }, 404);
  try {
    const entry = await listedEntry(id, m, c.req.param('entry'));
    if (!entry) return c.json({ error: 'That download is gone' }, 404);
    return c.json((await m.detail(entry)) satisfies TorrentDetail);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

app.post('/api/downloads/:id/entries/:entry/set/:what', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const id = c.req.param('id') as DownloadClientId;
  const what = c.req.param('what');
  const m = managerOf(id);
  if (!m?.detail || !m.change) return c.json({ error: 'That client can’t change a download' }, 404);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const entry = await listedEntry(id, m, c.req.param('entry'));
    if (!entry) return c.json({ error: 'That download is gone' }, 404);
    const detail = await m.detail(entry);
    let change: TorrentChange;
    let said: string;
    if (what === 'files') {
      const have = new Set(detail.files.map((f) => f.index));
      const files = Array.isArray(b.files) ? [...new Set(b.files.map(Number))] : [];
      const priority = b.priority as FilePriority;
      if (!files.length || !files.every((f) => have.has(f)) || !PRIORITIES.includes(priority)) return c.json({ error: 'Pick files from this download, and Skip, Normal or High.' }, 400);
      change = { files, priority };
      said = `${files.length} file${files.length === 1 ? '' : 's'} to ${priority}`;
    } else if (what === 'category') {
      const category = typeof b.category === 'string' ? b.category : '';
      if (!detail.categories || (category && !detail.categories.includes(category))) return c.json({ error: 'Pick one of the client’s categories.' }, 400);
      change = { category };
      said = category || 'no category';
    } else if (what === 'limits') {
      const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_LIMIT ? Math.round(v) : NaN);
      const lim = (b.limits ?? {}) as Record<string, unknown>;
      const down = n(lim.down);
      const up = n(lim.up);
      if (Number.isNaN(down) || Number.isNaN(up)) return c.json({ error: 'Limits are a speed, or none.' }, 400);
      change = { limits: { down, up } };
      said = `down ${down || 'none'}, up ${up || 'none'}`;
    } else return c.json({ error: 'Unknown change' }, 400);
    await m.change(entry, change, detail);
    lastLists.delete(id);
    recordAudit(who(c), `downloads.entry.${what}`, id, `${entry.name}: ${said}`);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
  return c.json({ ok: true });
});

// Add a download: a magnet or web link, or a .torrent or .nzb file as base64.
const DOWNLOAD_FILE_MAX = 10 * 1024 * 1024;
app.post('/api/downloads/:id/add', async (c) => {
  const id = c.req.param('id') as DownloadClientId;
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const m = managerOf(id);
  if (!m) return c.json({ error: 'That client is not set up' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { url?: unknown; name?: unknown; data?: unknown };
  let what: NewDownload;
  if (typeof body.url === 'string') {
    const url = body.url.trim();
    if (url.length > 8000 || !/^(magnet:\?|https?:\/\/)/i.test(url)) return c.json({ error: 'Paste a magnet link or a web address' }, 400);
    what = { url };
  } else if (typeof body.name === 'string' && typeof body.data === 'string') {
    const name = body.name.replace(/[^\w .()[\]-]/g, '_').slice(0, 200);
    if (!/\.(torrent|nzb)$/i.test(name)) return c.json({ error: 'Pick a .torrent or .nzb file' }, 400);
    const data = Buffer.from(body.data, 'base64');
    if (!data.length || data.length > DOWNLOAD_FILE_MAX) return c.json({ error: 'Files can be up to 10 MB' }, 413);
    what = { file: { name, data } };
  } else return c.json({ error: 'Send a link or a file' }, 400);
  try {
    await m.add(what);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
  recordAudit(who(c), 'downloads.add', id, 'url' in what ? what.url.slice(0, 120) : what.file.name);
  lastLists.delete(id);
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

// The Library page: every show or film, what's missing, the whole queue,
// and adding something. Read straight from Sonarr or Radarr while the page
// is open. Anything acted on must be in what the page was last sent.
const libraryOf = (app: string): ArrLibrary | undefined =>
  app !== 'sonarr' && app !== 'radarr' ? undefined : config.demo ? demoLibrary(app) : config[app] ? arrLibrary(app) : undefined;
const libSeen = new Map<string, { at: number; ids: Map<number, string> }>();
const appName = (app: string) => (app === 'sonarr' ? 'Sonarr' : 'Radarr');
const libFail = (c: Context, err: unknown) => c.json({ error: (err as Error).message }, 502);

async function libRead<T>(c: Context, part: 'items' | 'wanted' | 'queue' | 'options', names?: (got: T) => [number, string][]) {
  const app = c.req.param('app')!;
  const lib = libraryOf(app);
  if (!lib) return c.json({ error: `${appName(app)} is not set up` }, 404);
  try {
    const got = (await lib[part]()) as T;
    if (names) libSeen.set(`${app}:${part}`, { at: Date.now(), ids: new Map(names(got)) });
    return c.json(got);
  } catch (err) {
    return libFail(c, err);
  }
}

app.get('/api/library/:app/items', (c) => libRead<LibraryItem[]>(c, 'items', (l) => l.map((i) => [i.id, i.title])));
app.get('/api/library/:app/wanted', (c) => libRead<WantedList>(c, 'wanted', (w) => w.items.map((i) => [i.id, `${i.title} ${i.subtitle ?? ''}`.trim()])));
app.get('/api/library/:app/queue', (c) => libRead<ArrQueueItem[]>(c, 'queue', (q) => q.map((i) => [i.id, i.title])));
app.get('/api/library/:app/options', (c) => libRead<ArrOptions>(c, 'options'));
app.get('/api/library/:app/find', async (c) => {
  const app = c.req.param('app');
  const lib = libraryOf(app);
  if (!lib) return c.json({ error: `${appName(app)} is not set up` }, 404);
  const term = (c.req.query('q') ?? '').trim().slice(0, 100);
  if (!term) return c.json([]);
  try {
    const found = await lib.find(term);
    libSeen.set(`${app}:found`, { at: Date.now(), ids: new Map(found.map((f) => [f.key, f.title])) });
    return c.json(found);
  } catch (err) {
    return libFail(c, err);
  }
});

/** The name of something the page was sent in the last 10 minutes, or undefined. */
const libName = (app: string, part: string, id: number) => {
  const seen = libSeen.get(`${app}:${part}`);
  return seen && Date.now() - seen.at < 600_000 ? seen.ids.get(id) : undefined;
};

const LIB_ACTIONS: Record<string, { part: string; run: (lib: ArrLibrary, id: number, body: Record<string, unknown>) => Promise<unknown> }> = {
  'items:monitor': { part: 'items', run: (lib, id, b) => lib.monitor(id, b.on === true) },
  'items:search': { part: 'items', run: (lib, id) => lib.searchItem(id) },
  'wanted:search': { part: 'wanted', run: (lib, id) => lib.searchWanted(id) },
  'episodes:search': { part: 'episodes', run: (lib, id) => lib.searchWanted(id) },
  'queue:retry': { part: 'queue', run: (lib, id) => lib.retry(id) },
  'queue:remove': { part: 'queue', run: (lib, id) => lib.remove(id) },
};

app.post('/api/library/:app/:part/:id/:action', async (c) => {
  const { app: name, part, action } = c.req.param();
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const lib = libraryOf(name);
  if (!lib) return c.json({ error: `${appName(name)} is not set up` }, 404);
  const step = LIB_ACTIONS[`${part}:${action}`];
  if (!step) return c.json({ error: 'Unknown action' }, 400);
  const id = Number(c.req.param('id'));
  const what = libName(name, step.part, id);
  if (!what) return c.json({ error: 'That is no longer on the list. Reload and try again.' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    await step.run(lib, id, body);
  } catch (err) {
    return libFail(c, err);
  }
  recordAudit(who(c), `library.${part}.${action}${action === 'monitor' ? (body.on === true ? '.on' : '.off') : ''}`, name, what);
  if (part === 'queue') void hub.pollNow(name as ArrApp);
  return c.json({ ok: true });
});

app.get('/api/library/:app/history', async (c) => {
  const app = c.req.param('app');
  const lib = libraryOf(app);
  if (!lib) return c.json({ error: `${appName(app)} is not set up` }, 404);
  try {
    return c.json((await lib.history()) satisfies HistoryItem[]);
  } catch (err) {
    return libFail(c, err);
  }
});

/** Adds to what the page was sent, so two shows open at once both stay actionable. */
function libRemember(app: string, part: string, names: [number, string][]) {
  const old = libSeen.get(`${app}:${part}`);
  const ids = old && Date.now() - old.at < 600_000 ? old.ids : new Map<number, string>();
  for (const [id, name] of names) ids.set(id, name);
  libSeen.set(`${app}:${part}`, { at: Date.now(), ids });
}

// A show opened up: its seasons and episodes, straight from Sonarr.
app.get('/api/library/:app/items/:id/show', async (c) => {
  const app = c.req.param('app');
  const lib = libraryOf(app);
  if (!lib?.show) return c.json({ error: 'Only Sonarr has seasons' }, 404);
  const id = Number(c.req.param('id'));
  const title = libName(app, 'items', id);
  if (!title) return c.json({ error: 'That is no longer on the list. Reload and try again.' }, 404);
  try {
    const show = await lib.show(id);
    const code = (s: number, e: number) => `S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}`;
    libRemember(app, 'episodes', show.episodes.map((e) => [e.id, `${title} ${code(e.season, e.number)}`]));
    libRemember(app, 'seasons', show.seasons.map((s) => [id * 1000 + s.number, `${title} season ${s.number}`]));
    return c.json(show satisfies ShowDetail);
  } catch (err) {
    return libFail(c, err);
  }
});

app.post('/api/library/:app/items/:id/season/:season/:action', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const app = c.req.param('app');
  const lib = libraryOf(app);
  if (!lib?.monitorSeason || !lib.searchSeason) return c.json({ error: 'Only Sonarr has seasons' }, 404);
  const action = c.req.param('action');
  if (action !== 'monitor' && action !== 'search') return c.json({ error: 'Unknown action' }, 400);
  const id = Number(c.req.param('id'));
  const season = Number(c.req.param('season'));
  const what = Number.isInteger(season) && season >= 0 && season < 1000 ? libName(app, 'seasons', id * 1000 + season) : undefined;
  if (!what) return c.json({ error: 'That is no longer on the list. Reload and try again.' }, 404);
  const on = ((await c.req.json().catch(() => ({}))) as { on?: unknown }).on === true;
  try {
    if (action === 'monitor') await lib.monitorSeason(id, season, on);
    else await lib.searchSeason(id, season);
  } catch (err) {
    return libFail(c, err);
  }
  recordAudit(who(c), `library.season.${action}${action === 'monitor' ? (on ? '.on' : '.off') : ''}`, app, what);
  return c.json({ ok: true });
});

app.post('/api/library/:app/search-all', async (c) => {
  const name = c.req.param('app');
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const lib = libraryOf(name);
  if (!lib) return c.json({ error: `${appName(name)} is not set up` }, 404);
  try {
    await lib.searchAll();
  } catch (err) {
    return libFail(c, err);
  }
  recordAudit(who(c), 'library.search-all', name);
  return c.json({ ok: true });
});

// Prowlarr's indexers and Bazarr's missing subtitles, on the Library page.
// Read live while the page is open; acting needs something the page was
// just sent, the same as the rest of Library.
const indexersOf = () => (config.demo ? demoIndexers : prowlarrControl());
const subtitlesOf = () => (config.demo ? demoSubtitles : bazarrControl());
const indexerSeen = { at: 0, names: new Map<number, string>() };
const subtitleSeen = new Map<string, { at: number; item: SubtitleItem }>();
/** Searches Bazarr is still running, so a second press doesn't start another. */
const subtitleSearching = new Set<string>();
const fresh = (at: number) => Date.now() - at < 600_000;

app.get('/api/indexers', async (c) => {
  const ctl = indexersOf();
  if (!ctl) return c.json({ error: 'Prowlarr is not set up' }, 404);
  try {
    const indexers = await ctl.list();
    indexerSeen.at = Date.now();
    indexerSeen.names = new Map(indexers.map((i) => [i.id, i.name]));
    return c.json({ indexers } satisfies IndexerList);
  } catch (err) {
    return libFail(c, err);
  }
});

app.post('/api/indexers/test-all', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const ctl = indexersOf();
  if (!ctl) return c.json({ error: 'Prowlarr is not set up' }, 404);
  try {
    const results = await ctl.testAll();
    recordAudit(who(c), 'indexers.test-all', 'prowlarr', `${results.filter((r) => !r.ok).length} failed`);
    return c.json({ results });
  } catch (err) {
    return libFail(c, err);
  }
});

app.post('/api/indexers/:id/:action', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const ctl = indexersOf();
  if (!ctl) return c.json({ error: 'Prowlarr is not set up' }, 404);
  const action = c.req.param('action');
  if (!['test', 'enable', 'disable'].includes(action)) return c.json({ error: 'Unknown action' }, 400);
  const id = Number(c.req.param('id'));
  const name = fresh(indexerSeen.at) ? indexerSeen.names.get(id) : undefined;
  if (!name) return c.json({ error: 'That is no longer on the list. Reload and try again.' }, 404);
  try {
    if (action === 'test') await ctl.test(id);
    else await ctl.enable(id, action === 'enable');
  } catch (err) {
    // A failed test is an answer, not a fault: say what Prowlarr said.
    return c.json({ error: (err as Error).message }, action === 'test' ? 422 : 502);
  }
  recordAudit(who(c), `indexers.${action}`, 'prowlarr', name);
  if (action !== 'test') void hub.pollNow('prowlarr');
  return c.json({ ok: true });
});

const SUB_KINDS = ['episodes', 'movies'] as const;
app.get('/api/subtitles/:kind', async (c) => {
  const kind = c.req.param('kind') as SubtitleKind;
  if (!SUB_KINDS.includes(kind)) return c.json({ error: 'Unknown list' }, 404);
  const ctl = subtitlesOf();
  if (!ctl) return c.json({ error: 'Bazarr is not set up' }, 404);
  try {
    const list = await ctl.wanted(kind);
    const at = Date.now();
    for (const item of list.items) subtitleSeen.set(`${kind}:${item.id}`, { at, item });
    return c.json(list satisfies SubtitleList);
  } catch (err) {
    return libFail(c, err);
  }
});

app.post('/api/subtitles/:kind/search-all', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const kind = c.req.param('kind') as SubtitleKind;
  if (!SUB_KINDS.includes(kind)) return c.json({ error: 'Unknown list' }, 404);
  const ctl = subtitlesOf();
  if (!ctl) return c.json({ error: 'Bazarr is not set up' }, 404);
  try {
    await ctl.searchAll(kind);
  } catch (err) {
    return libFail(c, err);
  }
  recordAudit(who(c), 'subtitles.search-all', 'bazarr', kind);
  return c.json({ ok: true });
});

app.post('/api/subtitles/:kind/:id/search', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const kind = c.req.param('kind') as SubtitleKind;
  if (!SUB_KINDS.includes(kind)) return c.json({ error: 'Unknown list' }, 404);
  const ctl = subtitlesOf();
  if (!ctl) return c.json({ error: 'Bazarr is not set up' }, 404);
  const seen = subtitleSeen.get(`${kind}:${c.req.param('id')}`);
  if (!seen || !fresh(seen.at)) return c.json({ error: 'That is no longer on the list. Reload and try again.' }, 404);
  const { item } = seen;
  const key = `${kind}:${item.id}`;
  if (subtitleSearching.has(key)) return c.json({ ok: true, waiting: true });
  recordAudit(who(c), 'subtitles.search', 'bazarr', [item.title, item.subtitle].filter(Boolean).join(' '));
  // Bazarr answers once every provider has been asked, which can take a
  // minute. Past a few seconds, the page hears that it's still looking.
  subtitleSearching.add(key);
  const search = ctl
    .search(kind, item)
    .then(
      () => 'done' as const,
      (err: Error) => err,
    )
    .finally(() => subtitleSearching.delete(key));
  const got = await Promise.race([search, new Promise<'waiting'>((r) => setTimeout(() => r('waiting'), 8000))]);
  if (got instanceof Error) return libFail(c, got);
  return c.json({ ok: true, waiting: got === 'waiting' });
});

// Add a show or film found by name, with a quality profile and folder that
// Sonarr or Radarr offered.
app.post('/api/library/:app/add', async (c) => {
  const name = c.req.param('app');
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const lib = libraryOf(name);
  if (!lib) return c.json({ error: `${appName(name)} is not set up` }, 404);
  const b = (await c.req.json().catch(() => ({}))) as { key?: unknown; profile?: unknown; folder?: unknown; search?: unknown };
  const key = Number(b.key);
  if (!libName(name, 'found', key)) return c.json({ error: 'Search for it again, then add it.' }, 404);
  try {
    const options = await lib.options();
    const profile = options.profiles.find((p) => p.id === Number(b.profile));
    const folder = options.folders.find((f) => f.path === b.folder);
    if (!profile || !folder) return c.json({ error: 'Pick a quality and a folder.' }, 400);
    const title = await lib.add({ key, profile: profile.id, folder: folder.path, search: b.search !== false });
    recordAudit(who(c), 'library.add', name, title);
  } catch (err) {
    return libFail(c, err);
  }
  void hub.pollNow(name as ArrApp);
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

// The Ad blocking page: the query log, read live while the page is open, and
// your own allow and block lists, exact domains only.
const domainsOf = (id: string) => (id !== 'pihole' && id !== 'adguard' ? undefined : config.demo ? demoDnsDomains(id) : dnsDomains.get(id));

app.get('/api/dns/:id/log', async (c) => {
  const dom = domainsOf(c.req.param('id'));
  if (!dom) return c.json({ error: 'That blocker is not set up' }, 404);
  const search = (c.req.query('q') ?? '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 100);
  try {
    return c.json({ queries: await dom.log({ search: search || undefined, blocked: c.req.query('blocked') === '1' }) } satisfies DnsLog);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

app.get('/api/dns/:id/domains', async (c) => {
  const dom = domainsOf(c.req.param('id'));
  if (!dom) return c.json({ error: 'That blocker is not set up' }, 404);
  try {
    return c.json((await dom.lists()) satisfies DnsLists);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

const DOMAIN_ACTION = { allow: 'allow', block: 'deny', forget: null } as const;
app.post('/api/dns/:id/domains/:action', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const id = c.req.param('id');
  const dom = domainsOf(id);
  if (!dom) return c.json({ error: 'That blocker is not set up' }, 404);
  const action = c.req.param('action');
  if (!(action in DOMAIN_ACTION)) return c.json({ error: 'Unknown action' }, 400);
  const body = (await c.req.json().catch(() => ({}))) as { domain?: unknown };
  const domain = typeof body.domain === 'string' ? cleanDomain(body.domain) : null;
  if (!domain) return c.json({ error: 'That isn’t a domain name. Try one like ads.example.com.' }, 400);
  try {
    await dom.put(domain, DOMAIN_ACTION[action as keyof typeof DOMAIN_ACTION]);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
  recordAudit(who(c), `dns.${action}`, id, domain);
  return c.json({ ok: true, domain });
});

// Overseerr or Jellyseerr. The Requests page reads its lists straight from
// the app while open, and acts only on what it was last sent.
const requestsApi = () => (config.demo ? demoRequestsApi : seerrApi);
const NO_SEERR = 'Overseerr or Jellyseerr is not set up';

app.get('/api/requests/find', async (c) => {
  const api = requestsApi();
  if (!api) return c.json({ error: NO_SEERR }, 404);
  const term = (c.req.query('q') ?? '').trim().slice(0, 100);
  if (!term) return c.json([]);
  try {
    const found = await api.find(term);
    for (const kind of ['movie', 'tv'] as const) libSeen.set(`requests:found-${kind}`, { at: Date.now(), ids: new Map(found.filter((f) => f.kind === kind).map((f) => [f.key, f.title])) });
    return c.json(found);
  } catch (err) {
    return libFail(c, err);
  }
});

app.get('/api/requests/:which', async (c) => {
  const which = c.req.param('which');
  if (which !== 'waiting' && which !== 'coming') return c.json({ error: 'Unknown list' }, 404);
  const api = requestsApi();
  if (!api) return c.json({ error: NO_SEERR }, 404);
  try {
    const got = await api.list(which);
    libSeen.set(`requests:${which}`, { at: Date.now(), ids: new Map(got.items.map((r) => [r.id, r.title])) });
    return c.json(got);
  } catch (err) {
    return libFail(c, err);
  }
});

// Ask for a film or show just found. Seerr files it as the API key's user,
// usually the admin, so it is approved and sent on at once.
app.post('/api/requests/ask', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const api = requestsApi();
  if (!api) return c.json({ error: NO_SEERR }, 404);
  const b = (await c.req.json().catch(() => ({}))) as { kind?: unknown; key?: unknown };
  const kind = b.kind === 'tv' ? 'tv' : b.kind === 'movie' ? 'movie' : null;
  const key = Number(b.key);
  const title = kind ? libName('requests', `found-${kind}`, key) : undefined;
  if (!kind || !title) return c.json({ error: 'Find it again, then ask.' }, 404);
  try {
    await api.ask(kind, key);
  } catch (err) {
    return libFail(c, err);
  }
  recordAudit(who(c), 'requests.ask', kind, title);
  void hub.pollNow('overseerr');
  return c.json({ ok: true });
});

// Approve or decline a request: one the Home widget or the Requests page was
// shown as waiting, so the route can't touch anything else.
app.post('/api/requests/:id/:action', async (c) => {
  const id = Number(c.req.param('id'));
  const action = c.req.param('action');
  if (action !== 'approve' && action !== 'decline') return c.json({ error: 'Unknown action' }, 400);
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const api = requestsApi();
  if (!api) return c.json({ error: NO_SEERR }, 404);
  const listed = libName('requests', 'waiting', id);
  if (!config.demo && !pendingIds.has(id) && !listed) return c.json({ error: 'That request is not waiting for approval' }, 404);
  try {
    await api.act(id, action);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
  pendingIds.delete(id);
  libSeen.get('requests:waiting')?.ids.delete(id);
  const asked = listed ?? (hub.snapshot().sources.overseerr?.data as SeerrData | null)?.requests.find((r) => r.id === id)?.title;
  recordAudit(who(c), `requests.${action}`, String(id), asked);
  void hub.pollNow('overseerr');
  return c.json({ ok: true });
});

// The Media page: stop a stream, scan a library. Streams are the ones Home's
// Right now shows (Tautulli for Plex, Jellyfin, Emby), so both always agree;
// libraries are read live while the page is open.
const MEDIA_SERVERS: MediaServerId[] = ['plex', 'jellyfin', 'emby'];
const MEDIA_NAME: Record<MediaServerId, string> = { plex: 'Plex', jellyfin: 'Jellyfin', emby: 'Emby' };
const mediaSource = (s: MediaServerId) => (s === 'plex' ? 'tautulli' : s);
const controlOf = (s: MediaServerId) => (config.demo ? demoMediaControl(s) : mediaControl(s));
const librarySeen = new Map<string, { at: number; name: string }>();

app.get('/api/media/libraries', async (c) => {
  const servers = await Promise.all(
    MEDIA_SERVERS.flatMap((id) => {
      const ctl = controlOf(id);
      if (!ctl) return [];
      return [
        (async (): Promise<MediaLibraries['servers'][number]> => {
          try {
            const libraries = await ctl.libraries();
            for (const l of libraries) librarySeen.set(`${id}:${l.id}`, { at: Date.now(), name: l.name });
            return { id, name: MEDIA_NAME[id], libraries, canScan: !!ctl.scan, canOpen: !!ctl.library };
          } catch (err) {
            return { id, name: MEDIA_NAME[id], libraries: [], error: (err as Error).message, canScan: !!ctl.scan, canOpen: !!ctl.library };
          }
        })(),
      ];
    }),
  );
  return c.json({ servers } satisfies MediaLibraries);
});

// One library opened: only one the page was just shown.
app.get('/api/media/:server/library/:library', async (c) => {
  const server = c.req.param('server') as MediaServerId;
  if (!MEDIA_SERVERS.includes(server)) return c.json({ error: 'Unknown server' }, 404);
  const ctl = controlOf(server);
  if (!ctl?.library) return c.json({ error: server === 'plex' ? 'To open a library, add Plex’s address and token: Settings, Connections, Plex.' : `${MEDIA_NAME[server]} is not set up` }, 404);
  const id = c.req.param('library');
  const seen = librarySeen.get(`${server}:${id}`);
  if (!seen || Date.now() - seen.at > 600_000) return c.json({ error: 'Reload the page, then open it.' }, 404);
  try {
    return c.json(await ctl.library(id));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

app.post('/api/media/:server/stop/:session', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const server = c.req.param('server') as MediaServerId;
  if (!MEDIA_SERVERS.includes(server)) return c.json({ error: 'Unknown server' }, 404);
  const ctl = controlOf(server);
  if (!ctl) return c.json({ error: `${MEDIA_NAME[server]} is not set up` }, 404);
  const session = c.req.param('session');
  // Only a stream Right now shows: nothing else can be stopped from here.
  const stream = ((hub.snapshot().sources[mediaSource(server)]?.data as { streams?: Stream[] } | null)?.streams ?? []).find((s) => s.session === session);
  if (!stream) return c.json({ error: 'That stream has already ended.' }, 404);
  try {
    await ctl.stop(session);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
  recordAudit(who(c), 'media.stop', server, `${stream.user}: ${[stream.title, stream.subtitle].filter(Boolean).join(' ')}`);
  void hub.pollNow(mediaSource(server));
  return c.json({ ok: true });
});

app.post('/api/media/:server/scan/:library', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const server = c.req.param('server') as MediaServerId;
  if (!MEDIA_SERVERS.includes(server)) return c.json({ error: 'Unknown server' }, 404);
  const ctl = controlOf(server);
  if (!ctl?.scan) return c.json({ error: server === 'plex' ? 'Scanning needs Plex’s address and token: Settings, Connections, Plex.' : `${MEDIA_NAME[server]} is not set up` }, 404);
  const id = c.req.param('library');
  const seen = librarySeen.get(`${server}:${id}`);
  if (!seen || Date.now() - seen.at > 600_000) return c.json({ error: 'Reload the page, then scan.' }, 404);
  try {
    await ctl.scan(id);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
  recordAudit(who(c), 'media.scan', server, seen.name);
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

// Chores: when each one on a Chores widget was last done. Keyed by board and
// widget, so two boards keep their own. Household devices may mark one done;
// that's what a chore chart on the wall is for.
type ChoreTimes = Record<string, Record<string, number>>;
const choreWidget = (board: string, id: string) => getBoard(board)?.board.widgets.find((w) => w.id === id && w.type === 'chores');
app.get('/api/chores/:board/:id', (c) => {
  const w = choreWidget(c.req.param('board'), c.req.param('id'));
  if (!w) return c.json({ error: 'No such Chores widget' }, 404);
  return c.json({ done: (kvGet<ChoreTimes>('chores') ?? {})[`${c.req.param('board')}/${w.id}`] ?? {} });
});
app.post('/api/chores/:board/:id', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const board = c.req.param('board');
  const w = choreWidget(board, c.req.param('id'));
  if (!w) return c.json({ error: 'No such Chores widget' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown; at?: unknown };
  const chore = parseChores(w.config?.chores).find((x) => x.name === body.name);
  if (!chore) return c.json({ error: 'That chore is not on this widget' }, 400);
  // Done now, or put back to when it was done before (Undo). Never in the future.
  const at = body.at === null ? null : typeof body.at === 'number' && body.at > 0 && body.at <= Date.now() ? body.at : Date.now();
  const all = kvGet<ChoreTimes>('chores') ?? {};
  const key = `${board}/${w.id}`;
  const mine = { ...(all[key] ?? {}) };
  if (at === null) delete mine[chore.name];
  else mine[chore.name] = at;
  kvSet('chores', { ...all, [key]: mine });
  recordAudit(who(c), 'chores.done', key, chore.name);
  return c.json({ ok: true, done: mine });
});

// The last day of the sensors pinned to a Rooms widget, for its strips.
// Asked of Home Assistant at most every five minutes for the same set.
const roomHistory = new Map<string, { at: number; value: Promise<Record<string, [number, number][]>> }>();
app.get('/api/ha/history', async (c) => {
  const pinned = pinnedAnywhere();
  const ids = [...new Set((c.req.query('ids') ?? '').split(','))].filter((id) => id.startsWith('sensor.') && pinned.has(id)).slice(0, 24);
  if (!ids.length) return c.json({ history: {} });
  if (config.demo) return c.json({ history: demoHaHistory(ids) });
  if (!config.homeassistant) return c.json({ error: 'Home Assistant is not configured' }, 404);
  const key = ids.sort().join(',');
  const hit = roomHistory.get(key);
  if (!hit || Date.now() - hit.at > 5 * 60_000) {
    if (roomHistory.size > 50) roomHistory.clear();
    roomHistory.set(key, { at: Date.now(), value: haHistory(ids).catch((err) => (roomHistory.delete(key), Promise.reject(err))) });
  }
  try {
    return c.json({ history: await roomHistory.get(key)!.value });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

// A Home Assistant to-do list pinned to a List widget: its items, then adding
// one or ticking one off. Household devices may do both; that's the point of
// a shopping list on the fridge.
const isTodo = (entity: string) => entity.startsWith('todo.') && pinnedAnywhere().has(entity);
app.get('/api/ha/todo/:entity', async (c) => {
  const entity = c.req.param('entity');
  if (!isTodo(entity)) return c.json({ error: 'Pin that list to a List widget first' }, 403);
  try {
    if (config.demo) return c.json({ items: demoTodo(entity) });
    if (!config.homeassistant) return c.json({ error: 'Home Assistant is not configured' }, 404);
    return c.json({ items: await haTodoItems(entity) });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});
app.post('/api/ha/todo/:entity', async (c) => {
  const entity = c.req.param('entity');
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  if (!isTodo(entity)) return c.json({ error: 'Pin that list to a List widget first' }, 403);
  const body = (await c.req.json().catch(() => ({}))) as { add?: unknown; done?: unknown; undo?: unknown };
  const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : undefined);
  const change = { add: text(body.add, 200), done: text(body.done, 200), undo: text(body.undo, 200) };
  if (!change.add && !change.done && !change.undo) return c.json({ error: 'Say what to add or tick off' }, 400);
  try {
    if (config.demo) demoTodoChange(entity, change);
    else if (config.homeassistant) await haTodoChange(entity, change);
    else return c.json({ error: 'Home Assistant is not configured' }, 404);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
  recordAudit(who(c), change.add ? 'ha.todo.add' : 'ha.todo.tick', entity, change.add ?? '');
  return c.json({ ok: true });
});

// Toggle a light, run a scene, set a thermostat or move a shade. Only
// entities pinned on the saved board, and only what shared/ha.ts allows, so a
// stolen session can't open a lock or a garage door.
const HA_ACTIONS = new Set(['toggle', 'run', 'set', 'open', 'close', 'stop']);
app.post('/api/ha/:entity/:action', async (c) => {
  const entity = c.req.param('entity');
  const action = c.req.param('action') as HaAction;
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  if (!HA_ACTIONS.has(action)) return c.json({ error: 'Unknown action' }, 400);
  if (!pinnedAnywhere().has(entity)) return c.json({ error: 'Pin that entity to a Home Assistant widget first' }, 403);
  const extra: Record<string, number> = {};
  if (action === 'toggle' || action === 'run') {
    if (haActionFor(entity) !== action) return c.json({ error: 'Patchboard does not change that kind of entity' }, 403);
  } else {
    // Its class and range come from Home Assistant now, not from the browser.
    let e: HaEntity | undefined;
    try {
      e = config.demo ? demoHaList().find((x) => x.id === entity) : config.homeassistant ? await haEntity(entity) : undefined;
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502);
    }
    if (!e) return c.json({ error: 'Home Assistant has no such entity' }, 404);
    if (!haAllows(entity, action, e.deviceClass)) return c.json({ error: 'Patchboard does not change that kind of entity' }, 403);
    if (action === 'set') {
      const body = (await c.req.json().catch(() => ({}))) as { temperature?: unknown };
      const t = Number(body.temperature);
      const min = e.attrs?.min ?? 7;
      const max = e.attrs?.max ?? 35;
      if (!Number.isFinite(t) || t < min || t > max) return c.json({ error: `Pick a temperature from ${min} to ${max}` }, 400);
      extra.temperature = Math.round(t * 2) / 2;
    }
  }
  try {
    if (config.demo) demoHaAction(entity, action, extra);
    else if (config.homeassistant) await haCall(entity, action, extra);
    else return c.json({ error: 'Home Assistant is not configured' }, 404);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
  recordAudit(who(c), `ha.${action}`, entity, extra.temperature != null ? `to ${extra.temperature}` : '');
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
  if (config.demo) return c.json({ ok: true, summary: 'The address and key are filled in. Demo mode has nothing to connect to.' });
  try {
    const summary = await withConfig(candidate(checked.values), () => testIntegration(i.id));
    return c.json({ ok: true, summary });
  } catch (err) {
    return c.json({ ok: false, error: (err as Error).message });
  }
});

/** "Fill in the address and API key first.": the fields' own names, not environment variables. */
function fillIn(gaps: string[]): string {
  // "Address" reads "the address"; a name (Goodreads, Patchboard) keeps its capital.
  const names = [...new Set(gaps.map((g) => fieldLabel(g)).map((l) => (/^(Goodreads|Patchboard|Tailnet)\b/.test(l) ? l : l.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase()))))];
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
  // Save says whether it connects, so a typo shows now instead of as a quiet Off.
  // Notification channels skip it: their test sends you a message.
  let check: { ok: boolean; text: string } | undefined;
  if (!NOTIFY_IDS.includes(i.id)) {
    try {
      check = { ok: true, text: await testIntegration(i.id) };
    } catch (err) {
      check = { ok: false, text: (err as Error).message };
    }
  }
  return c.json({ integrations: describeSetup(), ...(check ? { check } : {}) });
});
const NOTIFY_IDS = ['ntfy', 'gotify', 'pushover', 'email', 'discord', 'webhook'];

// The weekly summary: its settings, and what it would say now.
app.get('/api/digest', (c) => {
  const now = Date.now();
  const { lastSent: _, ...settings } = digestSettings();
  const preview = composeDigest(config.demo ? demoDigestInput(hub.digestNow()) : gatherDigest(now, hub.digestNow()));
  return c.json({ ...settings, preview: { title: preview.title, body: preview.body }, channels: channels() });
});
app.put('/api/digest', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const r = saveDigest(await c.req.json().catch(() => null));
  if ('error' in r) return c.json(r, 400);
  recordAudit(who(c), 'digest.save', r.on ? `weekly, day ${r.day} at ${r.hour}:00` : 'off');
  const { lastSent: _, ...settings } = r;
  return c.json(settings);
});
// Send one now, to see it where it lands.
app.post('/api/digest/send', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  if (!anyNotifier()) return c.json({ error: 'Set up a way to be told first, under Where alerts go.' }, 400);
  // One a minute: enough to see it land, too slow to flood a channel.
  if (Date.now() - lastDigestTry < 60_000) return c.json({ error: 'Sent one a moment ago. Try again in a minute.' }, 429);
  lastDigestTry = Date.now();
  try {
    await send(composeDigest(config.demo ? demoDigestInput(hub.digestNow()) : gatherDigest(Date.now(), hub.digestNow())));
    recordAudit(who(c), 'digest.send', 'now');
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});
let lastDigestTry = 0;

// Connect an *arr app with the key in its own settings (server/keyfind.ts).
// The key goes from the container to the encrypted store and nowhere else:
// it's tested first, saved only if the app answers, and the browser hears
// the outcome. Each try counts toward the same pause as Test.
app.post('/api/setup/integrations/:id/find-key', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const i = setupIntegration(c.req.param('id'));
  if (!i || !canFindKey(i.id)) return c.json({ error: "Patchboard can't read this app's key." }, 404);
  if (config.demo) return c.json({ error: 'Demo mode has no settings file to read. Paste a key to try the form.' }, 400);
  if (Date.now() - (lastTest.get(i.id) ?? 0) < 2000) return c.json({ error: 'One try at a time. Try again in a moment.' }, 429);
  const body = (await c.req.json().catch(() => null)) as { container?: unknown; url?: unknown } | null;
  const which = keyContainer(i.id, body?.container, hub.containers());
  if ('error' in which) return c.json({ error: which.error }, 400);
  const [urlVar, keyVar] = i.env;
  lastTest.set(i.id, Date.now());
  let key: string;
  let addresses: string[];
  try {
    // Where the key may go comes from Docker, never from the request.
    addresses = await keyAddresses(i.id, which.container.name);
    if (!addresses.length) throw new Error(`${which.container.name} publishes no port Patchboard can reach, and shares no network with it. Fill in its address and key by hand.`);
    key = await findKey(i.id, which.container.name);
  } catch (err) {
    recordAudit(who(c), 'setup.find-key', i.id, `from ${which.container.name}: not found`);
    return c.json({ error: (err as Error).message }, 400);
  }
  // The first of its own addresses that answers with the key is the one kept.
  let values: Record<string, string> | null = null;
  let why = '';
  for (const url of addresses) {
    try {
      await withConfig(candidate({ [urlVar]: url, [keyVar]: key }), () => testIntegration(i.id));
      values = { [urlVar]: url, [keyVar]: key };
      break;
    } catch (err) {
      why = (err as Error).message;
    }
  }
  if (!values) {
    recordAudit(who(c), 'setup.find-key', i.id, `from ${which.container.name}: found, did not connect`);
    return c.json({ error: `Found the key, but ${i.name} didn't answer at ${addresses.join(' or ')}. ${why}`.trim() }, 400);
  }
  saveValues(values);
  recordAudit(who(c), 'setup.find-key', i.id, `from ${which.container.name}: saved`);
  hub.replaceAdapters(realAdapters());
  return c.json({ integrations: describeSetup(), check: { ok: true, text: await testIntegration(i.id).catch(() => 'Connected.') } });
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
  kvSet('app-order', sealOrder(v.order));
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
  kvSet('app-order', sealOrder(v.order));
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
  if (id === 'dockerhosts') {
    const hosts = config.dockerHosts;
    if (!hosts.length) throw new Error('No host read. Use name=tcp://address:port, such as pi=tcp://192.168.1.20:2375.');
    const lines = await Promise.all(
      hosts.map(async (h) => {
        try {
          const v = await getJson<{ Version?: string }>(`http://${h.host}:${h.port}/version`, {}, 6000);
          return `${h.name}: Docker ${v.Version ?? ''}`.trim();
        } catch (err) {
          throw new Error(`${h.name} didn't answer at ${h.host}:${h.port}. ${(err as Error).message}`);
        }
      }),
    );
    return `${lines.join(', ')}.`;
  }
  if (id === 'wake') {
    const n = config.wake.devices.length;
    if (!n) throw new Error('No machine parsed. Use Name=aa:bb:cc:dd:ee:ff, comma-separated.');
    return `${n} machine${n === 1 ? '' : 's'} ready: ${config.wake.devices.map((d) => d.name).join(', ')}.`;
  }
  if (id === 'ntfy' || id === 'gotify' || id === 'pushover' || id === 'email' || id === 'discord' || id === 'webhook') {
    if (!config.notify[id]) throw new Error("Patchboard couldn't use these settings. Check the address starts with http:// or https:// and the other values for typos.");
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
  if (id === 'plex') {
    const n = (await plexSections()).length;
    return `Connected: ${n} ${n === 1 ? 'library' : 'libraries'}.`;
  }
  if (id === 'dozzle') {
    await request(config.dozzleUrl!, {}, 8000);
    return 'Dozzle answered.';
  }
  // Hardcover and Goodreads share one source.
  const made = FACTORIES[id === 'hardcover' || id === 'goodreads' ? 'books' : id]?.();
  if (!made) throw new Error("Patchboard couldn't use these settings. Check the address starts with http:// or https:// and the other values for typos.");
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
  // An update recreates the container and starts it, stopped or not, as compose does.
  if (config.demo) return c.json(startDemoUpdate(name, () => (demoContainerAction(name, 'start', 0), done())));
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
  recordAudit(who(c), 'container.rollback', c.req.param('id'));
  try {
    return c.json(
      await (config.demo ? startDemoRollback : startRollback)(c.req.param('id'), () => {
        // The demo's container comes back recreated, as a real one does.
        if (config.demo) {
          const ctr = getJob(c.req.param('id'))?.container;
          if (ctr) demoContainerAction(ctr, 'start', 0);
        }
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
      if (j.status === 'done' || j.status === 'failed') finished = true;
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

// Patchboard's releases with their notes, so Home can say what an update brings.
app.get('/api/self/releases', async (c) => c.json({ version: APP_VERSION, releases: config.demo ? demoSelfReleases(APP_VERSION) : await selfReleases() }));

// Check for a newer Patchboard now, instead of waiting for the hourly look.
// The answer also settles the update mark, both ways.
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
  if (text.length > 16_000) return c.json({ error: 'The saved look is over 16,000 characters.' }, 413);
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
  // Entities pinned just now show at once, not at Home Assistant's next poll.
  if (pinnedEntities(v.board).size) void hub.pollNow('homeassistant');
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
  // Entities pinned just now show at once, not at Home Assistant's next poll.
  if (pinnedEntities(v.board).size) void hub.pollNow('homeassistant');
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
  kvSet('app-order', sealOrder(v.order));
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

// The whole setup as one file, JSON or YAML (?format=yaml). Import takes either.
app.get('/api/setup', (c) => {
  const yaml = c.req.query('format') === 'yaml';
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
  const name = `patchboard-setup-${new Date().toISOString().slice(0, 10)}`;
  if (yaml)
    return c.body(`# Patchboard setup. Import it in Settings, Connections, Backup.\n# Keys and integrations aren't in it.\n${stringifyYaml(body, { lineWidth: 0 })}`, 200, {
      'Content-Type': 'application/yaml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}.yaml"`,
    });
  return c.body(JSON.stringify(body, null, 2), 200, {
    'Content-Type': 'application/json',
    'Content-Disposition': `attachment; filename="${name}.json"`,
  });
});

app.put('/api/setup', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const text = await c.req.text();
  if (text.length > 5 * 1024 * 1024) return c.json({ error: 'A setup file can be up to 5 MB' }, 413);
  // YAML reads JSON too, so one parser takes either file.
  let parsed: unknown = null;
  try {
    parsed = parseYaml(text, { maxAliasCount: 50 });
  } catch {
    return c.json({ error: "Patchboard can't read that file as JSON or YAML." }, 400);
  }
  const raw = (parsed && typeof parsed === 'object' ? parsed : null) as { patchboard?: string; board?: unknown; boards?: unknown; apps?: unknown; pages?: unknown; brand?: unknown; notes?: unknown; thresholds?: unknown } | null;
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
  kvSet('app-order', apps ? sealOrder(apps.order) : null);
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

// Your own app icon, drawn at every size by the browser that uploads it.
app.put('/api/app-icon', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  if (Number(c.req.header('content-length') ?? 0) > 3 * 1024 * 1024) return c.json({ error: 'The icon came out over 2 MB. Try a simpler image.' }, 413);
  const r = saveAppIcon(await c.req.json().catch(() => null));
  if ('error' in r) return c.json({ error: r.error }, 400);
  recordAudit(who(c), 'app-icon.set', 'look', r.icon);
  hub.emitBrand(kvGet('brand') ?? {});
  return c.json(r);
});

app.delete('/api/app-icon', (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  clearAppIcon();
  recordAudit(who(c), 'app-icon.clear', 'look');
  hub.emitBrand(kvGet('brand') ?? {});
  return c.json({ ok: true });
});

// Uploaded icons. Named by content hash, so the same file uploads once and
// can be cached forever. Served with a sandboxing CSP: an SVG opened directly
// can't run script.
const ICON_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/gif': 'gif', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico' };
const ICON_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', gif: 'image/gif', ico: 'image/x-icon' };
const iconDir = join(config.dataDir, 'icons');
/** Browsers shrink big photos first; this is for SVGs and animated GIFs, which they send as they are. */
const ICON_MAX = 10 * 1024 * 1024;

app.post('/api/icons', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  const ext = ICON_TYPES[(c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase()];
  if (!ext) return c.json({ error: 'Use a PNG, JPEG, WebP, SVG, GIF or ICO image' }, 415);
  if (Number(c.req.header('content-length') ?? 0) > ICON_MAX) return c.json({ error: 'Icons can be up to 10 MB' }, 413);
  const body = Buffer.from(await c.req.arrayBuffer());
  if (!body.length || body.length > ICON_MAX) return c.json({ error: 'Icons can be up to 10 MB' }, 413);
  const name = `${createHash('sha256').update(body).digest('hex').slice(0, 16)}.${ext}`;
  mkdirSync(iconDir, { recursive: true });
  writeFileSync(join(iconDir, name), body);
  recordAudit(who(c), 'icon.upload', name);
  return c.json({ icon: `/api/icons/${name}` });
});

// Ask the car to do something: lock, open the frunk, start charging. Only a
// car Tessie listed in its last poll, only from a full session (household
// devices never reach here), and every command is audited.
app.post('/api/car/:vin/command/:cmd', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  if (config.readOnly) return c.json({ error: 'Read-only' }, 403);
  const vin = c.req.param('vin');
  const cmd = c.req.param('cmd');
  if (!isCarCommand(cmd)) return c.json({ error: 'Unknown command' }, 400);
  // Unlocking or opening the car needs sign-in: an address anyone can reach never opens it.
  if (OPENS_CAR.includes(cmd) && config.auth.mode === 'none') return c.json({ error: 'Turn on sign-in to unlock or open the car from here' }, 403);
  const cars = (hub.snapshot().sources.tessie?.data as CarData | null)?.cars ?? [];
  if (!cars.some((x) => x.vin === vin)) return c.json({ error: 'No such car' }, 404);
  let percent: number | undefined;
  if (cmd === 'limit') {
    const body = (await c.req.json().catch(() => null)) as { percent?: unknown } | null;
    const p = checkLimit(body?.percent);
    if (p == null) return c.json({ error: 'A charge limit is 50 to 100%' }, 400);
    percent = p;
  }
  try {
    await (config.demo ? demoCarCommand(cmd, percent) : tessieCommand(vin, cmd, percent));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
  recordAudit(who(c), `car.${cmd}`, percent != null ? `${vin}: ${percent}%` : vin);
  void hub.pollNow('tessie');
  return c.json({ ok: true });
});

// The built-in drawings of each car (shared/car-art.ts). Only names the
// catalog lists are served, so the path never leaves server/car-art.
app.get('/api/car-art/:car/:file', (c) => {
  const art = CAR_ART.find((a) => a.id === c.req.param('car'));
  const view = /^([a-z0-9]+)\.webp$/.exec(c.req.param('file'))?.[1];
  if (!art || !view || !art.views.some((v) => v.view === view)) return c.json({ error: 'No such drawing' }, 404);
  try {
    const data = readFileSync(new URL(`./car-art/${art.id}/${view}.webp`, import.meta.url));
    return c.body(data, 200, { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=86400' });
  } catch {
    return c.json({ error: 'No such drawing' }, 404);
  }
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

// App icons by name, from the dashboard-icons set, fetched once and kept in
// the data folder. Sandboxed like uploads: an SVG opened directly can't run script.
// A name the set doesn't draw is looked up in both sets' indexes
// (server/icon-index.ts): an alias, the name without "-ce" or "-server", or
// an icon only selfh.st has.
const icons = iconCache(join(config.dataDir, 'icon-cache'));
const selfhstIcons = iconCache(join(config.dataDir, 'icon-cache', 'selfhst'), 'https://cdn.jsdelivr.net/gh/selfhst/icons');
const iconIdx = iconIndex(join(config.dataDir, 'icon-cache'));
app.get('/api/icon/:kind/:file', async (c) => {
  const kind = c.req.param('kind');
  const file = c.req.param('file');
  let got = await icons.get(kind, file);
  if (!got && /^(png|svg|webp)$/.test(kind)) {
    const base = file.replace(/\.(png|svg|webp)$/, '');
    const r = await iconIdx.resolve([base]);
    if (r?.set === 'dash' && r.ref !== base) got = await icons.get(kind, `${r.ref}.${kind}`);
    else if (r?.set === 'selfhst') got = await selfhstIcons.get(kind, `${r.ref}.${kind}`);
  }
  if (!got) return c.json({ error: 'No such icon' }, 404);
  return c.body(got.body, 200, {
    'Content-Type': got.type,
    'Cache-Control': 'private, max-age=604800',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  });
});

// An icon given as a full address, fetched and served by Patchboard: a
// plain-HTTP LAN image can't load into a page served over HTTPS, and the
// browser never calls another site. Only addresses an app, link or hidden
// app in the catalog uses as its icon, so this can't fetch anything else.
const urlIcons = urlIconCache(join(config.dataDir, 'icon-cache', 'url'));
function catalogIconUrls(): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) {
        if (k === 'icon' && typeof x === 'string' && /^https?:\/\//.test(x)) out.add(x);
        else walk(x);
      }
  };
  walk(getCatalog());
  return out;
}
app.get('/api/icon-url', async (c) => {
  const url = c.req.query('u') ?? '';
  // A demo anyone can open never fetches an address a visitor typed.
  if (config.demo) return c.json({ error: 'No such icon' }, 404);
  if (!catalogIconUrls().has(url)) return c.json({ error: 'No such icon' }, 404);
  const got = await urlIcons.get(url);
  if (!got) return c.json({ error: 'No such icon' }, 404);
  return c.body(got.body, 200, {
    'Content-Type': got.type,
    'Cache-Control': 'private, max-age=86400',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  });
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
  // Each found app's icon: the first of its image, container and service names either icon set draws.
  await Promise.all(
    audit.discovered.map(async (d) => {
      const ctr = containers.find((x) => x.name === d.container);
      const repo = ctr?.image.replace(/@sha256:.*/, '').replace(/:[^/]+$/, '').split('/').pop();
      const r = await iconIdx.resolve([d.icon.replace(/\.png$/, ''), repo ?? '', d.container, ctr?.service ?? '', d.name].filter(Boolean));
      if (r) d.icon = `${r.ref}.png`;
    }),
  );
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

// Another Docker host's CPU by hour, busiest containers and disks, from Beszel (Server page, ?host=).
app.get('/api/hosts/:name/beszel', async (c) => {
  const name = c.req.param('name');
  if (!NAME.test(name)) return c.json({ error: 'Bad host name' }, 400);
  try {
    const detail = config.demo ? demoHostDetail(name) : await beszelHostDetail(name);
    return detail ? c.json(detail) : c.json({ error: 'Beszel has no system by this name' }, 404);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
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
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch {
    return c.body(null, 404);
  }
});

// Frigate pictures: a camera's newest frame (?camera=) or an event's
// thumbnail (?event=). Frames stream straight through, never held in memory.
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
        // A camera's frame is new every few seconds; an event's thumbnail never changes.
        'Cache-Control': q.camera ? 'no-store' : 'private, max-age=86400',
      },
    });
  } catch {
    return c.body(null, 404);
  }
});

// A camera live, while a viewer is open. Frigate's motion-JPEG stream passes
// straight through (see frigateLive): no buffering, closed with the viewer.
app.get('/api/live/frigate', async (c) => {
  if (config.demo) return c.json({ error: 'The demo has no cameras to stream.' }, 404);
  if (!config.frigate) return c.body(null, 404);
  try {
    const res = await frigateLive(c.req.query('camera') ?? '', c.req.raw.signal);
    if (res === 'busy') return c.json({ error: `${LIVE_MAX} live views are open already. Close one to watch this camera.` }, 429);
    return res;
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

app.get('/api/img/tautulli', async (c) => {
  if (config.demo || !config.tautulli) return c.body(null, 404);
  try {
    const res = await tautulliImage(c.req.query('path') ?? '');
    return new Response(res.body, {
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch {
    return c.body(null, 404);
  }
});

app.get('/api/img/plex', async (c) => {
  if (config.demo || !config.plex) return c.body(null, 404);
  try {
    const res = await plexImage(c.req.query('path') ?? '');
    return new Response(res.body, {
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch {
    return c.body(null, 404);
  }
});

// A 3D printer's preview of the print on it, from Home Assistant.
app.get('/api/img/ha-printer', async (c) => {
  if (config.demo) return c.body(DEMO_PRINT_SVG, 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, max-age=86400' });
  if (!config.homeassistant) return c.body(null, 404);
  try {
    const res = await haPrinterCover(c.req.query('id') ?? '');
    return new Response(res.body, {
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/png',
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch {
    return c.body(null, 404);
  }
});

app.get('/api/img/audiobookshelf', async (c) => {
  if (config.demo || !config.audiobookshelf) return c.body(null, 404);
  try {
    const res = await audiobookshelfCover(c.req.query('id') ?? '');
    return new Response(res.body, {
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch {
    return c.body(null, 404);
  }
});

app.get('/healthz', (c) => c.text('ok'));

// Opening a household link: keep it in this browser, then show Home.
// A signed-in browser that opens a household link asks first: otherwise
// anyone holding a link could send it to you and turn your browser into a
// household device, signed out. The answer comes back as a POST from this
// page only.
const joinPage = (body: string) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Patchboard</title><body style="font:16px system-ui;margin:2rem;max-width:32rem">${body}</body>`;
app.get('/join/:token', (c) => {
  c.header('Cache-Control', 'no-store');
  if (hasSession(c)) {
    const token = c.req.param('token').replace(/[^\w-]/g, '');
    return c.html(
      joinPage(
        `<h1 style="font-size:1.4rem">Make this browser a household device?</h1><p>This browser is signed in to Patchboard. As a household device it sees the boards and can't change anything, and it signs out here. Open the link on the tablet or phone it was made for instead.</p><form method="post" action="/join/${token}"><button type="submit" style="font:inherit;padding:.5rem 1rem">Make it a household device</button></form><p><a href="/">Keep this browser as it is</a></p>`,
      ),
    );
  }
  if (!joinHousehold(c, c.req.param('token'))) {
    return c.html('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Patchboard</title><body style="font:16px system-ui;margin:2rem;max-width:32rem"><h1 style="font-size:1.4rem">This link no longer works</h1><p>Whoever runs Patchboard removed it or made a new one. Ask them for a fresh link.</p></body>', 404);
  }
  // A household device keeps no password session: removing it later can't
  // leave the browser signed in with full access.
  logout(c);
  return c.redirect('/', 302);
});

app.post('/join/:token', (c) => {
  c.header('Cache-Control', 'no-store');
  // Only the question page above may answer it.
  const origin = c.req.header('origin');
  if (!origin || new URL(origin).host !== c.req.header('host')) return c.text('Open the link again to join', 403);
  if (!joinHousehold(c, c.req.param('token'))) return c.text('This link no longer works', 404);
  logout(c);
  return c.redirect('/', 302);
});

// The server as a picture for an e-paper panel (TRMNL, Inky, an ESP32): a
// household device's link token opens it, since such a screen keeps no
// cookie. /panel/<token>.png or .bmp; ?w= and ?h= for the panel's size,
// ?units=c or f, ?clock=24, ?invert=1.
app.get('/panel/:file', async (c) => {
  c.header('Cache-Control', 'no-store');
  const m = /^([\w-]{20,100})\.(png|bmp)$/.exec(c.req.param('file'));
  const device = m ? deviceByPanelToken(m[1]) : null;
  if (!m || !device) return c.text('No such panel', 404);
  const num = (v: string | undefined, lo: number, hi: number, d: number) => Math.min(hi, Math.max(lo, Math.round(Number(v) || d)));
  const w = num(c.req.query('w'), 200, 2560, 800);
  const h = num(c.req.query('h'), 120, 2560, 480);
  const american = (process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? '').startsWith('America/');
  const o = {
    w,
    h,
    f: (c.req.query('units') ?? (american ? 'f' : 'c')) === 'f',
    clock24: (c.req.query('clock') ?? (american ? '12' : '24')) === '24',
    invert: c.req.query('invert') === '1',
  };
  // ?widget=<board>/<widget>: that widget as one number, in place of the server summary.
  const pick = /^([\w-]+)\/([\w-]+)$/.exec(c.req.query('widget') ?? '');
  const widget = pick ? getBoard(pick[1])?.board.widgets.find((x) => x.id === pick[2] && (NUMBERS[x.type] || x.type === 'markets')) : undefined;
  if (pick && !widget) return c.text('No such widget with a number on that board', 404);
  const pic = widget ? drawNumberPanel(await panelReading(widget, o.f ? 'f' : 'c'), widget.config?.title || WIDGET_INFO[widget.type].name, o) : drawPanel(hub.snapshot(), o);
  const body = m[2] === 'png' ? png(pic) : bmp(pic);
  return c.body(new Uint8Array(body), 200, { 'Content-Type': m[2] === 'png' ? 'image/png' : 'image/bmp' });
});

/** A widget's number for a panel: shared/reading.ts with English words, or the first price for Markets. */
async function panelReading(w: Widget, unit: 'f' | 'c'): Promise<Reading | null | undefined> {
  if (w.type === 'markets') {
    const line = (w.config?.symbols ?? '').split('\n').filter(Boolean)[0];
    if (!line) return null;
    const q = (config.demo ? demoQuotes([line], 'USD') : await quotes([line], 'USD'))[0];
    if (!q || q.failed || q.price === undefined) return { value: '-', sub: `${q?.label ?? q?.symbol ?? line}: ${q?.failed ?? 'no price'}`, tone: 'warn' };
    const name = q.label ?? q.name ?? q.symbol;
    const price = q.currency ? new Intl.NumberFormat('en-US', { style: 'currency', currency: q.currency, maximumFractionDigits: q.price >= 1000 ? 0 : 2 }).format(q.price) : String(q.price);
    return { value: price, sub: q.change === undefined ? name : `${name} ${q.change >= 0 ? '▲' : '▼'} ${q.change.toFixed(2)}%`, line: q.line && q.line.length > 1 ? { data: q.line.map((v, i) => [i, v] as [number, number]), label: name } : undefined };
  }
  const snap = hub.snapshot();
  const need = historyFor(w, snap.sources);
  const history = Object.fromEntries(need.keys.map((k) => [k, series(k, need.hours * 3_600_000, 96)]));
  return readingOf(w, { sources: snap.sources, alerts: snap.alerts, limits: snap.limits, unit, now: Date.now(), history, f: PANEL_FORMAT });
}

// Static client and SPA fallback.
const indexPath = join(config.staticDir, 'index.html');
// Built files carry a hash in their name, so they keep forever. Everything
// else (icons, manifests, the page) keeps its name across releases, so the
// browser fetches it again rather than showing last release's copy.
app.use('/*', async (c, next) => {
  await next();
  if (c.req.path.startsWith('/api/') || c.res.headers.has('Cache-Control')) return;
  c.res.headers.set('Cache-Control', c.req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
});
// An uploaded app icon answers at the P's addresses.
app.use('/*', async (c, next) => {
  const icon = c.req.method === 'GET' ? appIconFor(c.req.path) : null;
  if (!icon) return next();
  return c.body(new Uint8Array(icon), 200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' });
});
app.use('/*', serveStatic({ root: config.staticDir }));
app.get('*', (c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ error: 'Not found' }, 404);
  // A build file that's gone (a tab older than the last update) is a 404, never
  // the page: a browser can't run HTML as a script, and must not keep it as one.
  if (c.req.path.startsWith('/assets/')) return c.text('Not found', 404, { 'Cache-Control': 'no-store' });
  if (!existsSync(indexPath)) return c.text('Client not built. Run `npm run build`, or use `npm run dev`.', 503);
  return c.html(readFileSync(indexPath, 'utf8'));
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

// Sign-in settings that can't be trusted stop the server, rather than leave
// it open: AUTH=Password once meant no sign-in at all.
const authTrouble = authProblem();
if (authTrouble) {
  console.error(`Patchboard won't start: ${authTrouble}`);
  process.exit(1);
}
console.log(`Sign-in: ${config.auth.mode}${config.auth.mode === 'none' ? ' (anyone who can reach this port gets in)' : ''}`);
if (config.auth.mode === 'oidc' && !config.auth.oidc.allowed.length && !config.auth.oidc.allowAnyone) {
  console.warn('OIDC_ALLOWED is empty: anyone your provider signs in gets in. List who may, or set OIDC_ALLOW_ANYONE=1 if the provider already decides.');
}

const httpServer = serve({ fetch: app.fetch, port: config.port, ...(config.listenHost ? { hostname: config.listenHost } : {}) }, (info) => {
  console.log(`patchboard: listening on :${info.port}`);
});

// A public demo starts over on a schedule: it leaves, Docker's restart
// policy brings it back, and its data tmpfs comes back empty, so one
// visitor's changes never linger for the next (examples/public-demo.yml).
if (config.demo && config.demoResetMinutes > 0) {
  setTimeout(() => {
    console.log('patchboard: demo reset');
    httpServer.close();
    setTimeout(() => process.exit(0), 500).unref();
  }, config.demoResetMinutes * 60_000);
}

// Docker stops a container with SIGTERM. Node running as the container's
// first process ignores it unless told otherwise, so every update used to
// wait out Docker's 10 seconds and end in a kill. Close the push lines and
// the port, give the goodbyes half a second to go out, then leave.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    console.log(`patchboard: ${signal}, stopping`);
    hub.closeLines();
    httpServer.close();
    setTimeout(() => process.exit(0), 500).unref();
  });
}
