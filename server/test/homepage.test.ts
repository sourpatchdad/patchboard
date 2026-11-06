import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { adoptYaml } from '../../shared/order.ts';
import { fromHomepage } from '../homepage.ts';

const SERVICES = `
- Media:
    - Plex:
        href: http://192.168.1.10:32400/web
        icon: plex.png
        description: Movies and shows
        container: plex
        widget:
          type: plex
          url: http://192.168.1.10:32400
          key: secret-token
    - Sonarr:
        href: http://192.168.1.10:8989
        icon: sonarr.png
        widget:
          type: sonarr
          key: another-secret
- Infra:
    - Network:
        - Pi-hole:
            href: http://192.168.1.2/admin
            widget:
              type: pihole
    - Paperless:
        href: http://192.168.1.10:8000
        widgets:
          - type: paperlessngx
          - type: somethingelse
`;

const BOOKMARKS = `
- Developer:
    - GitHub:
        - abbr: GH
          href: https://github.com/
- Social:
    - Reddit:
        - icon: reddit.png
          href: https://reddit.com/r/selfhosted
    - GitHub:
        - href: https://github.com/duplicate
`;

test('Homepage import: groups, nested groups, links, and no keys', () => {
  const { catalog, integrations } = fromHomepage(SERVICES, BOOKMARKS);
  assert.deepEqual(
    catalog.groups.map((g) => [g.name, g.services.map((s) => s.name)]),
    [
      ['Media', ['Plex', 'Sonarr']],
      ['Network', ['Pi-hole']],
      ['Infra', ['Paperless']],
    ],
  );
  assert.deepEqual(catalog.groups[0].services[0], { name: 'Plex', href: 'http://192.168.1.10:32400/web', icon: 'plex.png', description: 'Movies and shows', container: 'plex' });
  assert.equal(JSON.stringify(catalog).includes('secret'), false);
  assert.deepEqual(catalog.dock, [
    { name: 'GitHub', href: 'https://github.com/' },
    { name: 'Reddit', href: 'https://reddit.com/r/selfhosted', icon: 'reddit.png' },
  ]);
  // Widget types map to Patchboard integrations; unknown ones drop out.
  assert.deepEqual(integrations.sort(), ['paperless', 'pihole', 'sonarr', 'tautulli']);
});

test('Homepage import: bad YAML and the wrong shape say what to fix', () => {
  assert.throws(() => fromHomepage('- Media:\n  - Plex: [unclosed'), /services\.yaml isn't valid YAML/);
  assert.throws(() => fromHomepage('title: My page'), /should be a list of groups/);
  assert.throws(() => fromHomepage('- A: []', '- x: ['), /bookmarks\.yaml isn't valid YAML/);
  assert.deepEqual(fromHomepage('').catalog, { groups: [], dock: [] });
});

test('Homepage import merges beside saved apps without duplicating them', () => {
  const { catalog } = fromHomepage(SERVICES, BOOKMARKS);
  const once = adoptYaml(catalog, null);
  const twice = adoptYaml(catalog, once);
  assert.equal(once.added?.length, 4);
  assert.equal(twice.added?.length, 4);
  assert.equal(twice.addedLinks?.length, 2);
  assert.deepEqual(twice.apps.Media, ['Plex', 'Sonarr']);
});
