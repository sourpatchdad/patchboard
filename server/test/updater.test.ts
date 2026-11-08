// Updates end to end, against a stand-in Docker: an API on a socket that
// holds containers, images and tags, and a docker CLI that forwards each
// command to it. Pulls and recreates change that state as Docker would, so
// every path runs for real: success, already newest, failed pull, failed
// recreate, unhealthy then rollback, Patchboard updating itself, and two
// clicks at once.

import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import type { Container, UpdateJob } from '../../shared/types.ts';
import { withConfig } from '../config.ts';
import { clearUpdate, pendingUpdates, recordDiunNotice } from '../updates.ts';
import { changesLink } from '../selfcheck.ts';
import { checkSelfImage, eligibility, selfCheckStatus, startRollback, startUpdate, useDockerForTests, watchJob } from '../updater.ts';

const dir = mkdtempSync(join(tmpdir(), 'pb-update-'));
const composeFile = join(dir, 'compose.yml');
writeFileSync(composeFile, 'services: {}\n');
const sock = process.platform === 'win32' ? `\\\\.\\pipe\\pb-docker-${process.pid}` : join(dir, 'docker.sock');

// The stand-in CLI: posts its arguments to the stand-in API and exits as told.
const cli = join(dir, 'docker-cli.mjs');
writeFileSync(
  cli,
  `import http from 'node:http';
const [sock, ...args] = process.argv.slice(2);
const req = http.request({ socketPath: sock, method: 'POST', path: '/_cli' }, (res) => {
  let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => { const r = JSON.parse(b); if (r.out) console.log(r.out); process.exit(r.code); });
});
req.end(JSON.stringify(args));
`,
);

type Ctr = { Name: string; Image: string; Config: { Image: string; Labels: Record<string, string> }; State: { Status: string; Health?: { Status: string } }; Mounts?: { Source: string; Destination: string }[] };
const OLD = 'sha256:' + 'a'.repeat(64);
const NEW = 'sha256:' + 'b'.repeat(64);
const REF = 'lscr.io/linuxserver/sonarr:latest';

let containers: Record<string, Ctr>;
let images: Record<string, { Id: string; RepoDigests: string[] }>;
let calls: string[][];
/** What the next commands do. */
let plan: { pullTo: string; pullFails?: boolean; upFails?: boolean; health?: string; slowUp?: number };

const labels = (service: string) => ({
  'com.docker.compose.project': 'media',
  'com.docker.compose.service': service,
  'com.docker.compose.project.working_dir': dir,
  'com.docker.compose.project.config_files': composeFile,
});

function reset(): void {
  containers = {
    sonarr: { Name: '/sonarr', Image: OLD, Config: { Image: REF, Labels: labels('sonarr') }, State: { Status: 'running', Health: { Status: 'healthy' } } },
  };
  images = { [REF]: { Id: OLD, RepoDigests: [] }, [OLD]: { Id: OLD, RepoDigests: [] }, [NEW]: { Id: NEW, RepoDigests: [] } };
  calls = [];
  plan = { pullTo: NEW, health: 'healthy' };
}

