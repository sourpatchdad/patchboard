// The car, through Tessie: charge and range with the week behind them, the
// cabin and outside temperatures with the day behind them, and the four
// tires where they sit on the car. Patchboard records each reading Tessie
// has (never waking the car), so the lines start the day Tessie is set up.

import { Lines, Spark } from '../components/Spark.tsx';
import { Empty, Meter, Section } from '../components/ui.tsx';
import { useAppearance } from '../lib/appearance.ts';
import { useHistory } from '../lib/api.ts';
import { agoLong, deg } from '../lib/format.ts';
import { locale } from '../lib/region.ts';
import { useSource, useStore } from '../lib/store.tsx';
import { type CarData, carKey, TIRES, type TirePos } from '../../shared/types.ts';
import { PSI, softTires } from '../../shared/car.ts';
import { CarTires } from './CarSketch.tsx';
import { CarBlueprint, type CarSheet } from './CarBlueprint.tsx';
import { useWidget } from './widget-context.ts';

const CHARGE_WORDS: Record<string, string> = {
  Charging: 'Charging',
  Complete: 'Charged',
  Stopped: 'Plugged in, not charging',
  Disconnected: 'Unplugged',
  Starting: 'Starting to charge',
  NoPower: 'Plugged in, no power',
};

/** "1 h 25 min", "24 min": a drive or a charge, never "m" beside miles. */
function minutes(ms: number): string {
  const all = Math.max(1, Math.round(ms / 60_000));
  const h = Math.floor(all / 60);
  return `${h ? `${h} h ` : ''}${all % 60} min`;
}

