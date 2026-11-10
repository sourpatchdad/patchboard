# Design

What Patchboard is for, and the decisions that follow from it. Read this
before you change how it behaves.

## The goal

Patchboard is the one place you open to know where your home server stands
and to act on it, without thinking about the server to use it. Four promises
hold it to that:

1. **It answers before you ask.** In five seconds: is anything broken, what's
   new, what's coming. Healthy things stay quiet. Color means trouble,
   except for the playback service colors described below.
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
  number. Space goes to what's broken, new, in progress or upcoming. On
  Home's icon rack a healthy app is just its icon; one with a problem also
  shows its name, so trouble is never an unnamed dot. A widget
  stays neutral until a threshold is crossed. History squares follow the
  same rule: a healthy day is ink, and only a bad day takes color. The
  header, the tab title, Needs attention and Jump to count trouble from
  one list, so they always agree.
- **Playback identity.** Playback rows and previews use service colors:
  Plex gold, Jellyfin purple, Emby green, Audiobookshelf amber, Navidrome
  cyan and Tracearr blue. This is a narrow exception to healthy-neutral
  color. Paused and buffering states keep explicit text. Previews show
  artwork, never imply live video, and omit progress the service does not
  report. Hover, Enter (or Down) and a tap reach the same details; Tab
  always moves on. A playing bar moves every second; a paused one holds.
- **Everything goes somewhere.** A row, a number or a poster that leads
  nowhere doesn't earn its space.
- **Compact header.** Status, server graphs, and time above weather form
  three matching cards with aligned edges. Time and weather share one
  centered card; weather has no box of its own. Quiet status stays on one
  desktop line. Full graphs are the default, with on/off controls in
  Settings, Home and a Header settings link beside Arrange board. Sizes and
  forecasts are secondary controls. Header choices apply per device and
  leave saved boards alone. New boards leave out a duplicate Server card;
  saved widgets stay as they are. An unreachable integration leads with the
  connection problem, never a reassuring line that contradicts it.
- **List alignment.** Reading metadata and calendar rows keep consistent
  desktop baselines. When Reading and This week sit side by side at close
  heights, they can share a bottom edge if a small adjustment fits.
  Placement and page fit come before equal heights.
- **Fit without losing the row.** Fit can shorten vertical lists. A single
  horizontal poster row keeps its selected items. Recalculate on width
  changes and changes to the space above the board. Reserve the measured
  footer height, and report any remaining overflow. Fit is a temporary view
  adjustment and never rewrites the saved board. If shorter lists aren't
  enough, artwork can shrink with its proportions intact; every poster stays
  in the horizontal row. Right now folds first and can fold all the way,
  each service to its heading and one line of titles, so the other lists
  keep their rows. When nothing makes it fit, Fit gives every list its full
  length back: a page that scrolls anyway shouldn't also be cut short.
- **Use the width.** The board has the columns you choose; each widget lays
  itself out for the width it gets (container queries), so nothing clips.
- **The UI sits on top of files.** Apps, groups, icons, live numbers, the
  board and page settings live in Patchboard's database. services.yaml and
  Docker labels keep working underneath, and the UI never rewrites them.
- **One pattern per job.** Every page customizes through the same panel;
  every list sorts through the same control; sorts live in the URL.
  Arrange board keeps the viewed card sizes and fitted item counts, with
  floating controls and a bottom arrange bar: everyday moves in one row,
  the rest under Tools with Reset apart from Save. Hidden header widgets
  stay out of the grid. Dragging assigns a starting column and relative
  vertical position, so neighboring columns stay put; narrower screens
  clamp the column.
  Dotted editing outlines surround card content and leave the gutters clear.
- **Surfaces and corners.** Cards sit one tonal step above the page with a
  hairline edge and, in dark themes, a faint top light; only floating
  layers (sheets, Jump to, previews) cast a shadow. Corners step down as
  shapes nest: 14px cards and sheets, 10px tiles and icon wells, 8px
  controls and rows, 6px chips. Selection is a soft accent wash; trouble
  is a tinted outline plus its colored status line, never a side bar.
- **Motion answers you.** Hover and press take 120ms, things that appear
  200ms, sheets 280ms, all easing out. Buttons, tiles and app icons give
  a little when pressed. A playing bar glides between its once-a-second
  updates. Reduced motion turns all of it off.
- **Two control sizes.** Buttons and Settings choices are 36 pixels tall;
  sort and filter rows inside a list are 30. Every text action (Details,
  Pause, Search, Arrange board) is 14px. A link inside a sentence is
  underlined; a name or action on its own isn't, until you hover it.
- **Keyboard access.** Board drawers contain focus, Escape closes them,
  and focus returns to the opener. The background is inert while a drawer
  is open. Skip to content bypasses the navigation. Each app group is one
  Tab stop with arrow keys inside it, so the widgets below are a few
  presses away, not dozens.
- **Arriving at a section.** A link to part of a page scrolls there and
  marks the section's heading and rule in the accent until you scroll,
  click or type. No glow and no fade.
