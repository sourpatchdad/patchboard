# Changelog

## 1.9.4 (2026-11-12)

- **Wall boards on a swipe:** a household device fetches every board's layout
  before it draws the pages out of sight, so the next page shows as a wall
  board straight away. Before, it could flash the top bar and board tabs for
  half a second.

## 1.9.3 (2026-11-12)

- **Faster swiping on wall tablets:** a household device draws each of its
  pages once and keeps them, so a swipe shows the next page instead of
  building it. On a Fire HD 8, going between the Monitor and a board took
  over two seconds. While you drag, only the page showing moves.
- **Swipes on a busy tablet:** a quick flick counts by when your finger
  moved, so a slow page no longer drops it.
- **Updating Patchboard from the UI:** after the update hands off, the sheet
  says Patchboard is restarting and loads the new version when it's back.
  Before, the Update button came back as if nothing had happened. Patchboard
  also checks for a newer image of itself every hour, up from every six.

## 1.9.2 (2026-11-12)

- **Cameras full screen:** tapping a camera fills the screen with it, black
  around the picture and nothing cut off, on a wall tablet as on a desktop.
  A tap on the picture closes it.

## 1.9.1 (2026-11-12)

- **Smoother swiping on wall tablets:** the page leans with your finger as it
  moves, boards you've seen draw at once, and a tablet fetches all its pages
  ahead, so the first swipe is as quick as the rest. The touch that ends a
  swipe no longer opens a preview or link underneath, and long-press menus
  stay out of the way.
- **Large camera frames:** the Cameras widget can show its frames as big as
  the card allows, without today's detections. The wall cameras board starts
  that way.

## 1.9.0 (2026-11-12)

- **Scan to join:** a new household link comes with a QR code, so a tablet
  or phone opens it with its camera instead of someone typing it.

## 1.8.1 (2026-11-12)

- **Sign-in never falls open:** `AUTH=Password` or a password set without
  `AUTH` used to leave Patchboard with no sign-in. Now `AUTH` reads in any
  case, a password turns sign-in on by itself, and a value Patchboard
  doesn't know stops it from starting. With sign-in off, a visitor from the
  internet puts a warning at the top of Needs attention.
- **Keys stay with their servers:** pointing an integration at a new address
  asks for its key again, and a key an API widget uses goes only to the
  server it was first sent to. Keys typed into an app's live number move to
  the key store, as they already did on boards.
- **Stricter single sign-on:** `OIDC_ALLOWED` matches an email only once the
  provider has verified it, and takes typed entries (`email:`, `group:`,
  `user:`, `sub:`) so a username can't pass for a group. An empty list
  shows a warning until you fill it or set `OIDC_ALLOW_ANYONE=1`.
- **Sign-in behind a tunnel:** wrong passwords count per visitor, not per
  proxy, so a stranger can't lock you out; failures from many addresses
  slow every try instead. Settings' current-password check counts the same.
- **Household devices:** a panel picture gets its own address, which can't
  join as a device; a signed-in browser asks before becoming a household
  device; and household devices no longer receive the inbox.
- **Logs:** passwords, keys, cookies and tokens in more spellings are masked.

- **Safer to trust:** release images now carry a signed record of how they
  were built and a list of what's inside them, and GitHub's code scanning
  reads every change. Report a security problem privately from the
  repository's Security tab.

## 1.8.0 (2026-11-12)

- **Français:** Settings, Look, Language switches the boards, the wall
  screens, the Monitor, the navigation and the Home header to French, with
  dates and numbers written the French way to match. Settings and the
  problem titles the server writes stay in English for now. Another language
  is one file in `web/i18n`, and a check in CI catches any string it misses.

- **A picture for panels with no browser:** a TRMNL, an Inky or an ESP32
  e-paper screen can show the server as a one-bit PNG or BMP: the status
  and what needs you, the weather, and CPU, memory and the pool. Make a
  household device for it and Settings shows the picture's address beside
  the link; `?w=` and `?h=` set the size. It's drawn on the server in a
  bitmap font, with nothing added to the image.

## 1.7.0 (2026-11-12)

- **Wall tablets swipe between pages:** give a household device more pages
  in Settings, next to Opens: the Monitor, any board, Server, Weather. A
  swipe or an arrow key moves between them, dots show where it is, and it
  can turn them by itself every 30 seconds to 10 minutes, waiting three
  minutes after anyone touches it.
- **Boards for the wall:** New board offers five layouts made for a screen
  on the wall: clock and weather, markets, house, cameras, and media. A
  board set For a wall screen trades the header for one status line and
  drops the tabs; on a household device the navigation goes too.
- **Markets:** coins, stocks, funds, indexes and currencies, each with its
  price, the day's change and a line of the day. Write `BTC`, `AAPL`,
  `^GSPC` or `EUR/USD`; no key needed. Big numbers draws a tile for each.
- **Sun and moon:** sunrise, sunset, how long the day is and how it changes
  tomorrow, and tonight's moon, from the weather's place.
- **Countdown:** days until the dates you name; a date without a year comes
  round every year.
