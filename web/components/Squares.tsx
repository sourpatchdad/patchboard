// Square grids, in the manner of a contribution chart. Two kinds:
//
// - Health: one square per day. A healthy day is a quiet filled square,
//   trouble gets the warning or error tone, and days before Patchboard was
//   watching are empty outlines.
// - Heat: intensity in five steps of the accent color, for "when is this
//   busy" questions like CPU by hour of the week.

import type { DayState, Series } from '../../shared/types.ts';
import { locale } from '../lib/region.ts';

const STATE_TEXT: Record<DayState, string> = {
  up: 'no problems',
  warn: 'failed its health check',
  down: 'was down',
  none: 'not watched yet',
};

const dayName = (t: number) => new Date(t).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' });

export function HealthStrip({ states, days, label, large = false }: { states: DayState[] | undefined; days: number[]; label: string; large?: boolean }) {
  if (!states) return <span className={`squares ${large ? 'squares-lg' : ''}`} aria-hidden />;
  const bad = states.filter((s) => s === 'down' || s === 'warn').length;
  const watched = states.filter((s) => s !== 'none').length;
  const summary = watched === 0 ? 'not watched yet' : bad ? `${bad} of ${watched} days with problems` : `no problems in ${watched} days`;
  return (
    <span className={`squares ${large ? 'squares-lg' : ''}`} role="img" aria-label={`${label}: ${summary}`}>
      {states.map((s, i) => (
        <i key={days[i]} className={`sq sq-${s}`} title={`${dayName(days[i])}: ${STATE_TEXT[s]}`} />
      ))}
    </span>
  );
}

/**
 * Week-by-hour heatmap. Rows are the last seven days (oldest at top), columns
 * the 24 hours. Each cell averages the samples that fall in that hour.
 */
export function HourHeatmap({ series, max = 100, label, unit = '%' }: { series: Series | undefined; max?: number; label: string; unit?: string }) {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const rows: { day: number; cells: (number | null)[] }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    rows.push({ day: d.getTime(), cells: Array(24).fill(null) });
  }
  const sums = rows.map(() => Array.from({ length: 24 }, () => ({ s: 0, n: 0 })));
  for (const [t, v] of series ?? []) {
    const d = new Date(t);
    const mid = new Date(d);
    mid.setHours(0, 0, 0, 0);
    const r = rows.findIndex((x) => x.day === mid.getTime());
    if (r < 0) continue;
    const cell = sums[r][d.getHours()];
    cell.s += v;
    cell.n++;
  }
  rows.forEach((row, r) => {
    row.cells = sums[r].map((c) => (c.n ? c.s / c.n : null));
  });
  // Scale to the busiest hour seen, so a quiet box still shows its rhythm.
  const peak = Math.max(1, ...rows.flatMap((r) => r.cells.filter((c): c is number => c != null)));
  const scale = Math.min(max, peak);
  const level = (v: number | null) => (v == null ? -1 : Math.min(4, Math.floor((v / scale) * 4.999)));

  return (
    <div className="heat" role="img" aria-label={label}>
      <div className="heat-hours" aria-hidden>
        <span />
        {[0, 6, 12, 18].map((h) => (
          <span key={h} style={{ gridColumn: h + 2 }}>
            {new Date(2000, 0, 1, h).toLocaleTimeString(locale(), { hour: 'numeric' })}
          </span>
        ))}
      </div>
      {rows.map((row) => (
        <div className="heat-row" key={row.day}>
          <span className="heat-day">{new Date(row.day).toLocaleDateString(locale(), { weekday: 'short' })}</span>
          {row.cells.map((v, h) => (
            <i
              key={h}
              className={`hq hq-${level(v)}`}
              // The same clock as the axis above it.
              title={`${dayName(row.day)}, ${new Date(2000, 0, 1, h).toLocaleTimeString(locale(), { hour: 'numeric' })}: ${v == null ? 'no data' : `${v.toFixed(1)}${unit}`}`}
            />
          ))}
        </div>
      ))}
      <div className="heat-legend" aria-hidden>
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <i key={l} className={`hq hq-${l}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