- **Words:** plain, short, active. No em dashes. Name the thing.

## Architecture

- **The server holds every credential.** The browser talks only to
  Patchboard. Keys come from the database, pasted in the UI, or from the
  environment, and never travel to the browser.
- **One adapter per integration,** each polling on its own schedule, each
  with a demo fixture of the same shape. One failing integration marks its
  data stale; nothing else stops. A schedule can follow what's happening:
  media servers and music poll every 5 seconds while someone plays
  something and fall back to 15 or 20 when nobody does, and the slow parts
  (new arrivals, next up) ride along at most once a minute.
- **Live without weight.** Jellyfin, Emby and Audiobookshelf push: one
  WebSocket each, using Node's own client, so a start, stop, pause or seek
  shows at once, and polling drops to once a minute while the line is
  proven to carry news. Steady playing time isn't sent at all: the browser
  runs a playing stream's position on at real speed, at most 30 seconds
  past the last answer. Plex (through Tautulli) and Navidrome can't push,
  so they poll every 5 seconds while something plays. A camera's frame
  refreshes every 5 seconds only while it's on screen and the tab is in
  front, swapped in whole so it never flickers. Tapping a camera opens it
  live: Frigate's motion-JPEG feed passed straight through, one chunk at a
  time, at most three at once, ending when
  the view closes, the tab goes to the back, or ten minutes pass. Patchboard
  never decodes a frame, so a camera costs bandwidth, not memory.
- **Server-sent events** push changes to every open tab.
- **SQLite** (`node:sqlite`) holds what integrations can't supply: container
  history, minute samples, the boards, the app layout, page settings, keys and
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
4.5:1 or better on `bg`. No text goes below 11px: labels and `<small>`
  shrink with their line down to that floor. The inline script in
`web/index.html` paints the saved theme before the page loads; keep it in
step with `appearance.ts`.

## The status light

Patchboard's one status mark is a light in a patch-panel socket, the same
socket the patch-bay launcher plugs apps into. A quiet glow means live,
amber means stale, red means down and glows, and a dark socket means idle.
Every board widget wears one before its name: its integration's health, or
for a widget built from several, whether Patchboard itself is live, so a
dropped connection turns the whole board amber at once. Right now, Changes,
Logs, a container's state line and every alert (Needs attention, weather,
TrueNAS) use the same light at list size, in place of a colored stripe. An
app's light follows the alerts that name it, so Home, Apps and Needs
attention never disagree. A stop stays red only while it's unexplained: a
container that runs again, a scheduled job, or one you stopped from
Patchboard goes quiet. Color still
means trouble; only the top bar's Live light is green.

## The otter

An otter peeking over the edge of the water, keeping an eye on your server
so you don't have to. An otter floats calm with its tools at hand until
something needs it, and Patchboard should feel the same.

- **The art.** The designed artwork lives outside the repo, one 1254-pixel
  image per mood (hello, calm, alert, worried, asleep, happy, lost), each the
  otter on a navy tile: a brown dome with round ears, a cream face from the
  eyes down, a nose over a wide "w" mouth, cream whiskers, two paws on one
  band of water. The app icon wears the hello face.
- **Few colors.** Navy, one brown, cream, ink and one blue. Amber appears
  only on the alert otter and red only on the tab icon's dot, the same rule
  as the rest of the interface: color means trouble.
- **Never recolored.** The build lifts the otter off its tile and resizes
  it; the pixels stay as drawn. On a light page the mascot sits on its navy
  tile, so the cream whiskers show.
- **Moods follow the server.** Calm when all is quiet, eyes open when
  quiet notes wait (image updates, an app it can't reach), asleep on quiet
  nights, alert with an amber dot when something needs you, worried with a
  red dot when something is down. The header mark, the tab icon, the page
  title count and an installed app's badge all follow. Happy greets you on
  first run; lost answers a wrong address.
- **Quiet by default.** Healthy stays neutral here too: the otter shows up in
  empty and quiet moments and never pops up uninvited. Settings, Look turns
  the mascot off per device; the header mark stays.
- **The header mark and the tab icon** are the otter with no tile, cropped
  close, wearing the server's mood. The tab adds an amber or red dot.
- **Files.** `npm run icons -- /path/to/otter-art` reads the art and
  writes, per mood, `web/public/otter/<mood>.png` (navy tile),
  `<mood>-clear.png` (no tile, for the mascot) and `<mood>-mark.png` (no
  tile, cropped close, for the header). It also writes the home-screen
  PNGs with square corners (the platform rounds them), maskable PNGs with
  the otter inside Android's safe zone, `favicon.png` and `favicon.ico`. To
  change the otter, replace the art and run it again.
- **Per device.** Settings, Look, App icon picks match the mode, dark or
  light. Patchboard points the Apple touch icon and the install manifest at
  the choice, and `index.html` does the same before the bundle
  loads. Browsers read those links when you add to a home screen or install,
  so the pick is what gets installed. A home-screen icon can't change after
  that on iOS or Android; the badge count is how an installed app shows
  trouble.