- **Big clock:** Clocks can show your own time and date large, for across
  the room, with other places underneath.
- **E-ink:** set a household device's Screen to E-ink in Settings, or turn
  on E-ink under Look on any browser. The page goes black on white with no
  motion, problems show as a solid square or a ring as well as by color,
  photos turn gray, and what changes is drawn once a minute instead of
  flashing the panel all day. The Monitor gets a paper version and drops
  its seconds.
- **Region:** Settings, Look sets how dates, times, numbers and prices are
  written, from 28 regions, and the currency for prices. It follows the
  browser until you pick, and 24-hour time now starts on where the browser
  uses it. On the hour, a 24-hour clock reads 21:00 instead of 21.

## 1.6.1 (2026-11-12)

- **Wall tablets pick up updates:** after you update Patchboard, a household
  device loads the new version by itself. Before, it reconnected but kept
  the old page, so a new setting such as the Monitor's Color did nothing
  until someone reloaded it by hand.

## 1.6.0 (2026-11-12)

- **Showcase mode:** before you share a screenshot, turn it on in Settings,
  Look. Addresses, domain names, email and MAC addresses become made-up ones
  that read like real ones, camera pictures blur, and you list the rest
  (your server's name, family names, your town) for stand-ins. It covers
  every page and widget, and fields you type in keep their real values.
- **Wall tablets dim at night:** pick night hours for each household device
  in Settings, next to Opens and Monitor color. The screen darkens through
  them, and a tap brightens it for two minutes without pressing anything
  underneath.

## 1.5.0 (2026-11-12)

- **Monitor in color:** a third Monitor color in Settings, Household
  devices. Each part of the server gets one cool hue (blue CPU, violet
  memory, cyan network, ice storage) on a near-black that suits a tablet
  screen. Amber and red stay the only warm colors, so trouble still stands
  out from across the room, colorblind or not.

## 1.4.0 (2026-11-11)

- **Remote control for household devices:** in Settings, Connections,
  Sign-in and keys, set where each device opens (Home, any board, Monitor,
  Server, Upcoming, Reading or Weather) and the Monitor's color, gray or
  blue. The device follows within a second, with nobody touching it, and
  opens there again after a restart.
- **Lighter on open screens:** a source whose data didn't change since its
  last poll isn't sent again for a minute, so a tablet on the wall, or any
  tab left open, redraws only when something moved.
- **Monitor on a big screen:** on a TV or a large monitor, labels, numbers,
  lines, squares and bars all step up, so it reads from across the room.
- **Monitor:** the network tile shows the latest recorded reading while
  TrueNAS's live feed reconnects, instead of a blank.

## 1.3.3 (2026-11-11)

- **Monitor feed:** lines from before today show their day ("tue 22:13"),
  and apps that log JSON, such as autobrr, show their message instead of
  the raw line.
- **Monitor, no cut rows:** busiest now, needs you and updates waiting show
  only rows that fit whole. With room for none, the block hides, heading
  and all.

## 1.3.2 (2026-11-11)

- **Monitor feed:** Unpackerr's status line ("0 failed") no longer counts as
  an error, and Immich lines lose their own date prefix like the rest.
- **Monitor fills the screen:** the left column ends with the busiest
  containers right now, the middle with what needs you and the containers
  waiting for an update. Each shows as many rows as fit, and the last one
  fades instead of being cut in half.

## 1.3.1 (2026-11-11)

- **Monitor:** quiet grays now carry everything healthy, so only amber and
  red stand out. CPU and memory waffles and the CPU week sit together on the
  left, backups, cloud sync and the fleet in the middle. Uptime ticks by the
  second, the network line starts with two hours of history, and the pool
  shows its last 30 days.
- **A calmer feed:** the same message from the same app shows once, with a
  count, and apps' own dates, levels and process numbers come off the front.
  A Python crash counts once, by its last line, and errors named like
  `ConnectionError` count as errors.
- **Fixes:** Jellyfin 10.11's live playback works again: Patchboard sends
  its key the way 10.11 expects, which also stops "Token is required" in
  Jellyfin's log. Goodreads, Patchboard and Tailnet keep their capital
  letters in setup messages.

## 1.3.0 (2026-11-11)

- **Monitor:** the server on one full screen for a tablet on the wall, at
  `/monitor`. CPU, memory and network draw live lines, and CPU and memory
  also fill a hundred squares each. Every container, backup night and disk
  gets its own square or bar, beside the CPU week. A feed down the side shows
  container events and the warning and error lines from every log. Household
  devices see it too, and get only those masked problem lines.
- **Signing out:** Settings, Connections, Sign-in and keys has Sign out of
  this browser. Opening a household link signs that browser out too, so a
  wall tablet never keeps full access underneath.
- **Server at a glance:** long container names in Busiest containers give
  way instead of pushing the numbers off the edge, and TrueNAS alerts match
  the rest of the page. A household device no longer shows All stacks.

## 1.2.1 (2026-11-11)

- **Server at a glance:** on a short landscape screen, such as a wall tablet,
  the Server page packs into three tight columns and fits without
  scrolling: storage, datasets, backups, cloud sync, resources, the busiest
  containers, disks and the CPU week.

## 1.2.0 (2026-11-11)

- **Household devices:** a link for a family phone or a wall tablet, made in
  Settings, Connections, Sign-in and keys. Open it once and that device sees
  the boards, cameras, the Server page, reading and calendar, and switches
  the lights and scenes pinned to a board. It gets no update, restart or stop
  buttons, no Settings, logs or container pages, and the server refuses those
  from it too. Remove a device and its link stops working.

## 1.1.3 (2026-11-11)

- **Logs:** apps that color their output, such as Immich, read as plain
  text instead of showing terminal codes.
- **Jump to:** an action matches on its container's name, so "son" finds
  Sonarr's actions and not "Stop nextcloud".
- **Reading:** cards skip feed boilerplate, such as Hacker News link lines
  and affiliate notices, and keep paragraphs apart.
- **Under the hood:** TypeScript 7, cross-env 10, and patch updates to Hono,
  Vite, Playwright, concurrently and ws.

## 1.1.2 (2026-11-10)

- **Fixes:** the board tabs on a phone scroll only sideways, so a swipe
  down the page no longer catches on them. Browsers fetch the icons and
  install files again after an update instead of showing last release's
  copy.
- **App icon:** Dark is the default, and reads on light and dark home
  screens. A phone in dark mode could darken the Light icon until its P
  disappeared.

## 1.1.1 (2026-11-10)

- **New app icon:** a P with a blue tab, in dark and light, on the browser
  tab, home screens and the install prompt. A phone that already added
  Patchboard keeps the old icon until you add it again.
- **Home's foot:** your version on the left; Edit header, Arrange board and
  New board together on the right. On a phone, the version takes its own
  line.
- **Leaner examples:** examples/ holds the plain compose file and a
  hardened one. CONFIGURATION.md covers mounts, host networking for
  Wake-on-LAN, and HTTPS for the phone app. Import from Homepage in
  Settings replaces the command-line importer.

## 1.1.0 (2026-11-10)

- **Version and updates on Home:** Patchboard's version sits beside Header
  settings. When a newer release is out it reads "Update to v1.2.0" and
  opens what each release changed, with Update right there. After you
  update, it shows what's new once.
- **Accessibility:** hold-to-confirm buttons work with screen readers,
  voice control and switches (press twice). Single-key shortcuts can be
  turned off in Settings, Look. Focus stays put after you move or remove a
  widget, open an article or press a busy button. Failed backup nights are
  named in words, and form fields have edges you can see.
- **Security:** Reading fetches pictures only from public addresses,
  checked as each connection opens, including addresses written as IPv6.
  The API widget refuses metadata addresses however they're written, and
  feed downloads stop at 1 MB.
- **Look:** app icons show their own colors by default, and an app with a
  problem shows its name on Home's icon rack. Paper's accent is slate blue,
  apart from its amber warnings, and the accent presets drop green, rose
  and sand, which read as ok, down and warning. Floating panels share one
  shadow, and a chosen sort or filter is edged in the accent.
- **Fixes:** Reading's Mark all read no longer covers the sort buttons.
  Lists in articles, runbooks and release notes show their bullets again.
  Jump to opens an app's page on Enter instead of restarting it. A fresh
  install draws no empty cards, and Add all leaves Patchboard itself out.
- **Faster first load:** about 30 KB smaller; the update notes load when
  you open them.

## 1.0.0 (2026-11-10)

The first public release.

- **Home:** what needs you, the server, your apps,
  what's playing, the week's releases, your reading and what changed, fitted
  to one screen. Add boards for the TV, the rack or the house, on 2 to 6
  columns, each widget sized and placed by dragging.
- **Live playback and cameras:** Jellyfin, Emby and Audiobookshelf push playback as
  it happens; Plex (through Tautulli) and Navidrome poll every 5 seconds while
  something plays. Camera frames refresh while on screen, and a tap opens
  one live.
- **Container pages:** each container has a page with its alerts,
  runbook section, live logs, a 30-day health strip, and restart, update and
  roll back. Jump to (Ctrl K) reaches any app, page or action.
- **Setup in the browser:** add every running container in one click,
  connect any of 68 integrations from Settings with keys encrypted on the
  server, or import Homepage's `services.yaml`. Environment variables and
  `services.yaml` keep working underneath.
- **Alerts** through ntfy, Gotify, Pushover, Discord, email or a
  webhook when a problem lasts two minutes, and again when it clears.
- **Themes:** five themes in dark and light plus a custom one, accent
  colors, three densities, a phone layout with a tab bar, and an installable
  app with its own icon.
- **Security:** sign in with a password, OIDC or your reverse proxy; a
  read-only mode; an activity log of every change; a strict Content Security
  Policy. Your browser talks only to Patchboard: icons, posters and article
  pictures all come through it.
- One container, about 50 MB of memory, for amd64 and arm64, plus a slim
  image without the Docker CLI.
