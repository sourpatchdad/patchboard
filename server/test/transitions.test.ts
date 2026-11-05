import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Container } from '../../shared/types.ts';
import { emptyTrack, settle, settling, STOP_GRACE_MS } from '../transitions.ts';

const ctr = (name: string, state: string, imageId = 'aaa', health?: string): Container =>
  ({ id: name, name, image: `x/${name}`, imageId, state, status: state === 'running' ? 'Up 1 second' : 'Exited (0)', health }) as unknown as Container;

const T = 1_800_000_000_000;

test('an update (stop, then running on a new image within two minutes) is one "updated" event, not a stop and a start', () => {
  let { track } = settle(emptyTrack(), [ctr('sonarr', 'running', 'old')], T);
  let r = settle(track, [ctr('sonarr', 'exited', 'old')], T + 5_000);
  assert.deepEqual(r.events, []);
  assert.ok(settling(r.track, 'sonarr', T + 6_000), 'no alert while it settles');
  r = settle(r.track, [ctr('sonarr', 'running', 'new')], T + 20_000);
  assert.deepEqual(r.events.map((e) => [e.kind, e.detail]), [['container.restarted', 'updated']]);
  track = r.track;
  assert.ok(!settling(track, 'sonarr', T + 21_000));
});

test('a container recreated (gone for a poll, back on a new image) reads as updated', () => {
  const { track } = settle(emptyTrack(), [ctr('plex', 'running', 'v1')], T);
  const gone = settle(track, [], T + 10_000);
  assert.deepEqual(gone.events, []);
  const back = settle(gone.track, [ctr('plex', 'running', 'v2')], T + 30_000);
  assert.deepEqual(back.events.map((e) => [e.kind, e.detail]), [['container.restarted', 'updated']]);
});

test('a stop that lasts two minutes is reported, dated from when it began', () => {
  const { track } = settle(emptyTrack(), [ctr('radarr', 'running')], T);
  let r = settle(track, [ctr('radarr', 'exited')], T + 10_000);
  r = settle(r.track, [ctr('radarr', 'exited')], T + 10_000 + STOP_GRACE_MS);
  assert.deepEqual(r.events.map((e) => [e.kind, e.at]), [['container.stopped', T + 10_000]]);
  r = settle(r.track, [ctr('radarr', 'running')], T + 10 * 60_000);
  assert.deepEqual(r.events.map((e) => e.kind), ['container.started']);
});

test('a restart loop is reported at once', () => {
  const { track } = settle(emptyTrack(), [ctr('unpackerr', 'running')], T);
  const r = settle(track, [ctr('unpackerr', 'restarting')], T + 5_000);
  assert.deepEqual(r.events.map((e) => e.kind), ['container.stopped']);
  assert.ok(!settling(r.track, 'unpackerr', T + 6_000));
});

test('compose recreate (gone, then Created, then running) is one line, never "started"', () => {
  const { track } = settle(emptyTrack(), [ctr('game-night', 'running', 'v1')], T);
  let r = settle(track, [], T + 5_000);
  r = settle(r.track, [ctr('game-night', 'created', 'v2')], T + 10_000);
  assert.deepEqual(r.events, [], 'Created is not a stop');
  r = settle(r.track, [ctr('game-night', 'running', 'v2')], T + 15_000);
  assert.deepEqual(r.events.map((e) => [e.kind, e.detail]), [['container.restarted', 'updated']]);
});

test('Created seen while it was running, then running again on the same image: restarted, no stop', () => {
  const { track } = settle(emptyTrack(), [ctr('acme', 'running', 'v1')], T);
  let r = settle(track, [ctr('acme', 'created', 'v1')], T + 5_000);
  assert.deepEqual(r.events, []);
  r = settle(r.track, [ctr('acme', 'running', 'v1')], T + 9_000);
  assert.deepEqual(r.events, [], 'it never left running as far as we can tell');
});
