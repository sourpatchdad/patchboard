# Changelog

## 1.9.0 — 2026-11-04

Home is a board you arrange.

- **Widgets:** every Home section is a widget (Apps, Needs attention, Right
  now, This week, Inbox, Feeds, Changes, Recently added) with a width of a
  quarter, a third, a half or the full row. They pack like masonry on a
  12-column grid (6 on laptops, 1 on phones), so tall and short widgets
  leave no gaps.
- **New widgets:** Server (CPU, memory, storage, uptime, with the last 24
  hours) and Container (any container's CPU, memory, response time, a
  24-hour CPU line and 14 days of health). Add as many containers as you like.
- **Customize** on Home: drag by the handle or use the arrows, pick a width,
  remove, add from a drawer; Save, Cancel or Reset to default. View mode has
  no handles at all. Needs attention can move but never leave.
- The board is stored on the server, so every device shows the same one;
  phones show it as one column in the same order. Saving needs the action
  header, like every other change.
- Settings no longer lists Home sections; Customize replaces it.
- Tests for board validation (22 total).

## 1.8.0 — 2026-11-04

First piece of v2 (docs/DESIGN-v2.md).

- **Docker label discovery:** a container registers itself with
  `patchboard.name`, `.group`, `.href`, `.icon` and friends in its own
  compose file. Homepage's `homepage.*` labels work unchanged (never its
  widget credentials). Label entries join a catalog group of the same name or
  start new ones; the YAML file wins when both describe a container. Open
  tabs pick up catalog changes live.
- Trakt's calendar loads the moment sign-in completes, not on the next
  30-minute poll.
- Phones: ledger labels and tile lines wrap instead of clipping.

## 1.7.2 — 2026-11-04

- **Trakt works with only a Client ID.** Trakt stopped issuing client
  secrets to new apps in 2026; the code sign-in now needs none (one is still
  sent if configured). OAuth calls moved to auth.trakt.tv, as Trakt requires
  from February 2027. Tokens last 7 days and refresh a day early; refreshes
  never overlap, because Trakt's refresh tokens are single-use.

## 1.7.1 — 2026-11-04

A clean-up pass, checked by a script that finds clipped text on every page at
three widths, against real data.

- Removed the nbnstack theme; the patch bay stays as a Home layout.
- One duration style: Docker's "About an hour" and "Less than a second"
  become "1 hour" and "seconds".
- A key under the app tiles: what the dots, the arrow (newer image
  available), "29 ms" (how fast the app answered) and "Up 6 days" (uptime,
  for apps with no link to check) mean.
- Apps page sorts by your order, problems first, or A to Z. Home keeps your
  order so tiles never move under your hand.
- Nothing clipped: poster titles take two lines, cloud sync tasks get full
  rows, disk models and Stacks rows wrap on phones, long titles wrap on
  Upcoming, app names take two lines on phones.
- Wide screens (1600px and up): pages widen to 1720px and Home flows into
  three columns.

## 1.7.0 — 2026-11-04

Make it yours, and run it anywhere.

- **Themes are data** (web/lib/themes.ts): Graphite, Midnight, Forest, Dusk,
  Paper and nbnstack, each dark and light, plus **Custom** from any
  background, text and accent, with a live contrast check. Theme cards show a
  miniature of each theme.
- **Settings:** any accent color, four type pairings (Geist, DM, system,
  mono everywhere), three densities, 12/24-hour clock, °F/°C/both for weather
  and disks, which Home sections show, tiles or patch bay. Copy settings to
  another device as a string; reset to defaults.
- The saved theme paints before any script loads, for dark and light alike.
- **Contrast:** Graphite surfaces, lines and quiet text spread further apart;
  healthy days in the health squares are solid accent, unwatched days are
  outlines; meters are thicker with a visible track; charts use the accent;
  app tiles sit on their own surface.
- **Self-hosting:** generic env.example, docker-compose.example.yml and
  Caddyfile.example; docs/CONFIGURATION.md covers every variable, mount and
  file format; a release workflow publishes amd64 and arm64 images to
  ghcr.io on version tags; the README starts with a one-line demo run.
- Weather is fetched in Celsius and shown in the unit you choose.

## 1.6.0 — 2026-11-04

Apps that say something.

- **App tiles** replace the patch row on Home (the patch bay is still a
  setting). Each tile has the full name and one live line: Plex streams,
  Sonarr/Radarr queue, qBittorrent speed, Miniflux unread, Frigate cameras,
  otherwise response time or uptime. Trouble overrides it: stopped, failing
  its health check, not answering, stuck imports, or a catalog entry that
  points at no container. Only trouble gets color; an image update is a
  small arrow by the name. Group headers count only what needs attention.
