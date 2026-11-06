// NUT (Network UPS Tools): every UPS its server knows, with battery, runtime,
// load and whether the power is out. Speaks NUT's own text protocol on port
// 3493, which TrueNAS, Unraid, Synology, Proxmox and Home Assistant all serve
// or use. Reading needs no login. https://networkupstools.org/docs/developer-guide.chunked/net-protocol.html

import { connect } from 'node:net';
import type { NutData, Ups } from '../../shared/types.ts';
import { config } from '../config.ts';
import { type Adapter, SECOND } from './adapter.ts';

/** Parse "VAR ups name "value"" and "UPS name "description"" lines. */
export function parseList(text: string, kind: 'UPS' | 'VAR'): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = kind === 'UPS' ? /^UPS (\S+) "(.*)"$/.exec(line.trim()) : /^VAR \S+ (\S+) "(.*)"$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

export function toUps(name: string, description: string, v: Record<string, string>): Ups {
  const flags = (v['ups.status'] ?? '').split(/\s+/).filter(Boolean);
  const n = (k: string) => (v[k] != null && v[k] !== '' && Number.isFinite(Number(v[k])) ? Number(v[k]) : undefined);
  return {
    name,
    model: [v['device.mfr'] ?? v['ups.mfr'], v['device.model'] ?? v['ups.model']].filter(Boolean).join(' ') || description || name,
    onBattery: flags.includes('OB'),
    lowBattery: flags.includes('LB'),
    replaceBattery: flags.includes('RB'),
    charging: flags.includes('CHRG'),
    charge: n('battery.charge'),
    runtimeSec: n('battery.runtime'),
    loadPct: n('ups.load'),
    watts: n('ups.realpower') ?? (n('ups.load') != null && n('ups.realpower.nominal') != null ? Math.round((n('ups.load')! / 100) * n('ups.realpower.nominal')!) : undefined),
    inputVolts: n('input.voltage'),
  };
}

/** One NUT session: send each command, read until its END line. */
function session(host: string, port: number, commands: string[]): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const sock = connect({ host, port, timeout: 8000 });
    const replies: string[] = [];
    let buf = '';
    let i = 0;
    const next = () => {
      if (i >= commands.length) {
        sock.end('LOGOUT\n');
        return resolve(replies);
      }
      sock.write(`${commands[i]}\n`);
    };
    sock.setEncoding('utf8');
    sock.on('connect', next);
    sock.on('data', (d: string) => {
      buf += d;
      if (/^ERR /m.test(buf)) {
        sock.destroy();
        return reject(new Error(`NUT said ${buf.match(/^ERR (.*)$/m)?.[1] ?? 'no'}`));
      }
      if (/^END LIST/m.test(buf)) {
        replies.push(buf);
        buf = '';
        i++;
        next();
      }
    });
    sock.on('timeout', () => sock.destroy(new Error('Timed out after 8s')));
    sock.on('error', (e: NodeJS.ErrnoException) => reject(new Error(e.code ? `Unreachable (${e.code})` : e.message)));
  });
}

export function nutAdapter(): Adapter<NutData> {
  const { host, port } = config.nut!;
  return {
    id: 'nut',
    label: 'NUT',
    intervalMs: 15 * SECOND,
    async fetch() {
      const [list] = await session(host, port, ['LIST UPS']);
      const upses = parseList(list, 'UPS');
      const names = Object.keys(upses);
      const vars = names.length ? await session(host, port, names.map((n) => `LIST VAR ${n}`)) : [];
      return { ups: names.map((n, i) => toUps(n, upses[n], parseList(vars[i] ?? '', 'VAR'))) };
    },
  };
}
