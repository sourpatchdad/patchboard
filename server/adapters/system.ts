// Host vitals. Inside a container, os.cpus(), loadavg, uptime and /proc/meminfo
// report the host. Memory is split three ways because on TrueNAS the ZFS ARC
// (a cache the kernel hands back under pressure) holds most of RAM, and
// counting it as "used" makes a healthy box look full. The ARC size comes from
// /proc/spl/kstat/zfs/arcstats, which the ZFS module exposes host-wide.

import { readFile, statfs } from 'node:fs/promises';
import os from 'node:os';
import type { SystemData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { type Adapter, SECOND } from './adapter.ts';

function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    const t = c.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

async function memory(): Promise<SystemData['mem']> {
  try {
    const info = await readFile('/proc/meminfo', 'utf8');
    const kb = (key: string) => Number(new RegExp(`^${key}:\\s+(\\d+)`, 'm').exec(info)?.[1] ?? 0) * 1024;
    const total = kb('MemTotal');
    const available = kb('MemAvailable');
    let arc = 0;
    try {
      const stats = await readFile('/proc/spl/kstat/zfs/arcstats', 'utf8');
      arc = Number(/^size\s+\d+\s+(\d+)/m.exec(stats)?.[1] ?? 0);
    } catch {
      // Not a ZFS host, or not visible: memory is then used vs available.
    }
    return total ? { total, available, arc } : null;
  } catch {
    return null;
  }
}

export function systemAdapter(): Adapter<SystemData> {
  let prev = cpuTimes();
  return {
    id: 'system',
    label: 'System',
    intervalMs: 5 * SECOND,
    async fetch() {
      const now = cpuTimes();
      const dTotal = now.total - prev.total;
      const cpuPct = dTotal > 0 ? (1 - (now.idle - prev.idle) / dTotal) * 100 : 0;
      prev = now;

      // Fallback only: statfs sees a single dataset, so the TrueNAS source is
      // what Patchboard trusts for pool capacity when it's configured.
      let pool: SystemData['pool'] = null;
      if (config.poolPath) {
        const s = await statfs(config.poolPath);
        const totalBytes = s.blocks * s.bsize;
        const usedBytes = totalBytes - s.bavail * s.bsize;
        pool = { path: config.poolPath, usedBytes, totalBytes, usedPct: (usedBytes / totalBytes) * 100 };
      }

      const [a, b, c] = os.loadavg();
      return {
        cpuPct: Math.max(0, Math.min(100, cpuPct)),
        load: [a, b, c],
        cores: os.cpus().length,
        uptimeSec: os.uptime(),
        pool,
        mem: await memory(),
      };
    },
  };
}
