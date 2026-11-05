# Integrations

How your apps get onto Patchboard, and how their numbers do. The first way
in each list needs no files at all.

## Four ways to add apps

Mix them freely. Changes you make in the UI sit on top of the others and
never rewrite your files.

1. **One click.** On a fresh install, Home offers to add every running
   container, grouped by compose stack. A container page for a container
   that isn't an app yet has **Add as an app**.
2. **Edit apps** on the Apps page. Add an app with a name, link, container
   and group. Drag apps between groups, rename groups, hide anything, change
   any icon or upload one.
3. **Docker labels** in the app's own compose file, so the entry travels with
   the app. See [examples/labels](../examples/labels/docker-compose.yml).

   | Label | |
   |---|---|
   | `patchboard.name` | Required. |
   | `patchboard.group` | Joins the group of that name or starts one. Default `Discovered`. |
   | `patchboard.href`, `patchboard.icon`, `patchboard.description` | Link, icon and tooltip. |
   | `patchboard.expect-stopped` | `true` for jobs that run and exit. |
   | `patchboard.check` | `false` skips the reachability check; a URL checks that address instead. |
   | `patchboard.order` | A number; lower sorts first. |

   Homepage's `homepage.name`, `.group`, `.href`, `.icon` and `.description`
   labels work as they are. Patchboard ignores `homepage.widget.*`, which
   carry credentials.
4. **A catalog file**, `config/services.yaml`, for the whole list in one
   place. Start from [config/services.example.yaml](../config/services.example.yaml).
   Coming from Homepage? `npm run import-homepage -- /path/to/homepage/config`
   writes one from its `services.yaml` and `bookmarks.yaml` and leaves the
   credentials out.

