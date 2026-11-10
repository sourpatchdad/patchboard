# Contributing

Bug reports, integration requests and pull requests are welcome. This file
covers how to run Patchboard locally, the checks a change has to pass, and
what a new integration or widget needs.

## Run it

You need Node 24 or newer. No database server or API keys required.

```sh
npm install
npm run dev:demo      # invented data on http://localhost:5173, hot reload
```

Demo mode fills every page with made-up containers, media, feeds and
alerts, so UI work never needs a real server. To point at your own Docker
and apps, copy `examples/env.example` to `.env`, fill in what you run, and use
`npm run dev`.

## Before you open a pull request

```sh
npm run typecheck
npm test
npm run docs:check
npm run test:ui
```

The UI check builds the app and starts an isolated demo database. It needs
Chrome, Chromium (`CHROMIUM_PATH` can select it), or a browser installed with
`npx playwright-core install chromium`. It checks Fit, saved boards, poster
rows, responsive layout and keyboard paths.

CI runs these checks, builds the image, scans history for committed keys,
and fails when code changes without a CHANGELOG.md entry. The pull request
template has the rest of the checklist.

Some house rules:

- **The server runs TypeScript directly** on Node 24. Only erasable syntax
  works: no enums, namespaces or constructor parameter properties. Imports
  end in `.ts`.
- **Docs ship with the code,** in the same pull request: README, the
  matching file in `docs/`, CHANGELOG.md, `examples/env.example` and the
  example compose files. Run `npm run screenshots` when the change shows on screen.
- **Check every screen size.** Look at a change at 1440 by 900, 1920 by 1080
  and a 390-pixel phone. Pages should fit a desktop screen with little or no
  scrolling, and nothing on a phone should scroll sideways.
- **Color means trouble.** Healthy things stay neutral. Styles use the theme
  tokens in `web/lib/themes.ts`, never raw colors.
  [docs/DESIGN.md](../docs/DESIGN.md) has the reasons.
- **Anything that changes state** (a container action, a sign-in, a saved
  setting) is a POST that requires the `X-Patchboard: action` header and
  writes to the audit log.
- **Adapter errors reach the browser.** Never put a URL in one; some apps
  carry keys in the query string.
- **Prose is plain:** active voice, specific, short. No em dashes.

## Adding an integration

An integration reads one app's API on a timer and hands the browser typed
data. Uptime Kuma (`server/adapters/uptimekuma.ts`) is a small, complete
example. A new one touches these files:

1. **`shared/types.ts`:** add the id to `SourceId` and an interface for the
   data the browser gets. Keep it to what a screen shows.
2. **`server/adapters/<name>.ts`:** an `Adapter` with an id, a label, a poll
   interval and `fetch()`. Use `getJson` or `request` from `server/http.ts`,
   which set timeouts and keep URLs out of error messages. Export the pure
   mapping function so a test can feed it a recorded response.
3. **`server/config.ts`:** read the variables. Settings saved from the UI
   arrive through the same lookup, so there is nothing else to wire.
4. **`server/index.ts`:** one line in `FACTORIES`. The same factory builds
   the live adapter and the Test connection check.
5. **`shared/integrations.ts`:** name, what it adds, its variables and where
   to find a key. `npm run docs` turns this into docs/INTEGRATIONS.md.
6. **`shared/setup.ts`:** add the id to `UI_SETUP` so Settings can set it up.
   Patchboard encrypts secrets at rest and never sends them back to a
   browser.
7. **`examples/env.example`:** every variable, with a realistic placeholder.
   A test fails when one is missing.
8. **`server/demo.ts`:** invented data in the same shape. Demo mode has to
   keep working.
9. **`server/test/<name>.test.ts`:** the mapping, against a fixture shaped
   like the app's real response.
10. **A place on screen:** a widget (below), a line in Needs attention
    (`server/alerts.ts`), or both.

Read-only comes first. An integration that can act (Pause, Toggle, Wake)
needs a POST route with the action header, a check that the target is one
the user chose, and an audit entry.

## Adding a widget

1. **`shared/board.ts`:** add the type to `WidgetType` and an entry in
   `WIDGET_INFO`. That entry sets the name, description, default width and
   whether a board can hold more than one.
2. **`web/board/`:** the component. It renders inside `Section`, returns
   nothing while its integration is off, and handles an empty state.
3. **`web/board/Board.tsx`:** one case in the render switch. If the widget
   depends on an integration, add a line to `ready` in `AddDrawer`, so
   Customize only offers it once the integration is on.

## Reporting a security problem

Please don't open a public issue. SECURITY.md explains how to report one
privately.

## License

By contributing, you agree that your contributions are licensed under the
GNU Affero General Public License v3.0 in LICENSE.
