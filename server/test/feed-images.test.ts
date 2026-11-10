import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { feedPicture, proxied, proxyContent, publicAddress } from '../feed-images.ts';

test('article pictures point at Patchboard, and no publisher copy is left to pick', () => {
  const html =
    '<p>Hi</p><picture><source srcset="https://cdn.example/a.webp 2x"><img src="https://cdn.example/a.jpg?w=1&amp;h=2" srcset="https://cdn.example/a@2x.jpg 2x" sizes="100vw" alt="A"></picture>' +
    "<img src='http://pics.example/b.png'><img src=\"data:image/gif;base64,R0lGOD\">";
  const out = proxyContent(42, html);
  assert.match(out, /<img src="\/api\/feed-img\/42\/1" alt="A">/);
  assert.match(out, /<img src='\/api\/feed-img\/42\/2'>/);
  assert.match(out, /data:image\/gif/, 'inline pictures stay inline');
  assert.doesNotMatch(out, /example|srcset|sizes|<source/);
  assert.equal(proxied(42, 0, 'https://cdn.example/lead.jpg'), '/api/feed-img/42/0');
});

test('only public addresses', () => {
  for (const ip of ['10.0.0.5', '127.0.0.1', '172.20.1.1', '192.168.1.10', '100.112.9.9', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:192.168.1.1', '224.0.0.1']) {
    assert.equal(publicAddress(ip), false, ip);
  }
  for (const ip of ['93.184.216.34', '1.1.1.1', '172.32.0.1', '100.128.0.1', '2606:4700::1111']) assert.equal(publicAddress(ip), true, ip);
});

test('a picture on a private address is never fetched, even one Patchboard handed out', async () => {
  let hits = 0;
  const lan = createServer((_req, res) => {
    hits++;
    res.writeHead(200, { 'Content-Type': 'image/png' }).end('PNG');
  });
  await new Promise<void>((r) => lan.listen(0, '127.0.0.1', r));
  const port = (lan.address() as AddressInfo).port;
  proxied(7, 0, `http://127.0.0.1:${port}/x.png`);
  assert.equal(await feedPicture('7', '0'), null);
  assert.equal(await feedPicture('7', '9'), null, 'unknown picture');
  assert.equal(hits, 0);
  lan.close();
});