Patchboard finds icons by name in [dashboard icons](https://dashboardicons.com),
which covers about 2,000 self-hosted apps: `sonarr.png`, `jellyfin.svg` or
`jellyfin`. Any image URL works too, as does an icon you upload.

## Three ways to add numbers

1. **Built-in integrations** feed whole parts of Patchboard: Needs attention,
   the calendar, Right now, the Server page. You turn them on in `.env`.
   Settings, Connections shows which ones run and what the others need.
2. **A live number on an app's tile.** In Edit apps, open the app's ⋯ menu,
   choose Icon and live number, pick a preset or Any JSON API, paste the key,
   and press Test. The key stays on the server.
3. **An API numbers widget** on Home shows up to four values from any JSON
   API, with amber and red thresholds. Refer to keys as `${secret:NAME}`
   (from Settings, Keys) or `${env:WIDGET_NAME}`.

## Built-in integrations

Set one up in **Settings, Connections**: press **Set up**, fill in the
address and key, **Test connection**, then **Save**. Patchboard connects at
once, with no restart. Keys you type there are encrypted on the server and
never shown again.

Or add the variables to `.env` and run `docker compose up -d` (a restart keeps
the old values). A variable in `.env` always wins and shows in Settings as
locked. Integrations that read folders need their mount in compose, so those
use `.env` only.

<!-- generated:integrations -->
| Integration | What it adds | Turn on with | Where to find it |
|---|---|---|---|
| **Docker** | Required. Containers, stacks, logs, stats, health, actions and updates. | nothing to set; optional `DOCKER_SOCKET`, `DOCKER_HOST` | Mount /var/run/docker.sock (read-only is fine), or point DOCKER_HOST at a socket proxy. |
| **This host** | CPU, memory and uptime with 24 hours of history. | nothing to set; optional `POOL_PATH` | POOL_PATH shows a disk or pool’s usage when TrueNAS isn’t connected. |
| **Service checks** | Asks every app with a link once a minute; flags one that stops answering though its container runs. | nothing to set; optional `CHECK_DOMAINS` | Runs for links on private and Tailscale addresses. CHECK_DOMAINS adds your own domains. |
| **TrueNAS** | Pools, datasets, disks and temperatures, scrubs, snapshots, TrueNAS alerts, cloud sync, a forecast of when the pool fills. | `TRUENAS_API_KEY`; optional `TRUENAS_URL`, `TRUENAS_VERIFY_TLS` | In TrueNAS, create a user with the Read-Only Administrator role and an API key for it. Use wss://: TrueNAS revokes a key sent over ws://. |
| **Weather** | Now, the next 24 hours, the week, sunrise and sunset; US weather alerts. Free, no key. | `WEATHER_LAT`, `WEATHER_LON`; optional `WEATHER_LABEL` | Your latitude and longitude. Open-Meteo provides the forecast and the National Weather Service the alerts. |
| **Sonarr** | Episodes on the calendar, the queue, stuck imports and health warnings. | `SONARR_URL`, `SONARR_KEY` | Sonarr: Settings, General, API Key. |
| **Radarr** | Films on the calendar (cinema, digital, physical), the queue, stuck imports and health warnings. | `RADARR_URL`, `RADARR_KEY` | Radarr: Settings, General, API Key. |
| **Trakt** | Your Trakt calendar for shows and films Sonarr and Radarr don’t track, merged without doubles. | `TRAKT_CLIENT_ID` | Create an app at app.trakt.tv/settings/apps and copy its Client ID. Then connect from Settings, Connections with the code it shows. |
| **Tautulli (Plex)** | Who is watching Plex right now, and recently added posters. | `TAUTULLI_URL`, `TAUTULLI_KEY` | Tautulli: Settings, Web Interface, API Key. |
| **Jellyfin** | Who is watching, recently added and Next up, with posters that open the item in Jellyfin. | `JELLYFIN_URL`, `JELLYFIN_KEY`; optional `JELLYFIN_USER` | Jellyfin: Dashboard, API Keys, +. JELLYFIN_USER picks whose Next up to show; blank uses the first admin. |
| **Emby** | Who is watching, recently added and Next up, with posters that open the item in Emby. | `EMBY_URL`, `EMBY_KEY`; optional `EMBY_USER` | Emby: Settings, Advanced, API Keys, New API Key. EMBY_USER works as it does for Jellyfin. |
| **qBittorrent** | Downloads in progress with time left, seeding and stalled torrents, and a Pause button for all of them. | `QBIT_URL`, `QBIT_USERNAME`, `QBIT_PASSWORD` | Your Web UI login. Patchboard signs in once and backs off on failure, so a wrong password never gets you banned. |
| **Transmission** | Downloads in progress, seeding, errors, and a Pause button for every torrent. | `TRANSMISSION_URL`; optional `TRANSMISSION_USERNAME`, `TRANSMISSION_PASSWORD` | The Web UI address, port 9091. The login only if you set one in settings.json (rpc-authentication-required). |
| **Deluge** | Downloads in progress, seeding, errors, and a Pause button for the whole session. | `DELUGE_URL`, `DELUGE_PASSWORD` | The Web UI address, port 8112, and its password. Patchboard connects the Web UI to its daemon when it isn’t. |
| **SABnzbd** | The queue with time left, failed downloads from the last day, and Pause. | `SABNZBD_URL`, `SABNZBD_KEY` | SABnzbd: Config, General, Security, API Key. |
| **NZBGet** | The queue with time left, failed downloads from the last day, and Pause. | `NZBGET_URL`; optional `NZBGET_USERNAME`, `NZBGET_PASSWORD` | NZBGet: Settings, Security. The control username and password, or a restricted user that can pause. |
| **Miniflux** | A feed reader with keyboard navigation; read state syncs back to Miniflux. | `MINIFLUX_URL`, `MINIFLUX_TOKEN` | Miniflux: Settings, API Keys, Create a new API key. |
| **Fastmail** | Unread count and the newest messages (read-only). | `FASTMAIL_TOKEN`; optional `FASTMAIL_WEB_URL` | Fastmail: Settings, Privacy & Security, API tokens; give it read-only Mail access. |
| **Home Assistant** | A widget of the lights, switches, sensors and scenes you pick. Tap a light to toggle it or a scene to run it. Locks, garage doors and alarms show their state only. | `HA_URL`, `HA_TOKEN` | Home Assistant: your profile, Security, Long-lived access tokens, Create token. A token for a non-admin user limits what Patchboard can reach. |
| **Tessie (Tesla)** | A Car widget: battery, range, charging and time to full, climate, locks. Reads Tessie’s cached state, so it never wakes the car. | `TESSIE_TOKEN`; optional `TESSIE_VIN` | Tessie: Settings, API, Generate access token. TESSIE_VIN picks one car when the account has several. |
| **Wake-on-LAN** | A Wake widget with a button per machine. The MAC addresses stay on the server. | `WOL_DEVICES`; optional `WOL_BROADCAST` | WOL_DEVICES=NAS=aa:bb:cc:dd:ee:ff,Desktop=00:11:22:33:44:55. Needs host networking: examples/wake-on-lan. |
| **Uptime Kuma** | An Uptime widget: each monitor with its last 30 checks and 24-hour uptime. A monitor that goes down shows in Needs attention. | `UPTIME_KUMA_URL`; optional `UPTIME_KUMA_SLUG` | Uptime Kuma: Status Pages, New Status Page, then add the monitors you want. UPTIME_KUMA_SLUG is the end of its address. No key needed. |
| **Frigate** | Cameras online and offline. | `FRIGATE_URL` | Frigate’s address; its API needs no key on the local network. |
| **Backup logs** | Nightly backups as a grid of nights per job, and a one-line overnight summary on Home. | `LOGS_PATH` | A read-only mount of the folder your backup scripts log to (see docs/CONFIGURATION.md for the format). |
| **Diun** | Marks containers with a newer image; the mark clears once the container runs it. | nothing to set; optional `HOOK_TOKEN` | Point Diun’s webhook notifier at http://<patchboard>/api/hooks/diun. With sign-in on, send HOOK_TOKEN. |
| **Updates from the UI** | Pull and recreate one compose service from its page, watch each step, roll back if it fails. | `COMPOSE_ROOT` | Mount your compose folders read-only at the same path as on the host. |
| **Runbook** | The matching section of your RUNBOOK.md on each container page, moved to the top when it’s in trouble. | `DOCS_PATH` | A read-only mount of the folder holding RUNBOOK.md. |
| **Dozzle** | An “Open in Dozzle” hand-off from logs, for searching across containers. | `DOZZLE_URL` | Dozzle’s address. |
<!-- /generated -->

## Live number presets

Patchboard suggests the preset that matches the app's name.

<!-- generated:presets -->
| App | Numbers you can show | Key |
|---|---|---|
| **Jellyfin** | movies, series, episodes, songs | Dashboard, API Keys, + |
| **Immich** | photos, videos, stored | An admin account: Account Settings, API Keys, New API Key |
| **Paperless-ngx** | documents, in the inbox | Your profile (top right), Auth token, Create |
| **Overseerr or Jellyseerr** | pending, processing, requests | Settings, General, API Key |
| **Tautulli** | streams, Mbps out | Settings, Web Interface, API Key |
| **Sonarr or Radarr** | queued, with errors | Settings, General, API Key |
| **Lidarr, Readarr or Prowlarr** | health warnings | Settings, General, API Key |
| **Bazarr** | episodes missing subtitles, movies missing subtitles | Settings, General, Security, API Key |
| **Audiobookshelf** | listened | Settings, Users, your user, API token |
| **Linkding** | bookmarks | Settings, Integrations, REST API token |
| **Nextcloud** | files, active today | Set one with occ config:app:set serverinfo token --value <token> |
| **Home Assistant** | entities | Your profile, Security, Long-lived access tokens, Create token |
| **AdGuard Home** | blocked, queries | your login, typed as username:password |
| **Pi-hole 6** | blocked today, blocked, queries today, active clients | Settings, Web interface / API, Configure app password (or your admin password) |
| **Pi-hole 5** | blocked today, blocked, queries today | Settings, API, Show API token |
| **Glances** | CPU, memory | none needed |
<!-- /generated -->

Any JSON API covers the rest. Give its address, put `{key}` where the key
goes (in the address or a header), and name the field, such as `data.count`
or `items[0].total`.

## Adding a built-in integration

1. Write an adapter in `server/adapters/`. It returns one typed object, keeps
   URLs out of error messages, and backs off after a failed login.
2. Add a fixture of the same shape to `server/demo.ts`, so demo mode and the
   screenshots keep working.
3. Add an entry to [shared/integrations.ts](../shared/integrations.ts) and
   its variables to `env.example`. A test checks both.
4. Run `npm run docs`, and `npm run screenshots` if the change shows on
   screen.

A live number preset is one entry in [shared/presets.ts](../shared/presets.ts),
then `npm run docs`.
