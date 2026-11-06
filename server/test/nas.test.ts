import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { toSynology } from '../adapters/synology.ts';
import { blocks, tag, toDisks, toVolumes } from '../adapters/qnap.ts';

test('Synology: volumes with sizes and status; a failing SMART check or crashed drive is a failure', () => {
  const n = toSynology(
    {
      volumes: [
        { id: 'volume_1', vol_path: '/volume1', status: 'normal', size: { total: '1000', used: '600' } },
        { id: 'volume_2', vol_path: '/volume2', status: 'degraded', size: { total: '500', used: '100' } },
      ],
      disks: [
        { id: 'sata1', longName: 'Drive 1', model: 'HAT5300 ', temp: 38, status: 'normal', smart_status: 'normal' },
        { id: 'sata2', longName: 'Drive 2', temp: 41, status: 'normal', smart_status: 'failing' },
        { id: 'sata3', longName: 'Drive 3', temp: 0, status: 'warning' },
      ],
    },
    'nas',
    'https://nas:5001',
  );
  assert.deepEqual(n.volumes.map((v) => [v.name, v.used, v.total, v.status]), [['volume1', 600, 1000, 'ok'], ['volume2', 100, 500, 'warn']]);
  assert.deepEqual(n.disks.map((d) => [d.name, d.status, d.tempC]), [['Drive 1', 'ok', 38], ['Drive 2', 'failed', 41], ['Drive 3', 'warn', undefined]]);
  assert.equal(n.disks[0].model, 'HAT5300');
});

test('QNAP: XML with and without CDATA; volumes join labels to sizes; drives read health and temperature', () => {
  assert.equal(tag('<a><![CDATA[x y]]></a>', 'a'), 'x y');
  assert.equal(tag('<a>1</a>', 'a'), '1');
  assert.equal(blocks('<e>1</e><e>2</e>', 'e').length, 2);
  const usage = `<QDocRoot><volumeList><volume><volumeValue>1</volumeValue><volumeLabel><![CDATA[DataVol1]]></volumeLabel><volumeStatus>0</volumeStatus></volume></volumeList>
    <volumeUseList><volumeUse><volumeValue>1</volumeValue><total_size>1000</total_size><free_size>250</free_size></volumeUse></volumeUseList></QDocRoot>`;
  assert.deepEqual(toVolumes(usage), [{ name: 'DataVol1', used: 750, total: 1000, status: 'ok', detail: undefined }]);
  const smart = `<QDocRoot><Disk_Info><entry><HDNo>1</HDNo><Model><![CDATA[WD80EFZZ]]></Model><Health><![CDATA[OK]]></Health><Temperature><oC>36</oC><oF>96</oF></Temperature></entry>
    <entry><HDNo>2</HDNo><Health>Abnormal</Health><Temperature><oC>44</oC></Temperature></entry></Disk_Info></QDocRoot>`;
  assert.deepEqual(toDisks(smart).map((d) => [d.name, d.status, d.tempC]), [['Drive 1', 'ok', 36], ['Drive 2', 'failed', 44]]);
});