const server: Server = createServer((req, res) => {
  const url = new URL(req.url!, 'http://docker');
  const json = (code: number, body: unknown) => (res.writeHead(code, { 'content-type': 'application/json' }), res.end(JSON.stringify(body)));
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const ctr = /^\/containers\/([^/]+)\/json$/.exec(url.pathname);
    if (ctr) {
      const c = containers[decodeURIComponent(ctr[1])];
      return c ? json(200, c) : json(404, { message: 'No such container' });
    }
    const img = /^\/images\/(.+)\/json$/.exec(url.pathname);
    if (img) {
      const i = images[decodeURIComponent(img[1])];
      return i ? json(200, i) : json(404, { message: 'No such image' });
    }
    const tag = /^\/images\/(.+)\/tag$/.exec(url.pathname);
    if (tag && req.method === 'POST') {
      const i = images[decodeURIComponent(tag[1])];
      if (!i) return json(404, {});
      images[`${url.searchParams.get('repo')}:${url.searchParams.get('tag')}`] = i;
      return json(201, {});
    }
    if (url.pathname === '/_cli') {
      const args = JSON.parse(body) as string[];
      calls.push(args);
      const service = args[args.length - 1];
      if (args.includes('pull')) {
        if (plan.pullFails) return json(200, { code: 1, out: 'Error response from daemon: unauthorized, see https://registry.example/token?apikey=SECRET123' });
        images[REF] = images[plan.pullTo];
        return json(200, { code: 0, out: 'latest: Pulling from linuxserver/sonarr\nStatus: Downloaded newer image' });
      }
      if (args.includes('up')) {
        if (plan.upFails) return json(200, { code: 1, out: 'Error: port is already allocated' });
        const c = containers[service];
        const finish = () => {
          c.Image = images[c.Config.Image].Id;
          c.State = { Status: 'running', Health: plan.health ? { Status: plan.health } : undefined };
          json(200, { code: 0, out: ` Container ${service}  Recreated` });
        };
        return plan.slowUp ? setTimeout(finish, plan.slowUp) : finish();
      }
      if (args[0] === 'run') return json(200, { code: 0, out: 'f00d' });
      return json(200, { code: 1, out: `unexpected: docker ${args.join(' ')}` });
    }
    json(404, {});
  });
});

before(async () => {
  await new Promise<void>((ok) => server.listen(sock, ok));
  useDockerForTests({ command: process.execPath, prefix: [cli, sock], cli: true, pollMs: 15, healthMs: 400 });
});
after(() => {
  server.close();
  useDockerForTests({ command: 'docker', prefix: [], pollMs: 3000, healthMs: 120_000 });
});
beforeEach(reset);

const ctr = (name: string): Container => ({ name, image: REF, imageId: containers[name]?.Image ?? OLD, state: 'running' }) as Container;
const docker = <T>(fn: () => Promise<T>) => withConfig({ DOCKER_SOCKET: sock }, fn);

/** The job once it stops running. */
function settled(first: UpdateJob): Promise<UpdateJob> {
  return new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error(`job still ${first.status}`)), 5000);
    const off = watchJob(first.id, (j) => {
      if (j.status === 'running') return;
      clearTimeout(t);
      queueMicrotask(() => off());
      ok(j);
    });
  });
}
const stepOf = (j: UpdateJob, key: string) => j.steps.find((s) => s.key === key)?.status;

test('an update pulls, recreates, waits for healthy, and says what changed', async () => {
  const j = await docker(async () => settled(await startUpdate(ctr('sonarr'), async () => true, () => {})));
  assert.equal(j.status, 'done', j.error ?? '');
  assert.deepEqual(j.steps.map((s) => s.status), ['done', 'done', 'done']);
  assert.equal(j.from, 'a'.repeat(12));
  assert.equal(j.to, 'b'.repeat(12));
  assert.equal(containers.sonarr.Image, NEW);
  assert.deepEqual(
    calls.map((c) => c.slice(c.indexOf('-f') + 2).join(' ')),
    ['pull sonarr', 'up -d --no-deps --pull never sonarr'],
    'only this service, with the image just pulled',
  );
});

test('a re-published tag: the pull finds nothing new, nothing restarts, and the update mark clears', async () => {
  recordDiunNotice({ image: REF, digest: 'sha256:c' } as never, [ctr('sonarr')]);
  assert.ok(pendingUpdates().sonarr, 'marked by Diun');
  plan.pullTo = OLD;
  const j = await docker(async () => settled(await startUpdate(ctr('sonarr'), async () => true, () => {})));
  assert.equal(j.status, 'done');
  assert.deepEqual(j.steps.map((s) => s.status), ['done', 'skipped', 'skipped']);
  assert.equal(calls.length, 1, 'no recreate');
  assert.equal(pendingUpdates().sonarr, undefined);
});

