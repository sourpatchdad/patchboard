// Frigate NVR: whether each camera is delivering frames, which ones detect
// objects, and what they saw in the last day. The pictures themselves come
// through /api/img/frigate, so the browser never needs Frigate's address.

import type { FrigateData, FrigateEvent } from '../../shared/types.ts';
import { config } from '../config.ts';
import { getJson, request } from '../http.ts';
import { type Adapter, SECOND } from './adapter.ts';

interface RawEvent {
  id: string;
  camera: string;
  label: string;
  sub_label?: string | [string, number] | null;
  start_time: number;
  top_score?: number | null;
  zones?: string[];
  data?: { top_score?: number };
}

/** Frigate's events as Patchboard shows them: newest first, times in milliseconds. */
export function toEvents(raw: RawEvent[]): FrigateEvent[] {
  return raw
    .filter((e) => e && typeof e.id === 'string' && typeof e.start_time === 'number')
    .map((e) => {
      const sub = Array.isArray(e.sub_label) ? e.sub_label[0] : e.sub_label;
      const score = e.data?.top_score ?? e.top_score;
      return {
        id: e.id,
        camera: e.camera,
        label: e.label,
        ...(sub ? { name: String(sub) } : {}),
        at: Math.round(e.start_time * 1000),
        ...(typeof score === 'number' ? { score: Math.round(score * 100) } : {}),
        zones: e.zones ?? [],
      };
    })
    .sort((a, b) => b.at - a.at);
}

export function frigateAdapter(): Adapter<FrigateData> {
  return {
    id: 'frigate',
    label: 'Frigate',
    intervalMs: 30 * SECOND,
    async fetch() {
      const base = config.frigate!.url;
      const [stats, conf] = await Promise.all([
        getJson<{ cameras: Record<string, { camera_fps: number }> }>(`${base}/api/stats`),
        getJson<{ cameras?: Record<string, { detect?: { enabled?: boolean } }> }>(`${base}/api/config`).catch(() => ({ cameras: undefined })),
      ]);
      const detecting = Object.entries(conf.cameras ?? {}).filter(([, c]) => c.detect?.enabled).map(([n]) => n);
      // Events exist only where detection runs; skip the call when none does.
      const after = Math.floor(Date.now() / 1000) - 86_400;
      const events = detecting.length ? toEvents(await getJson<RawEvent[]>(`${base}/api/events?limit=40&after=${after}`).catch(() => [])) : [];
      return {
        webUrl: base,
        cameras: Object.entries(stats.cameras).map(([name, c]) => ({
          name,
          fps: c.camera_fps,
          online: c.camera_fps > 0,
          detect: detecting.includes(name),
        })),
        events,
      };
    },
  };
}

const CAMERA = /^[\w-]{1,64}$/;
const EVENT = /^[\w.-]{1,80}$/;

/** A camera's newest frame, or an event's thumbnail, straight from Frigate. */
export async function frigateImage(q: { camera?: string; event?: string }): Promise<Response> {
  const base = config.frigate!.url;
  if (q.camera && CAMERA.test(q.camera)) return request(`${base}/api/${q.camera}/latest.jpg?h=360`);
  if (q.event && EVENT.test(q.event)) return request(`${base}/api/events/${q.event}/thumbnail.jpg`);
  throw new Error('Bad image');
}

/** At most this many live views at once, across every tab, so a forgotten tab can't pile up streams. */
export const LIVE_MAX = 3;
/** A live view ends itself after this long; reopen it to keep watching. */
export const LIVE_MS = 10 * 60_000;
let viewers = 0;

/**
 * A camera, live: Frigate's own motion-JPEG feed at five frames a second and
 * 540 pixels tall, passed straight through. Nothing is held: the stream asks
 * Frigate for the next chunk only when the browser has taken the last one,
 * and stops the moment the viewer closes, leaves, or hits the time limit.
 * Patchboard never decodes or re-encodes a frame.
 */
export async function frigateLive(camera: string, closed: AbortSignal): Promise<Response | 'busy'> {
  if (!CAMERA.test(camera)) throw new Error('Bad camera');
  if (viewers >= LIVE_MAX) return 'busy';
  const stop = new AbortController();
  const res = await fetch(`${config.frigate!.url}/api/${camera}?fps=5&h=540`, { signal: stop.signal });
  if (!res.ok || !res.body) {
    stop.abort();
    throw new Error(`Frigate answered ${res.status}`);
  }
  viewers++;
  const reader = res.body.getReader();
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    viewers--;
    clearTimeout(limit);
    stop.abort();
    void reader.cancel().catch(() => {});
  };
  const limit = setTimeout(end, LIVE_MS);
  limit.unref?.();
  closed.addEventListener('abort', end);
  const body = new ReadableStream<Uint8Array>(
    {
      async pull(out) {
        try {
          const { done, value } = await reader.read();
          if (done || ended) {
            end();
            out.close();
          } else out.enqueue(value);
        } catch {
          end();
          out.close();
        }
      },
      cancel: end,
    },
    // No read-ahead: one chunk at a time, so memory stays flat however long it runs.
    { highWaterMark: 0 },
  );
  return new Response(body, {
    headers: { 'Content-Type': res.headers.get('content-type') ?? 'multipart/x-mixed-replace;boundary=frame', 'Cache-Control': 'no-store' },
  });
}
