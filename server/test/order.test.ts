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

test('hidden apps and bookmarks are set aside; icons override; added apps join their group', () => {
  const withDock = { ...cat, dock: [{ name: 'GitHub', href: 'https://github.com' }, { name: 'Mail', href: 'https://mail.example' }] } as Catalog;
  const out = applyOrder(withDock, {
    groups: [],
    apps: {},
    hidden: ['Sonarr', 'Mail'],
    icons: { Plex: '/api/icons/0123456789abcdef.png', GitHub: 'github' },
    added: [{ name: 'Wiki', group: 'Projects', href: 'https://wiki.example' }, { name: 'Plex', group: 'Infra' }],
  });
  const media = out.groups.find((g) => g.name === 'Media')!;
  assert.deepEqual(media.services.map((s) => s.name), ['Plex', 'Radarr']);
  assert.equal(media.services[0].icon, '/api/icons/0123456789abcdef.png');
  assert.deepEqual(out.hiddenApps?.map((h) => [h.group, h.service.name]), [['Media', 'Sonarr']]);
  assert.deepEqual(out.dock.map((b) => [b.name, b.icon]), [['GitHub', 'github']]);
  assert.deepEqual(out.hiddenDock?.map((b) => b.name), ['Mail']);
  const projects = out.groups.find((g) => g.name === 'Projects')!;
  assert.deepEqual(projects.services, [{ name: 'Wiki', href: 'https://wiki.example', source: 'ui' }]);
  // A name already in the catalog wins over an added app with the same name.
  assert.equal(out.groups.flatMap((g) => g.services).filter((s) => s.name === 'Plex').length, 1);
});

test('validateOrder refuses unsafe icons and links', () => {
  assert.ok('error' in validateOrder({ groups: [], apps: {}, icons: { Plex: 'javascript:alert(1)' } }));
  assert.ok('error' in validateOrder({ groups: [], apps: {}, icons: { Plex: '/api/icons/../../etc/passwd' } }));
  assert.ok('error' in validateOrder({ groups: [], apps: {}, added: [{ name: 'x', group: 'g', href: 'javascript:alert(1)' }] }));
  assert.ok('error' in validateOrder({ groups: [], apps: {}, added: [{ name: 'x', group: 'g' }, { name: 'x', group: 'g' }] }));
  assert.ok('order' in validateOrder({ groups: [], apps: {}, icons: { Plex: 'plex.png', Wiki: 'https://example.com/i.svg' } }));
});
