// Open-Meteo: free, no API key. Current conditions, the next 24 hours and
// seven days. In the US, active alerts come from the National Weather
// Service (also free, no key); anywhere else, or if it doesn't answer, the
// forecast still shows.

import type { WeatherAlert, WeatherData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { getJson } from '../http.ts';
import { type Adapter, MINUTE } from './adapter.ts';

interface OpenMeteo {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
    relative_humidity_2m: number;
    is_day: number;
  };
  hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[] };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
    precipitation_probability_max: number[];
    sunrise: string[];
    sunset: string[];
    uv_index_max: number[];
    wind_speed_10m_max: number[];
  };
}

interface NwsAlerts {
  features: { properties: { event: string; headline?: string; severity?: string; ends?: string | null; expires?: string } }[];
}

export function weatherAdapter(): Adapter<WeatherData> {
  const w = config.weather!;
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${w.lat}&longitude=${w.lon}` +
    '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day' +
    '&hourly=temperature_2m,precipitation_probability,weather_code&forecast_hours=24' +
    '&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,sunrise,sunset,uv_index_max,wind_speed_10m_max' +
    '&temperature_unit=celsius&wind_speed_unit=kmh&timezone=auto&forecast_days=7';
  return {
    id: 'weather',
    label: 'Weather',
    intervalMs: 15 * MINUTE,
    async fetch() {
      const r = await getJson<OpenMeteo>(url);
      return {
        label: w.label,
        tempNow: Math.round(r.current.temperature_2m),
        codeNow: r.current.weather_code,
        feelsNow: Math.round(r.current.apparent_temperature),
        windNow: Math.round(r.current.wind_speed_10m),
        humidityNow: Math.round(r.current.relative_humidity_2m),
        isDay: r.current.is_day === 1,
        hours: (r.hourly?.time ?? []).map((time, i) => ({
          time,
          temp: Math.round(r.hourly.temperature_2m[i]),
          code: r.hourly.weather_code[i],
          precipPct: r.hourly.precipitation_probability[i] ?? 0,
        })),
        days: r.daily.time.map((date, i) => ({
          date,
          high: Math.round(r.daily.temperature_2m_max[i]),
          low: Math.round(r.daily.temperature_2m_min[i]),
          code: r.daily.weather_code[i],
          precipPct: r.daily.precipitation_probability_max[i] ?? 0,
          sunrise: r.daily.sunrise?.[i],
          sunset: r.daily.sunset?.[i],
          uvMax: r.daily.uv_index_max?.[i] != null ? Math.round(r.daily.uv_index_max[i]) : undefined,
          windMax: r.daily.wind_speed_10m_max?.[i] != null ? Math.round(r.daily.wind_speed_10m_max[i]) : undefined,
        })),
        alerts: await nwsAlerts(w.lat, w.lon),
      };
    },
  };
}

/** Active US alerts for the point. Empty outside the US or on any failure. */
async function nwsAlerts(lat: number, lon: number): Promise<WeatherAlert[]> {
  if (lat < 17 || lat > 72 || lon > -64 || lon < -180) return [];
  try {
    const r = await getJson<NwsAlerts>(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`, {
      headers: { 'User-Agent': 'Patchboard/1 (self-hosted dashboard)', Accept: 'application/geo+json' },
    });
    return r.features.slice(0, 5).map((f) => ({
      event: f.properties.event,
      headline: f.properties.headline ?? f.properties.event,
      severity: f.properties.severity ?? 'Unknown',
      until: f.properties.ends ?? f.properties.expires ?? undefined,
    }));
  } catch {
    return [];
  }
}
