# Releasing

## Branches, tags and images

| Name | What it is | Image |
|---|---|---|
| `dev` | Where work lands. Features and fixes go here first. | `dev`, and `dev-<sha>` per commit |
| `main` | What the next release will be. `dev` merges in when a batch is ready. | `edge`, and `edge-<sha>` per commit |
| `v1.2.0` | A tag on `main`: one released version, never moved or deleted. | `1.2.0`, `1.2`, `1`, `latest`, and the same with `-slim` (`latest-slim`) |
| `v1.2.0-rc.1` | A pre-release tag, for a change that needs testing on real installs first. | `1.2.0-rc.1` only |
| GitHub Release | The page for a tag, with that version's CHANGELOG section. The release workflow writes it. | |

Demo mode ships in every image (`DEMO=1`), so the demo needs no branch or
image of its own.

The per-commit tags (`dev-<sha>`, `edge-<sha>`) are for trying or rolling
back a recent build. A weekly workflow, Prune images, keeps the newest ten
of each and deletes older ones; releases, `edge`, `dev` and `latest` are
never pruned.

## Which tag to pull

- `latest`: the newest release. Most installs want this.
- `1`: every 1.x release, never a breaking 2.0.
- `1.2`: fixes to 1.2 only.
- `1.2.0`: exactly that build, for rollbacks and reproducible setups.
- `edge`: the next release, before it ships.
- `dev`: work in progress. It can break.

Each release also comes as a slim image: add `-slim` to any tag above
(`latest-slim`, `1.2-slim`). It leaves out the Docker CLI, about 90 MB,
so updating a container from Patchboard is off. Everything else works the
same. Pick it for a read-only install or a small disk. `edge` and `dev`
have no slim build.

## Day to day

Commit to `dev`, or open a PR against it. CI runs on both. Add a line under
`## Unreleased` at the top of CHANGELOG.md for anything a user would notice.

Each section becomes a GitHub Release and the What's new sheet on Home, so
write it for the person running Patchboard: what changed for them, in plain
words and active voice, with no em dashes. Group a release's lines under a
few bold leads, as 1.0.0 and 1.1.0 do.

## Cutting a release

1. Batch the work. A release is a set of features or a set of fixes, not a
   commit.
2. Pick the version: fixes bump the patch (1.1.1), features bump the minor
   (1.2.0), and a change that breaks a setup bumps the major.
3. On `dev`, set `version` in `package.json` and rename `## Unreleased` in
   CHANGELOG.md to `## 1.2.0 (date)`. Update the root and package version
   in `package-lock.json` too.
4. Run `npm run typecheck`, `npm test`, `npm run docs:check`,
   `npm run build`, and `npm run screenshots` when the change shows on screen.
   Run `npm run test:ui` for Home, Fit or board keyboard changes, and
   `npm run test:a11y` for accessible names, reflow and high-contrast graphics.
   Run `npm run test:zoom` for actual browser zoom and enlarged-text checks.
   See [Accessibility checks](ACCESSIBILITY.md) for coverage and manual checks.
5. Run `npm run release:check -- v1.2.0`. It checks the tag against
   `package.json` and both lockfile versions, and requires one matching,
   nonempty changelog section.
6. Merge `dev` into `main`, then tag and push:

   ```sh
   git checkout main
   git merge --ff-only dev
   git tag v1.2.0
   git push --atomic origin main dev v1.2.0
   ```

The release workflow runs this preflight before it publishes any image. A
version or notes mismatch stops the publication jobs. When the check passes,
the workflow builds the image, moves `latest`, `1` and `1.2`, and publishes
the GitHub Release. It fails when CHANGELOG.md has no section for the tag.
