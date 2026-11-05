# Design

What Patchboard is for, and the decisions that follow from it. Read this
before you change how it behaves.

## The goal

Patchboard is the one place you open to know where your home server stands
and to act on it, without thinking about the server to use it. Four promises
hold it to that:

1. **It answers before you ask.** In five seconds: is anything broken, what's
   new, what's coming. Healthy things stay quiet. Color means trouble.
2. **Every glance leads to an action.** A number opens what's behind it. A
   stopped container is two clicks from its logs, a restart or a rollback.
3. **It's yours without config files.** Someone who has never opened YAML can
   add an app, connect its number, move it and hide it. Someone who keeps
   YAML in git keeps that, and the two never fight.
4. **It's safe to trust.** An engineer can read SECURITY.md, narrow what it
   can do, and see who did what.

Test a feature against two people: someone non-technical in your house, who
should understand it on sight, and you at 2 AM, who should reach the fix in
one click.

## In the interface

- **Exceptions, not inventory.** A healthy app gets an icon and a quiet
  number. Space goes to what's broken, new, in progress or upcoming. A widget
  stays neutral until a threshold is crossed.
- **Everything goes somewhere.** A row, a number or a poster that leads
  nowhere doesn't earn its space.
- **Use the width.** The board has the columns you choose; each widget lays
  itself out for the width it gets (container queries), so nothing clips.
- **The UI sits on top of files.** Apps, groups, icons, live numbers, the
  board and page settings live in Patchboard's database. services.yaml and
  Docker labels keep working underneath, and the UI never rewrites them.
- **One pattern per job.** Every page customizes through the same panel;
  every list sorts through the same control; sorts live in the URL.
- **Words:** plain, short, active. No em dashes. Name the thing.

## Architecture

- **The server holds every credential.** The browser talks only to
  Patchboard. Keys come from `.env` or, when pasted in the UI, from the
  database, and never travel to the browser.
- **One adapter per integration,** each polling on its own schedule, each
  with a demo fixture of the same shape. One failing integration marks its
  data stale; nothing else stops.
- **Server-sent events** push changes to every open tab.
- **SQLite** (`node:sqlite`) holds what integrations can't supply: container
  history, minute samples, the board, the app layout, page settings, keys and
  the activity log.
- **Shared validation.** `shared/` holds the board, layout, page and widget
  rules that both sides use, so the server never stores something the UI
  can't draw.
- **No build step for the server.** Node runs the TypeScript directly, so the
  code uses erasable syntax only: no enums, namespaces or parameter
  properties.
- **Demo mode is a startup switch** (`DEMO=1`), and the screenshots come from
  it.

## Themes

A theme is data: an entry in `web/lib/themes.ts` with dark and light color
tokens and a type pairing. `web/lib/appearance.ts` turns it into CSS
variables on `<html>`, and every rule in `web/styles.css` uses those tokens.
Keep `ok`, `warn` and `crit` apart from `accent`, and quiet text (`ink3`) at
4.5:1 or better on `bg`. The inline script in `web/index.html` paints the
saved theme before the page loads; keep it in step with `appearance.ts`.
