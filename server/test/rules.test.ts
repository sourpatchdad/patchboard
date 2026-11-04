// The decisions Patchboard makes on its own: what raises an alert, which
// links get checked, and how Diun notices map to containers.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Catalog, Container, SourceId, SourceState } from '../../shared/types.ts';
import { checkUrl } from '../adapters/checks.ts';
import { auditCatalog, guessFromImage } from '../catalog-audit.ts';
import { mergeCatalog, pickLabels } from '../labels.ts';
import { DEFAULT_BOARD, validateBoard } from '../../shared/board.ts';
import { computeAlerts, stoppedDetail } from '../alerts.ts';
import { normalizeImage, pendingUpdates, recordDiunNotice, settleUpdates } from '../updates.ts';

const ctr = (name: string, over: Partial<Container> = {}): Container => ({
  id: name.slice(0, 12),
  name,
  image: `example/${name}:latest`,
  state: 'running',
  status: 'Up 2 days',
  health: null,
  ...over,
});
const down = (name: string, over: Partial<Container> = {}) => ctr(name, { state: 'exited', status: 'Exited (1) 5 minutes ago', ...over });

const sources = (s: Partial<Record<SourceId, unknown>>): Partial<Record<SourceId, SourceState>> =>
  Object.fromEntries(Object.entries(s).map(([id, data]) => [id, { id: id as SourceId, label: id, ok: true, updatedAt: Date.now(), data }]));

const catalog = (services: Catalog['groups'][number]['services'] = []): Catalog => ({ groups: [{ name: 'G', services }], dock: [] });

test('healthy containers raise nothing', () => {
  const alerts = computeAlerts(sources({ docker: { containers: [ctr('plex'), ctr('sonarr')] } }), catalog());
  assert.deepEqual(alerts, []);
});

test('a stopped container is critical; expectStopped ones are not', () => {
  const alerts = computeAlerts(
    sources({ docker: { containers: [down('unpackerr'), down('recyclarr', { status: 'Exited (0) 9 hours ago' })] } }),
    catalog([{ name: 'Recyclarr', container: 'recyclarr', expectStopped: true }]),
  );
  assert.deepEqual(alerts.map((a) => a.id), ['ctr-down-unpackerr']);
  assert.equal(alerts[0].level, 'critical');
  assert.equal(alerts[0].href, '/c/unpackerr');
});

test('root-cause folding: dependents fold under the container they depend on', () => {
  const containers = [
    down('immich-postgres'),
    down('immich-server', { dependsOn: ['immich-postgres', 'immich-redis'] }),
    down('immich-machine-learning', { dependsOn: ['immich-server'] }),
    ctr('immich-redis'),
  ];
  const alerts = computeAlerts(sources({ docker: { containers } }), catalog());
  assert.deepEqual(alerts.map((a) => a.id), ['ctr-down-immich-postgres']);
  assert.match(alerts[0].detail ?? '', /Also down because of it: immich-server, immich-machine-learning/);
});

test('a dependency loop does not hang the folding', () => {
  const containers = [down('a', { dependsOn: ['b'] }), down('b', { dependsOn: ['a'] })];
  const alerts = computeAlerts(sources({ docker: { containers } }), catalog());
  assert.ok(alerts.length >= 1);
});

test('service checks: two misses raise a warning, one does not', () => {
  const svc = [{ name: 'Sonarr', container: 'sonarr', href: 'http://10.0.0.2:8989' }];
  const check = (fails: number) => ({ services: { Sonarr: { name: 'Sonarr', target: '10.0.0.2:8989', ok: false, status: 502, ms: 20, at: Date.now(), fails, error: 'HTTP 502' } } });
  const one = computeAlerts(sources({ docker: { containers: [ctr('sonarr')] }, checks: check(1) }), catalog(svc));
  assert.equal(one.length, 0);
  const two = computeAlerts(sources({ docker: { containers: [ctr('sonarr')] }, checks: check(2) }), catalog(svc));
  assert.deepEqual(two.map((a) => a.title), ["Sonarr isn't answering"]);
  assert.match(two[0].detail ?? '', /HTTP 502 from 10\.0\.0\.2:8989, though its container is running/);
});

