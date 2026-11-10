// Prune the container package: every commit to dev and main publishes an
// image tagged dev-<sha> or edge-<sha>. This keeps the newest KEEP of each
// and deletes the rest, along with the per-platform images and attestations
// inside them and any untagged leftovers no tag points at.
//
// Never touched: releases (1.2.0, 1.2, 1, latest and their -slim twins),
// edge, dev, and anything a kept tag uses.
//
//   GITHUB_TOKEN=... node scripts/prune-images.mjs            # dry run: lists what would go
//   GITHUB_TOKEN=... DRY_RUN=0 node scripts/prune-images.mjs  # deletes
//
// MAX_DELETE caps one run (the API allows a token about 1,000 calls an hour).

const OWNER = process.env.OWNER ?? 'sourpatchdad';
const NAME = process.env.PACKAGE ?? 'patchboard';
const KEEP = Number(process.env.KEEP ?? 10);
const MAX_DELETE = Number(process.env.MAX_DELETE ?? 500);
const DRY = process.env.DRY_RUN !== '0';
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) throw new Error('Set GITHUB_TOKEN to a token that can delete packages.');

const PER_COMMIT = /^(edge|dev)-[0-9a-f]{7,40}$/;
/** An untagged leftover younger than this may belong to a build still running. */
const SETTLE_MS = 24 * 3600_000;

async function api(path, method = 'GET') {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return method === 'GET' ? res.json() : null;
}

const versions = [];
for (let page = 1; ; page++) {
  const batch = await api(`/users/${OWNER}/packages/container/${NAME}/versions?per_page=100&page=${page}`);
  versions.push(...batch);
  if (batch.length < 100) break;
}
const tagsOf = (v) => v.metadata?.container?.tags ?? [];

// The registry lists what each tagged image holds.
const { token: pull } = await (await fetch(`https://ghcr.io/token?scope=repository:${OWNER}/${NAME}:pull`)).json();
async function parts(digest) {
  const res = await fetch(`https://ghcr.io/v2/${OWNER}/${NAME}/manifests/${digest}`, {
    headers: {
      Authorization: `Bearer ${pull}`,
      Accept: 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json',
    },
  });
  if (!res.ok) return [];
  const m = await res.json();
  return (m.manifests ?? []).map((x) => x.digest);
}

const perCommit = { edge: [], dev: [] };
for (const v of versions) {
  const tags = tagsOf(v);
  if (tags.length && tags.every((t) => PER_COMMIT.test(t))) perCommit[tags[0].split('-')[0]].push(v);
}
const doomed = new Set();
for (const list of Object.values(perCommit)) {
  list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const v of list.slice(KEEP)) doomed.add(v);
}

// Everything a surviving tag points at stays, even when shared.
const kept = new Set();
for (const v of versions) {
  if (!tagsOf(v).length || doomed.has(v)) continue;
  kept.add(v.name);
  for (const d of await parts(v.name)) kept.add(d);
}

const now = Date.now();
const gone = [
  ...doomed,
  ...versions.filter((v) => !tagsOf(v).length && !kept.has(v.name) && now - Date.parse(v.created_at) > SETTLE_MS),
];
const tagged = gone.filter((v) => tagsOf(v).length);
console.log(`${versions.length} versions. Keeping ${versions.length - gone.length}; ${DRY ? 'would delete' : 'deleting'} ${gone.length} (${tagged.length} per-commit builds, ${gone.length - tagged.length} untagged).`);
for (const v of tagged.slice(0, 5)) console.log(`  ${tagsOf(v).join(', ')}  ${v.created_at.slice(0, 10)}`);
if (tagged.length > 5) console.log(`  ...and ${tagged.length - 5} more`);
if (DRY) process.exit(0);

let done = 0;
// Untagged parts first, so an interrupted run never leaves a tag pointing at nothing.
for (const v of [...gone].sort((a, b) => tagsOf(a).length - tagsOf(b).length)) {
  if (done >= MAX_DELETE) {
    console.log(`Stopped at ${MAX_DELETE}; the next run continues.`);
    break;
  }
  await api(`/users/${OWNER}/packages/container/${NAME}/versions/${v.id}`, 'DELETE');
  done++;
}
console.log(`Deleted ${done}.`);
