// The server as a picture, for screens with no browser: TRMNL, Pimoroni
// Inky, an ESP32 with an e-paper panel, a jailbroken Kindle. One bit per
// pixel, drawn here in a bitmap font (Spleen, BSD-2-Clause, in fonts/) and
// written as PNG or BMP with nothing but zlib. A household device's link
// token opens it, so the picture shows what that device may see.

import { readFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import type { Alert, Snapshot, SystemData, TruenasData, WeatherData } from '../shared/types.ts';

type Face = { w: number; h: number; ascent: number; glyphs: Record<string, string> };
const FONT = JSON.parse(readFileSync(new URL('./fonts/spleen.json', import.meta.url), 'utf8')) as Record<string, Face>;

// Characters the font lacks, drawn as the nearest it has.
const STAND_IN: Record<string, string> = { '−': '-', '▲': '^', '▼': 'v', '■': '#' };

/** A one-bit picture: 1 is ink. */
export class Bitmap {
  readonly w: number;
  readonly h: number;
  readonly px: Uint8Array;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h);
  }

  set(x: number, y: number, ink = 1): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = ink;
  }

  rect(x: number, y: number, w: number, h: number, ink = 1): void {
    for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++) this.px.fill(ink, j * this.w + Math.max(0, x), j * this.w + Math.min(this.w, x + w));
  }

  frame(x: number, y: number, w: number, h: number, t = 1): void {
    this.rect(x, y, w, t);
    this.rect(x, y + h - t, w, t);
    this.rect(x, y, t, h);
    this.rect(x + w - t, y, t, h);
  }

  /** Text at a size (16, 24, 32, 64, or 128 drawn from 64 at twice the scale). Returns the width drawn. */
  text(x: number, y: number, s: string, size: number, ink = 1, maxW = Infinity): number {
    const scale = size > 64 ? Math.round(size / 64) : 1;
    const face = FONT[String(size > 64 ? 64 : size)] ?? FONT['16'];
    const cw = face.w * scale;
    let chars = [...s];
    if (chars.length * cw > maxW) chars = [...chars.slice(0, Math.max(0, Math.floor(maxW / cw) - 1)), '…'];
    let cx = x;
    for (const ch of chars) {
      const hex = face.glyphs[String((STAND_IN[ch] ?? ch).codePointAt(0))] ?? face.glyphs['63'];
      const rowBytes = Math.ceil(face.w / 8);
      for (let r = 0; r < face.h; r++) {
        for (let c = 0; c < face.w; c++) {
          const byte = parseInt(hex.substr((r * rowBytes + (c >> 3)) * 2, 2), 16);
          if (byte & (0x80 >> (c & 7))) {
            if (scale === 1) this.set(cx + c, y + r, ink);
            else this.rect(cx + c * scale, y + r * scale, scale, scale, ink);
          }
        }
      }
      cx += cw;
    }
    return cx - x;
  }

  static textWidth(s: string, size: number): number {
    const scale = size > 64 ? Math.round(size / 64) : 1;
    return [...s].length * (FONT[String(size > 64 ? 64 : size)] ?? FONT['16']).w * scale;
  }

  /** A meter: a frame, filled to `pct`. */
  bar(x: number, y: number, w: number, h: number, pct: number): void {
    this.frame(x, y, w, h, Math.max(1, Math.round(h / 8)));
    this.rect(x, y, Math.round((w * Math.min(100, Math.max(0, pct))) / 100), h);
  }

  invert(): void {
    for (let i = 0; i < this.px.length; i++) this.px[i] ^= 1;
  }
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/** A one-bit grayscale PNG: white paper, black ink. */
export function png(b: Bitmap): Buffer {
  const rowBytes = Math.ceil(b.w / 8);
  const raw = Buffer.alloc((rowBytes + 1) * b.h);
  for (let y = 0; y < b.h; y++) {
    const o = y * (rowBytes + 1);
    for (let x = 0; x < b.w; x++) if (!b.px[y * b.w + x]) raw[o + 1 + (x >> 3)] |= 0x80 >> (x & 7);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(b.w, 0);
  ihdr.writeUInt32BE(b.h, 4);
  ihdr[8] = 1; // bit depth
  ihdr[9] = 0; // grayscale
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** A one-bit BMP, as TRMNL's firmware and many e-paper sketches read. */
export function bmp(b: Bitmap): Buffer {
  const rowBytes = Math.ceil(b.w / 32) * 4;
  const size = 62 + rowBytes * b.h;
  const out = Buffer.alloc(size);
  out.write('BM', 0, 'ascii');
  out.writeUInt32LE(size, 2);
  out.writeUInt32LE(62, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(b.w, 18);
  out.writeInt32LE(b.h, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(1, 28);
  out.writeUInt32LE(rowBytes * b.h, 34);
  out.writeUInt32LE(2835, 38);
  out.writeUInt32LE(2835, 42);
  out.writeUInt32LE(2, 46);
  // Palette: 0 is black, 1 is white.
  out.writeUInt32LE(0x000000, 54);
  out.writeUInt32LE(0xffffff, 58);
  for (let y = 0; y < b.h; y++) {
    const o = 62 + (b.h - 1 - y) * rowBytes;
    for (let x = 0; x < b.w; x++) if (!b.px[y * b.w + x]) out[o + (x >> 3)] |= 0x80 >> (x & 7);
  }
  return out;
}

export interface PanelOptions {
  w: number;
  h: number;
  /** Temperatures in Fahrenheit. */
  f: boolean;
  clock24: boolean;
  /** White on black. */
  invert: boolean;
  now?: number;
}

const deg = (c: number, f: boolean) => `${Math.round(f ? (c * 9) / 5 + 32 : c)}°`;
const WEATHER: [number, string][] = [
  [0, 'Clear'],
  [2, 'Partly cloudy'],
  [3, 'Overcast'],
  [48, 'Fog'],
  [57, 'Drizzle'],
  [67, 'Rain'],
  [77, 'Snow'],
  [82, 'Showers'],
  [86, 'Snow showers'],
  [99, 'Thunderstorms'],
];
const sky = (code: number) => WEATHER.find(([max]) => code <= max)?.[1] ?? '';

/** The server on one screen: status and problems, the weather, and the gauges. */
export function drawPanel(snap: Snapshot, o: PanelOptions): Bitmap {
  const b = new Bitmap(o.w, o.h);
  const now = new Date(o.now ?? Date.now());
  // Sizes step up on bigger panels: 800 by 480 is the base.
  const k = Math.min(o.w / 800, o.h / 480);
  const up = k >= 2 ? 2 : k >= 1.4 ? 1 : 0;
  const S = (base: 16 | 24 | 32 | 64) => [16, 24, 32, 64, 128][Math.min(4, [16, 24, 32, 64].indexOf(base) + up)];
  const pad = Math.round(20 * Math.max(1, k));

  const sys = snap.sources.system?.data as SystemData | undefined;
  const nas = snap.sources.truenas?.data as TruenasData | undefined;
  const wx = snap.sources.weather?.data as WeatherData | undefined;
  const alerts = snap.alerts.filter((a: Alert) => a.level !== 'info').sort((a, b2) => (a.level === b2.level ? 0 : a.level === 'critical' ? -1 : 1));

  // The top band: the server's name, the date and the time, white on black.
  const bandH = S(32) + pad;
  b.rect(0, 0, o.w, bandH);
  const host = nas?.hostname ?? snap.brand?.name ?? 'Patchboard';
  b.text(pad, Math.round((bandH - S(32)) / 2), host, S(32), 0, o.w / 2 - pad);
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: !o.clock24 });
  const date = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const right = `${date}  ${time}`;
  b.text(o.w - pad - Bitmap.textWidth(right, S(32)), Math.round((bandH - S(32)) / 2), right, S(32), 0);

  // Left: how things stand, then what needs you.
  const colW = Math.round(o.w * 0.58);
  let y = bandH + pad;
  const status = alerts.length === 0 ? 'All quiet.' : alerts.length === 1 ? 'One thing needs you.' : `${alerts.length} things need you.`;
  // As large as fits the column.
  const statusSize = [S(64), S(32), S(24), 16].find((z) => Bitmap.textWidth(status, z) <= colW - pad * 2) ?? 16;
  b.text(pad, y, status, statusSize, 1, colW - pad * 2);
  y += statusSize + Math.round(pad * 0.75);
  // Problems one size under the status line, so it always leads.
  const STEPS = [16, 24, 32, 64, 128];
  const lineSize = STEPS[Math.max(0, STEPS.indexOf(statusSize) - 1)];
  const lineH = lineSize + Math.round(pad * 0.5);
  const room = Math.max(0, Math.floor((o.h - y - S(32) * 2 - pad * 3) / lineH));
  for (const a of alerts.slice(0, room)) {
    const m = lineSize;
    const mark = Math.round(m * 0.5);
    const my = y + Math.round((m - mark) / 2);
    // Critical: a solid square. A warning: an open one.
    if (a.level === 'critical') b.rect(pad, my, mark, mark);
    else b.frame(pad, my, mark, mark, Math.max(2, Math.round(mark / 6)));
    b.text(pad + mark + Math.round(m * 0.5), y, a.title, m, 1, colW - pad * 2 - mark - m);
    y += lineH;
  }
  if (alerts.length > room && room > 0) b.text(pad, y, `and ${alerts.length - room} more`, S(16));

  // Right: the weather.
  const rx = colW + pad;
  b.rect(colW, bandH + pad, Math.max(2, Math.round(k * 2)), o.h - bandH - pad * 2 - S(32) * 2 - pad);
  if (wx) {
    let wy = bandH + pad;
    b.text(rx, wy, deg(wx.tempNow, o.f), S(64));
    wy += S(64) + Math.round(pad * 0.4);
    b.text(rx, wy, sky(wx.codeNow), S(24), 1, o.w - rx - pad);
    wy += S(24) + Math.round(pad * 0.3);
    const today = wx.days[0];
    if (today) b.text(rx, wy, `High ${deg(today.high, o.f)}  Low ${deg(today.low, o.f)}`, S(16), 1, o.w - rx - pad);
    wy += S(16) + pad;
    for (const d of wx.days.slice(1, 4)) {
      if (wy + S(16) > o.h - S(32) * 2 - pad * 2) break;
      const day = new Date(`${d.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
      b.text(rx, wy, `${day}  ${deg(d.high, o.f)} ${deg(d.low, o.f)}  ${sky(d.code)}`, S(16), 1, o.w - rx - pad);
      wy += S(16) + Math.round(pad * 0.4);
    }
  }

  // The gauges along the bottom: CPU, memory, the pool.
  const gy = o.h - S(32) * 2 - pad;
  b.rect(pad, gy - Math.round(pad / 2), o.w - pad * 2, Math.max(2, Math.round(k * 2)));
  const pool = nas?.pools[0];
  const memPct = sys?.mem ? ((sys.mem.total - sys.mem.available) / sys.mem.total) * 100 : null;
  const gauges: [string, number | null][] = [
    ['CPU', sys ? sys.cpuPct : null],
    ['Memory', memPct],
    [pool ? `Pool ${pool.name}` : 'Storage', pool ? pool.usedPct : (sys?.pool?.usedPct ?? null)],
  ];
  const gw = Math.floor((o.w - pad * 2 - pad * 2) / 3);
  gauges.forEach(([label, v], i) => {
    const gx = pad + i * (gw + pad);
    b.text(gx, gy, label, S(16), 1, gw - Bitmap.textWidth('100%', S(24)) - pad);
    const val = v === null ? '-' : `${Math.round(v)}%`;
    b.text(gx + gw - Bitmap.textWidth(val, S(24)), gy - Math.round((S(24) - S(16)) / 2), val, S(24));
    if (v !== null) b.bar(gx, gy + S(24) + Math.round(pad * 0.3), gw, Math.round(S(16) * 0.75), v);
  });

  if (o.invert) b.invert();
  return b;
}
