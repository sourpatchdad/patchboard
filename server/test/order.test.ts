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
  // Plex was saved here in Infra, which wins over the file's Media entry.
  assert.deepEqual(media.services.map((s) => s.name), ['Radarr']);
  const infra = out.groups.find((g) => g.name === 'Infra')!;
  assert.equal(infra.services.find((s) => s.name === 'Plex')?.icon, '/api/icons/0123456789abcdef.png');
  assert.deepEqual(out.hiddenApps?.map((h) => [h.group, h.service.name]), [['Media', 'Sonarr']]);
  assert.deepEqual(out.dock.map((b) => [b.name, b.icon]), [['GitHub', 'github']]);
  assert.deepEqual(out.hiddenDock?.map((b) => b.name), ['Mail']);
  const projects = out.groups.find((g) => g.name === 'Projects')!;
  assert.deepEqual(projects.services, [{ name: 'Wiki', href: 'https://wiki.example', source: 'ui' }]);
  // An app saved here wins over a file entry with the same name, and shows once.
  assert.equal(out.groups.flatMap((g) => g.services).filter((s) => s.name === 'Plex').length, 1);
});

test('validateOrder refuses unsafe icons and links', () => {
  assert.ok('error' in validateOrder({ groups: [], apps: {}, icons: { Plex: 'javascript:alert(1)' } }));
  assert.ok('error' in validateOrder({ groups: [], apps: {}, icons: { Plex: '/api/icons/../../etc/passwd' } }));
  assert.ok('error' in validateOrder({ groups: [], apps: {}, added: [{ name: 'x', group: 'g', href: 'javascript:alert(1)' }] }));
  assert.ok('error' in validateOrder({ groups: [], apps: {}, added: [{ name: 'x', group: 'g' }, { name: 'x', group: 'g' }] }));
  assert.ok('order' in validateOrder({ groups: [], apps: {}, icons: { Plex: 'plex.png', Wiki: 'https://example.com/i.svg' } }));
});

test('services.yaml copied in: every app keeps its group, order, label, icon and check; links join; nothing doubles', async () => {
  const { adoptYaml, applyOrder, validateOrder } = await import('../../shared/order.ts');
  const cat = {
    groups: [
      { name: 'Media', services: [{ name: 'Plex', href: 'http://10.0.0.2:32400', icon: 'plex.png', container: 'plex', label: 'Plex' }, { name: 'Tdarr', container: 'tdarr', expectStopped: true, check: false }] },
      { name: 'Tools', services: [{ name: 'Dozzle', href: 'http://10.0.0.2:8080', container: 'dozzle' }] },
    ],
    dock: [{ name: 'Router', href: 'http://192.168.1.1' }],
  };
  const v = validateOrder(adoptYaml(cat, null));
  assert.ok('order' in v, 'error' in v ? v.error : '');
  const order = v.order;
  assert.equal(order.added!.length, 3);
  assert.deepEqual(order.apps, { Media: ['Plex', 'Tdarr'], Tools: ['Dozzle'] });
  assert.deepEqual(order.added!.find((a) => a.name === 'Tdarr'), { name: 'Tdarr', group: 'Media', expectStopped: true, check: false, container: 'tdarr' });
  // With the file gone, the same apps and link remain.
  const after = applyOrder({ groups: [], dock: [] }, order);
  assert.deepEqual(after.groups.map((g) => [g.name, g.services.map((s) => s.name)]), [['Media', ['Plex', 'Tdarr']], ['Tools', ['Dozzle']]]);
  assert.deepEqual(after.dock.map((b) => b.name), ['Router']);
  // With the file still there, nothing shows twice.
  const both = applyOrder(cat, order);
  assert.equal(both.groups.flatMap((g) => g.services).length, 3);
  assert.equal(both.dock.length, 1);
  // Copying again adds nothing.
  assert.equal(adoptYaml(cat, order).added!.length, 3);
});

test('icons can be site paths; one the layout cannot hold is dropped on copy instead of failing it', async () => {
  const { adoptYaml, okIcon, validateOrder } = await import('../../shared/order.ts');
  assert.ok(okIcon('/icon.svg'));
  assert.ok(okIcon('/icons/plex.png'));
  assert.ok(!okIcon('/../etc/passwd.png'));
  assert.ok(!okIcon('javascript:alert(1)'));
  const cat = { groups: [{ name: 'G', services: [{ name: 'A', icon: '/icon.svg' }, { name: 'B', icon: 'bad icon with spaces' }] }], dock: [] };
  const v = validateOrder(adoptYaml(cat, null));
  assert.ok('order' in v, 'error' in v ? v.error : '');
  assert.equal(v.order.added!.find((a) => a.name === 'A')!.icon, '/icon.svg');
  assert.equal(v.order.added!.find((a) => a.name === 'B')!.icon, undefined);
});
