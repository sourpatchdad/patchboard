import { strict as assert } from 'node:assert';
import { createSocket } from 'node:dgram';
import { test } from 'node:test';
import { validateBoard } from '../../shared/board.ts';
import { haActionFor, haService, parseEntities, pinnedEntities } from '../../shared/ha.ts';
import { toCar } from '../adapters/tessie.ts';
import { magicPacket, parseDevices, sendWake } from '../wake.ts';

test('Home Assistant: lights toggle, scenes run, locks and garage doors never change', () => {
  assert.equal(haActionFor('light.kitchen'), 'toggle');
  assert.equal(haActionFor('input_boolean.guest_mode'), 'toggle');
  assert.equal(haActionFor('scene.movie_night'), 'run');
  assert.deepEqual(haService('button.doorbell_chime', 'run'), ['button', 'press']);
  for (const id of ['lock.front_door', 'cover.garage_door', 'alarm_control_panel.home', 'climate.thermostat', 'sensor.power']) {
    assert.equal(haActionFor(id), null, id);
    assert.equal(haService(id, 'toggle'), null, id);
  }
  // A toggle request can't be dressed up as a run, or the reverse.
  assert.equal(haService('lock.front_door', 'run'), null);
  assert.equal(haService('scene.x', 'toggle'), null);
});

test('Home Assistant: the board pins entities, and only valid ids survive', () => {
  assert.deepEqual(parseEntities(' light.a, LIGHT.A, bad id, ../x, sensor.t_1 '), ['light.a', 'sensor.t_1']);
  const v = validateBoard({
    widgets: [
      { id: 'ha-1', type: 'homeassistant', size: 'm', config: { entities: 'light.kitchen,lock.front_door,nope' } },
      { id: 'ha-2', type: 'homeassistant', size: 'm', config: { entities: 'scene.movie_night' } },
    ],
  });
  assert.ok('board' in v);
  assert.deepEqual([...pinnedEntities(v.board)].sort(), ['light.kitchen', 'lock.front_door', 'scene.movie_night']);
});

