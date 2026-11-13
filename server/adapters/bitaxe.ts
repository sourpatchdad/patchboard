// BitAxe and other AxeOS miners (NerdQAxe, Gamma, Supra): hashrate, the ASIC
// temperature, power and shares, from the miner's own local API. No key.
// BITAXE_URL takes one address or several, comma-separated, so one widget
// covers a shelf of them. A miner that doesn't answer shows as offline rather
// than failing the rest. https://github.com/bitaxeorg/ESP-Miner

import type { Miner, MinerData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { getJson } from '../http.ts';
import { type Adapter, SECOND } from './adapter.ts';

/** What AxeOS answers at /api/system/info; only the fields used here. */
export interface AxeInfo {
  hostname?: string;
  ASICModel?: string;
  deviceModel?: string;
  version?: string;
  hashRate?: number; // GH/s
  temp?: number; // ASIC, °C
  vrTemp?: number; // voltage regulator, °C
  power?: number; // W
  fanspeed?: number; // %
  bestDiff?: string | number;
  bestSessionDiff?: string | number;
  sharesAccepted?: number;
  sharesRejected?: number;
  uptimeSeconds?: number;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function toMiner(url: string, r: AxeInfo): Miner {
  return {
    url,
    name: r.hostname || new URL(url).hostname,
    model: r.deviceModel || r.ASICModel,
    version: r.version,
    ok: true,
    hashGh: num(r.hashRate) ?? 0,
    tempC: num(r.temp),
    vrTempC: num(r.vrTemp),
    powerW: num(r.power),
    fanPct: num(r.fanspeed),
    bestDiff: r.bestDiff != null ? String(r.bestDiff) : undefined,
    accepted: num(r.sharesAccepted) ?? 0,
    rejected: num(r.sharesRejected) ?? 0,
    uptimeSec: num(r.uptimeSeconds),
  };
}

export function bitaxeAdapter(): Adapter<MinerData> {
  const { urls } = config.bitaxe!;
  return {
    id: 'bitaxe',
    label: 'BitAxe',
    intervalMs: 30 * SECOND,
    async fetch() {
      const miners = await Promise.all(
        urls.map((url) =>
          getJson<AxeInfo>(`${url}/api/system/info`)
            .then((r) => toMiner(url, r))
            .catch((err: Error): Miner => ({ url, name: new URL(url).hostname, ok: false, error: err.message, hashGh: 0, accepted: 0, rejected: 0 })),
        ),
      );
      if (miners.every((m) => !m.ok)) throw new Error(miners[0]?.error ?? 'No miner answered');
      return { miners };
    },
  };
}
