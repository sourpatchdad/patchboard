import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { dimLabel, isNight } from '../../shared/night.ts';
import { makeSwapper } from '../../web/lib/showcase.ts';

test('showcase swaps addresses, domains and listed words, one stand-in per real value', () => {
  const swap = makeSwapper('tank\nNicholas = Rivera');
  const out = swap('tank at 192.168.4.119 and 100.64.0.7, dash.nbnstack.com, nate@nbnstack.com, Nicholas, aa:bb:cc:dd:ee:ff');
  for (const real of ['tank', '192.168.4.119', '100.64.0.7', 'nbnstack', 'Nicholas', 'aa:bb:cc']) assert.ok(!out.includes(real), `${real} in ${out}`);
  assert.match(out, /dash\.home\.arpa/, 'a service keeps its own label');
  assert.match(out, /^Atlas at /, 'a word without a stand-in gets one that suits a server, a person or a town');
  assert.match(out, /Rivera/);
  assert.equal(swap('192.168.4.119'), swap('192.168.4.119'), 'the same address, the same stand-in');
  assert.notEqual(swap('10.0.0.1'), swap('10.0.0.2'));
  assert.equal(swap(out), out, 'stand-ins are left alone');
  assert.equal(swap('truenas 25.10.5, see github.com/sourpatchdad'), 'truenas 25.10.5, see github.com/sourpatchdad');
});

test('night hours run past midnight and read as times', () => {
  const at = (h: number) => new Date(2026, 10, 12, h, 30);
  assert.ok(isNight('22-7', at(23)) && isNight('22-7', at(3)));
  assert.ok(!isNight('22-7', at(7)) && !isNight('22-7', at(21)));
  assert.equal(dimLabel('22-7'), '10 PM to 7 AM');
  assert.equal(dimLabel('21-6'), '9 PM to 6 AM');
});