test('a failed pull stops at the pull, masks keys in the output, and offers no rollback', async () => {
  plan.pullFails = true;
  const first = await docker(() => startUpdate(ctr('sonarr'), async () => true, () => {}));
  const j = await settled(first);
  assert.equal(j.status, 'failed');
  assert.equal(stepOf(j, 'pull'), 'failed');
  assert.equal(stepOf(j, 'recreate'), 'waiting');
  assert.match(j.error ?? '', /pull exited with 1/);
  assert.ok(j.log.some((l) => l.includes('apikey=••••')) && !j.log.some((l) => l.includes('SECRET123')), 'keys masked');
  assert.equal(containers.sonarr.Image, OLD, 'still on the old image');
  await assert.rejects(docker(() => startRollback(j.id, () => {})), /nothing to roll back/i);
});

test('a failed recreate is reported at that step, and the next update can start', async () => {
  plan.upFails = true;
  const j = await docker(async () => settled(await startUpdate(ctr('sonarr'), async () => true, () => {})));
  assert.equal(j.status, 'failed');
  assert.equal(stepOf(j, 'recreate'), 'failed');
  plan.upFails = false;
  const again = await docker(async () => settled(await startUpdate(ctr('sonarr'), async () => true, () => {})));
  assert.equal(again.status, 'done', 'the one-job slot was freed');
});

test('an unhealthy container fails the update, and rollback puts the old image back', async () => {
  plan.health = 'unhealthy';
  const j = await docker(async () => settled(await startUpdate(ctr('sonarr'), async () => true, () => {})));
  assert.equal(j.status, 'failed');
  assert.equal(stepOf(j, 'healthy'), 'failed');
  assert.match(j.error ?? '', /Not healthy after .* \(unhealthy\)/);
  assert.equal(containers.sonarr.Image, NEW, 'running the bad image');

  plan.health = 'healthy';
  const rb = await docker(async () => settled(await startRollback(j.id, () => {})));
  assert.equal(rb.status, 'done', rb.error ?? '');
  assert.equal(rb.kind, 'rollback');
  assert.equal(images[REF].Id, OLD, 'the tag points at the previous image again');
  assert.equal(containers.sonarr.Image, OLD, 'and the container runs it');
});

test('an app that never answers fails the update even when Docker calls it healthy', async () => {
  const j = await docker(async () => settled(await startUpdate(ctr('sonarr'), async () => false, () => {})));
  assert.equal(j.status, 'failed');
  assert.equal(stepOf(j, 'healthy'), 'failed');
});

