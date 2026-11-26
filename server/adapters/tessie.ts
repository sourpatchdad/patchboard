// Tessie: your Tesla's battery, range, charging, climate and locks, from
// Tessie's cached state. Reading it never wakes the car, so polling costs
// nothing in battery. https://developer.tessie.com

import { type Car, type CarData, type Drive, TIRES } from '../../shared/types.ts';
import { artFor } from '../../shared/car-art.ts';
import { config } from '../config.ts';
import { CAR_COMMANDS, type CarCommand } from '../../shared/car-commands.ts';
import { getJson, request } from '../http.ts';
import { type Adapter, MINUTE } from './adapter.ts';

interface Vehicle {
  vin: string;
  last_state?: {
    display_name?: string;
    state?: string; // online, asleep, offline
    charge_state?: {
      battery_level?: number;
      battery_range?: number; // miles
      charging_state?: string; // Charging, Complete, Disconnected, Stopped, Starting, NoPower
      minutes_to_full_charge?: number;
      charge_limit_soc?: number;
      charger_power?: number; // kW
      timestamp?: number;
      usable_battery_level?: number;
      charge_energy_added?: number; // kWh, this session
      charger_voltage?: number;
      charger_actual_current?: number;
      conn_charge_cable?: string; // "<invalid>" with no cable in
      charge_port_door_open?: boolean;
    };
    climate_state?: { inside_temp?: number; outside_temp?: number; is_climate_on?: boolean; driver_temp_setting?: number };
    vehicle_state?: {
      locked?: boolean;
      odometer?: number;
      sentry_mode?: boolean;
      car_version?: string;
      // In bar; null while the car hasn't measured since it woke.
      tpms_pressure_fl?: number | null;
      tpms_pressure_fr?: number | null;
      tpms_pressure_rl?: number | null;
      tpms_pressure_rr?: number | null;
      // 0 shut, anything else open: driver front, driver rear, passenger front, passenger rear, front and rear trunk.
      df?: number;
      dr?: number;
      pf?: number;
      pr?: number;
      ft?: number;
      rt?: number;
    };
    vehicle_config?: { car_type?: string; trim_badging?: string };
    drive_state?: { shift_state?: string | null };
  };
}

export function toCar(v: Vehicle): Car | null {
  const s = v.last_state;
  const c = s?.charge_state;
  if (!s || !c || c.battery_level == null) return null;
  return {
    vin: v.vin,
    name: s.display_name || 'Tesla',
    battery: c.battery_level,
    rangeMi: Math.round(c.battery_range ?? 0),
    charging: c.charging_state ?? 'Disconnected',
    minutesToFull: c.charging_state === 'Charging' ? c.minutes_to_full_charge : undefined,
    chargeKw: c.charging_state === 'Charging' ? c.charger_power : undefined,
    limit: c.charge_limit_soc ?? 80,
    insideC: s.climate_state?.inside_temp,
    outsideC: s.climate_state?.outside_temp,
    climateOn: !!s.climate_state?.is_climate_on,
    locked: s.vehicle_state?.locked ?? true,
    sentry: !!s.vehicle_state?.sentry_mode,
    odometerMi: Math.round(s.vehicle_state?.odometer ?? 0),
    driving: !!s.drive_state?.shift_state && s.drive_state.shift_state !== 'P',
    asleep: s.state === 'asleep',
    updatedAt: c.timestamp ?? Date.now(),
    setC: s.climate_state?.driver_temp_setting,
    tires: tiresOf(s.vehicle_state),
    model: modelName(s.vehicle_config?.car_type),
    trim: s.vehicle_config?.trim_badging || undefined,
    usable: c.usable_battery_level,
    addedKwh: c.charge_energy_added,
    volts: c.charging_state === 'Charging' ? c.charger_voltage : undefined,
    amps: c.charging_state === 'Charging' ? c.charger_actual_current : undefined,
    cable: c.conn_charge_cable == null ? undefined : c.conn_charge_cable !== '<invalid>' && c.conn_charge_cable !== '',
    portOpen: c.charge_port_door_open,
    open: openParts(s.vehicle_state),
  };
}

/** "model3" is "Model 3"; "cybertruck" is "Cybertruck". */
export function modelName(t?: string): string | undefined {
  if (!t) return undefined;
  const m = /^model([a-z0-9])$/i.exec(t);
  return m ? `Model ${m[1].toUpperCase()}` : t.charAt(0).toUpperCase() + t.slice(1);
}

/** Doors and trunks that stand open, when the car says. Tesla's driver side is left. */
function openParts(v: NonNullable<Vehicle['last_state']>['vehicle_state']): Car['open'] {
  if (!v || v.df == null) return undefined;
  return { fl: !!v.df, rl: !!v.dr, fr: !!v.pf, rr: !!v.pr, frunk: !!v.ft, trunk: !!v.rt };
}

