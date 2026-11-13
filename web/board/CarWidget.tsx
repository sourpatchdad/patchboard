// The car, through Tessie: charge and range with the week behind them, the
// cabin and outside temperatures with the day behind them, and the four
// tires where they sit on the car. Patchboard records each reading Tessie
// has (never waking the car), so the lines start the day Tessie is set up.

import { Spark } from '../components/Spark.tsx';
import { Empty, Meter, Section } from '../components/ui.tsx';
import { useAppearance } from '../lib/appearance.ts';
import { useHistory } from '../lib/api.ts';
import { agoLong, deg } from '../lib/format.ts';
import { locale } from '../lib/region.ts';
import { useSource } from '../lib/store.tsx';
import { type CarData, carKey, TIRES, type TirePos } from '../../shared/types.ts';
import { PSI, softTires } from '../../shared/car.ts';

const CHARGE_WORDS: Record<string, string> = {
  Charging: 'Charging',
  Complete: 'Charged',
  Stopped: 'Plugged in, not charging',
  Disconnected: 'Unplugged',
  Starting: 'Starting to charge',
  NoPower: 'Plugged in, no power',
};

const TIRE_NAMES: Record<TirePos, string> = {
  fl: 'Front left',
  fr: 'Front right',
  rl: 'Rear left',
  rr: 'Rear right',
};
export function CarWidget() {
  const { state, data } = useSource<CarData>('tessie');
  const { temp: unit } = useAppearance();
  const cars = data?.cars ?? [];
  // A week of charge, a day of temperatures, for every car at once.
  const week = useHistory(
    cars.flatMap((c) => [carKey('battery', c.vin)]),
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
        const soft = softTires(c.tires);
        const inside = day[carKey('inside', c.vin)];
        const outside = day[carKey('outside', c.vin)];
        const temps = [...(inside ?? []), ...(outside ?? [])].map((p) => p[1]);
        const lo = temps.length ? Math.min(...temps) - 1 : 0;
        const hi = temps.length ? Math.max(...temps) + 1 : 1;
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
                  <Spark data={week[carKey('battery', c.vin)]} min={0} max={100} height={36} label={`${c.name} charge, last 7 days`} />
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
                    <Spark data={inside} min={lo} max={hi} height={30} label={`${c.name} inside temperature, last 24 hours`} />
                    <span className="car-chart-outside">
                      <Spark data={outside} min={lo} max={hi} height={30} label={`${c.name} outside temperature, last 24 hours`} />
                    </span>
                    <span className="car-chart-label">Inside, and outside dashed, last 24 hours</span>
                  </div>
                )}

                {c.tires && (
                  <div className="car-tires" role="group" aria-label={`Tires, ${metric ? 'bar' : 'psi'}`}>
                    {TIRES.map((t) => (
                      <span key={t} className={`car-tire car-tire-${t} ${soft.includes(t) ? 'is-soft' : ''}`} title={TIRE_NAMES[t]}>
                        <span className="car-tire-num">{tire(c.tires![t])}</span>
                        <span className="car-tire-pos">{TIRE_NAMES[t]}</span>
                      </span>
                    ))}
                    <span className="car-tires-body" aria-hidden="true" />
                    <span className="car-tires-unit">{metric ? 'bar' : 'psi'}</span>
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