test('two clicks at once start one update', async () => {
  plan.slowUp = 150;
  const [a, b] = await docker(() => Promise.allSettled([startUpdate(ctr('sonarr'), async () => true, () => {}), startUpdate(ctr('sonarr'), async () => true, () => {})]));
  assert.equal([a, b].filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = [a, b].find((r) => r.status === 'rejected') as PromiseRejectedResult;
  assert.match(String(rejected.reason), /Another update is running/);
  await settled((a.status === 'fulfilled' ? a : b as PromiseFulfilledResult<UpdateJob>).value);
});

test('Patchboard updating itself hands the recreate to a helper container from the new image', async () => {
  containers.patchboard = {
    Name: '/patchboard',
    Image: OLD,
    Config: { Image: REF, Labels: labels('patchboard') },
    State: { Status: 'running' },
    Mounts: [{ Source: '/var/run/docker.sock', Destination: '/var/run/docker.sock' }],
  };
  containers[hostname()] = containers.patchboard;
  useDockerForTests({}); // forget any earlier answer to "which container am I"
  const j = await docker(async () => settled(await startUpdate(ctr('patchboard'), async () => true, () => {})));
  assert.equal(j.status, 'done', j.error ?? '');
  assert.equal(stepOf(j, 'healthy'), 'skipped');
  const helper = calls.find((c) => c[0] === 'run')!;
  assert.ok(helper, 'a helper ran');
  assert.deepEqual(helper.slice(helper.indexOf('--entrypoint'), helper.indexOf('--entrypoint') + 3), ['--entrypoint', 'docker', REF]);
  assert.ok(helper.includes('/var/run/docker.sock:/var/run/docker.sock'));
  assert.ok(!calls.some((c) => c.includes('up') && c[0] !== 'run'), 'Patchboard never recreates itself directly');
  delete containers[hostname()];
  useDockerForTests({});
});

test('what can be updated from here, and the reason when not', async () => {
  const why = async (patch: (c: Ctr) => void) => {
    reset();
    patch(containers.sonarr);
    return (await docker(() => eligibility(ctr('sonarr')))) as { ok: boolean; reason?: string };
  };
  assert.deepEqual(await why(() => {}), { ok: true });
  assert.match((await why((c) => (c.Config.Labels = {}))).reason!, /Not started by Docker Compose/);
  assert.match((await why((c) => (c.Config.Labels['com.docker.compose.project.working_dir'] = '/mnt/.ix-apps/app_mounts/sonarr'))).reason!, /TrueNAS Apps/);
  assert.match((await why((c) => (c.Config.Labels['com.docker.compose.project.config_files'] = 'compose.yml'))).reason!, /relative paths/);
  assert.match((await why((c) => (c.Config.Labels['com.docker.compose.project.config_files'] = join(dir, 'missing.yml')))).reason!, /Mount .* at the same path/);
  assert.match((await why((c) => (c.Config.Image = 'media-sonarr'))).reason!, /Built locally/);
  useDockerForTests({ cli: false });
  assert.match((await why(() => {})).reason!, /slim image/);
  useDockerForTests({ cli: true });
});

test('Patchboard spots a newer image of itself on the registry, and links to what changed', async () => {
  const PB = 'ghcr.io/sourpatchdad/patchboard:edge';
  containers.patchboard = { Name: '/patchboard', Image: OLD, Config: { Image: PB, Labels: labels('patchboard') }, State: { Status: 'running' } };
  containers[hostname()] = containers.patchboard;
  images[OLD] = { Id: OLD, RepoDigests: ['ghcr.io/sourpatchdad/patchboard@sha256:old'] };
  useDockerForTests({});
  const realFetch = globalThis.fetch;
  let served = 'sha256:old';
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith('https://ghcr.io/token')) return new Response(JSON.stringify({ token: 't' }));
    if (u === 'https://ghcr.io/v2/sourpatchdad/patchboard/manifests/edge' && init?.method === 'HEAD') return served ? new Response(null, { headers: { 'docker-content-digest': served } }) : new Response(null, { status: 401 });
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  try {
    clearUpdate('patchboard');
    const me = { ...ctr('patchboard'), image: PB } as Container;
    assert.equal(await docker(() => checkSelfImage([me])), false, 'the registry serves the image it runs');
    assert.equal(selfCheckStatus()?.state, 'current');
    served = '';
    assert.equal(await docker(() => checkSelfImage([me])), false);
    assert.match(selfCheckStatus()?.reason ?? '', /sign-in/, 'a private image says why it cannot check');
    served = 'sha256:new';
    assert.equal(await docker(() => checkSelfImage([me])), true, 'a new digest on its tag');
    assert.equal(pendingUpdates().patchboard?.link, 'https://github.com/sourpatchdad/patchboard/commits/main');
    assert.equal(selfCheckStatus()?.state, 'newer');
    assert.equal(await docker(() => checkSelfImage([me])), false, 'flagged once, not every check');
  } finally {
    globalThis.fetch = realFetch;
    clearUpdate('patchboard');
    delete containers[hostname()];
    useDockerForTests({});
  }
});

test('what changed: release notes for a version, commits for edge and dev', () => {
  assert.equal(changesLink('ghcr.io/sourpatchdad/patchboard:latest'), 'https://github.com/sourpatchdad/patchboard/releases');
  assert.equal(changesLink('ghcr.io/sourpatchdad/patchboard:1.2'), 'https://github.com/sourpatchdad/patchboard/releases');
  assert.equal(changesLink('ghcr.io/sourpatchdad/patchboard:edge'), 'https://github.com/sourpatchdad/patchboard/commits/main');
  assert.equal(changesLink('ghcr.io/sourpatchdad/patchboard:dev'), 'https://github.com/sourpatchdad/patchboard/commits/dev');
  assert.equal(changesLink('sourpatchdad/patchboard:latest'), undefined, 'Docker Hub has no release page to point at');
});