test('service checks: a stopped container is reported once, not twice', () => {
  const svc = [{ name: 'Sonarr', container: 'sonarr', href: 'http://10.0.0.2:8989' }];
  const checks = { services: { Sonarr: { name: 'Sonarr', target: '10.0.0.2:8989', ok: false, status: null, ms: null, at: Date.now(), fails: 5, error: 'Connection refused' } } };
  const alerts = computeAlerts(sources({ docker: { containers: [down('sonarr')] }, checks }), catalog(svc));
  assert.deepEqual(alerts.map((a) => a.id), ['ctr-down-sonarr']);
});

test('backups: a failed item and a missed night both warn', () => {
  const H = 3_600_000;
  const run = (ago: number, failed?: string) => ({
    startedAt: Date.now() - ago,
    finishedAt: Date.now() - ago + 60_000,
    items: ['Immich', 'Joplin'].map((label) => ({ label, ok: label !== failed })),
  });
  const failing = computeAlerts(sources({ backups: { db: [run(5 * H, 'Joplin')], files: [run(5 * H)] } }), catalog());
  assert.deepEqual(failing.map((a) => a.title), ["Last night's database backup failed for Joplin"]);
  const stale = computeAlerts(sources({ backups: { db: [run(40 * H)], files: [run(5 * H)] } }), catalog());
  assert.deepEqual(stale.map((a) => a.id), ['bk-db-stale']);
});

test('stoppedDetail drops the time Docker repeats', () => {
  assert.equal(stoppedDetail('Exited (1) 2 hours ago', 'golift/unpackerr:latest'), 'Exited with code 1. golift/unpackerr:latest');
  assert.equal(stoppedDetail('Exited (0) 9 hours ago', 'x:1'), 'Exited cleanly. x:1');
});

test('checkUrl: private and tailnet addresses are checked, public sites are not', () => {
  const url = (href: string, check?: boolean | string) => checkUrl({ name: 'x', href, check })?.host ?? null;
  assert.equal(url('http://192.168.1.10:30113'), '192.168.1.10:30113');
  assert.equal(url('http://192.168.4.136'), '192.168.4.136');
  assert.equal(url('http://nas.tail1234.ts.net:8080'), 'nas.tail1234.ts.net:8080');
  assert.equal(url('https://github.com'), null);
  assert.equal(url('https://app.example.org/x'), 'app.example.org'); // CHECK_DOMAINS=example.org in the test env
  assert.equal(url('http://192.168.1.10:1', false), null);
  assert.equal(url('https://github.com', true), 'github.com');
  assert.equal(url('https://public.example.com', 'http://10.0.0.5:9000/health'), '10.0.0.5:9000');
});

test('normalizeImage treats registry spellings of one image as equal', () => {
  assert.equal(normalizeImage('docker.io/library/postgres:16'), 'postgres:16');
  assert.equal(normalizeImage('postgres'), 'postgres:latest');
  assert.equal(normalizeImage('lscr.io/linuxserver/sonarr:latest'), 'lscr.io/linuxserver/sonarr:latest');
  assert.equal(normalizeImage('ghcr.io/x/y:1@sha256:abcd'), 'ghcr.io/x/y:1');
});

test('Diun notices flag matching containers and clear once the image changes', () => {
  const sonarr = ctr('sonarr', { image: 'lscr.io/linuxserver/sonarr:latest', imageId: 'aaa' });
  const radarr = ctr('radarr', { image: 'lscr.io/linuxserver/radarr:latest', imageId: 'bbb' });
  assert.deepEqual(recordDiunNotice({ status: 'new', image: 'lscr.io/linuxserver/sonarr:latest' }, [sonarr, radarr]), []);
  assert.deepEqual(recordDiunNotice({ status: 'update', image: 'lscr.io/linuxserver/sonarr:latest', hub_link: 'https://x' }, [sonarr, radarr]), ['sonarr']);
  assert.ok(pendingUpdates().sonarr);
  assert.equal(settleUpdates([sonarr, radarr]), false);
  assert.equal(settleUpdates([{ ...sonarr, imageId: 'ccc' }, radarr]), true);
  assert.equal(pendingUpdates().sonarr, undefined);
});

