import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Hono } from 'hono';
import { securityHeaders } from '../security.ts';

test('the page may show its own copies of camera frames, and nothing runs from elsewhere', async () => {
  const app = new Hono();
  app.use('*', securityHeaders('<html><script>boot()</script></html>'));
  app.get('/', (c) => c.text('ok'));
  const csp = (await app.request('/')).headers.get('Content-Security-Policy') ?? '';
  const directive = (name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';
  // Camera frames swap in as blob: images; without it every new frame is blocked.
  assert.match(directive('img-src'), /\bblob:/);
  assert.doesNotMatch(directive('script-src'), /blob:|unsafe-inline|\*/);
  assert.match(directive('object-src'), /'none'/);
});
