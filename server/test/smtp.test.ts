import { strict as assert } from 'node:assert';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { compose, headerValue, sendMail } from '../smtp.ts';

test('mail headers: no line breaks get through, and non-ASCII is encoded', () => {
  assert.equal(headerValue('Disk sda\r\nBcc: evil@x'), 'Disk sda Bcc: evil@x');
  assert.match(headerValue('sda is at 52°C'), /^=\?UTF-8\?B\?/);
  const msg = compose({ host: 'h', port: 25, from: 'pb@x', to: ['a@x', 'b@x'], verifyTls: true }, 'Hi', 'line\n.dot', new Date(0));
  assert.match(msg, /^From: Patchboard <pb@x>\r\nTo: a@x, b@x\r\n/);
  assert.match(msg, /\r\n\r\nline\r\n\.\.dot\r\n$/);
});

test('SMTP: a full conversation with a relay that needs no sign-in, and refusing a password over plain text', async () => {
  const got: string[] = [];
  const server = createServer((s) => {
    s.write('220 relay ready\r\n');
    let data = false;
    let buf = '';
    s.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        got.push(line);
        if (data) {
          if (line === '.') {
            data = false;
            s.write('250 queued\r\n');
          }
          continue;
        }
        if (line.startsWith('EHLO')) s.write('250-relay\r\n250 SIZE 1000000\r\n');
        else if (line.startsWith('MAIL') || line.startsWith('RCPT')) s.write('250 ok\r\n');
        else if (line === 'DATA') {
          data = true;
          s.write('354 go\r\n');
        } else if (line === 'QUIT') s.end('221 bye\r\n');
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  const base = { host: '127.0.0.1', port, from: 'pb@x', to: ['you@x'], verifyTls: true };
  await sendMail(base, 'Disk failing', 'sdb failed SMART');
  assert.ok(got.includes('MAIL FROM:<pb@x>'));
  assert.ok(got.includes('RCPT TO:<you@x>'));
  assert.ok(got.some((l) => l === 'Subject: Disk failing'));
  await assert.rejects(sendMail({ ...base, username: 'u', password: 'p' }, 'x', 'y'), /won't send the password/);
  server.close();
});
