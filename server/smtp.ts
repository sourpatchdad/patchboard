// A small SMTP client for notification email, so Patchboard needs no mail
// library. Port 465 speaks TLS from the start; 587 and 25 upgrade with
// STARTTLS when the server offers it (and must, before a password is sent).
// AUTH PLAIN or LOGIN. One message per connection, plain text.

import { connect as netConnect, type Socket } from 'node:net';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';

export interface SmtpConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  from: string;
  to: string[];
  verifyTls: boolean;
}

/** A header value safe for a mail header: no line breaks, non-ASCII as RFC 2047. */
export function headerValue(s: string): string {
  const flat = s.replace(/[\r\n]+/g, ' ').trim();
  return /^[\x20-\x7e]*$/.test(flat) ? flat : `=?UTF-8?B?${Buffer.from(flat).toString('base64')}?=`;
}

/** The message: headers, a blank line, the body with dot-stuffing and CRLF line ends. */
export function compose(c: SmtpConfig, subject: string, body: string, date = new Date()): string {
  const lines = [
    `From: Patchboard <${c.from}>`,
    `To: ${c.to.join(', ')}`,
    `Subject: ${headerValue(subject)}`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: <${date.getTime()}.${Math.random().toString(36).slice(2)}@patchboard>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    ...body.replace(/\r?\n/g, '\n').split('\n').map((l) => (l.startsWith('.') ? `.${l}` : l)),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

export function sendMail(c: SmtpConfig, subject: string, body: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let sock: Socket | TLSSocket;
    let buf = '';
    let waiting: ((line: { code: number; text: string }) => void) | null = null;
    const fail = (e: Error) => {
      sock?.destroy();
      reject(e);
    };
    const onData = (d: Buffer) => {
      buf += d.toString('utf8');
      // A reply ends with a line of "NNN text" (a space, not a dash, after the code).
      const m = /(?:^|\r\n)(\d{3}) ([^\r\n]*)\r\n$/.exec(buf);
      if (m && waiting) {
        const w = waiting;
        waiting = null;
        const text = buf;
        buf = '';
        w({ code: Number(m[1]), text });
      }
    };
    const reply = () => new Promise<{ code: number; text: string }>((r) => (waiting = r));
    const cmd = async (line: string, ok: number[], what: string) => {
      sock.write(`${line}\r\n`);
      const r = await reply();
      if (!ok.includes(r.code)) throw new Error(`The mail server refused ${what}: ${r.code} ${r.text.trim().split('\r\n').pop()?.slice(4) ?? ''}`.trim());
      return r;
    };
    const attach = (s: Socket | TLSSocket) => {
      sock = s;
      s.on('data', onData);
      s.on('error', (e: NodeJS.ErrnoException) => fail(new Error(e.code ? `Can't reach the mail server (${e.code})` : e.message)));
      s.setTimeout(15_000, () => fail(new Error('The mail server stopped answering')));
    };
    const run = async () => {
      const hello = await reply();
      if (hello.code !== 220) throw new Error(`The mail server said ${hello.code}`);
      let ehlo = await cmd('EHLO patchboard', [250], 'the greeting');
      if (!(sock as TLSSocket).encrypted && /STARTTLS/i.test(ehlo.text)) {
        await cmd('STARTTLS', [220], 'STARTTLS');
        await new Promise<void>((res, rej) => {
          const plain = sock;
          plain.removeAllListeners('data');
          const secure = tlsConnect({ socket: plain, servername: c.host, rejectUnauthorized: c.verifyTls }, () => res());
          secure.on('error', rej);
          attach(secure);
        });
        ehlo = await cmd('EHLO patchboard', [250], 'the greeting');
      }
      if (c.username && c.password) {
        if (!(sock as TLSSocket).encrypted) throw new Error("The mail server doesn't offer encryption, so Patchboard won't send the password. Use port 465, or 587 with STARTTLS.");
        if (/AUTH[^\r\n]*PLAIN/i.test(ehlo.text)) {
          await cmd(`AUTH PLAIN ${Buffer.from(`\0${c.username}\0${c.password}`).toString('base64')}`, [235], 'the username or password');
        } else {
          await cmd('AUTH LOGIN', [334], 'sign-in');
          await cmd(Buffer.from(c.username).toString('base64'), [334], 'the username');
          await cmd(Buffer.from(c.password).toString('base64'), [235], 'the username or password');
        }
      }
      await cmd(`MAIL FROM:<${c.from}>`, [250], 'the sender address');
      for (const to of c.to) await cmd(`RCPT TO:<${to}>`, [250, 251], `the address ${to}`);
      await cmd('DATA', [354], 'the message');
      await cmd(`${compose(c, subject, body)}.`, [250], 'the message');
      sock.end('QUIT\r\n');
    };
    const start = c.port === 465 ? tlsConnect({ host: c.host, port: c.port, servername: c.host, rejectUnauthorized: c.verifyTls }) : netConnect({ host: c.host, port: c.port });
    attach(start);
    run().then(resolve, fail);
  });
}
