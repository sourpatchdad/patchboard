import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import type { Container } from '../../shared/types.ts';
import { withConfig } from '../config.ts';
import { apiKeyIn, findKey, firstFile, keyContainer, MAX_BYTES } from '../keyfind.ts';

// A made-up key, built here so no secret-shaped string sits in the source.
const KEY = 'a1'.repeat(16);
const XML = `<Config>\n  <BindAddress>*</BindAddress>\n  <Port>8989</Port>\n  <ApiKey>${KEY.toUpperCase()}</ApiKey>\n  <AuthenticationMethod>Forms</AuthenticationMethod>\n</Config>\n`;

/** A tar entry the way Docker's archive endpoint writes one. */
function entry(name: string, body: Buffer, type = '0'): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 'ascii');
  header.write('0000644\0', 100, 'ascii');
  header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124, 'ascii');
  header.write(type, 156, 'ascii');
  const pad = Buffer.alloc((512 - (body.length % 512)) % 512);
  return Buffer.concat([header, body, pad]);
}
const tar = (...entries: Buffer[]) => Buffer.concat([...entries, Buffer.alloc(1024)]);

test('the key is the ApiKey in the settings file, 32 hex characters and nothing else', () => {
  assert.equal(apiKeyIn(XML), KEY);
  assert.equal(apiKeyIn('<ApiKey>not-a-key</ApiKey>'), null);
  assert.equal(apiKeyIn(`<ApiKey>${KEY}00</ApiKey>`), null, 'too long is not a key');
  assert.equal(apiKeyIn('<Config></Config>'), null);
});

test("Docker's archive gives up its one file, past any metadata entry, and nothing oversized", () => {
  assert.equal(firstFile(tar(entry('config.xml', Buffer.from(XML))))?.toString(), XML);
  const pax = entry('PaxHeader', Buffer.from('30 mtime=1700000000.0\n'), 'x');
  assert.equal(firstFile(tar(pax, entry('config.xml', Buffer.from(XML))))?.toString(), XML, 'a PAX header first is skipped');
  assert.equal(firstFile(tar(entry('config.xml', Buffer.alloc(MAX_BYTES + 1)))), null, 'a file past the cap is refused');
  assert.equal(firstFile(Buffer.alloc(1024)), null, 'an empty archive has no file');
});

test('only a running container that is the app gets read', () => {
  const ctr = (name: string, image: string, state = 'running') => ({ name, image, state }) as Container;
  const all = [ctr('sonarr', 'lscr.io/linuxserver/sonarr:latest'), ctr('radarr', 'hotio/radarr', 'exited'), ctr('postgres', 'postgres:16')];
  assert.ok('container' in keyContainer('sonarr', 'sonarr', all));
  assert.match((keyContainer('radarr', 'radarr', all) as { error: string }).error, /isn't running/);
  assert.match((keyContainer('sonarr', 'postgres', all) as { error: string }).error, /doesn't look like Sonarr/, 'a database is not Sonarr, whatever it is asked');
  assert.match((keyContainer('sonarr', 'nope', all) as { error: string }).error, /No container/);
  assert.match((keyContainer('plex', 'sonarr', all) as { error: string }).error, /can't read/, 'only the listed apps');
  assert.match((keyContainer('sonarr', { name: 'sonarr' }, all) as { error: string }).error, /No container/, 'a name that is not a string');
});

test('the key comes out of the container through the archive endpoint, from its settings file only', async () => {
  const asked: string[] = [];
  let reply: (res: import('node:http').ServerResponse) => void = (res) => res.end(tar(entry('config.xml', Buffer.from(XML))));
  const server = createServer((req, res) => {
    asked.push(req.url ?? '');
    reply(res);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  try {
    await withConfig({ DOCKER_HOST: `tcp://127.0.0.1:${(server.address() as AddressInfo).port}` }, async () => {
      assert.equal(await findKey('sonarr', 'sonarr'), KEY);
      assert.deepEqual(asked, ['/containers/sonarr/archive?path=%2Fconfig%2Fconfig.xml']);
      reply = (res) => res.writeHead(404).end();
      await assert.rejects(findKey('sonarr', 'sonarr'), /No settings file/);
      reply = (res) => res.writeHead(403).end();
      await assert.rejects(findKey('sonarr', 'sonarr'), /ARCHIVE/);
      reply = (res) => res.end(tar(entry('config.xml', Buffer.from('<Config></Config>'))));
      await assert.rejects(findKey('sonarr', 'sonarr'), /No API key/);
      reply = (res) => res.end(Buffer.alloc(MAX_BYTES * 2));
      await assert.rejects(findKey('sonarr', 'sonarr'), /too large/, 'a stream past the cap is cut off');
    });
  } finally {
    server.close();
  }
});
