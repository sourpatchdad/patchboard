// Wake-on-LAN: a magic packet (6 bytes of 0xFF, then the MAC 16 times) sent
// by UDP broadcast. Devices come from WOL_DEVICES ("NAS=aa:bb:cc:dd:ee:ff,
// Desktop=..."). A broadcast only leaves the container on the host network,
// so the compose file needs network_mode: host for this to reach your LAN.

import { createSocket } from 'node:dgram';

export interface WakeDevice {
  name: string;
  mac: string;
}

const MAC = /^([0-9a-f]{2})[:-]?([0-9a-f]{2})[:-]?([0-9a-f]{2})[:-]?([0-9a-f]{2})[:-]?([0-9a-f]{2})[:-]?([0-9a-f]{2})$/i;

export function parseDevices(raw: string | undefined): WakeDevice[] {
  const out: WakeDevice[] = [];
  for (const part of (raw ?? '').split(',')) {
    const i = part.lastIndexOf('=');
    if (i < 1) continue;
    const name = part.slice(0, i).trim().slice(0, 40);
    const m = MAC.exec(part.slice(i + 1).trim());
    if (name && m && !out.some((d) => d.name === name)) out.push({ name, mac: m.slice(1).join(':').toLowerCase() });
  }
  return out;
}

export function magicPacket(mac: string): Buffer {
  const bytes = Buffer.from(mac.replace(/[:-]/g, ''), 'hex');
  if (bytes.length !== 6) throw new Error('Bad MAC address');
  return Buffer.concat([Buffer.alloc(6, 0xff), ...Array.from({ length: 16 }, () => bytes)]);
}

export function sendWake(mac: string, address = '255.255.255.255', port = 9): Promise<void> {
  const packet = magicPacket(mac);
  return new Promise((resolve, reject) => {
    const sock = createSocket('udp4');
    sock.once('error', (err) => {
      sock.close();
      reject(err);
    });
    sock.bind(() => {
      sock.setBroadcast(true);
      sock.send(packet, port, address, (err) => {
        sock.close();
        if (err) reject(err);
        else resolve();
      });
    });
  });
}
