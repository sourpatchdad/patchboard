import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { daysUntil, moonAt, nextDay } from '../../shared/almanac.ts';
import { eventsField, symbolsField } from '../../shared/fields.ts';
import { demoQuotes, parseLine, sourceOf } from '../markets.ts';

test('each Markets line goes to its source: coins, currency pairs, and the rest to stocks', () => {
  assert.deepEqual(sourceOf('BTC'), { kind: 'coin', id: 'bitcoin' });
  assert.deepEqual(sourceOf('ethereum'), { kind: 'coin', id: 'ethereum' });
  assert.deepEqual(sourceOf('EUR/USD'), { kind: 'fx', from: 'EUR', to: 'USD' });
  assert.deepEqual(sourceOf('^GSPC'), { kind: 'stock', symbol: '^GSPC' });
  assert.deepEqual(sourceOf('eurusd=x'), { kind: 'stock', symbol: 'EURUSD=X' });
  assert.deepEqual(parseLine('S&P 500=^GSPC'), { label: 'S&P 500', symbol: '^GSPC' });
  assert.deepEqual(parseLine('EURUSD=X'), { symbol: 'EURUSD=X' }, "Yahoo's own = isn't a label");
});

test('the Markets field keeps labels and symbols, drops what no source could price', () => {
  assert.equal(symbolsField.check('Bitcoin = btc\naapl\nnot a symbol!!\nEURUSD=X\neur/usd'), 'Bitcoin=BTC\nAAPL\nEURUSD=X\nEUR/USD');
  assert.equal(symbolsField.check('!!!'), null);
});

test('the demo prices every line, coins in the asked currency', () => {
  const q = demoQuotes(['Bitcoin=BTC', 'AAPL', 'EUR/USD'], 'eur');
  assert.deepEqual(
    q.map((x) => [x.label, x.currency, x.line?.length]),
    [
      ['Bitcoin', 'EUR', 48],
      [undefined, 'USD', 48],
      [undefined, 'USD', 48],
    ],
  );
});

test('countdowns: a fixed date, or the next time a yearly one comes round', () => {
  const now = new Date(2026, 10, 12, 9).getTime();
  assert.equal(eventsField.check('Trip=2027-03-14\nbad line\nBirthday = 02-30\nNew Year=01-01'), 'Trip=2027-03-14\nNew Year=01-01');
  assert.equal(daysUntil(nextDay('2026-11-13', now), now), 1);
  assert.equal(daysUntil(nextDay('11-12', now), now), 0, 'today counts as today, not next year');
  assert.equal(nextDay('11-11', now).getFullYear(), 2027, 'yesterday comes round next year');
  assert.equal(daysUntil(nextDay('2026-11-10', now), now), -2);
});

test('the moon: new, full, and the next full moon ahead', () => {
  // A full moon on 2026-11-24, a new moon on 2026-11-09 (UTC).
  const full = moonAt(Date.UTC(2026, 10, 24, 15));
  assert.equal(full.name, 'Full moon');
  assert.ok(full.lit > 0.97);
  const fresh = moonAt(Date.UTC(2026, 10, 9, 8));
  assert.equal(fresh.name, 'New moon');
  assert.ok(fresh.lit < 0.03);
  const n = moonAt(Date.UTC(2026, 10, 12));
  assert.ok(n.nextFull > Date.UTC(2026, 10, 23) && n.nextFull < Date.UTC(2026, 10, 26), new Date(n.nextFull).toISOString());
});

test('a key typed into an app live number moves to the key store, like a board widget', async () => {
  const { sealOrder } = await import('../sealwidgets.ts');
  const saved: Record<string, string> = {};
  const order = { stats: { Immich: { url: 'http://immich:2283/api/server/statistics', headers: { 'X-Api-Key': 'xxxxxxxxxx' }, fields: [{ label: 'Photos', path: 'photos' }], interval: 60 } } } as never;
  const sealed = sealOrder(order, (n, v) => (saved[n] = v)) as { stats: Record<string, { headers: Record<string, string> }> };
  assert.equal(Object.values(saved)[0], 'xxxxxxxxxx');
  assert.match(sealed.stats.Immich.headers['X-Api-Key'], /^\$\{secret:W_APPS_IMMICH_/);
  assert.equal(sealOrder(sealed as never, () => assert.fail('nothing left to move')), sealed, 'a sealed order stays as it is');
});
