import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { withConfig } from '../config.ts';
import { listContainers } from '../adapters/docker.ts';

test('a container whose tag moved to a newer pull keeps its image name and says it runs the old copy', async () => {
  let inspects = 0;
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url?.startsWith('/containers/json')) {
      return res.end(
        JSON.stringify([
          { Id: 'aaa111', Names: ['/timesheet-db'], Image: 'sha256:74d436cb49d3', ImageID: 'sha256:74d436cb49d3', State: 'running', Status: 'Up 3 days', Created: 1 },
          { Id: 'bbb222', Names: ['/plex'], Image: 'plexinc/pms-docker:latest', ImageID: 'sha256:99', State: 'running', Status: 'Up 3 days', Created: 1 },
        ]),
      );
    }
    if (req.url === '/containers/aaa111/json') {
      inspects++;
      return res.end(JSON.stringify({ Config: { Image: 'postgres:16' } }));
    }
    res.writeHead(404).end('{}');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  try {
    await withConfig({ DOCKER_HOST: `tcp://127.0.0.1:${(server.address() as AddressInfo).port}` }, async () => {
      const first = await listContainers();
      const db = first.find((c) => c.name === 'timesheet-db')!;
      assert.equal(db.image, 'postgres:16');
      assert.equal(db.staleImage, true);
      assert.equal(first.find((c) => c.name === 'plex')!.staleImage, undefined);
      await listContainers();
      assert.equal(inspects, 1, 'looked up once, then remembered');
    });
  } finally {
    server.close();
  }
});
