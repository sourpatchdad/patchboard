// Widgets that suit a screen on the wall as much as a desk: markets, the sun
// and moon, countdowns, and a big clock. None needs an integration. Markets
// come through the server, which reads the lines saved in the board.

import type { MarketQuote, WeatherData } from '../../shared/types.ts';
import { Empty, Section } from '../components/ui.tsx';
import { Spark } from '../components/Spark.tsx';
import { useAppearance } from '../lib/appearance.ts';
import { currency, locale, money, pct } from '../lib/region.ts';
import { useSource } from '../lib/store.tsx';
import { daysUntil, moonAt, nextDay } from '../../shared/almanac.ts';
import { useWidgetData } from './widget-data.ts';
import { SetupLink } from './SetupLink.tsx';
import { useWidget } from './widget-context.ts';

const SPAN_WORDS = { '24h': 'last 24 hours', today: 'today', '30d': 'last 30 days' } as const;

/** The short name a line goes by: yours, or the source's without the "Inc.". */
function nameOf(q: MarketQuote): string {
  return q.label ?? (q.name ? q.name.replace(/,? (Inc|Corp|Corporation|Ltd|plc|N\.V\.|S\.A\.)\.?$/i, '') : q.symbol);
}

export function MarketsWidget({ board, id, config }: { board: string; id: string; config?: Record<string, string> }) {
  const { style } = useWidget();
  const cur = currency();
  const lines = (config?.symbols ?? '').split('\n').filter(Boolean);
  const { data, failed } = useWidgetData<{ quotes: MarketQuote[] }>(`/api/markets/${encodeURIComponent(board)}/${encodeURIComponent(id)}?currency=${cur}`, 2 * 60_000);
  const big = style === 'big';
  return (
    <Section title="Markets" className={`markets${big ? ' markets-big' : ''}`}>
      {lines.length === 0 ? (
        <Empty>
          Nothing to follow yet. <SetupLink>Add coins, stocks or currencies</SetupLink>
        </Empty>
      ) : !data ? (
        failed ? <Empty>Prices aren't loading. Patchboard tries again in two minutes.</Empty> : null
      ) : (
        <ul className="market-list">
          {data.quotes.map((q) => {
            const name = nameOf(q);
            if (q.failed || q.price === undefined) {
              return (
                <li key={q.symbol} className="market market-failed">
                  <span className="market-name">{name}</span>
                  <span className="market-why">{q.failed ?? 'no price'}</span>
                </li>
              );
            }
            const up = (q.change ?? 0) >= 0;
            const line = q.line ?? [];
            const lo = Math.min(...line);
            const hi = Math.max(...line);
            const pad = (hi - lo) * 0.1 || hi * 0.001;
            return (
              <li key={q.symbol} className="market">
                <span className="market-name" title={q.name ? `${q.name} (${q.symbol})` : q.symbol}>
                  {name}
                </span>
                <span className="market-line">
                  <Spark data={line.map((v, i) => [i, v] as [number, number])} min={lo - pad} max={hi + pad} height={big ? 40 : 22} label={`${name}, ${q.span ? SPAN_WORDS[q.span] : ''}`} />
                </span>
                <span className="market-price">{q.currency ? money(q.price, q.currency, q.span === '30d' ? 4 : undefined) : q.price}</span>
                {q.change !== undefined && (
                  <span className={`market-change ${up ? 'is-up' : 'is-down'}`} title={q.span ? SPAN_WORDS[q.span] : undefined}>
                    <span aria-hidden="true">{up ? '▲' : '▼'}</span> {pct(q.change)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/** The lit part of the moon as a path on a circle of radius 1. */
function moonPath(phase: number): string {
  const x = Math.cos(2 * Math.PI * phase);
  const rx = Math.abs(x).toFixed(3);
  return phase <= 0.5 ? `M0,-1 A1,1 0 0 1 0,1 A${rx},1 0 0 ${x > 0 ? 0 : 1} 0,-1` : `M0,-1 A1,1 0 0 0 0,1 A${rx},1 0 0 ${x < 0 ? 0 : 1} 0,-1`;
}

const minutes = (iso?: string) => (iso ? new Date(iso).getTime() / 60_000 : NaN);

export function SkyWidget({ now }: { now: number }) {
  const a = useAppearance();
  const { data: w } = useSource<WeatherData>('weather');
  const today = w?.days[0];
  const tomorrow = w?.days[1];
  const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit', hour12: !a.clock24 }) : '');
  const length = minutes(today?.sunset) - minutes(today?.sunrise);
  const next = minutes(tomorrow?.sunset) - minutes(tomorrow?.sunrise);
  const change = Math.round(next - length);
  const moon = moonAt(now);
  return (
    <Section title="Sun and moon" className="sky">
      {!today?.sunrise ? (
        <Empty>
          The sun needs the weather's place. <SetupLink>Set up weather</SetupLink>
        </Empty>
      ) : (
        <div className="sky-body">
          <dl className="sky-sun">
            <div>
              <dt>Sunrise</dt>
              <dd>{time(today.sunrise)}</dd>
            </div>
            <div>
              <dt>Sunset</dt>
              <dd>{time(today.sunset)}</dd>
            </div>
            <div>
              <dt>Daylight</dt>
              <dd>
                {Math.floor(length / 60)} h {Math.round(length % 60)} min
                {Number.isFinite(change) && <span className="sky-change">{change === 0 ? 'The same tomorrow' : `${change > 0 ? '+' : '−'}${Math.abs(change)} min tomorrow`}</span>}
              </dd>
            </div>
          </dl>
          <div className="sky-moon">
            <svg viewBox="-1.1 -1.1 2.2 2.2" role="img" aria-label={`${moon.name}, ${Math.round(moon.lit * 100)}% lit`}>
              <circle r="1" className="moon-dark" />
              <path d={moonPath(moon.phase)} className="moon-lit" />
            </svg>
            <span className="sky-moon-name">{moon.name}</span>
            <span className="sky-moon-sub">
              {Math.round(moon.lit * 100)}% lit
              {moon.lit < 0.98 && `, full ${new Date(moon.nextFull).toLocaleDateString(locale(), { month: 'short', day: 'numeric' })}`}
            </span>
          </div>
        </div>
      )}
    </Section>
  );
}

export function CountdownWidget({ config, now }: { config?: Record<string, string>; now: number }) {
  const events = (config?.events ?? '')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const at = l.lastIndexOf('=');
      const day = nextDay(l.slice(at + 1), now);
      return { name: l.slice(0, at), day, left: daysUntil(day, now) };
    })
    // A day that has passed stays a week, then goes.
    .filter((e) => e.left >= -7)
    .sort((x, y) => x.left - y.left);
  return (
    <Section title="Countdown" className="countdown">
      {events.length === 0 ? (
        <Empty>
          No days to count to. <SetupLink>Add a date</SetupLink>
        </Empty>
      ) : (
        <ul className="count-list">
          {events.map((e) => (
            <li key={e.name + e.day.getTime()}>
              <span className="count-days">{e.left === 0 ? 'Today' : Math.abs(e.left)}</span>
              <span className="count-what">
                <span className="count-name">{e.name}</span>
                <span className="count-sub">
                  {e.left === 0 ? '' : e.left === 1 ? 'day to go, tomorrow' : e.left > 0 ? `days to go, ${e.day.toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' })}` : e.left === -1 ? 'day ago' : 'days ago'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Clocks as one big clock: your time and the date, for across the room. Places stay underneath. */
export function BigClock({ now, children }: { now: number; children?: React.ReactNode }) {
  const a = useAppearance();
  const d = new Date(now);
  const parts = new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit', hour12: !a.clock24 }).formatToParts(d);
  const clock = parts.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim();
  const period = parts.find((p) => p.type === 'dayPeriod')?.value;
  return (
    <div className="big-clock">
      <p className="big-clock-time">
        {clock}
        {period && <span className="big-clock-period">{period}</span>}
      </p>
      <p className="big-clock-date">{d.toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      {children}
    </div>
  );
}
