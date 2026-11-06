import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { toTailnet, toUnifiDevices } from '../adapters/network.ts';

test('UniFi: devices online unless their state says otherwise', () => {
  const d = toUnifiDevices([{ id: '1', name: 'AP', model: 'U6-Lite', state: 'ONLINE' }, { id: '2', model: 'USW-8', state: 'OFFLINE' }], 'Default');
  assert.deepEqual(d.map((x) => [x.name, x.online]), [['AP', true], ['USW-8', false]]);
});

test('Tailscale: short names, online first, no expiry when it is off or unset', () => {
  const now = Date.parse('2026-11-06T00:00:00Z');
  const d = toTailnet(
    [
      { id: 'a', name: 'pi.tail1234.ts.net', connectedToControl: false, expires: '2026-11-08T00:00:00Z' },
      { id: 'b', name: 'nas.tail1234.ts.net', connectedToControl: true, keyExpiryDisabled: true, expires: '2027-01-01T00:00:00Z' },
      { id: 'c', name: 'old.tail1234.ts.net', lastSeen: '2026-11-05T23:58:00Z', expires: '0001-01-01T00:00:00Z' },
    ],
    now,
  );
  assert.deepEqual(d.map((x) => [x.name, x.online, x.keyExpires]), [['nas', true, undefined], ['old', true, undefined], ['pi', false, Date.parse('2026-11-08T00:00:00Z')]]);
});