- **Catalog audit** in Settings and on Apps: entries naming a container that
  doesn't exist, and running apps the catalog doesn't list (databases,
  caches, workers and anything another container depends on are skipped),
  with drafted YAML: a name and icon guessed from the image and a link from
  the published port.
- Apps page uses the same tiles, plus "Running, not in the catalog".
- Settings: Apps on Home (tiles or patch bay).
- Tests for the audit and name guessing (18 total).

## 1.5.3 — 2026-11-04

- Removed the bookmark dock from Home. It was start-page furniture with a
  white key behind every logo; Home is about the server now. Bookmarks are
  still in Jump to and under Elsewhere on Apps.
- Fixed: the phone top bar's search button showed a default button box.

## 1.5.2 — 2026-11-04

Dependencies, all majors tested together.

- Node 26 (current LTS) in the image and CI
- Vite 8 with @vitejs/plugin-react 6: client builds in about 0.25 s (was 2.4 s)
- @hono/node-server 2, marked 18, concurrently 10, @types/node 26
- GitHub Actions: checkout 7, setup-node 7, setup-buildx 4, build-push 7,
  which also clears the Node 20 deprecation warnings

## 1.5.1 — 2026-11-04

Phones.

- Nothing scrolls sideways any more. The page clips horizontally, and the
  bookmark dock (which pushed real Home to 490px on a 390px phone) wraps.
- The patch row is a wrapping grid on phones: every app visible, no
  sideways strip inside a vertical page.
- Phone Home order: status, Needs attention, apps, then the rest.
- Search moved from the floating button into the top bar; it opens as a
  sheet at the top. The page behind search and the shortcut list stays put.
- Inputs are 16px on phones, so iOS no longer zooms in on focus.
- Long episode titles, image names and identifiers truncate or wrap instead
  of widening their row; inner log panes don't drag the page when they hit
  their end.
- CI: secret scan uses the gitleaks CLI over the full history (the GitHub
  action crashed on a range starting at the first commit).

## 1.5.0 — 2026-11-04

Update containers from the UI.

- **Update** on container pages (two-step confirm): pulls the image, recreates
  only that service with `docker compose up -d --no-deps`, then waits until it
  is running, healthy, and answering its service check, live-tested rather
  than taken from the last minute's result. Each step streams to the page with
  the old and new image ids and the raw output.
- **Roll back:** a failed update offers the previous image; Patchboard points
  the tag back at it and recreates on it without pulling.
- **Guard rails:** only compose stacks under `COMPOSE_ROOT`; TrueNAS apps,
  locally built images and Patchboard itself are refused with the reason on
  the page. One job at a time. Compose runs with only `PATH` and `HOME`, so
  Patchboard's own keys can never leak into, or override, a stack's variables.
- The runtime image now includes the docker CLI and compose plugin.
- Repository: CI (typecheck, tests, build, Docker image), gitleaks over the
  full history, Dependabot, SECURITY.md.

## 1.4.0 — 2026-11-04

Acting on what it sees.

- **Container actions:** Restart, Stop and Start on container pages. The first
  click arms the button ("Restart sonarr?"), the second sends it; it disarms
  after four seconds. Every action is recorded in the container's history
  and on Home. The API requires a custom header, so another site can't
  trigger it through your browser.
- **Image updates from Diun:** Diun's webhook notifier posts to
  `/api/hooks/diun`. Containers running that image get an "update" tag on
  Stacks (with a filter) and a note on their page, and one quiet line in
  Needs attention. The flag clears by itself once the container runs a new
  image id.
- **Root-cause folding:** when a container and something it depends on are
  both down, only the dependency alerts, listing what went down with it.
- **Live Docker events:** container lifecycle events trigger a refresh within
  half a second instead of waiting for the 10-second poll.
- **Trakt sign-in** from Settings with the device-code flow; tokens are kept
  in SQLite and refreshed before they expire. A pasted token still works.
- **Keyboard:** `g` then `h s k f u l a ,` to jump between views, `?` for the list.
- **Tests:** `npm test` runs Node's built-in test runner over the backup-log,
  audit and runbook parsers and the alert, check and update rules (16 tests,
  no test framework).

## 1.3.0 — 2026-11-04

Does it answer, and did the backups run.

- **Service checks:** each service link is requested once a minute. Any
  answer below HTTP 500 counts (a login redirect still means the app is up);
  5xx, timeouts and refused connections don't. Two misses in a row raise
  "Sonarr isn't answering" even when the container looks fine, and turn its
  jack amber. Apps shows uptime and response time ("Up 6 days · 21 ms");
  container pages show the last answer and a 24-hour response-time line.
  Checked by default: private and tailnet addresses, plus `CHECK_DOMAINS`.
  Per service: `check: false`, `check: true`, or `check: <url>`.
