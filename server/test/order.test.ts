import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { applyOrder, orderOf, validateOrder } from '../../shared/order.ts';
import type { Catalog } from '../../shared/types.ts';

const svc = (name: string) => ({ name });
const cat: Catalog = {
  groups: [
    { name: 'Media', services: [svc('Plex'), svc('Sonarr'), svc('Radarr')] },
    { name: 'Home', services: [svc('Mealie'), svc('Immich')] },
    { name: 'Infra', services: [svc('Dozzle')] },
  ],
  dock: [],
} as Catalog;

test('applyOrder sorts groups and apps, keeping unlisted ones after in catalog order', () => {
  const out = applyOrder(cat, { groups: ['Home'], apps: { Media: ['Radarr', 'Plex'] } });
  assert.deepEqual(
    out.groups.map((g) => g.name),
    ['Home', 'Media', 'Infra'],
  );
  assert.deepEqual(
    out.groups[1].services.map((s) => s.name),
    ['Radarr', 'Plex', 'Sonarr'],
  );
  assert.equal(out.ordered, true);
});

test('applyOrder without an order returns the catalog untouched', () => {
  assert.equal(applyOrder(cat, null), cat);
});

test('orderOf round-trips through applyOrder', () => {
  const reversed = [...cat.groups].reverse().map((g) => ({ ...g, services: [...g.services].reverse() }));
  const out = applyOrder(cat, orderOf(reversed));
  assert.deepEqual(
    out.groups.map((g) => g.services.map((s) => s.name)),
    reversed.map((g) => g.services.map((s) => s.name)),
  );
});

test('validateOrder rejects junk and dedupes', () => {
  assert.ok('error' in validateOrder(null));
  assert.ok('error' in validateOrder({ groups: 'x', apps: {} }));
  assert.ok('error' in validateOrder({ groups: [], apps: [] }));
  assert.ok('error' in validateOrder({ groups: [1], apps: {} }));
  assert.ok('error' in validateOrder({ groups: [], apps: { Media: [''] } }));
  const v = validateOrder({ groups: ['A', 'A'], apps: { A: ['x', 'x', 'y'] } });
  assert.ok('order' in v);
  if ('order' in v) {
    assert.deepEqual(v.order.groups, ['A']);
    assert.deepEqual(v.order.apps.A, ['x', 'y']);
  }
});

test('apps move between groups, groups rename, new apps follow the rename', () => {
  const out = applyOrder(cat, {
    groups: ['Media', 'Family'],
    apps: { Media: ['Plex', 'Immich'], Family: ['Mealie'] },
    renamed: { Home: 'Family', 'Watch': 'x' },
  });
  assert.deepEqual(
    out.groups.map((g) => [g.name, g.services.map((s) => s.name)]),
    [
      ['Media', ['Plex', 'Immich', 'Sonarr', 'Radarr']],
      ['Family', ['Mealie']],
      ['Infra', ['Dozzle']],
    ],
  );
});

test('a group emptied by moves disappears; orderOf records renames', () => {
  const out = applyOrder(cat, { groups: ['Infra'], apps: { Infra: ['Dozzle', 'Mealie', 'Immich'] } });
  assert.ok(!out.groups.some((g) => g.name === 'Home'));
  const o = orderOf([{ name: 'Family', from: 'Home', services: [] }], { Media: 'Home' });
  assert.deepEqual(o.renamed, { Media: 'Family' });
  const o2 = orderOf([{ name: 'Family', from: 'Home', services: [] }]);
  assert.deepEqual(o2.renamed, { Home: 'Family' });
});
