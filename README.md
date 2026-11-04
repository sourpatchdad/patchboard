# Patchboard

A start page and control center for a home server. It opens as the browser's
home page and as an installed app on a phone, and answers three questions at a
glance: is anything broken, what's new, and what's coming up.

It's the successor to a [Homepage](https://gethomepage.dev) dashboard. Homepage
shows a tile for every service whether anything is happening or not.
Patchboard shows exceptions and changes instead. Healthy services shrink to one
line, and the page's space goes to failures, new mail and articles, downloads
in progress, and the release calendar.

## What's on it

- **Patch row.** Every service is a jack on a patch bay, grouped into bays with
  tape labels. The LED shows the container's state, and clicking a jack opens
  the app. It's a status board and a launcher in one.
- **Needs attention.** Stopped or unhealthy containers, a nearly full pool,
  Sonarr/Radarr import failures and health errors, errored torrents, offline
  cameras. Nothing shows when nothing is wrong.
- **Inbox.** Unread count and newest messages from Fastmail over JMAP (read-only).
- **Feeds.** A full reader on top of Miniflux, with keyboard navigation (`j`/`k`/`o`)
  and read state synced back.
- **Upcoming.** Sonarr, Radarr and Trakt merged into one calendar, deduplicated.
- **Right now.** Plex streams (via Tautulli), active downloads, CPU, storage, uptime.
- **Changes.** Container state transitions over the last 48 hours, recorded by
  Patchboard itself, so a crash at 3 AM is still visible at breakfast.
- **Server.** Pool capacity and health from TrueNAS, scrubs, datasets, disks
  and temperatures, TrueNAS alerts, cloud sync, CPU and memory with history,
  and a plain-sentence forecast of when the pool fills.
- **Stacks.** Every container grouped by compose project, with CPU and memory.
- **Container pages.** One page per container: state, resources, live logs,
  wiring, history, and the matching section of the server's runbook, which
  moves to the top when the container is in trouble.
- **Service checks.** Each app is requested once a minute; an app that stops
  answering is flagged even when its container looks healthy.
- **Backups.** Nightly backup logs become a grid of nights per database, and
  a one-line overnight summary on Home.
- **Actions.** Restart, stop or start a container from its page, with a
  two-step confirm, recorded in its history.
- **Image updates.** Diun's webhook marks containers with a newer image; the
  mark clears once the container runs it.
- **Logs.** Live container logs from the Docker socket, with a hand-off to Dozzle.
- **Jump to (Ctrl/Cmd+K or `/`).** One input that reaches every app, view,
  container, unread article and message, with web search as the fallback.

## How it works

```
browser ──SSE──▶ Hono server ──▶ adapters (one per integration, own poll interval)
   ▲                 │              docker socket · truenas · sonarr · radarr
   └── snapshot ─────┘              tautulli · qbittorrent · miniflux · fastmail
                     │              trakt · frigate · open-meteo · host stats
                     ├──▶ SQLite (container history, minute samples)
                     └──▶ read-only notes (RUNBOOK.md, audit reports)
```

- **The browser never talks to an integration.** Keys live in the server's
  environment. Even Plex posters go through the server, so the Tautulli key
  stays private.
- **Each adapter polls on its own schedule** (5 s for downloads, 30 min for
  Trakt) and pushes changes to every open tab over server-sent events.
- **A failing integration degrades instead of blanking.** The last good data
  stays on screen, marked stale, and a quiet "Can't reach X" note appears.
- **Demo mode** (`DEMO=1`) swaps every adapter for a fixture with the same
  shape. The public demo and all screenshots run on invented data with no
  network access.
- **Node 24 runs the TypeScript server directly** (type stripping) and uses the
  built-in `node:sqlite`. There's no server build step and no native modules.

Stack: TypeScript, Hono, React 19, Vite, SQLite. No UI kit; the CSS is hand-written
on the nbnstack.com design system (DM Serif Display, DM Sans, DM Mono, self-hosted).

## Run it

```sh
npm install
npm run dev:demo        # invented data, http://localhost:5173
```

Against real services:

```sh
cp env.example .env     # fill in what you use; everything is optional
npm run import-homepage -- /path/to/homepage/config   # or write config/services.yaml
npm run dev
```

In Docker:

```sh
cp docker-compose.example.yml docker-compose.yml
docker compose up -d --build
```

The container binds to the Tailscale address only and has no login; the
tailnet is the access control. For HTTPS (needed to install it as an app), see
[deploy/Caddyfile.example](deploy/Caddyfile.example).

## Configuration

- `.env` holds URLs and credentials (see [env.example](env.example)).
- `DOCS_PATH` points at a folder holding `RUNBOOK.md`. Its `## ` sections are
  matched to containers by app name ("Immich Unresponsive" for `immich-server`).
- `LOGS_PATH` points at a folder whose `audit/` reports seed storage history.
- `config/services.yaml` holds the catalog: groups of services with `name`,
  `href`, `icon`, `container` and optional `expectStopped`, plus a `dock` of
  bookmarks. It holds no secrets and reloads on save.
- Icons accept the same forms as Homepage: a URL, or a
  [dashboard-icons](https://github.com/homarr-labs/dashboard-icons) name such as
  `plex.png`.

## Development

```sh
npm run dev:demo     # invented data, hot reload
npm test             # parsers and alert rules, Node's built-in test runner
npm run typecheck
```

Keyboard: `Ctrl/Cmd+K` or `/` to jump anywhere, `g` then a letter to switch
views (`g s` Server, `g k` Stacks), `?` for the full list.

## Themes

Settings (the sliders icon, or "Settings" in Jump to) picks a theme, dark or
light, an accent color and grayscale or color icons, per device. Two themes
ship: Graphite (default) and nbnstack. A theme is one block of CSS variables
at the top of `web/styles.css` plus an entry in `web/lib/appearance.ts`.

See [DESIGN.md](DESIGN.md) for why it's built this way.