- **Backups:** the nightly database and file backup logs are parsed into a
  Backups section on Server, with one square per night per item. Alerts for a
  failed item, a run that never finished, or no run in 36 hours.
- **Overnight line** under the status on Home: "Backed up overnight: 12
  databases, 7 file sets." It turns amber when something failed.

## 1.2.0 — 2026-11-04

Themes and square grids.

- **Graphite** is the new default theme: plain dark, one accent, Geist and
  Geist Mono, flat square sockets. The nbnstack look is kept as a theme.
- **Settings** page (sliders icon in the top bar, or "Settings" in Jump to):
  theme, dark/light/system, accent (blue, green, amber, violet, rose, none),
  grayscale or color service icons. Saved per device, applied before first
  paint so there's no flash.
- **Health squares:** 30 days per container on its page, 14 days on every
  Stacks row. A day turns amber or red when the container spent 5+ minutes
  unhealthy or down; days before Patchboard was watching are outlines.
- **CPU by hour:** a seven-day heatmap on the Server page.
- Temperatures in °C and °F
- Fixed: datasets listed twice; memory values wrapping in Busiest containers

## 1.1.0 — 2026-11-04

Phase 1 of the roadmap: see the server.

- **Server page:** pool capacity and health from the TrueNAS API (replacing
  the statfs figure, which saw one dataset), last scrub, snapshots, datasets,
  disks with temperatures, TrueNAS alerts, cloud sync tasks, CPU and memory
  with 24-hour history, network rates, busiest containers
- **Storage forecast:** growth per week and when the pool reaches the next
  threshold, seeded from the audit reports in `logs/audit`
- **Stacks page:** every container grouped by compose project from Docker's
  labels, with CPU and memory per container and per stack
- **Container pages** (`/c/:name`): state sentence, resources with 24-hour
  sparklines, live log tail, health-check output, image, restarts, ports,
  mounts, networks, depends-on and used-by, history, the app's own panel
  (Sonarr, Radarr, Plex, qBittorrent, Frigate, Miniflux), and the matching
  RUNBOOK.md section with copy buttons; it leads the page when something is wrong
- **Memory** shown honestly: in use, ZFS cache and free, from /proc/meminfo
  and the ARC stats
- **Alerts:** degraded pool, disk errors, scrub errors, hot disks and
  TrueNAS's own warnings; container alerts open the container page
- **Graphite pass:** healthy states are neutral instead of green, service
  icons rest in grayscale and get their color back on hover
- Patch row, Apps, Changes and the palette open container pages; the palette
  lists Server and Stacks
- Phone tab bar: Home, Server, Stacks, Feeds, Upcoming
- Minute-by-minute samples in SQLite (containers kept 2 days, host 8 days)
- New read-only mounts: `system-docs` and `logs`

## 1.0.1 — 2026-11-04

First deploy fixes.

- qBittorrent: accept the 5.x login reply (204, empty body) as well as 4.x's
  "Ok."; one login at a time, and a 30-minute pause after a failed login so
  Patchboard can't get the shared IP banned
- Dockerfile: runtime dependencies come from their own `npm ci --omit=dev`
  stage instead of `npm prune`, which stalled the build on TrueNAS

## 1.0.0 — 2026-11-03

The nbnstack.com design system, ahead of first deploy.

- Visual system moved to nbnstack.com tokens: near-black and warm white, one
  blue accent used thinly, the site's success/warning/error tones for status
- Type: DM Serif Display for names and titles, DM Sans for reading, DM Mono as
  the label and data layer; fonts self-hosted, no Google Fonts requests
- Container names, episode codes, times and counts set in mono
- Patch row: label-maker tape in DM Mono, optional short `label` per service
- Home is denser: single-line inbox and release rows
- Alerts: neutral rows with a colored rule; stopped containers show the exit
  code and image instead of repeating the time
- Nav marks the current page with a thin blue line, as on nbnstack.com
- Fallback posters set as serif title pages on muted slates
- Icons and PWA colors updated (the patch cable is now blue)

## 0.1.0 — 2026-11-03

First version.

- Home: masthead (clock, weather, status, dock), patch row, Needs attention,
  Inbox, Feeds, Right now, This week, Changes, Recently added
- Views: Feeds reader, Upcoming, Logs, Apps
- Command palette (Ctrl/Cmd+K, `/`)
- Integrations: Docker, host stats, Open-Meteo, Sonarr, Radarr, Trakt,
  Tautulli, qBittorrent, Miniflux, Fastmail (JMAP), Frigate
- Demo mode with fixture data for every integration
- PWA manifest, service worker and icons
- `import-homepage` script to carry over a Homepage catalog without its secrets
