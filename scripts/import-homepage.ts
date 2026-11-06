// Convert a Homepage (gethomepage.dev) config into a services.yaml, for people
// who keep their catalog in a file. Settings, Connections, Catalog does the
// same from the browser and saves straight into Patchboard.
//
//   node scripts/import-homepage.ts <homepage-config-dir> [out=config/services.yaml]
//
// Widget blocks (where Homepage keeps API keys and passwords) stay behind.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { fromHomepage } from '../server/homepage.ts';

const [dir, out = 'config/services.yaml'] = process.argv.slice(2);
if (!dir) {
  console.error('usage: node scripts/import-homepage.ts <homepage-config-dir> [out]');
  process.exit(1);
}

const bookmarks = join(dir, 'bookmarks.yaml');
const { catalog, integrations } = fromHomepage(readFileSync(join(dir, 'services.yaml'), 'utf8'), existsSync(bookmarks) ? readFileSync(bookmarks, 'utf8') : '');

const header = `# Patchboard service catalog, imported from Homepage on ${new Date().toISOString().slice(0, 10)}.
# No secrets belong here; credentials go in Settings, Connections.
# Per service: name, href, icon, container, description, expectStopped.
# Set expectStopped: true on one-shot containers so their exit isn't an alert.
`;
writeFileSync(out, header + stringify(catalog, { lineWidth: 0 }));
const n = catalog.groups.reduce((sum, g) => sum + g.services.length, 0);
console.log(`wrote ${out}: ${catalog.groups.length} groups, ${n} services, ${catalog.dock.length} links`);
if (integrations.length) console.log(`Homepage widgets for: ${integrations.join(', ')}. Connect them in Settings, Connections.`);
