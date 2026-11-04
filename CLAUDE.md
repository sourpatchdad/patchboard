# Patchboard

Start page and control center for HomeNAS. Read DESIGN.md before changing
behavior; it records why things are the way they are.

- `npm run dev:demo` for UI work: invented data, no secrets needed.
- Visual changes follow DESIGN.md "Themes": every color and typeface is a
  token in a theme block at the top of `web/styles.css`; rules below the
  token blocks use tokens only, never raw colors. Color means trouble:
  healthy stays neutral. A new theme is a token block plus an entry in
  `web/lib/appearance.ts` (keep the inline script in `web/index.html` in step).
- `npm run typecheck` and `npm test` before calling anything done. Parser
  and rule changes get a test in `server/test/` with a fixture shaped like
  the real file on the NAS.
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
