// Every English string the app sends through the translator: t() and tn()
// calls, section titles and links, the navigation, weather words and moon
// phases. `node scripts/i18n-keys.mjs` lists them; `--check` fails when a
// catalog in web/i18n is missing one, so a new string can't slip through
// untranslated.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const files = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
};
walk('web');
files.push('shared/almanac.ts', 'shared/reading.ts');

const keys = new Set();
const str = String.raw`(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")`;
const pick = (m, i) => (m[i] ?? m[i + 1] ?? '').replace(/\\'/g, "'").replace(/\\"/g, '"');
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  // t('x'), tr('x'), and tn(n, 'one', 'many').
  for (const m of s.matchAll(new RegExp(String.raw`\b(?:t|tr)\(` + str, 'g'))) keys.add(pick(m, 1));
  for (const m of s.matchAll(new RegExp(String.raw`\btn\([^,]+,\s*` + str + String.raw`,\s*` + str, 'g'))) {
    keys.add(pick(m, 1));
    keys.add(pick(m, 3));
  }
  // <Section title="x"> and its link: action={{ label: 'x' }}.
  for (const m of s.matchAll(new RegExp(String.raw`<Section\s+title=` + str, 'g'))) keys.add(pick(m, 1));
  for (const m of s.matchAll(new RegExp(String.raw`<Section\s+title=\{` + str, 'g'))) keys.add(pick(m, 1));
  for (const m of s.matchAll(new RegExp(String.raw`action=\{[^}]*?label:\s*` + str, 'g'))) keys.add(pick(m, 1));
}
// The navigation, the weather's words and the moon's phases.
const shell = readFileSync('web/components/Shell.tsx', 'utf8');
for (const m of shell.matchAll(/\{ to: '[^']+', label: '([^']+)'/g)) keys.add(m[1]);
const format = readFileSync('web/lib/format.ts', 'utf8');
const words = format.slice(format.indexOf('function weatherWord'));
for (const m of words.slice(0, words.indexOf('\n}')).matchAll(/return '([^']+)'/g)) keys.add(m[1]);
const moon = readFileSync('shared/almanac.ts', 'utf8');
for (const m of (moon.match(/const PHASES = \[([^\]]+)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)) keys.add(m[1]);
const kiosk = readFileSync('web/board/Kiosk.tsx', 'utf8');
for (const m of (kiosk.match(/const SPAN_WORDS = \{([^}]+)\}/)?.[1] ?? '').matchAll(/: '([^']+)'/g)) keys.add(m[1]);
keys.delete('');

const sorted = [...keys].sort((a, b) => a.localeCompare(b));
if (process.argv.includes('--check')) {
  let missing = 0;
  for (const f of readdirSync('web/i18n').filter((x) => x.endsWith('.json'))) {
    const cat = JSON.parse(readFileSync(join('web/i18n', f), 'utf8'));
    const gone = sorted.filter((k) => !(k in cat));
    const stale = Object.keys(cat).filter((k) => !keys.has(k));
    if (gone.length) console.error(`${f} is missing ${gone.length}:\n  ${gone.join('\n  ')}`);
    if (stale.length) console.error(`${f} has ${stale.length} no longer used:\n  ${stale.join('\n  ')}`);
    // A translation keeps every {value} its English has, and adds none.
    const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    const off = sorted.filter((k) => k in cat && holes(k) !== holes(cat[k]));
    if (off.length) console.error(`${f} changes the {values} in ${off.length}:\n  ${off.join('\n  ')}`);
    missing += gone.length + stale.length + off.length;
  }
  if (missing) process.exit(1);
  console.log(`translations complete: ${sorted.length} strings`);
} else {
  console.log(JSON.stringify(sorted, null, 1));
}
