// Validate a release before any image tags or GitHub Releases are published.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface ReleaseInput {
  tag: string;
  version: string;
  lockVersion: string;
  rootVersion: string;
  changelog: string;
}

export function checkRelease({ tag, version, lockVersion, rootVersion, changelog }: ReleaseInput): { version: string; notes: string } {
  const match = /^v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(tag);
  const zeroPadded = (s: string) => /^\d+$/.test(s) && s.length > 1 && s.startsWith('0');
  if (!match || match.slice(1, 4).some(zeroPadded) || match[4]?.split('.').some(zeroPadded)) {
    throw new Error('Use a version tag such as v1.40.0 or v1.40.0-rc.1.');
  }
  const expected = tag.slice(1);
  for (const [name, value] of [['package.json', version], ['package-lock.json', lockVersion], ['package-lock.json root package', rootVersion]]) {
    if (value !== expected) throw new Error(`${name} version is ${value ?? 'missing'}; ${tag} requires ${expected}.`);
  }
  const lines = changelog.replace(/\r\n/g, '\n').split('\n');
  const starts = lines.flatMap((line, i) => line.startsWith('## ') && line.slice(3).trim().split(/\s+/)[0] === expected ? [i] : []);
  if (starts.length !== 1) throw new Error(`CHANGELOG.md needs exactly one ## ${expected} section; found ${starts.length}.`);
  const start = starts[0] + 1;
  const end = lines.findIndex((line, i) => i >= start && line.startsWith('## '));
  const notes = lines.slice(start, end < 0 ? undefined : end).join('\n').trim();
  if (!notes) throw new Error(`CHANGELOG.md section ${expected} has no release notes.`);
  return { version: expected, notes: `${notes}\n` };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    const release = checkRelease({ tag: process.argv[2] ?? '', version: pkg.version, lockVersion: lock.version, rootVersion: lock.packages?.['']?.version, changelog: readFileSync('CHANGELOG.md', 'utf8') });
    if (process.argv[3]) writeFileSync(process.argv[3], release.notes);
    console.log(`Validated ${process.argv[2]}: package versions and release notes agree.`);
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
