// Prices for the Markets widget, from three free sources that need no key:
// CoinGecko for coins, the European Central Bank (through Frankfurter) for
// currency pairs, and Yahoo Finance's chart feed for stocks, funds and
// indexes. Each answer is cached, so a board on five screens asks once.
// Yahoo's feed is unofficial: when it fails, that line says so and the rest
// carry on.

import type { MarketQuote } from '../shared/types.ts';

const TIMEOUT = 8000;
const COIN_MS = 2 * 60_000;
const STOCK_MS = 2 * 60_000;
const FX_MS = 60 * 60_000;

/** Tickers people type for the big coins, to CoinGecko's names for them. */
const COINS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  LTC: 'litecoin',
  DOT: 'polkadot',
  XMR: 'monero',
  BNB: 'binancecoin',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  TRX: 'tron',
  XLM: 'stellar',
  BCH: 'bitcoin-cash',
  USDT: 'tether',
  USDC: 'usd-coin',
};
const COIN_IDS = new Set(Object.values(COINS));

export type Source = { kind: 'coin'; id: string } | { kind: 'fx'; from: string; to: string } | { kind: 'stock'; symbol: string };

/** Where a line's price comes from. */
export function sourceOf(symbol: string): Source {
  const s = symbol.toUpperCase();
  const pair = /^([A-Z]{3})\/([A-Z]{3})$/.exec(s);
  if (pair) return { kind: 'fx', from: pair[1], to: pair[2] };
  if (COINS[s]) return { kind: 'coin', id: COINS[s] };
  if (COIN_IDS.has(symbol.toLowerCase())) return { kind: 'coin', id: symbol.toLowerCase() };
  return { kind: 'stock', symbol: s };
}

/** "Bitcoin=BTC" to a label and a symbol. */
export function parseLine(line: string): { label?: string; symbol: string } {
  const at = line.lastIndexOf('=');
  if (at > 0 && !/^[A-Z]{6}=X$/i.test(line)) return { label: line.slice(0, at).trim(), symbol: line.slice(at + 1).trim() };
  return { symbol: line.trim() };
}

const cache = new Map<string, { at: number; value: Promise<Omit<MarketQuote, 'label' | 'symbol'>> }>();

function cached(key: string, ms: number, load: () => Promise<Omit<MarketQuote, 'label' | 'symbol'>>) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.value;
  const entry = { at: Date.now(), value: load() };
  // A failure is asked again after 30 seconds, not after the whole wait.
  entry.value = entry.value.catch((e: unknown) => {
    entry.at = Date.now() - ms + 30_000;
    return { failed: e instanceof Error && !/abort|timeout/i.test(e.message) ? e.message : 'not answering' };
  });
  cache.set(key, entry);
  return entry.value;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (Patchboard)' } });
  if (!res.ok) throw new Error(res.status === 429 ? 'busy, try again soon' : `answered ${res.status}`);
  return res.json();
}

/** Every 4th point of a long line is plenty for a sparkline. */
const thin = (points: number[], keep = 48) => {
  const clean = points.filter((p) => Number.isFinite(p));
  if (clean.length <= keep) return clean;
  const step = clean.length / keep;
  return Array.from({ length: keep }, (_, i) => clean[Math.floor(i * step)]).concat(clean[clean.length - 1]);
};

