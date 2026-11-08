import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { checkRelease } from '../../scripts/release-check.ts';

const fixture = (version = '1.40.0', changelog = `# Changes\n\n## Unreleased\n\n- Later.\n\n## ${version} (2026-11-07)\n\n- Release notes.\n\n## 1.39.1 (earlier)\n\n- Older notes.`) => ({ tag: `v${version}`, version, lockVersion: version, rootVersion: version, changelog });

test('release preflight extracts just the exact version notes, including prereleases and CRLF', () => {
  assert.equal(checkRelease(fixture()).notes, '- Release notes.\n');
  assert.equal(checkRelease(fixture('1.40.0-rc.1')).version, '1.40.0-rc.1');
  assert.equal(checkRelease(fixture('1.40.0+build.1')).version, '1.40.0+build.1');
  const input = fixture();
  assert.equal(checkRelease({ ...input, changelog: input.changelog.replaceAll('\n', '\r\n') }).notes, '- Release notes.\n');
});

test('release preflight rejects mismatched package and both lockfile versions', () => {
  for (const key of ['version', 'lockVersion', 'rootVersion'] as const) {
    assert.throws(() => checkRelease({ ...fixture(), [key]: '1.39.1' }), /requires 1.40.0/);
  }
});

test('release preflight rejects invalid tags and numeric identifiers with leading zeroes', () => {
  for (const tag of ['latest', 'v1.40', 'v01.40.0', 'v1.40.0-rc.01', 'v1.40.0-', 'v1.40.0;echo']) {
    assert.throws(() => checkRelease({ ...fixture(), tag }), /version tag/);
  }
});

test('release preflight refuses missing, empty or duplicate notes and near-match headings', () => {
  for (const changelog of ['## Unreleased\n- Work.', '## 1.40.0\n\n## 1.39.1\n- Older.', '## 1.40.0\n- One.\n## 1.40.0 (later)\n- Two.', '## 1x40x0\n- Wrong.', '## 1.40.0-rc.1\n- Wrong.']) {
    assert.throws(() => checkRelease(fixture('1.40.0', changelog)), /CHANGELOG.md/);
  }
});
