// Writes the generated parts of the docs from the code they describe, so
// they can't drift: the integrations and presets tables in
// docs/INTEGRATIONS.md. `npm run docs` writes; `npm run docs:check` (CI)
// fails if anything is out of date.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { INTEGRATIONS } from '../shared/integrations.ts';
import { PRESETS } from '../shared/presets.ts';

const check = process.argv.includes('--check');
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const code = (vars: string[]) => vars.map((v) => `\`${v}\``).join(', ');

const integrations = [
  '| Integration | What it adds | Turn on with | Where to find it |',
  '|---|---|---|---|',
  ...INTEGRATIONS.map((i) => {
    const vars = [i.env.length ? code(i.env) : 'nothing to set', i.optional?.length ? `optional ${code(i.optional)}` : ''].filter(Boolean).join('; ');
    return `| **${cell(i.name)}** | ${cell(i.adds)} | ${vars} | ${cell(i.where ?? '')} |`;
  }),
].join('\n');

const presets = [
  '| App | Numbers you can show | Key |',
  '|---|---|---|',
  ...PRESETS.map((p) => {
    const key = !p.auth ? 'none needed' : p.auth.kind === 'basic' ? 'your login, typed as username:password' : (p.keyHelp ?? 'its API key');
    return `| **${cell(p.name)}** | ${cell(p.values.map((v) => v.label).join(', '))} | ${cell(key)} |`;
  }),
].join('\n');

const sections: Record<string, string> = { integrations, presets };
const path = 'docs/INTEGRATIONS.md';
const before = readFileSync(path, 'utf8');
let after = before;
for (const [name, body] of Object.entries(sections)) {
  const re = new RegExp(`(<!-- generated:${name} -->)[\\s\\S]*?(<!-- /generated -->)`);
  if (!re.test(after)) throw new Error(`${path}: no <!-- generated:${name} --> block`);
  after = after.replace(re, `$1\n${body}\n$2`);
}

// House style (stop-slop): no em dashes in anything a reader sees.
const prose = [
  'README.md',
  'CHANGELOG.md',
  'SECURITY.md',
  ...readdirSync('docs').filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`),
  ...readdirSync('web', { recursive: true }).filter((f) => /\.tsx$/.test(String(f))).map((f) => `web/${String(f).replaceAll('\\', '/')}`),
  'shared/integrations.ts',
  'shared/presets.ts',
];
const dashes = prose.filter((f) => readFileSync(f, 'utf8').includes('—'));
if (dashes.length) {
  console.error(`Em dashes in reader-facing text (house style: rewrite the sentence): ${dashes.join(', ')}`);
  process.exit(1);
}

if (check) {
  if (after !== before) {
    console.error(`${path} is out of date with shared/integrations.ts or shared/presets.ts. Run: npm run docs`);
    process.exit(1);
  }
  console.log('docs up to date');
} else {
  writeFileSync(path, after);
  console.log(after === before ? 'docs already up to date' : `wrote ${path}`);
}
