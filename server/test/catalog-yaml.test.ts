import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parse } from 'yaml';
import { catalogYaml } from '../../shared/catalog-yaml.ts';
import { applyOrder } from '../../shared/order.ts';
import type { Catalog } from '../../shared/types.ts';

test('the arranged catalog writes a services.yaml that reads back the same', () => {
  const cat: Catalog = {
    groups: [{ name: 'Media', services: [{ name: 'Plex', href: 'http://plex.lan', icon: 'plex.png', container: 'plex' }, { name: 'Sonarr', container: 'sonarr' }] }],
    dock: [{ name: 'GitHub', href: 'https://github.com' }],
  };
  const arranged = applyOrder(cat, {
    groups: ['Watch', 'Media'],
    apps: { Watch: ['Plex'] },
    hidden: ['Sonarr'],
    added: [{ name: 'Wiki', group: 'Media', href: 'https://wiki.lan' }],
    icons: { Plex: '/api/icons/0123456789abcdef.png' },
  });
  const doc = parse(catalogYaml(arranged));
  assert.deepEqual(doc.groups, [
    { name: 'Watch', services: [{ name: 'Plex', href: 'http://plex.lan', icon: '/api/icons/0123456789abcdef.png', container: 'plex' }] },
    { name: 'Media', services: [{ name: 'Wiki', href: 'https://wiki.lan' }] },
  ]);
  assert.deepEqual(doc.dock, [{ name: 'GitHub', href: 'https://github.com' }]);
});