test('Wake-on-LAN: devices parse, bad MACs drop, the packet is 6 x FF then the MAC 16 times', async () => {
  assert.deepEqual(parseDevices('NAS=AA:BB:CC:DD:EE:FF, Desktop = 00-11-22-33-44-55,Bad=zz:zz,=11:22:33:44:55:66'), [
    { name: 'NAS', mac: 'aa:bb:cc:dd:ee:ff' },
    { name: 'Desktop', mac: '00:11:22:33:44:55' },
  ]);
  const p = magicPacket('aa:bb:cc:dd:ee:ff');
  assert.equal(p.length, 102);
  assert.ok(p.subarray(0, 6).every((b) => b === 0xff));
  assert.deepEqual([...p.subarray(96)], [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);

  // Send to a local listener instead of the broadcast address.
  const sock = createSocket('udp4');
  const got = new Promise<Buffer>((r) => sock.once('message', r));
  await new Promise<void>((r) => sock.bind(0, '127.0.0.1', r));
  await sendWake('aa:bb:cc:dd:ee:ff', '127.0.0.1', sock.address().port);
  assert.deepEqual(await got, p);
  sock.close();
});

test('Tessie: a charging car reads as charging, with time to full', () => {
  const car = toCar({
    vin: 'V1',
    last_state: {
      display_name: 'Blue',
      state: 'online',
      charge_state: { battery_level: 64, battery_range: 201.6, charging_state: 'Charging', minutes_to_full_charge: 95, charge_limit_soc: 90, charger_power: 11, timestamp: 1 },
      climate_state: { inside_temp: 20.5, is_climate_on: true },
      vehicle_state: { locked: false, odometer: 12345.6 },
      drive_state: { shift_state: null },
    },
  });
  assert.deepEqual(
    { battery: car!.battery, range: car!.rangeMi, mins: car!.minutesToFull, kw: car!.chargeKw, locked: car!.locked, driving: car!.driving, odo: car!.odometerMi },
    { battery: 64, range: 202, mins: 95, kw: 11, locked: false, driving: false, odo: 12346 },
  );
  assert.equal(toCar({ vin: 'V2' }), null);
});

test('the car: all four tire pressures or none, and a soft tire is named', async () => {
  const { softTires } = await import('../../shared/car.ts');
  const base = { display_name: 'Blue', charge_state: { battery_level: 64 } };
  const four = toCar({ vin: 'V1', last_state: { ...base, vehicle_state: { tpms_pressure_fl: 2.9, tpms_pressure_fr: 2.9, tpms_pressure_rl: 2.88, tpms_pressure_rr: 2.6 }, climate_state: { driver_temp_setting: 21 } } });
  assert.deepEqual(four!.tires, { fl: 2.9, fr: 2.9, rl: 2.88, rr: 2.6 });
  assert.equal(four!.setC, 21);
  // A car just awake has measured some tires and not others: show none yet.
  assert.equal(toCar({ vin: 'V1', last_state: { ...base, vehicle_state: { tpms_pressure_fl: 2.9, tpms_pressure_fr: null } } })!.tires, undefined);
  // 2.6 bar is 37.7 psi: low outright, and 4 psi under the others.
  assert.deepEqual(softTires(four!.tires), ['rr']);
  assert.deepEqual(softTires({ fl: 2.9, fr: 2.9, rl: 2.9, rr: 2.9 }), []);
});

test('a thermostat may be set and blinds moved, but never a garage door, gate or door', async () => {
  const { haAllows, haService, parseEntities: parse } = await import('../../shared/ha.ts');
  assert.equal(haAllows('climate.living', 'set'), true);
  assert.deepEqual(haService('climate.living', 'set'), ['climate', 'set_temperature']);
  for (const cls of ['blind', 'shade', 'curtain', 'awning', 'shutter']) assert.equal(haAllows('cover.x', 'open', cls), true, cls);
  for (const cls of ['garage', 'gate', 'door', 'window', undefined]) assert.equal(haAllows('cover.x', 'open', cls), false, String(cls));
  assert.equal(haAllows('lock.front_door', 'open', 'blind'), false);
  assert.equal(haAllows('light.kitchen', 'set'), false);
  // Each widget pins only its own kind, and as many as it takes.
  assert.deepEqual(parse('light.kitchen,climate.living,climate.upstairs', 'climate'), ['climate.living']);
  assert.deepEqual(parse('person.sam,light.porch,person.jo', 'people'), ['person.sam', 'person.jo']);
  assert.deepEqual(parse('todo.shopping_list', 'halist'), ['todo.shopping_list']);
});

test('chores keep a name and how often, and drop repeats and stray characters', async () => {
  const { parseChores } = await import('../../shared/fields.ts');
  assert.deepEqual(parseChores('Water Albus=7\nClean the gutters\nWater Albus=3\nFilter=900\n\u0007Odd=2'), [
    { name: 'Water Albus', every: 7 },
    { name: 'Clean the gutters', every: undefined },
    { name: 'Filter', every: undefined },
    { name: 'Odd', every: 2 },
  ]);
});

test('a room strip is 48 half-hour cells, each the last reading by its end, carried forward', async () => {
  const { roomCells, ROOM_CELL_MS } = await import('../../shared/ha.ts');
  const now = 1_000_000_000_000;
  const cells = roomCells([[now - 46.5 * ROOM_CELL_MS, 70], [now - 10 * ROOM_CELL_MS, 72], [now - 9.9 * ROOM_CELL_MS, 73]], now);
  assert.equal(cells.length, 48);
  assert.equal(cells[0], null, 'nothing before the first reading');
  assert.equal(cells[1], 70);
  assert.equal(cells[37], 72);
  assert.equal(cells[38], 73);
  assert.equal(cells[47], 73, 'a quiet sensor carries its last reading');
});

test('BitAxe: AxeOS fields become a miner, and missing ones stay missing', async () => {
  const { toMiner } = await import('../adapters/bitaxe.ts');
  const m = toMiner('http://192.168.1.50', { hostname: 'gamma', ASICModel: 'BM1370', deviceModel: 'Gamma', hashRate: 1210.4, temp: 58.4, power: 17.8, bestDiff: '4.29G', sharesAccepted: 10, sharesRejected: 1, uptimeSeconds: 60 });
  assert.deepEqual([m.name, m.model, m.hashGh, m.tempC, m.powerW, m.bestDiff, m.accepted, m.rejected, m.ok], ['gamma', 'Gamma', 1210.4, 58.4, 17.8, '4.29G', 10, 1, true]);
  const bare = toMiner('http://192.168.1.51', {});
  assert.equal(bare.name, '192.168.1.51', 'no hostname: the address names it');
  assert.equal(bare.tempC, undefined);
  assert.equal(bare.hashGh, 0);
});

test('an edge or dev build carries its commit; a release is the plain version', async () => {
  const { buildSuffix } = await import('../hub.ts');
  const { baseVersion, compareVersions, showVersion } = await import('../../shared/version.ts');
  assert.equal(buildSuffix('edge.4f2c1a9e0b77d1c2'), '+edge.4f2c1a9');
  assert.equal(buildSuffix('dev.abcdef1'), '+dev.abcdef1');
  assert.equal(buildSuffix(''), '');
  assert.equal(buildSuffix('latest; rm -rf /'), '', 'nothing odd gets into the version');
  assert.equal(showVersion('1.13.0+edge.4f2c1a9'), '1.13.0, edge 4f2c1a9');
  assert.equal(showVersion('1.13.0'), '1.13.0');
  assert.equal(baseVersion('v1.13.0+edge.4f2c1a9'), '1.13.0');
  // An edge build of 1.13 is not behind 1.13.0, and 1.14.0 is newer than it.
  assert.equal(compareVersions('1.13.0', '1.13.0+edge.4f2c1a9'), 0);
  assert.equal(compareVersions('1.14.0', '1.13.0+edge.4f2c1a9'), 1);
});