const TIRE_NAMES: Record<TirePos, string> = {
  fl: 'Front left',
  fr: 'Front right',
  rl: 'Rear left',
  rr: 'Rear right',
};
export function CarWidget() {
  const { state, data } = useSource<CarData>('tessie');
  const { snap } = useStore();
  const limits = snap?.limits;
  const readOnly = snap?.readOnly;
  const { style } = useWidget();
  const { temp: unit } = useAppearance();
  const cars = data?.cars ?? [];
  // A week of charge, a day of temperatures, for every car at once.
  const week = useHistory(
    cars.flatMap((c) => [carKey('battery', c.vin), ...TIRES.map((t) => carKey(`tire.${t}`, c.vin))]),
    24 * 7,
    168,
  );
  const day = useHistory(
    cars.flatMap((c) => [carKey('inside', c.vin), carKey('outside', c.vin)]),
    24,
    96,
  );
  if (!state || !data) return null;
  const metric = unit === 'c';
  const tire = (bar: number) => (metric ? bar.toFixed(1) : String(Math.round(bar * PSI)));
  return (
    <Section title="Car" source={state} className="car">
      {cars.length === 0 && <Empty>Tessie returned no cars for this token.</Empty>}
      {cars.map((c) => {
        const low = c.battery <= 20;
        const words = CHARGE_WORDS[c.charging] ?? c.charging;
        const h = c.minutesToFull ? Math.floor(c.minutesToFull / 60) : 0;
        const m = c.minutesToFull ? c.minutesToFull % 60 : 0;
        const soft = softTires(c.tires, limits);
        const inside = day[carKey('inside', c.vin)];
        const outside = day[carKey('outside', c.vin)];
        const temps = [...(inside ?? []), ...(outside ?? [])].map((p) => p[1]);
        const lo = temps.length ? Math.min(...temps) - 1 : 0;
        const hi = temps.length ? Math.max(...temps) + 1 : 1;
        const tireList = c.tires ? TIRES.map((p) => ({ pos: p, value: tire(c.tires![p]), name: TIRE_NAMES[p], soft: soft.includes(p) })) : [];
        // Dashboard: the car large with its tires, and the numbers that matter beside it.
        if (style === 'dashboard') {
          const range = metric ? `${Math.round(c.rangeMi * 1.609)} km` : `${c.rangeMi} mi`;
          const dist = (mi: number, digits = 0) => `${(metric ? mi * 1.609 : mi).toLocaleString(locale(), { maximumFractionDigits: digits })} ${metric ? 'km' : 'mi'}`;
          // The week's drives: the last one, how far in all, and the energy per distance where Tessie has it.
          const drives = c.drives ?? [];
          const last = drives[0];
          const metered = drives.filter((d) => d.kwh);
          const meteredMi = metered.reduce((n, d) => n + d.mi, 0);
          const meteredWh = metered.reduce((n, d) => n + d.kwh! * 1000, 0);
          const OPEN_WORDS: Record<string, string> = { fl: 'driver door', rl: 'driver rear door', fr: 'passenger door', rr: 'passenger rear door', frunk: 'frunk', trunk: 'trunk' };
          const sheet: CarSheet = {
            vin: c.vin,
            name: c.name,
            model: c.model,
            art: c.art,
            ro: !!readOnly,
            metric,
            unit: metric ? 'bar' : 'psi',
            tires: tireList,
            battery: c.battery,
            usable: c.usable,
            limit: c.limit,
            low,
            range,
            rangeMi: c.rangeMi,
            state: c.charging === 'Charging' ? 'Charging' : c.cable || (c.charging && c.charging !== 'Disconnected') ? 'Plugged in' : 'Unplugged',
            plugged: !!c.cable || (!!c.charging && c.charging !== 'Disconnected'),
            charging: c.charging === 'Charging',
            kw: c.chargeKw ? `${c.chargeKw} kW` : undefined,
            volts: c.volts,
            amps: c.amps,
            added: c.addedKwh ? `${c.addedKwh.toFixed(1)} kWh` : undefined,
            toFull: c.charging === 'Charging' && c.minutesToFull ? minutes(c.minutesToFull * 60_000) : undefined,
            inside: c.insideC != null ? `${deg(c.insideC, unit)}°` : undefined,
            outside: c.outsideC != null ? `${deg(c.outsideC, unit)}°` : undefined,
            insideC: c.insideC,
            outsideC: c.outsideC,
            climate: c.climateOn,
            locked: c.locked,
            open: Object.entries(c.open ?? {})
              .filter(([, v]) => v)
              .map(([k]) => OPEN_WORDS[k] ?? k),
            sentry: c.sentry,
            odometer: metric ? `${Math.round(c.odometerMi * 1.609).toLocaleString(locale())} km` : `${c.odometerMi.toLocaleString(locale())} mi`,
            read: agoLong(c.updatedAt),
            asleep: c.asleep,
            note: soft.length ? `${soft.map((t) => TIRE_NAMES[t]).join(' and ')} ${soft.length === 1 ? 'tire is' : 'tires are'} low` : undefined,
            week: { battery: week[carKey('battery', c.vin)], tires: Object.fromEntries(TIRES.map((t) => [t, week[carKey(`tire.${t}`, c.vin)]])) },
            day: { inside, outside },
            tireText: (v) => tire(v),
            tempText: (v) => `${deg(v, unit)}°`,
            toTemp: (v) => (unit === 'c' ? v : v * 1.8 + 32),
            dist: (mi) => dist(mi),
            parts: c.open ?? {},
            portOpen: c.portOpen,
            noControls: !!readOnly || !!snap?.household,
            parked: c.parked,
            lastDrive: last ? `${dist(last.mi, 1)} · ${minutes(last.end - last.start)}` : undefined,
            weekDriven: drives.length ? dist(drives.reduce((n, d) => n + d.mi, 0)) : undefined,
            efficiency: meteredMi >= 1 ? `${Math.round(meteredWh / (metric ? meteredMi * 1.609 : meteredMi))} ${metric ? 'Wh/km' : 'Wh/mi'}` : undefined,
          };
          return (
            <CarBlueprint
              key={c.vin}
              sheet={sheet}
              fallback={
            <div className="car-dash">
              <div className="car-dash-stage"><CarTires vin={c.vin} art={c.art} unit={metric ? 'bar' : 'psi'} tires={tireList} /></div>
              <div className="car-dash-side">
                {cars.length > 1 && <h3 className="car-name">{c.name}</h3>}
                <div className="car-dash-charge">
                  <span className={`car-dash-num ${low ? 'warn-text' : ''}`}>{c.battery}%</span>
                  <span className="car-dash-range">{metric ? `${Math.round(c.rangeMi * 1.609)} km` : `${c.rangeMi} mi`}</span>
                </div>
                <div className="car-bar">
                  <Meter label={`${c.name} battery charge`} value={c.battery} level={low ? 'warn' : 'ok'} />
                  <i className="car-limit" style={{ left: `${c.limit}%` }} title={`Charge limit ${c.limit}%`} />
                </div>
                <p className="car-line">
                  {c.driving ? 'Driving' : words}
                  {c.charging === 'Charging' && c.minutesToFull ? `, full in ${h ? `${h} h ` : ''}${m} min` : ''}
                  {c.chargeKw ? ` at ${c.chargeKw} kW` : ''}.
                </p>
                <dl className="car-dash-facts">
                  {c.insideC != null && (
                    <div>
                      <dt>Inside</dt>
                      <dd>
                        {deg(c.insideC, unit)}°{c.climateOn ? ', climate on' : ''}
                      </dd>
                    </div>
                  )}
                  {c.outsideC != null && (
                    <div>
                      <dt>Outside</dt>
                      <dd>{deg(c.outsideC, unit)}°</dd>
                    </div>
                  )}
                  <div>
                    <dt>Doors</dt>
                    <dd className={c.locked ? '' : 'warn-text'}>{c.locked ? 'Locked' : 'Unlocked'}</dd>
                  </div>
                  <div>
                    <dt>Sentry</dt>
                    <dd>{c.sentry ? 'On' : 'Off'}</dd>
                  </div>
                </dl>
                {soft.length > 0 && (
                  <p className="car-line warn-text">
                    {soft.map((t) => TIRE_NAMES[t]).join(' and ')} {soft.length === 1 ? 'tire is' : 'tires are'} low.
                  </p>
                )}
                <p className="car-seen">
                  {c.asleep ? 'Asleep. ' : ''}Updated {agoLong(c.updatedAt)}.
                </p>
              </div>
            </div>
              }
            />
          );
        }
        return (
          <div className="car-one" key={c.vin}>
            {cars.length > 1 && <h3 className="car-name">{c.name}</h3>}
            <div className="car-cols">
              <div className="car-charge">
                <div className="car-top">
                  <span className={`car-pct ${low ? 'warn-text' : ''}`}>{c.battery}%</span>
                  <span className="car-range">{metric ? `${Math.round(c.rangeMi * 1.609)} km` : `${c.rangeMi} mi`}</span>
                </div>
                <div className="car-bar">
                  <Meter label={`${c.name} battery charge`} value={c.battery} level={low ? 'warn' : 'ok'} />
                  <i className="car-limit" style={{ left: `${c.limit}%` }} title={`Charge limit ${c.limit}%`} />
                </div>
                <p className="car-line">
                  {c.driving ? 'Driving' : words}
                  {c.charging === 'Charging' && c.minutesToFull ? `, full in ${h ? `${h} h ` : ''}${m} min` : ''}
                  {c.chargeKw ? ` at ${c.chargeKw} kW` : ''}. Limit {c.limit}%.
                </p>
                <div className="car-chart">
                  <Spark data={week[carKey('battery', c.vin)]} min={0} max={100} height={36} format={(v) => `${Math.round(v)}%`} label={`${c.name} charge, last 7 days`} />
                  <span className="car-chart-label">Charge, last 7 days</span>
                </div>
              </div>
              <div className="car-env">
                <div className="car-temps">
                  {c.insideC != null && (
                    <p>
                      <span className="car-temp-num">{deg(c.insideC, unit)}°</span>
                      <span className="car-temp-what">
                        inside
                        {c.climateOn ? `, climate on${c.setC != null ? ` to ${deg(c.setC, unit)}°` : ''}` : ''}
                      </span>
                    </p>
                  )}
                  {c.outsideC != null && (
                    <p>
                      <span className="car-temp-num">{deg(c.outsideC, unit)}°</span>
                      <span className="car-temp-what">outside</span>
                    </p>
                  )}
                </div>
                {(inside?.length ?? 0) > 1 && (
                  <div className="car-chart car-chart-pair">
                    <Spark data={inside} min={lo} max={hi} height={30} format={(v) => `${deg(v, unit)}° inside`} label={`${c.name} inside temperature, last 24 hours`} />
                    <span className="car-chart-outside">
                      <Spark data={outside} min={lo} max={hi} height={30} format={(v) => `${deg(v, unit)}° outside`} label={`${c.name} outside temperature, last 24 hours`} />
                    </span>
                    <span className="car-chart-label">Inside, and outside dashed, last 24 hours</span>
                  </div>
                )}

                {/* The car always: a sleeping car often reports no tire pressures, and then only the figures are missing. */}
                <CarTires vin={c.vin} art={c.art} unit={metric ? 'bar' : 'psi'} tires={tireList} />
                {c.tires && (
                  <div className="car-chart">
                    <Lines
                      height={34}
                      format={(v) => `${tire(v)} ${metric ? 'bar' : 'psi'}`}
                      label={`${c.name} tire pressures, last 7 days`}
                      lines={TIRES.map((t) => ({ data: week[carKey(`tire.${t}`, c.vin)], label: TIRE_NAMES[t], className: soft.includes(t) ? 'is-soft' : undefined }))}
                    />
                    <span className="car-chart-label">Tires, last 7 days</span>
                  </div>
                )}
                {soft.length > 0 && (
                  <p className="car-line warn-text">
                    {soft.map((t) => TIRE_NAMES[t]).join(' and ')} {soft.length === 1 ? 'tire is' : 'tires are'} low.
                  </p>
                )}
              </div>
            </div>

            <dl className="car-facts">
              <div>
                <dt>Doors</dt>
                <dd className={c.locked ? '' : 'warn-text'}>{c.locked ? 'Locked' : 'Unlocked'}</dd>
              </div>
              <div>
                <dt>Odometer</dt>
                <dd>{metric ? `${Math.round(c.odometerMi * 1.609).toLocaleString(locale())} km` : `${c.odometerMi.toLocaleString(locale())} mi`}</dd>
              </div>
              <div>
                <dt>Sentry</dt>
                <dd>{c.sentry ? 'On' : 'Off'}</dd>
              </div>
            </dl>
            <p className="car-seen">
              {c.asleep ? 'Asleep. ' : ''}Updated {agoLong(c.updatedAt)}.
            </p>
          </div>
        );
      })}
    </Section>
  );
}