function coin(id: string, currency: string) {
  return cached(`coin:${id}:${currency}`, COIN_MS, async () => {
    const vs = currency.toLowerCase();
    const d = (await getJson(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=${encodeURIComponent(vs)}&ids=${encodeURIComponent(id)}&sparkline=true&price_change_percentage=24h`)) as {
      name: string;
      current_price: number;
      price_change_percentage_24h: number | null;
      sparkline_in_7d?: { price: number[] };
    }[];
    const c = d[0];
    if (!c) throw new Error('no such coin');
    // The last day of the week's line, hourly.
    const week = c.sparkline_in_7d?.price ?? [];
    return { name: c.name, price: c.current_price, change: c.price_change_percentage_24h ?? undefined, currency: currency.toUpperCase(), line: thin(week.slice(-25)), span: '24h' as const };
  });
}

function stock(symbol: string) {
  return cached(`stock:${symbol}`, STOCK_MS, async () => {
    const d = (await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`)) as {
      chart: { result?: { meta: { regularMarketPrice: number; chartPreviousClose?: number; previousClose?: number; currency?: string; shortName?: string; longName?: string; marketState?: string }; indicators: { quote: { close: (number | null)[] }[] } }[]; error?: { description?: string } };
    };
    const r = d.chart.result?.[0];
    if (!r) throw new Error(d.chart.error?.description ? 'no such symbol' : 'no answer');
    const prev = r.meta.chartPreviousClose ?? r.meta.previousClose;
    const price = r.meta.regularMarketPrice;
    return {
      name: r.meta.shortName ?? r.meta.longName ?? symbol,
      price,
      change: prev ? ((price - prev) / prev) * 100 : undefined,
      currency: r.meta.currency?.toUpperCase(),
      line: thin((r.indicators.quote[0]?.close ?? []).filter((v): v is number => v !== null)),
      span: 'today' as const,
    };
  });
}

function fx(from: string, to: string) {
  return cached(`fx:${from}:${to}`, FX_MS, async () => {
    const start = new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 10);
    const d = (await getJson(`https://api.frankfurter.dev/v1/${start}..?base=${from}&symbols=${to}`)) as { rates?: Record<string, Record<string, number>> };
    const days = Object.keys(d.rates ?? {}).sort();
    const series = days.map((k) => d.rates![k][to]).filter((v) => typeof v === 'number');
    if (!series.length) throw new Error('no such currency');
    const price = series[series.length - 1];
    const prev = series[series.length - 2];
    return { name: `${from} in ${to}`, price, change: prev ? ((price - prev) / prev) * 100 : undefined, currency: to, line: series, span: '30d' as const };
  });
}

/** Quotes for a widget's lines, in order. `currency` prices the coins. */
export async function quotes(lines: string[], currency: string): Promise<MarketQuote[]> {
  return Promise.all(
    lines.map(async (line) => {
      const { label, symbol } = parseLine(line);
      const src = sourceOf(symbol);
      const q = src.kind === 'coin' ? await coin(src.id, currency) : src.kind === 'fx' ? await fx(src.from, src.to) : await stock(src.symbol);
      return { label: label || undefined, symbol, ...q };
    }),
  );
}

/** Believable prices for the demo, moving a little with the clock. */
export function demoQuotes(lines: string[], currency: string): MarketQuote[] {
  const base: Record<string, [string, number, number]> = {
    BTC: ['Bitcoin', 71880, 1.8],
    ETH: ['Ethereum', 3420, -0.9],
    '^GSPC': ['S&P 500', 6712.4, 0.42],
    '^IXIC': ['Nasdaq', 22874.1, 0.61],
    AAPL: ['Apple', 357.61, 0.63],
    VTI: ['Vanguard Total Stock Market', 331.2, 0.38],
    'EUR/USD': ['EUR in USD', 1.1127, -0.12],
  };
  const t = Date.now() / 3_600_000;
  return lines.map((line, n) => {
    const { label, symbol } = parseLine(line);
    const [name, price, change] = base[symbol.toUpperCase()] ?? [symbol, 100 + n * 37, 0.5 - n * 0.3];
    const line24 = Array.from({ length: 48 }, (_, i) => price * (1 + (Math.sin(i / 5 + n + t) * 0.004 + ((i - 47) * change) / 4800)));
    const src = sourceOf(symbol);
    return { label: label || undefined, symbol, name, price, change, currency: src.kind === 'coin' ? currency.toUpperCase() : src.kind === 'fx' ? src.to : 'USD', line: line24, span: src.kind === 'coin' ? '24h' : src.kind === 'fx' ? '30d' : 'today' };
  });
}
