// Rasterizes the app icon to PNG (iOS needs PNG for home-screen icons) with
// no dependencies: signed-distance shapes, 4x4 supersampling, zlib for PNG.
// Run: node scripts/make-icons.ts

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;

const BG = hex('#0E1114');
const SOCKET = hex('#07090B');
const RIM = hex('#2B3238');
const PLUG = hex('#E8E5DC');
const CABLE = hex('#69AEE8');
const LED = hex('#7FB08F');

// Shapes in the 512-unit design space, painted in order.
function paint(x: number, y: number, full: boolean): RGB | null {
  let c: RGB | null = full ? BG : null;
  if (!full) {
    // Rounded-square background (non-maskable variant).
    const r = 112;
    const dx = Math.max(Math.abs(x - 256) - (256 - r), 0);
    const dy = Math.max(Math.abs(y - 256) - (256 - r), 0);
    if (Math.hypot(dx, dy) <= r) c = BG;
    else return null;
  }
  for (const cx of [160, 352]) {
    const d = Math.hypot(x - cx, y - 200);
    if (d <= 67) c = d >= 57 ? RIM : SOCKET;
  }
  // Cable: two verticals and a half-circle, 34 units wide.
  const w = 17;
  const onVert = (cx: number) => Math.abs(x - cx) <= w && y >= 226 && y <= 262;
  const arc = y >= 262 && Math.abs(Math.hypot(x - 256, y - 262) - 96) <= w;
  const cap = (cx: number) => Math.hypot(x - cx, y - 226) <= w;
  if (onVert(160) || onVert(352) || arc || cap(160) || cap(352)) c = CABLE;
  for (const cx of [160, 352]) if (Math.hypot(x - cx, y - 200) <= 26) c = PLUG;
  for (const cx of [212, 404]) if (Math.hypot(x - cx, y - 150) <= 14) c = LED;
  return c;
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size: number, full: boolean): Buffer {
  const S = 4;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const scale = 512 / size;
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const c = paint((px + (sx + 0.5) / S) * scale, (py + (sy + 0.5) / S) * scale, full);
          if (c) {
            r += c[0]; g += c[1]; b += c[2]; a += 255;
          }
        }
      }
      const n = S * S;
      const o = py * (size * 4 + 1) + 1 + px * 4;
      const cov = a / 255 || 1;
      raw[o] = Math.round(r / cov);
      raw[o + 1] = Math.round(g / cov);
      raw[o + 2] = Math.round(b / cov);
      raw[o + 3] = Math.round(a / n);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Home-screen icons are full-bleed: iOS and Android apply their own mask.
writeFileSync('web/public/icon-192.png', png(192, true));
writeFileSync('web/public/icon-512.png', png(512, true));
console.log('wrote web/public/icon-192.png, icon-512.png');
