import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Adapter } from './adapters/adapter.ts';
import { radarrAdapter, sonarrAdapter } from './adapters/arr.ts';
import { type ContainerAction, containerAction, dockerAdapter, followLogs, inspectContainer, statsAdapter } from './adapters/docker.ts';
import { fastmailAdapter } from './adapters/fastmail.ts';
import { frigateAdapter } from './adapters/frigate.ts';
import { listEntries, markRead, minifluxAdapter } from './adapters/miniflux.ts';
import { qbitAdapter } from './adapters/qbit.ts';
import { systemAdapter } from './adapters/system.ts';
import { tautulliAdapter, tautulliImage } from './adapters/tautulli.ts';
import { traktAdapter } from './adapters/trakt.ts';
import { truenasAdapter } from './adapters/truenas.ts';
import { backupsAdapter } from './adapters/backups.ts';
import { checksAdapter } from './adapters/checks.ts';
import { weatherAdapter } from './adapters/weather.ts';
import { initCatalog } from './catalog.ts';
import { config } from './config.ts';
import { series } from './db.ts';
import { demoAdapters, demoFeeds, demoInspect, demoLogs, demoReadIds, demoRunbook } from './demo.ts';
import { Hub, seedDemoHistory, seedDemoSamples } from './hub.ts';
import { runbookFor } from './notes.ts';
import { uptimeDays } from './uptime.ts';
import { type DiunNotice, recordDiunNotice } from './updates.ts';
import { recordEvent } from './db.ts';
import { startDeviceFlow, traktDisconnect, traktStatus } from './trakt-auth.ts';

function realAdapters(): Adapter[] {
  const list: Adapter[] = [dockerAdapter(), statsAdapter(), systemAdapter()];
  if (config.truenas) list.push(truenasAdapter());
  list.push(checksAdapter());
  if (config.logsPath) list.push(backupsAdapter());
  if (config.weather) list.push(weatherAdapter());
  if (config.sonarr) list.push(sonarrAdapter());
  if (config.radarr) list.push(radarrAdapter());
  if (config.trakt) list.push(traktAdapter());
  if (config.tautulli) list.push(tautulliAdapter());
  if (config.qbit) list.push(qbitAdapter());
  if (config.miniflux) list.push(minifluxAdapter());
  if (config.fastmail) list.push(fastmailAdapter());
  if (config.frigate) list.push(frigateAdapter());
  return list;
}

if (config.demo) {
  seedDemoHistory();
  seedDemoSamples();
}
const adapters = config.demo ? demoAdapters() : realAdapters();
const hub = new Hub(adapters);
initCatalog(() => hub.refreshAlerts());
hub.start();
console.log(`patchboard: ${config.demo ? 'DEMO mode, ' : ''}${adapters.map((a) => a.id).join(', ')}`);

const app = new Hono();

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
  if (config.demo) {
    return c.json(demoFeeds.filter((e) => status === 'all' || !demoReadIds.has(e.id)));
  }
  if (!config.miniflux) return c.json({ error: 'Miniflux is not configured' }, 404);
  return c.json(await listEntries({ status, limit: 80 }));
});

app.post('/api/feeds/read', async (c) => {
  const body = await c.req.json<{ ids: unknown }>();
  const ids = Array.isArray(body.ids) ? body.ids.filter((n): n is number => Number.isInteger(n)) : [];
  if (!ids.length) return c.json({ ok: true });
  if (config.demo) ids.forEach((id) => demoReadIds.add(id));
  else if (config.miniflux) await markRead(ids);
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
      await follow(name, tail, (line) => void stream.writeSSE({ data: JSON.stringify(line) }), ac.signal);
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
    return d ? c.json(d) : c.json({ error: 'No such container' }, 404);
  }
  try {
    return c.json(await inspectContainer(name, hub.containers()));
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
  if (!config.demo) {
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

// Trakt sign-in (device flow). Same action header as container actions.
app.get('/api/trakt', (c) =>
  c.json(config.demo ? { configured: true, canConnect: true, connected: true, user: 'demo' } : traktStatus()),
);
app.post('/api/trakt/connect', async (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  if (config.demo) return c.json({ error: 'Not available in the demo' }, 400);
  try {
    return c.json(await startDeviceFlow());
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});
app.post('/api/trakt/disconnect', (c) => {
  if (c.req.header('x-patchboard') !== 'action') return c.json({ error: 'Missing action header' }, 403);
  if (!config.demo) traktDisconnect();
  return c.json({ ok: true });
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

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`patchboard: listening on :${info.port}`);
});