test('catalog audit: flags dead entries, finds unlisted apps, skips plumbing', () => {
  const containers = [
    ctr('sonarr', { image: 'lscr.io/linuxserver/sonarr:latest' }),
    ctr('jellyfin', { image: 'jellyfin/jellyfin:latest' }),
    ctr('notes-api', { image: 'notes-api-notes-api', project: 'notes-api' }),
    ctr('immich-server', { image: 'ghcr.io/immich-app/immich-server:release', dependsOn: ['immich-postgres'] }),
    ctr('immich-postgres', { image: 'ghcr.io/immich-app/postgres:15' }),
    ctr('app-redis', { image: 'redis:7-alpine' }),
    ctr('acme-scheduler', { image: 'ghcr.io/x/acme:latest' }),
    down('old-thing'),
  ];
  const cat = catalog([
    { name: 'Sonarr', container: 'sonarr' },
    { name: 'Immich', container: 'immich-server' },
    { name: 'Ghost', container: 'ghost' },
  ]);
  const ports = (n: string) => (n === 'jellyfin' ? [{ container: '8096/tcp', host: '8096' }] : undefined);
  const a = auditCatalog(cat, containers, ports, '10.0.0.2');
  assert.deepEqual(a.missing, [{ service: 'Ghost', container: 'ghost' }]);
  assert.deepEqual(
    a.discovered.map((d) => [d.container, d.name, d.href]),
    [
      ['jellyfin', 'Jellyfin', 'http://10.0.0.2:8096'],
      ['notes-api', 'Notes API', undefined],
    ],
  );
});

test('guessFromImage: product names from images, container names for local builds', () => {
  assert.deepEqual(guessFromImage('plexinc/pms-docker:latest', 'plex'), { name: 'Plex', icon: 'plex.png' });
  assert.deepEqual(guessFromImage('lscr.io/linuxserver/sonarr:latest', 'sonarr'), { name: 'Sonarr', icon: 'sonarr.png' });
  assert.equal(guessFromImage('trivia-night-web', 'trivia-night-web').name, 'Trivia Night');
});

test('labels: patchboard.* beats homepage.*, and widget credentials are never kept', () => {
  const l = pickLabels({
    'homepage.name': 'Old name',
    'homepage.group': 'Media',
    'homepage.widget.key': 'secret-api-key',
    'patchboard.name': 'Sonarr',
    'com.docker.compose.project': 'arr',
  });
  assert.deepEqual(l, { name: 'Sonarr', group: 'Media' });
});

test('labels: join a YAML group by name, start new groups after, never shadow YAML', () => {
  const containers = [
    ctr('sonarr', { labels: { name: 'Sonarr (labels)', group: 'media' } }),
    ctr('bazarr', { labels: { name: 'Bazarr', group: 'media' } }),
    ctr('caddy', { labels: { name: 'Caddy', group: 'Edge', check: 'false' } }),
    ctr('plain'),
  ];
  const yaml = catalog([{ name: 'Sonarr', container: 'sonarr' }]);
  yaml.groups[0].name = 'Media';
  const m = mergeCatalog(yaml, containers);
  assert.deepEqual(
    m.groups.map((g) => [g.name, g.services.map((s) => `${s.name}:${s.source ?? 'yaml'}`)]),
    [
      ['Media', ['Sonarr:yaml', 'Bazarr:labels']],
      ['Edge', ['Caddy:labels']],
    ],
  );
  assert.equal(m.groups[1].services[0].check, false);
});

test('board: the default is valid, and Needs attention can never be removed', () => {
  const ok = validateBoard(DEFAULT_BOARD);
  assert.ok('board' in ok);
  const v = validateBoard({ widgets: [{ id: 'feeds', type: 'feeds', size: 'l' }] });
  assert.ok('board' in v);
  if ('board' in v) assert.deepEqual(v.board.widgets.map((w) => w.type), ['attention', 'feeds']);
});

