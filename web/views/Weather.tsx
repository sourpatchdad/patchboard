// Where the masthead's weather leads: active alerts first, then right now,
// the next 24 hours as a strip, and the week as temperature ranges on one
// shared scale so warm and cold days compare at a glance.

import { Link } from 'react-router-dom';
import type { WeatherData } from '../../shared/types.ts';
import { Empty, Led, Section } from '../components/ui.tsx';
import { useAppearance } from '../lib/appearance.ts';
import { deg, weatherText } from '../lib/format.ts';
import { useNow, useSource } from '../lib/store.tsx';
import { locale } from '../lib/region.ts';

const clockOf = (iso: string | undefined, h24: boolean) =>
  iso ? new Date(iso).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit', hour12: !h24 }) : '';

export function Weather() {
  const { state, data: w } = useSource<WeatherData>('weather');
  const { temp: unit, clock24 } = useAppearance();
  const now = useNow(60_000);
  if (!state) {
    return (
      <div className="page">
        <h1 className="page-title">Weather</h1>
        <Empty>
          No forecast yet. <Link to="/settings?tab=connections&setup=weather">Set your location</Link> to turn it on.
        </Empty>
      </div>
    );
  }
  if (!w) return null;
  const imperial = unit !== 'c';
  const speed = (kmh?: number) => (kmh == null ? '' : imperial ? `${Math.round(kmh * 0.621)} mph` : `${kmh} km/h`);
  const today = w.days[0];
  const daylight = today?.sunrise && today?.sunset ? (Date.parse(today.sunset) - Date.parse(today.sunrise)) / 60_000 : 0;
  const lo = Math.min(...w.days.map((d) => d.low));
  const hi = Math.max(...w.days.map((d) => d.high));
  const pos = (c: number) => ((c - lo) / Math.max(1, hi - lo)) * 100;
  const hours = w.hours ?? [];
  const hMin = Math.min(...hours.map((h) => h.temp));
  const hMax = Math.max(...hours.map((h) => h.temp));

  return (
    <div className="page weather-page">
      <div className="page-head">
        <h1 className="page-title">Weather</h1>
        <span className="section-count">{w.label}</span>
      </div>

      {(w.alerts ?? []).map((a) => (
        <div className={`weather-alert sev-${a.severity.toLowerCase()}`} key={a.headline}>
          <Led state={/extreme|severe/i.test(a.severity) ? 'crit' : 'warn'} />
          <strong>{a.event}</strong>
          {/* Services often start the headline with the event's own name: say it once. */}
          <span>{withoutEvent(a.headline ?? '', a.event)}</span>
          {a.until && !/\buntil\b/i.test(a.headline ?? '') && <time>until {new Date(a.until).toLocaleString(locale(), { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</time>}
        </div>
      ))}

      <section className="weather-now">
        <div className="weather-now-main">
          <span className="weather-big">{deg(w.tempNow, unit)}°</span>
          <span className="weather-cond">
            {weatherText(w.codeNow)}
            {today && (
              <small>
                High {deg(today.high, unit)}°, low {deg(today.low, unit)}°{today.precipPct >= 20 ? `, ${today.precipPct}% chance of rain` : ''}
              </small>
            )}
          </span>
        </div>
        <dl className="weather-facts">
          {w.feelsNow != null && (
            <div>
              <dt>Feels like</dt>
              <dd>{deg(w.feelsNow, unit)}°</dd>
            </div>
          )}
          {w.windNow != null && (
            <div>
              <dt>Wind</dt>
              <dd>{speed(w.windNow)}</dd>
            </div>
          )}
          {w.humidityNow != null && (
            <div>
              <dt>Humidity</dt>
              <dd>{w.humidityNow}%</dd>
            </div>
          )}
          {today?.uvMax != null && (
            <div>
              <dt>UV today</dt>
              <dd>
                {today.uvMax}
                <small>{today.uvMax >= 8 ? ' very high' : today.uvMax >= 6 ? ' high' : today.uvMax >= 3 ? ' moderate' : ' low'}</small>
              </dd>
            </div>
          )}
          {today?.sunrise && (
            <div>
              <dt>Sunrise</dt>
              <dd>{clockOf(today.sunrise, clock24)}</dd>
            </div>
          )}
          {today?.sunset && (
            <div>
              <dt>Sunset</dt>
              <dd>
                {clockOf(today.sunset, clock24)}
                {daylight > 0 && (
                  <small>
                    {' '}
                    {Math.floor(daylight / 60)}h {Math.round(daylight % 60)}m of light
                  </small>
                )}
              </dd>
            </div>
          )}
        </dl>
      </section>

      {hours.length > 0 && (
        <Section title="Next 24 hours">
          <div className="hours" role="list">
            {hours.map((h, i) => {
              const t = new Date(h.time);
              const lift = ((h.temp - hMin) / Math.max(1, hMax - hMin)) * 28;
              return (
                <div className="hour" role="listitem" key={h.time} title={`${weatherText(h.code)}, ${h.precipPct}% chance of rain`}>
                  <span className="hour-temp" style={{ marginBottom: lift }}>
                    {deg(h.temp, unit)}°
                  </span>
                  <span className="hour-rain" aria-label={`${h.precipPct}% chance of rain`}>
                    <i style={{ height: `${h.precipPct}%` }} />
                  </span>
                  <span className="hour-pct">{h.precipPct >= 20 ? `${h.precipPct}%` : ''}</span>
                  <time className={t.getHours() === 0 ? 'is-midnight' : ''}>
                    {i === 0 ? 'Now' : t.toLocaleTimeString(locale(), { hour: 'numeric', hour12: !clock24 }).replace(/\s?([AP])M/i, (_m, a: string) => a.toLowerCase())}
                  </time>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="This week">
        <ul className="week">
          {w.days.map((d, i) => (
            <li key={d.date}>
              <span className="week-day">{i === 0 ? 'Today' : new Date(`${d.date}T12:00:00`).toLocaleDateString(locale(), { weekday: 'long' })}</span>
              <span className="week-cond">{weatherText(d.code)}</span>
              <span className="week-rain">{d.precipPct >= 20 ? `${d.precipPct}%` : ''}</span>
              <span className="week-lo">{deg(d.low, unit)}°</span>
              <span className="week-range" aria-hidden>
                <i style={{ left: `${pos(d.low)}%`, right: `${100 - pos(d.high)}%` }} />
                {i === 0 && <b style={{ left: `${pos(w.tempNow)}%` }} />}
              </span>
              <span className="week-hi">{deg(d.high, unit)}°</span>
              <span className="week-extra">
                {d.windMax != null && `wind to ${speed(d.windMax)}`}
                {d.uvMax != null && `, UV ${d.uvMax}`}
              </span>
            </li>
          ))}
        </ul>
        <p className="settings-note">
          Updated {Math.max(1, Math.round((now - (state.updatedAt ?? now)) / 60_000))} min ago. Forecast from Open-Meteo; alerts, in the US, from the National Weather Service.
        </p>
      </Section>
    </div>
  );
}

/** "Wind Advisory until Tuesday" under a "Wind Advisory" label reads "Until Tuesday". */
function withoutEvent(headline: string, event: string): string {
  if (!event || !headline.toLowerCase().startsWith(event.toLowerCase())) return headline;
  const rest = headline.slice(event.length).replace(/^[\s,:.-]+/, '');
  return rest ? rest[0].toUpperCase() + rest.slice(1) : headline;
}
