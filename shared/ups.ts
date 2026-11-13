// The UPS in one reading, for the Home header beside the server it powers.

import type { Ups } from './types.ts';

/** The UPS that matters most: one on battery, then one asking for a new battery, then the first. */
export function headlineUps(list: Ups[] | undefined): Ups | undefined {
  if (!list?.length) return undefined;
  return list.find((u) => u.onBattery || u.lowBattery) ?? list.find((u) => u.replaceBattery) ?? list[0];
}

type Tr = (english: string, vars?: Record<string, string | number>) => string;

/** "On battery, 23 min left", "Replace battery", or "UPS" while all is well, in the page's language. */
export function upsLabel(u: Ups, tr: Tr = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => String(v?.[k] ?? ''))): string {
  const left = u.runtimeSec == null ? '' : `, ${u.runtimeSec >= 3600 ? tr('{n} h left', { n: Math.floor(u.runtimeSec / 3600) }) : tr('{n} min left', { n: Math.max(1, Math.round(u.runtimeSec / 60)) })}`;
  if (u.lowBattery) return tr('Battery nearly empty') + left;
  if (u.onBattery) return tr('On battery') + left;
  if (u.replaceBattery) return tr('Replace battery');
  return tr('UPS');
}

export function upsLevel(u: Ups): 'ok' | 'warn' | 'crit' {
  if (u.lowBattery || u.onBattery || (u.charge ?? 100) < 30) return 'crit';
  if (u.replaceBattery || (u.charge ?? 100) < 60) return 'warn';
  return 'ok';
}