test('board: rejects unknown types, duplicates, bad container names; fixes bad sizes', () => {
  assert.ok('error' in validateBoard({ widgets: [{ id: 'x', type: 'nope', size: 'm' }] }));
  assert.ok('error' in validateBoard({ widgets: [{ id: 'a', type: 'feeds', size: 'm' }, { id: 'b', type: 'feeds', size: 'm' }] }));
  assert.ok('error' in validateBoard({ widgets: [{ id: 'c', type: 'container', size: 's', config: { container: '../etc' } }] }));
  const v = validateBoard({ widgets: [{ id: 'apps', type: 'apps', size: 's' }, { id: 'c1', type: 'container', size: 's', config: { container: 'plex', extra: 'dropped' } }] });
  assert.ok('board' in v);
  if ('board' in v) {
    assert.equal(v.board.widgets.find((w) => w.id === 'apps')?.size, 'xl');
    assert.deepEqual(v.board.widgets.find((w) => w.id === 'c1')?.config, { container: 'plex' });
  }
});

test('json widget: secrets only from WIDGET_* variables', async () => {
  const { validateJsonConfig } = await import('../../shared/jsonwidget.ts');
  const base = { title: 'x', fields: [{ label: 'n', path: 'a', format: 'number' }] };
  assert.ok('error' in validateJsonConfig({ ...base, url: 'http://h/?k=${env:TRUENAS_API_KEY}' }));
  assert.ok('error' in validateJsonConfig({ ...base, url: 'http://h/', headers: { Authorization: 'Bearer ${env:FASTMAIL_TOKEN}' } }));
  assert.ok('config' in validateJsonConfig({ ...base, url: 'http://h/', headers: { 'X-Api-Key': '${env:WIDGET_PIHOLE}' } }));
  assert.ok('error' in validateJsonConfig({ ...base, url: 'file:///etc/passwd' }));
  assert.ok('error' in validateJsonConfig({ ...base, url: 'http://h/', fields: [] }));
});

test('json widget: reads paths and applies thresholds in either direction', async () => {
  const { readPath, toneFor } = await import('../../shared/jsonwidget.ts');
  const data = { a: { list: [{ n: 5 }, { n: 9 }] } };
  assert.equal(readPath(data, 'a.list[1].n'), 9);
  assert.equal(readPath(data, 'a.list.0.n'), 5);
  assert.equal(readPath(data, 'a.missing.x'), undefined);
  const hot = { label: 't', path: 'x', format: 'number' as const, warn: 70, crit: 90 };
  assert.deepEqual([toneFor(hot, 50), toneFor(hot, 75), toneFor(hot, 95)], ['ok', 'warn', 'crit']);
  const low = { label: 'f', path: 'x', format: 'number' as const, warn: 20, crit: 5 };
  assert.deepEqual([toneFor(low, 50), toneFor(low, 10), toneFor(low, 3)], ['ok', 'warn', 'crit']);
});

test('json widget: refuses cloud metadata and link-local addresses', async () => {
  const { fetchJsonWidget } = await import('../jsonwidget.ts');
  const r = await fetchJsonWidget({ title: 't', url: 'http://169.254.169.254/latest/meta-data/', headers: {}, interval: 60, fields: [{ label: 'x', path: 'x', format: 'text' }] });
  assert.equal(r.error, 'That address is blocked');
});

test('board: an API numbers widget keeps only validated settings', () => {
  const json = JSON.stringify({ title: 'Pi-hole', url: 'http://10.0.0.2/api/stats', fields: [{ label: 'Blocked', path: 'blocked', format: 'percent', warn: 'x' }] });
  const v = validateBoard({ widgets: [{ id: 'j1', type: 'json', size: 's', config: { json } }] });
  assert.ok('board' in v);
  if ('board' in v) {
    const cfg = JSON.parse(v.board.widgets.find((w) => w.id === 'j1')!.config!.json);
    assert.equal(cfg.fields[0].warn, undefined);
    assert.equal(cfg.interval, 60);
  }
  assert.ok('error' in validateBoard({ widgets: [{ id: 'j2', type: 'json', size: 's', config: { json: '{"url":"ftp://x"}' } }] }));
});
