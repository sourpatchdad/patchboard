import { strict as assert } from 'node:assert';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

// A fake Frigate whose camera feed never ends, as a real motion-JPEG feed doesn't.
const open = new Set<ServerResponse>();
const frigate = createServer((req, res) => {
  if (!req.url?.startsWith('/api/porch?')) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace;boundary=frame' });
  open.add(res);
  const t = setInterval(() => res.write('--frame\r\nContent-Type: image/jpeg\r\n\r\nJPEG\r\n'), 20);
  res.on('close', () => {
    clearInterval(t);
    open.delete(res);
  });
});

let cam: typeof import('../adapters/frigate.ts');
before(async () => {
  await new Promise<void>((r) => frigate.listen(0, '127.0.0.1', r));
  process.env.FRIGATE_URL = `http://127.0.0.1:${(frigate.address() as AddressInfo).port}`;
  cam = await import('../adapters/frigate.ts');
});
after(() => {
  frigate.closeAllConnections();
  frigate.close();
});

const until = async (ok: () => boolean) => {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 20));
  assert(ok(), 'timed out');
};

test('a live view passes frames through, is capped, and ends with its viewer', async () => {
  const viewers = [new AbortController(), new AbortController(), new AbortController()];
  const streams = await Promise.all(viewers.map((v) => cam.frigateLive('porch', v.signal)));
  for (const s of streams) assert(s instanceof Response);
  const first = (streams[0] as Response).body!.getReader();
  const { value } = await first.read();
  assert.match(new TextDecoder().decode(value), /--frame/);
  assert.equal(await cam.frigateLive('porch', new AbortController().signal), 'busy', 'a fourth viewer waits');

  // Closing a viewer ends its request to Frigate and frees its place.
  viewers[0].abort();
  await until(() => open.size === 2);
  const again = await cam.frigateLive('porch', new AbortController().signal);
  assert(again instanceof Response, 'the freed place is usable');

  // The browser going away (its stream cancelled) ends it too.
  await (streams[1] as Response).body!.cancel();
  await until(() => open.size === 2);
  viewers[2].abort();
  await (again as Response).body!.cancel();
  await until(() => open.size === 0);
  await assert.rejects(cam.frigateLive('../etc', new AbortController().signal), /Bad camera/);
});
