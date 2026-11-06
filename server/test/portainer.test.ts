import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { toEnvs } from '../adapters/portainer.ts';

test('Portainer: Docker environments from snapshots, down and unhealthy first, Kubernetes left out', () => {
  const envs = toEnvs([
    { Id: 1, Name: 'local', Type: 1, Status: 1, Snapshots: [{ RunningContainerCount: 20, StoppedContainerCount: 1, UnhealthyContainerCount: 0, StackCount: 5 }] },
    { Id: 2, Name: 'pi', Type: 2, Status: 1, Snapshots: [{ RunningContainerCount: 4, UnhealthyContainerCount: 1 }] },
    { Id: 3, Name: 'old', Type: 1, Status: 2 },
    { Id: 4, Name: 'k3s', Type: 5, Status: 1 },
  ]);
  assert.deepEqual(envs.map((e) => [e.name, e.up, e.running, e.unhealthy]), [['old', false, 0, 0], ['pi', true, 4, 1], ['local', true, 20, 0]]);
});
