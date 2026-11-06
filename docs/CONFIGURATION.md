# Configuration

You configure almost everything in the UI:

| Where | What | Applies to |
|---|---|---|
| Settings, Connections | Integrations: addresses and keys, encrypted on the server | Every device |
| Apps, Edit apps, and Customize on each page | Apps, groups, icons, live numbers, the boards on Home, what each page shows | Every device |
| Settings, Alerts | When storage, drives and links count as trouble | Every device |
| Settings, Connections, Sign-in | A password, and other names you open Patchboard by | Every device |
| Settings, Look, Name | The name in the header and tab, and the otter beside it | Every device |
| Settings, Look and Home and units | Theme, colors, type, density, units and Home header | This device only |
| The compose file | Time zone, port, mounts | The server |

Settings, Home and units controls the header on this device. Status sizes
offer Small, Medium and Large otters beside the whole summary. Clock offers
Hide, Small, Medium and Large; Medium is the default. Weather offers
Hide, Summary and Hourly chart. Hourly chart is the default: temperature
and rain for the next 12 hours, falling back to daily forecasts when hourly
data is unavailable.

Files still work for anyone who keeps config in git. Any variable below, in
the compose file's `environment:` or an `env_file`, wins over the UI and
shows there as locked; `config/services.yaml` and Docker labels list apps
underneath your UI changes. See [INTEGRATIONS.md](INTEGRATIONS.md) for those.
After you change a variable, recreate the container with
`docker compose up -d`.

Settings, Home and units, Setup file downloads the UI part (board, apps, page
settings) as one JSON file and imports it on another server. Keys and
uploaded icons stay behind.

## Moving off files

Started with a `.env` full of integration keys and a `services.yaml`? Patchboard
can take both over, so the UI is the one place you change things.

1. **Settings, Connections, Integrations: Save them in Patchboard.** Every
   integration value in your `.env` is copied into Patchboard's encrypted
   store. The `.env` keeps winning while it still has them, so nothing
   changes yet. Each field it copied now reads "Saved here too".
2. **Settings, Connections, Catalog: Copy into Patchboard.** Every app in
   `services.yaml` becomes one saved in Patchboard, with its group, order,
   short name, icon, check and one-shot flag, and the links join the
   Elsewhere row. Patchboard never edits the file.
3. **Turn on a password** in Settings, Sign-in, if you had `AUTH=password`.
4. **Remove what was copied:** the `.env` (or all of it but the time zone),
   `services.yaml` and the `./config` mount, and the folder variables for
   mounts at /pool, /docs and /logs.
5. **Recreate Patchboard** with `docker compose up -d`. Apps, links and connections are all still there,
   and from now on you change them in the UI.

To keep a copy in git, Settings, Connections, Catalog has Download
services.yaml.

## Server

| Variable | Default | |
|---|---|---|
| `TZ` | `UTC` | Time zone for clocks and calendars. |
| `ALLOWED_HOSTS` | empty | Other names you reach Patchboard by, such as `dash.example.com`; Settings, Sign-in sets them too. IP addresses, `localhost` and home names (`nas`, `nas.local`, `.lan`, `.home.arpa`, `.internal`) always work. Patchboard refuses any other name, which blocks DNS rebinding. |
| `PORT` | `3200` | Port inside the container. |
| `LISTEN_HOST` | every address | The address to answer on. Set it with `network_mode: host` (Wake-on-LAN), where `ports:` doesn't apply. |
| `DATA_DIR` | `/data` | Patchboard's own state: `patchboard.db` (SQLite: the boards, apps, history, integration settings, keys) and `secret.key`, which encrypts the keys. Mount it, back it up, keep it owner-only. A few megabytes. |
| `PATCHBOARD_SECRET_KEY` | a random `secret.key` | Any long string. Encrypts keys saved in the UI instead of the generated file, so the database and the key can live on different disks. Set it later and Patchboard moves saved keys over to it on the next start, as long as `secret.key` is still in `DATA_DIR`. Back up `DATA_DIR` whole: the database and its key together. |
| `CATALOG_PATH` | `/config/services.yaml` | The optional catalog file. |
| `DEMO` | `0` | `1` runs on demo data. Its only outside requests load posters from TVmaze and Wikipedia. |
| `DEMO_EMPTY` | `0` | With `DEMO=1`, starts like a fresh install so you can see the first run. |

## Sign-in and safety

[SECURITY.md](../SECURITY.md) explains when to use each.

| Variable | Default | |
|---|---|---|
| `AUTH` | `none` | `none`, `forward` (trust a reverse proxy's user header), `oidc` or `password`. Settings, Sign-in turns a password on without it. |
| `TRUSTED_USER_HEADER` | `Remote-User` | The header your forward-auth proxy sets. |
| `PATCHBOARD_PASSWORD` | empty | The password for `AUTH=password`, instead of setting one in Settings. Also how you get back in after forgetting one. |
| `OIDC_ISSUER` | empty | Your provider's issuer URL, for `AUTH=oidc`. |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | empty | The client you created at the provider. Leave the secret empty for a public client. |
| `OIDC_REDIRECT_URL` | from the request | `https://dash.example.com/api/oidc/callback`. Set it behind a reverse proxy, and register the same URL at the provider. |
| `OIDC_ALLOWED` | empty | Emails, usernames or groups that may sign in, comma-separated. Empty lets in anyone the provider signs in. |
| `OIDC_NAME` | `your identity provider` | The name on the sign-in button. |
| `OIDC_SCOPES` | `openid email profile` | Add `groups` if your provider needs it to send groups. |
| `HOOK_TOKEN` | generated | What webhooks send when sign-in is on. Settings, Sign-in shows Diun's address with it. |
| `READ_ONLY` | `0` | `1` refuses every change and hides the controls for them. |
| `DOCKER_HOST` | empty | `tcp://host:port` of a Docker socket proxy, used instead of the socket. |

## Alerts

Settings, Alerts sets when storage, drives and links count as trouble, for
every device. Each has a default that suits most setups. The same names work
as environment variables, which win and show there as locked.

| Setting | Default | |
|---|---|---|
| `POOL_WARN_PCT` | `85` | Storage use that raises a warning, for every pool, volume or array. |
| `POOL_CRIT_PCT` | `95` | Storage use that raises an alarm. |
| `DISK_WARN_C` | `50` | Drive temperature, in Celsius, that raises a warning. |
| `DISK_CRIT_C` | `58` | Drive temperature that raises an alarm. |
| `CHECK_DOMAINS` | empty | Your own domains, comma-separated. Patchboard checks app links on them, as well as private and Tailscale addresses. |
| `UPCOMING_DAYS` | `14` | How far ahead the calendar looks. |

## Mounts

Each turns on by being mounted, read-only, at its place.
[examples/everything](../examples/everything/docker-compose.yml) has all four.

| Mount at | What | Adds |
|---|---|---|
| `/pool` | a filesystem | Its usage, when TrueNAS isn't connected. |
| `/docs` | a folder with `RUNBOOK.md` | Runbook sections on container pages. |
| `/logs` | a folder with backup logs | The Backups grid and the overnight line on Home. |
| the same path as on the host | your compose projects | Update and roll back from container pages. |

`POOL_PATH`, `DOCS_PATH` and `LOGS_PATH` point somewhere else instead, and
`COMPOSE_ROOT` limits updates to one folder.

## The catalog file

Optional. Most installs add apps with one click and Edit apps. A catalog file
suits anyone who wants the list in git: `config/services.yaml` lists apps in
groups, plus bookmarks. Copy
[examples/services.example.yaml](../examples/services.example.yaml) to start.

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
