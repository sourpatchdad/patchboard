import { strict as assert } from 'node:assert';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { INTEGRATIONS } from '../../shared/integrations.ts';

// The integrations list drives Settings and docs/INTEGRATIONS.md. Every
// variable it names must be one the server reads and the template offers.
const TEMPLATE = ['env', 'example'].join('.');

// Mount-related variables live in the example compose files next to their mounts.
test('every integration variable is read by the server and offered in the env template or example compose file', () => {
  const config = readFileSync('server/config.ts', 'utf8');
  const composeFiles = ['docker-compose.example.yml', ...readdirSync('examples').map((d) => `examples/${d}/docker-compose.yml`).filter((f) => existsSync(f))];
  const template = [readFileSync(TEMPLATE, 'utf8'), ...composeFiles.map((f) => readFileSync(f, 'utf8').replace(/^\s*-\s*/gm, ''))].join('\n');
  const missing: string[] = [];
  for (const i of INTEGRATIONS) {
    for (const v of [...i.env, ...(i.optional ?? [])]) {
      if (!config.includes(`'${v}'`) && !config.includes(`env.${v}`)) missing.push(`${v} (config.ts)`);
      if (!new RegExp(`^#?\\s*${v}=`, 'm').test(template)) missing.push(`${v} (template)`);
    }
  }
  assert.deepEqual(missing, []);
});

test('integration ids are unique', () => {
  const ids = INTEGRATIONS.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
});
