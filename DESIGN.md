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

## The otter

An otter peeking over the edge of the water, keeping an eye on your server
so you don't have to. An otter floats calm with its tools at hand until
something needs it, and Patchboard should feel the same.

- **One drawing.** `shared/otter.ts` traces the designed icon set on a 100
  by 100 grid: a brown dome with round ears, a cream face from the eyes
  down, a rounded-triangle nose over a wide "w" mouth, two cream whiskers a
  side, two paws on one band of water with rounded shoulders. The app icon
  wears the hello face, open eyes and the smile, which reads best at every
  size; the header and the tab follow the server's mood.
- **Few colors.** Navy, one brown, cream, ink and one blue. Amber appears
  only on the alert otter and red only on the tab icon's dot, the same rule
  as the rest of the interface: color means trouble. Whiskers are cream on
  navy and brown on the light tile, so they never vanish.
- **Two sizes.** Below 40 pixels the drawing drops whiskers and mouth, grows
  the eyes and nose, and crops to the face, so it holds up on a bookmark
  bar.
- **Moods follow the server.** Calm when all is quiet, asleep on quiet
  nights, alert with an amber dot when something needs you, worried with a
  red dot when something is down. The header mark, the tab icon, the page
  title count and an installed app's badge all follow. Happy greets you on
  first run; lost answers a wrong address.
- **Quiet by default.** Healthy stays neutral here too: the otter shows up in
  empty and quiet moments and never pops up uninvited. Settings, Look turns
  the mascot off per device; the header mark stays.
- **Files.** `npm run icons` writes `icon.svg` (dark tile), `icon-light.svg`,
  `favicon.svg` (the small otter with no tile, for any browser theme),
  `favicon-dark.svg` and `favicon-light.svg`, the home-screen PNGs with
  square corners (the platform rounds them), maskable PNGs with the otter
  inside Android's safe zone, and `favicon.ico`.
- **Per device.** Settings, Look, App icon picks match the mode, dark or
  light. Patchboard points the tab icon, the Apple touch icon and the install
  manifest at the choice, and `index.html` does the same before the bundle
  loads. Browsers read those links when you add to a home screen or install,
  so the pick is what gets installed. A home-screen icon can't change after
  that on iOS or Android; the badge count is how an installed app shows
  trouble.
