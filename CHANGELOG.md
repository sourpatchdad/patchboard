# Changelog

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
