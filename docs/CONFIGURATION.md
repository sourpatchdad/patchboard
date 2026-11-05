# Configuration

You configure Patchboard in three places:

| Where | What | Applies to |
|---|---|---|
| `.env` (from `env.example`) | Addresses and keys for built-in integrations, sign-in, thresholds | The server |
| The UI | Apps, groups, icons, live numbers, the Home board, what each page shows | Every device |
| Settings, Look and Home | Theme, colors, type, density, units | This device only |

`config/services.yaml` and Docker labels are optional ways to list apps. See
[INTEGRATIONS.md](INTEGRATIONS.md) for those and for every integration's
variables.

After you change `.env`, recreate the container with `docker compose up -d`.
A restart keeps the old values.

Settings, Home and units, Setup file downloads the UI part (board, apps, page
settings) as one JSON file and imports it on another server. Keys and
uploaded icons stay behind.

## Server

| Variable | Default | |
|---|---|---|
| `BIND_ADDRESS` | `127.0.0.1` | The address the compose file publishes port 3200 on. Use a private one. |
| `TZ` | `UTC` | Time zone for clocks and calendars. |
| `ALLOWED_HOSTS` | empty | Hostnames you reach Patchboard by, such as `dash.example.com`. IP addresses and `localhost` always work. Patchboard refuses any other name, which blocks DNS rebinding. |
| `PORT` | `3200` | Port inside the container. |
| `LISTEN_HOST` | every address | The address to answer on. Set it with `network_mode: host` (Wake-on-LAN), where `ports:` doesn't apply. |
| `DATA_DIR` | `/data` | The SQLite database. Mount it. |
| `CATALOG_PATH` | `/config/services.yaml` | The optional catalog file. |
| `DEMO` | `0` | `1` runs on demo data. Its only outside requests load posters from TVmaze and Wikipedia. |
| `DEMO_EMPTY` | `0` | With `DEMO=1`, starts like a fresh install so you can see the first run. |

## Sign-in and safety

[SECURITY.md](../SECURITY.md) explains when to use each.

| Variable | Default | |
|---|---|---|
| `AUTH` | `none` | `none`, `forward` (trust a reverse proxy's user header), `oidc` or `password`. |
| `TRUSTED_USER_HEADER` | `Remote-User` | The header your forward-auth proxy sets. |
| `PATCHBOARD_PASSWORD` | empty | The password for `AUTH=password`. |
| `OIDC_ISSUER` | empty | Your provider's issuer URL, for `AUTH=oidc`. |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | empty | The client you created at the provider. Leave the secret empty for a public client. |
| `OIDC_REDIRECT_URL` | from the request | `https://dash.example.com/api/oidc/callback`. Set it behind a reverse proxy, and register the same URL at the provider. |
| `OIDC_ALLOWED` | empty | Emails, usernames or groups that may sign in, comma-separated. Empty lets in anyone the provider signs in. |
| `OIDC_NAME` | `your identity provider` | The name on the sign-in button. |
| `OIDC_SCOPES` | `openid email profile` | Add `groups` if your provider needs it to send groups. |
| `HOOK_TOKEN` | empty | What webhooks send when sign-in is on. |
| `READ_ONLY` | `0` | `1` refuses every change and hides the controls for them. |
| `DOCKER_HOST` | empty | `tcp://host:port` of a Docker socket proxy, used instead of the socket. |

## Thresholds

| Variable | Default | |
|---|---|---|
| `CHECK_DOMAINS` | empty | Your own domains, comma-separated. Patchboard checks app links on them, as well as private and Tailscale addresses. |
| `POOL_WARN_PCT` | `85` | Storage use that raises an alert. |
| `DISK_WARN_C` | `50` | Disk temperature, in Celsius, that raises an alert. |
| `UPCOMING_DAYS` | `14` | How far ahead the calendar looks. |

## Mounts

Each needs a read-only mount and its variable.
[examples/everything](../examples/everything/docker-compose.yml) sets all four.

| Variable | Mount | Adds |
|---|---|---|
| `POOL_PATH` | a filesystem | Its usage, when TrueNAS isn't connected. |
| `DOCS_PATH` | a folder with `RUNBOOK.md` | Runbook sections on container pages. |
| `LOGS_PATH` | a folder with backup logs | The Backups grid and the overnight line on Home. |
| `COMPOSE_ROOT` | your compose projects, at the same path as on the host | Update and roll back from container pages. |

## The catalog file

`config/services.yaml` lists apps in groups, plus bookmarks. Copy
[config/services.example.yaml](../config/services.example.yaml) to start.

| Field | |
|---|---|
| `name` | Shown on the tile, in Apps and in Jump to. |
| `label` | A short name for under the icon, when the Apps widget shows names. |
| `href` | Where the tile goes. |
| `icon` | A [dashboard icons](https://dashboardicons.com) name such as `plex.png`, a URL, or a site path. |
| `container` | The Docker container. Gives the tile its status and a container page. |
| `expectStopped` | `true` for one-shot jobs, so their exit raises no alert. |
| `check` | `false` skips the reachability check; a URL checks that address instead of `href`. |

Patchboard reloads the file when you save it. Settings, Connections, Catalog
lists entries that name a missing container and running apps the file doesn't
list. **Download services.yaml** there writes the apps as you arranged them in
the UI, ready to commit.

## Runbook format

A Markdown file with level-two headings. A section shows on a container page
when its heading names the app or its compose project: `## Immich Unresponsive`
matches `immich-server`. Patchboard ignores the suffixes `server`, `db`,
`api`, `web` and `worker` when it matches.

## Backup log format

`LOGS_PATH/ops/db-backup.log` and `LOGS_PATH/ops/file-backup.log`, one run
after another:

```text
[11-04-2026 01:00 AM CST] Starting database backups...
Immich backup complete
Joplin backup failed
Backup complete. Total backups stored: 372
Total backup size: 16G
[11-04-2026 01:01 AM CST] Database backup finished
```

Each `<name> backup complete` or `<name> backup failed` line becomes that
night's square for that job. Audit reports in `LOGS_PATH/audit/` with a
`ZFS DATASET USAGE` table seed storage history.

## Themes

Settings has six themes and a Custom one built from three colors. To add a
theme to the code, add one entry to `web/lib/themes.ts`: dark and light color
tokens and a type pairing. Keep `ok`, `warn` and `crit` distinct from the
accent, and quiet text (`ink3`) at 4.5:1 or better on `bg`.
