// Frigate NVR: we only care whether each camera is delivering frames.

import type { FrigateData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { getJson } from '../http.ts';
import { type Adapter, SECOND } from './adapter.ts';

export function frigateAdapter(): Adapter<FrigateData> {
  return {
    id: 'frigate',
    label: 'Frigate',
    intervalMs: 30 * SECOND,
    async fetch() {
      const stats = await getJson<{ cameras: Record<string, { camera_fps: number }> }>(
        `${config.frigate!.url}/api/stats`,
      );
      return {
        cameras: Object.entries(stats.cameras).map(([name, c]) => ({
          name,
          fps: c.camera_fps,
          online: c.camera_fps > 0,
        })),
      };
    },
  };
}
