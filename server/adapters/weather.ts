// Open-Meteo: free, no API key.

import type { WeatherData } from '../../shared/types.ts';
import { config } from '../config.ts';
import { getJson } from '../http.ts';
import { type Adapter, MINUTE } from './adapter.ts';

interface OpenMeteo {
  current: { temperature_2m: number; weather_code: number };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
    precipitation_probability_max: number[];
  };
}

export function weatherAdapter(): Adapter<WeatherData> {
  const w = config.weather!;
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${w.lat}&longitude=${w.lon}` +
    '&current=temperature_2m,weather_code' +
    '&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max' +
    '&temperature_unit=fahrenheit&timezone=auto&forecast_days=4';
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
        days: r.daily.time.map((date, i) => ({
          date,
          high: Math.round(r.daily.temperature_2m_max[i]),
          low: Math.round(r.daily.temperature_2m_min[i]),
          code: r.daily.weather_code[i],
          precipPct: r.daily.precipitation_probability_max[i] ?? 0,
        })),
      };
    },
  };
}
