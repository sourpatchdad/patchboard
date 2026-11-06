import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseList, toUps } from '../adapters/nut.ts';

const vars = `BEGIN LIST VAR rack
VAR rack battery.charge "64"
VAR rack battery.runtime "1260"
VAR rack device.mfr "CyberPower"
VAR rack device.model "CP1500PFCLCD"
VAR rack ups.load "30"
VAR rack ups.realpower.nominal "900"
VAR rack ups.status "OB DISCHRG"
END LIST VAR rack`;

test('NUT: lists parse, status flags become plain facts, watts come from load when the UPS has no meter', () => {
  assert.deepEqual(parseList('BEGIN LIST UPS\nUPS rack "Rack UPS"\nUPS desk ""\nEND LIST UPS', 'UPS'), { rack: 'Rack UPS', desk: '' });
  const u = toUps('rack', 'Rack UPS', parseList(vars, 'VAR'));
  assert.equal(u.model, 'CyberPower CP1500PFCLCD');
  assert.equal(u.onBattery, true);
  assert.equal(u.lowBattery, false);
  assert.equal(u.charge, 64);
  assert.equal(u.runtimeSec, 1260);
  assert.equal(u.watts, 270);
});
