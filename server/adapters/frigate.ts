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
