# Releasing

## Branches, tags and images

| Name | What it is | Image |
|---|---|---|
| `main` | The only long-lived branch. Work lands here through commits and PRs. | `edge`, and `edge-<sha>` per commit |
| `v1.27.0` | A tag: one released version, never moved or deleted. | `1.27.0`, `1.27`, `1`, `latest`, and the same with `-slim` (`latest-slim`) |
| `v1.27.0-rc.1` | A pre-release tag, for a change that needs testing on real installs first. | `1.27.0-rc.1` only |
| GitHub Release | The page for a tag, with that version's CHANGELOG section. The release workflow writes it. | |

Demo mode ships in every image (`DEMO=1`), so the demo needs no branch or
image of its own.

## Which tag to pull

- `latest`: the newest release. Most installs want this.
- `1`: every 1.x release, never a breaking 2.0.
- `1.27`: fixes to 1.27 only.
- `1.27.0`: exactly that build, for rollbacks and reproducible setups.
- `edge`: the tip of `main`. It can break.

Each release also comes as a slim image: add `-slim` to any tag above
(`latest-slim`, `1.33-slim`). It leaves out the Docker CLI, about 90 MB,
so updating a container from Patchboard is off. Everything else works the
same. Pick it for a read-only install or a small disk. `edge` has no slim
build.

## Cutting a release

1. Batch the work. One release per session of changes, not per commit.
2. Pick the version: a fix bumps the patch (1.27.1), a feature bumps the
   minor (1.28.0), and a change that breaks a setup bumps the major.
3. Set `version` in `package.json` and add a `## 1.28.0 (date)` section to
   the top of CHANGELOG.md.
4. Run `npm run typecheck`, `npm test`, `npm run docs:check`, and
   `npm run screenshots` when the change shows on screen.
5. Commit, then tag and push:

   ```sh
   git tag v1.28.0
   git push origin main v1.28.0
   ```

The release workflow builds the image, moves `latest`, `1` and `1.28`, and
publishes the GitHub Release. It fails when CHANGELOG.md has no section for
the tag.