/** All four pressures, or none: a car that has only some reports none yet. */
function tiresOf(v: NonNullable<Vehicle['last_state']>['vehicle_state']): Car['tires'] {
  const p = TIRES.map((t) => v?.[`tpms_pressure_${t}`]);
  if (p.some((x) => typeof x !== 'number' || !(x > 0))) return undefined;
  return { fl: p[0]!, fr: p[1]!, rl: p[2]!, rr: p[3]! };
}

/**
 * Asks the car to do something. Tessie wakes it if it must and waits for it
 * to finish, so this can take most of a minute on a sleeping car.
 */
export async function tessieCommand(vin: string, cmd: CarCommand, percent?: number): Promise<void> {
  const { token } = config.tessie!;
  const q = new URLSearchParams({ wait_for_completion: 'true' });
  if (cmd === 'limit' && percent != null) q.set('percent', String(percent));
  const res = await request(`https://api.tessie.com/${encodeURIComponent(vin)}/command/${CAR_COMMANDS[cmd]}?${q}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }, 75_000);
  const body = (await res.json().catch(() => ({}))) as { result?: boolean; reason?: string };
  if (body.result !== true) throw new Error(body.reason || 'The car said no');
}

interface TessieDrive {
  started_at?: number;
  ended_at?: number;
  odometer_distance?: number;
  energy_used?: number;
  starting_battery?: number;
  ending_battery?: number;
}

/** A drive from Tessie (seconds, miles), or null for a blip under a tenth of a mile. */
export function toDrive(d: TessieDrive): Drive | null {
  if (!d.started_at || !d.ended_at || !(Number(d.odometer_distance) >= 0.1)) return null;
  return {
    start: d.started_at * 1000,
    end: d.ended_at * 1000,
    mi: Math.round(d.odometer_distance! * 10) / 10,
    kwh: d.energy_used != null && d.energy_used > 0 ? Math.round(d.energy_used * 100) / 100 : undefined,
    battery: d.starting_battery != null && d.ending_battery != null ? [d.starting_battery, d.ending_battery] : undefined,
  };
}

/**
 * Where the car is, fit for a wall: your saved name for the place, or the town
 * from "street, town, state zip, country". Never the street.
 */
export function placeName(loc: { saved_location?: string | null; address?: string | null }): string | undefined {
  const saved = loc.saved_location?.trim();
  if (saved) return saved;
  const parts = (loc.address ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 4) return parts[parts.length - 3];
  return parts.length >= 2 ? parts[1] : undefined;
}

/** Drives and place change only when the car moves: look again once the odometer has, or every half hour. */
const EXTRA_EVERY = 30 * MINUTE;

export function tessieAdapter(): Adapter<CarData> {
  const { token, vin, car: picked } = config.tessie!;
  const headers = { Authorization: `Bearer ${token}` };
  const extra = new Map<string, { odo: number; at: number; parked?: string; drives?: Drive[] }>();
  const more = async (car: Car) => {
    const had = extra.get(car.vin);
    // Mid-drive the odometer ticks every poll: wait for the drive to end.
    if (had && (car.driving || (had.odo === car.odometerMi && Date.now() - had.at < EXTRA_EVERY))) return had;
    const week = Math.floor((Date.now() - 7 * 24 * 60 * MINUTE) / 1000);
    const base = `https://api.tessie.com/${encodeURIComponent(car.vin)}`;
    // Either can fail on its own; the car still shows, with what was known before.
    const [drives, loc] = await Promise.allSettled([
      getJson<{ results: TessieDrive[] }>(`${base}/drives?distance_format=mi&from=${week}&limit=100`, { headers }),
      getJson<{ saved_location?: string; address?: string }>(`${base}/location`, { headers }),
    ]);
    const next = {
      odo: car.odometerMi,
      at: Date.now(),
      drives:
        drives.status === 'fulfilled'
          ? drives.value.results
              .map(toDrive)
              .filter((d): d is Drive => d !== null)
              .sort((a, b) => b.end - a.end)
          : had?.drives,
      parked: loc.status === 'fulfilled' ? placeName(loc.value) : had?.parked,
    };
    extra.set(car.vin, next);
    return next;
  };
  return {
    id: 'tessie',
    label: 'Tesla',
    intervalMs: 2 * MINUTE,
    async fetch() {
      const r = await getJson<{ results: Vehicle[] }>('https://api.tessie.com/vehicles?only_active=false', { headers });
      const cars = r.results
        .filter((v) => !vin || v.vin === vin)
        .map(toCar)
        .filter((c): c is Car => c !== null)
        .map((c) => ({ ...c, art: artFor(picked, c.model) }));
      for (const car of cars) {
        const x = await more(car);
        car.drives = x.drives;
        // A car on the move is parked nowhere.
        car.parked = car.driving ? undefined : x.parked;
      }
      return { cars };
    },
  };
}
