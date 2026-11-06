import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { toArr, toNextcloud } from '../adapters/apps.ts';

test('the *arr family: stuck downloads and non-ok health; Prowlarr has no queue', () => {
  const a = toArr(
    { totalRecords: 4, records: [{ title: 'Album', trackedDownloadStatus: 'warning', statusMessages: [{ messages: ['No files found'] }] }, { title: 'Fine', trackedDownloadStatus: 'ok' }] },
    [{ type: 'error', message: 'Indexer down' }, { type: 'ok', message: '' }],
  );
  assert.equal(a.queueTotal, 4);
  assert.deepEqual(a.problems, [{ title: 'Album', message: 'No files found' }]);
  assert.deepEqual(a.health, [{ level: 'error', message: 'Indexer down' }]);
  assert.equal(toArr(null, []).queueTotal, 0);
});

test('Nextcloud: files, users and app updates from serverinfo', () => {
  const n = toNextcloud({ ocs: { data: { nextcloud: { system: { version: '30.0.2', freespace: 5e11, apps: { num_updates_available: 3 } }, storage: { num_users: 4, num_files: 120000 } }, activeUsers: { last24hours: 2 } } } }, 'https://cloud');
  assert.deepEqual([n.version, n.files, n.users, n.appUpdates, n.activeToday], ['30.0.2', 120000, 4, 3, 2]);
});
