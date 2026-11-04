# Configuration

Patchboard is configured in three places:

| Where | What | Shared by |
|---|---|---|
| `.env` (from `env.example`) | Addresses and keys for integrations, thresholds | The server |
| `config/services.yaml` | The catalog: your apps, groups and bookmarks | The server; reloads on save |
| Settings page | Theme, colors, type, density, units, Home layout | Each device separately |

Every integration is optional and turns itself on when all of its variables
are set. Leave a block empty and that part of the page simply doesn't appear.

## Environment variables

### Basics

| Variable | Default | |
|---|---|---|
| `BIND_ADDRESS` | `127.0.0.1` | Address the compose file publishes port 3200 on. Use a private one. |
| `TZ` | `UTC` | Time zone for times and the "today" in calendars. |
| `DEMO` | `0` | `1` runs on invented data with no network access. |
| `PORT` | `3200` | Port inside the container. |
| `DATA_DIR` | `/data` | SQLite database location (mount it). |
| `CATALOG_PATH` | `/config/services.yaml` | The catalog file. |

### Checks and thresholds

| Variable | Default | |
|---|---|---|
| `CHECK_DOMAINS` | empty | Domains whose service links are checked, besides private and tailnet addresses. Comma-separated. |
| `POOL_WARN_PCT` | `85` | Storage alert threshold. |
| `DISK_WARN_C` | `50` | Disk temperature alert, in Celsius. |
| `UPCOMING_DAYS` | `14` | How far ahead the release calendar looks. |

### Integrations

| Integration | Variables | Notes |
|---|---|---|
| Weather | `WEATHER_LAT`, `WEATHER_LON`, `WEATHER_LABEL` | Open-Meteo, no key. |
| Sonarr, Radarr | `SONARR_URL`, `SONARR_KEY`, `RADARR_URL`, `RADARR_KEY` | v3 API. Calendar, queue, health. |
| Tautulli | `TAUTULLI_URL`, `TAUTULLI_KEY` | Plex streams and recently added. Posters are proxied, so the key stays server-side. |
| qBittorrent | `QBIT_URL`, `QBIT_USERNAME`, `QBIT_PASSWORD` | One login attempt at a time, and a 30-minute pause after a failure so it can't trip the ban. |
| Trakt | `TRAKT_CLIENT_ID`, `TRAKT_CLIENT_SECRET` | Connect from Settings with a code. `TRAKT_ACCESS_TOKEN` works instead of the secret. |
| Miniflux | `MINIFLUX_URL`, `MINIFLUX_TOKEN` | Feeds reader with read state synced back. |
| Fastmail | `FASTMAIL_TOKEN`, `FASTMAIL_WEB_URL` | JMAP, read-only scope. |
| Frigate | `FRIGATE_URL` | Camera status. |
| TrueNAS | `TRUENAS_URL`, `TRUENAS_API_KEY`, `TRUENAS_VERIFY_TLS` | 25.04 or later. `wss://` only. A read-only key is enough. |
| Dozzle | `DOZZLE_URL` | Links out for heavier log work. |
| Diun | none on this side | Point Diun's webhook notifier at `http://<patchboard>/api/hooks/diun`. |

### Optional mounts

| Variable | Mount | Unlocks |
|---|---|---|
| `POOL_PATH` | a filesystem, read-only | A disk-usage figure when TrueNAS isn't connected. |
| `DOCS_PATH` | a folder with `RUNBOOK.md`, read-only | Runbook sections on matching container pages. |
| `LOGS_PATH` | a folder with backup logs and audits, read-only | The Backups grid, the overnight line, storage history. |
| `COMPOSE_ROOT` | your compose projects, read-only, at the same path as on the host | Update and roll back from the UI. |

## The catalog

`config/services.yaml` lists your apps in groups, plus bookmarks. Start from
`config/services.example.yaml`. Per service:

| Field | |
|---|---|
| `name` | Shown on the tile, in Apps and in Jump to. |
| `href` | Where the tile goes. |
| `icon` | A URL, a site path, or a [dashboard-icons](https://github.com/homarr-labs/dashboard-icons) name such as `plex.png`. |
| `container` | The Docker container name. Links the tile to its container page, status, stats and logs. |
| `expectStopped` | `true` for one-shot jobs, so their exit isn't an alert. |
| `check` | `false` to skip the reachability check, `true` to force it, or a URL to check instead of `href`. |

Settings → Catalog compares the file with Docker: entries naming a container
that doesn't exist, and running apps the catalog doesn't list, with drafted
entries to paste.

## Runbook format

Any Markdown file with level-two headings. A section shows on a container's
page when its heading names the container's app or compose project:
`## Immich Unresponsive` matches `immich-server`; `## Game Night` matches
`game-night`. Generic suffixes (`server`, `db`, `api`, `web`, `worker`) are
ignored when matching.

## Backup log format

`LOGS_PATH/ops/db-backup.log` and `LOGS_PATH/ops/file-backup.log`, one run
after another:

```
[11-04-2026 01:00 AM CST] Starting database backups...
Immich backup complete
Joplin backup failed
Backup complete. Total backups stored: 372
Total backup size: 16G
[11-04-2026 01:01 AM CST] Database backup finished
```

Each `<label> backup complete` or `<label> backup failed` line becomes one
square for that night. Audit reports in `LOGS_PATH/audit/` seed storage
history when their `ZFS DATASET USAGE` table starts with the pool's root
dataset.

## Themes

A theme is one entry in `web/lib/themes.ts`: a dark and a light set of color
tokens and a type pairing. Rules in `web/styles.css` only use tokens, so a
new theme needs no CSS. Keep the status colors (`ok`, `warn`, `crit`) clearly
apart from the accent, and quiet text (`ink3`) at 4.5:1 or better on `bg`.
Anyone can also build a Custom theme from three colors in Settings.
