# Changelog

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
