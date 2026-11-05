# Patchboard

A start page and control center for a home server. Read DESIGN.md before
changing behavior; it records the goal and the decisions that follow from it.

- `npm run dev:demo` for UI work: invented data, no secrets needed.
- Visual changes follow DESIGN.md "Themes": colors and type are tokens from
  `web/lib/themes.ts`; rules in `web/styles.css` use tokens only, never raw
  colors. Color means trouble: healthy stays neutral. A new theme is one
  entry in `themes.ts` (keep the inline script in `web/index.html` in step).
- `npm run typecheck` and `npm test` before calling anything done. Parser
  and rule changes get a test in `server/test/` with a fixture shaped like
  the real file.
- Anything that changes state on the server (container actions, sign-ins)
  goes through a POST that requires the `X-Patchboard: action` header and is
  recorded as an event.
- `npm run typecheck` runs tsc. The server runs TypeScript
  directly on Node 24, so only erasable syntax works: no enums, no namespaces,
  no constructor parameter properties. Imports use `.ts` extensions.
- A new integration is an adapter in `server/adapters/` plus a matching
  fixture in `server/demo.ts`. Both are required; demo mode must keep working.
- Never put credentials in `config/services.yaml`. They belong in `.env`, which
  is off-limits to read or edit (see ~/.claude/CLAUDE.md). The template is
  `env.example`.
- Error messages from adapters reach the browser. Never include a URL in them,
  because some integrations (Tautulli) carry keys in the query string.
- Git: every commit, tag, merge and push is authored as Nathan
  (`Nathan Nicholas <github@nbnstack.com>`, the configured identity). No
  `Co-Authored-By` lines or any other AI attribution in commit messages, tag
  messages or PR descriptions. When merging PRs, use a merge or rebase that
  keeps Nathan as the committer.
- Releases follow docs/RELEASING.md: work lands on `main`, one tag per batch
  of changes (not per commit), the version in package.json matches the tag,
  and CHANGELOG.md has its section before the tag is pushed.
- Docs move with the code, in the same commit. Any change a user or
  contributor would notice also updates README.md, the matching doc in
  docs/, CHANGELOG.md, env.example and the example compose files, and the
  in-app text. Integrations and presets live in `shared/integrations.ts` and
  `shared/presets.ts`; run `npm run docs` after changing them. Run
  `npm run screenshots` when the change shows on screen. CI fails when the
  generated docs are stale or when code changes without a CHANGELOG entry.
- Prose follows the stop-slop rules: no em dashes (CI checks), no filler or
  softening adverbs, active voice with a real actor, specific claims, varied
  sentences, "you" for the reader. This covers docs, the changelog, comments
  in example files and every string in the UI.
- Example files are complete and working. Don't ship commented-out blocks
  for optional setups; give the setup its own file in `examples/`.
