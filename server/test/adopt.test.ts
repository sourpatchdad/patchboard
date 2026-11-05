import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { validateOrder } from '../../shared/order.ts';
import { adoptAll } from '../../web/lib/adopt.ts';

test('Add all groups by stack, shares a group for single-app stacks, and avoids name clashes', () => {
  const found = [
    { container: 'sonarr', project: 'arr', name: 'Sonarr', icon: 'sonarr' },
    { container: 'radarr', project: 'arr', name: 'Radarr', icon: 'radarr' },
    { container: 'immich-server', project: 'immich', name: 'Immich', icon: 'immich' },
    { container: 'immich-ml', project: 'media_stack', name: 'Immich', icon: 'immich' },
    { container: 'jellyfin', project: 'media_stack', name: 'Jellyfin', icon: 'jellyfin' },
  ];
  const out = adoptAll(found, null);
  assert.deepEqual(out.groups, ['Arr', 'Apps', 'Media Stack']);
  assert.deepEqual(out.apps['Media Stack'], ['immich-ml', 'Jellyfin']);
  assert.deepEqual(out.apps.Apps, ['Immich']);
  assert.ok('order' in validateOrder(out), 'the layout it builds is one the server accepts');
  // Running it again adds nothing twice.
  assert.equal(adoptAll(found, out).added?.length, out.added?.length);
});
