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
   the app:

   ```yaml
   labels:
     patchboard.name: Sonarr
     patchboard.group: Media
     patchboard.href: http://192.168.1.10:8989
     patchboard.icon: sonarr.png
   ```

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
   place. Settings, Connections, Apps downloads your current apps as one.
   Coming from Homepage? Settings, Connections, Import from Homepage takes
   its `services.yaml` and `bookmarks.yaml` and saves the apps in Patchboard,
   leaving the credentials out.

Patchboard finds icons by name in [dashboard icons](https://dashboardicons.com),
which covers about 2,000 self-hosted apps: `sonarr.png`, `jellyfin.svg` or
`jellyfin`. Any image URL works too, as does an icon you upload.

## Three ways to add numbers

1. **Built-in integrations** feed whole parts of Patchboard: Needs attention,
   the calendar, Right now, the Server page. You turn them on in Settings,
   Connections, which also shows which ones run.
2. **A live number on an app's tile.** In Edit apps, open the app's ⋯ menu,
   choose Icon and live number, pick a preset or Any JSON API, paste the key,
   and press Test. The key stays on the server.
3. **An API numbers widget** on Home shows up to four values from any JSON
   API, with amber and red thresholds. Paste a key into a header or the
   URL as it is: saving the board moves it to Settings, Keys and leaves a
   `${secret:NAME}` reference in the widget, so boards and setup files
   never carry it. `${env:WIDGET_NAME}` reads one from the environment.

## Built-in integrations

Set one up in **Settings, Connections**: press **Set up**, fill in the
address and key, **Test connection**, then **Save**. Patchboard connects at
once, with no restart. Keys you type there are encrypted on the server and
never shown again.

Each variable in the table below also works in the compose file's
`environment:`. It wins over Settings and shows there as locked; recreate the
container with `docker compose up -d` after changing one. To move variables
into Patchboard later, see [Moving off files](CONFIGURATION.md#moving-off-files).

<!-- generated:integrations -->
| Integration | What it adds | Turn on with | Where to find it |
|---|---|---|---|
| **Docker** | Required. Containers, stacks, logs, stats, health, actions and updates. | nothing to set; optional `DOCKER_SOCKET`, `DOCKER_HOST` | Mount /var/run/docker.sock (read-only is fine), or point DOCKER_HOST at a socket proxy. |
| **This host** | CPU, memory and uptime with 24 hours of history. | nothing to set; optional `POOL_PATH` | Mount a disk or pool at /pool to show its usage when TrueNAS isn’t connected. |
| **Service checks** | Asks every app with a link once a minute; flags one that stops answering though its container runs. | nothing to set; optional `CHECK_DOMAINS` | Runs for links on private and Tailscale addresses. CHECK_DOMAINS adds your own domains. |
| **TrueNAS** | Pools, datasets, disks and temperatures, scrubs, snapshots, TrueNAS alerts, cloud sync, a forecast of when the pool fills. | `TRUENAS_API_KEY`; optional `TRUENAS_URL`, `TRUENAS_VERIFY_TLS` | In TrueNAS, create a user with the Read-Only Administrator role and an API key for it. Use wss://: TrueNAS revokes a key sent over ws://. |
| **Weather** | Now, the next 24 hours, the week, sunrise and sunset; US weather alerts. Free, no key. | `WEATHER_LAT`, `WEATHER_LON`; optional `WEATHER_LABEL` | Your latitude and longitude. Open-Meteo provides the forecast and the National Weather Service the alerts. |
| **Sonarr** | Episodes on the calendar, the queue, stuck imports and health warnings. Try another release for a stuck download, Search for an episode that aired without arriving, or search for everything missing. | `SONARR_URL`, `SONARR_KEY` | Sonarr: Settings, General, API Key. |
| **Radarr** | Films on the calendar (cinema, digital, physical), the queue, stuck imports and health warnings. Try another release for a stuck download, Search for a film that is out without arriving, or search for everything missing. | `RADARR_URL`, `RADARR_KEY` | Radarr: Settings, General, API Key. |
| **Trakt** | Your Trakt calendar for shows and films Sonarr and Radarr don’t track, merged without doubles. | `TRAKT_CLIENT_ID` | Create an app at app.trakt.tv/settings/apps and copy its Client ID. Then connect from Settings, Connections with the code it shows. |
| **Tautulli (Plex)** | Who is watching Plex right now, recently added posters, what was watched lately and by whom, and how big the library is. | `TAUTULLI_URL`, `TAUTULLI_KEY` | Tautulli: Settings, Web Interface, API Key. |
| **Jellyfin** | Who is watching, the moment it changes, recently added, Next up, what you watched lately and how big the library is, with posters that open the item in Jellyfin. | `JELLYFIN_URL`, `JELLYFIN_KEY`; optional `JELLYFIN_USER` | Jellyfin: Dashboard, API Keys, +. JELLYFIN_USER picks whose Next up to show; blank uses the first admin. |
| **Emby** | Who is watching, recently added, Next up, what you watched lately and how big the library is, with posters that open the item in Emby. | `EMBY_URL`, `EMBY_KEY`; optional `EMBY_USER` | Emby: Settings, Advanced, API Keys, New API Key. EMBY_USER works as it does for Jellyfin. |
| **qBittorrent** | Downloads in progress with time left, seeding and stalled torrents. Pause, resume or remove one torrent (its files stay) or pause them all, and turn the alternative speed limits on or off. | `QBIT_URL`, `QBIT_USERNAME`, `QBIT_PASSWORD` | Your Web UI login. Patchboard signs in once and backs off on failure, so a wrong password never gets you banned. |
| **Transmission** | Downloads in progress, seeding, errors, and a Pause button for every torrent. | `TRANSMISSION_URL`; optional `TRANSMISSION_USERNAME`, `TRANSMISSION_PASSWORD` | The Web UI address, port 9091. The login only if you set one in settings.json (rpc-authentication-required). |
| **Deluge** | Downloads in progress, seeding, errors, and a Pause button for the whole session. | `DELUGE_URL`, `DELUGE_PASSWORD` | The Web UI address, port 8112, and its password. Patchboard connects the Web UI to its daemon when it isn’t. |
| **SABnzbd** | The queue with time left, failed downloads from the last day, and Pause. | `SABNZBD_URL`, `SABNZBD_KEY` | SABnzbd: Config, General, Security, API Key. |
| **NZBGet** | The queue with time left, failed downloads from the last day, and Pause. | `NZBGET_URL`; optional `NZBGET_USERNAME`, `NZBGET_PASSWORD` | NZBGet: Settings, Security. The control username and password, or a restricted user that can pause. |
| **Miniflux** | A feed reader with keyboard navigation; read state syncs back to Miniflux. | `MINIFLUX_URL`, `MINIFLUX_TOKEN` | Miniflux: Settings, API Keys, Create a new API key. |
| **Fastmail** | Unread count and the newest messages (read-only). | `FASTMAIL_TOKEN`; optional `FASTMAIL_WEB_URL` | Fastmail: Settings, Privacy & Security, API tokens; give it read-only Mail access. |
| **Home Assistant** | A widget of the lights, switches, sensors and scenes you pick. Tap a light to toggle it or a scene to run it. Locks, garage doors and alarms show their state only. | `HA_URL`, `HA_TOKEN` | Home Assistant: your profile, Security, Long-lived access tokens, Create token. A token for a non-admin user limits what Patchboard can reach. |
| **Tessie (Tesla)** | A Car widget: battery, range, charging and time to full, climate, locks. Reads Tessie’s cached state, so it never wakes the car. | `TESSIE_TOKEN`; optional `TESSIE_VIN` | Tessie: Settings, API, Generate access token. TESSIE_VIN picks one car when the account has several. |
| **Wake-on-LAN** | A Wake widget with a button per machine. The MAC addresses stay on the server. | `WOL_DEVICES`; optional `WOL_BROADCAST` | WOL_DEVICES=NAS=aa:bb:cc:dd:ee:ff,Desktop=00:11:22:33:44:55. Needs host networking: see CONFIGURATION.md, Host networking. |
| **ntfy** | Push notifications: a problem in Needs attention that lasts two minutes reaches your phone, and so does its fix. Test sends a real one. | `NTFY_URL`; optional `NTFY_TOKEN`, `NOTIFY_LEVEL`, `PATCHBOARD_URL` | A topic on your own ntfy server or ntfy.sh. On ntfy.sh, pick a long topic name nobody can guess. NTFY_TOKEN for a server that needs sign-in. |
| **Gotify** | The same push notifications through Gotify. | `GOTIFY_URL`, `GOTIFY_TOKEN`; optional `NOTIFY_LEVEL`, `PATCHBOARD_URL` | Gotify: Apps, Create application, then copy its token. |
| **Pushover** | The same notifications through Pushover: outages at high priority, fixes quietly. | `PUSHOVER_TOKEN`, `PUSHOVER_USER_KEY`; optional `NOTIFY_LEVEL`, `PATCHBOARD_URL` | pushover.net: your User Key is on the front page; Create an Application for the token. |
| **Discord** | The same notifications in a Discord channel, red for down, amber for a warning, green when fixed, each linking back here. Test sends a real one. | `DISCORD_WEBHOOK`; optional `NOTIFY_LEVEL`, `PATCHBOARD_URL` | In Discord: the channel’s settings, Integrations, Webhooks, New Webhook, Copy Webhook URL. Treat it like a password. |
| **Webhook** | The same notifications as a JSON POST, for Home Assistant, n8n, Apprise or your own script: level, title, body, a link and the time. | `WEBHOOK_URL`; optional `WEBHOOK_TOKEN`, `NOTIFY_LEVEL`, `PATCHBOARD_URL` | Any address that takes a POST. A token goes out as Authorization: Bearer. Home Assistant: an automation with a Webhook trigger gives you the address. |
| **Email** | The same notifications by email, subject first: [Down], [Warning] or [Fixed]. Test sends a real one. | `SMTP_HOST`, `SMTP_FROM`, `SMTP_TO`; optional `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_VERIFY_TLS`, `NOTIFY_LEVEL`, `PATCHBOARD_URL` | Any mail server: port 465 for TLS, or 587 with STARTTLS. Gmail, iCloud and Fastmail need an app password. A relay on your network may need no sign-in. |
| **Speedtest Tracker** | An Internet widget: the latest download, upload and ping, with the last day as a line. A failed test, or one under the thresholds you set in Speedtest Tracker, shows in Needs attention. | `SPEEDTEST_URL`, `SPEEDTEST_TOKEN` | Speedtest Tracker 1.0 or newer: your profile, API tokens, create one with Read results. |
| **Unraid** | A Storage widget: the array and each cache pool with how full they are, and every parity, data and cache disk with its state and temperature. A stopped array, a disabled or missing disk, a full pool or a hot disk shows in Needs attention, by your Settings, Alerts thresholds. | `UNRAID_URL`, `UNRAID_KEY` | Unraid 7.2 or newer (or the Unraid Connect plugin on older versions): Settings, Management Access, API Keys, create a key with read access. |
| **Synology DSM** | Every volume and drive in the Storage widget, with how full each volume is and each drive's health and temperature. A degraded or crashed volume, a failing drive, a full volume or a hot drive shows in Needs attention. | `SYNOLOGY_URL`, `SYNOLOGY_USERNAME`, `SYNOLOGY_PASSWORD`; optional `SYNOLOGY_VERIFY_TLS` | DSM shares storage details only with administrators: in Control Panel, User & Group, create an account in the administrators group for Patchboard, without two-factor sign-in. Port 5001 for HTTPS, 5000 for HTTP. |
| **QNAP QTS** | Every volume and drive in the Storage widget, with how full each volume is and each drive's health and temperature. A full volume, a drive with abnormal health or a hot drive shows in Needs attention. | `QNAP_URL`, `QNAP_USERNAME`, `QNAP_PASSWORD`; optional `QNAP_VERIFY_TLS` | In Control Panel, Users, create a user for Patchboard without two-step verification. QuTS hero works the same way. |
| **Portainer** | A Docker hosts widget for every environment Portainer manages: up or down, with running, stopped and unhealthy containers and stacks. An environment that goes down, or unhealthy containers on any host, show in Needs attention. Patchboard's own pages keep using the Docker socket it is given. | `PORTAINER_URL`, `PORTAINER_KEY` | In Portainer: your account (top right), Access tokens, Add access token. |
| **Netdata** | Netdata's raised alarms join Needs attention, warnings and criticals alike, with a link back to Netdata. Patchboard leaves the charts to Netdata. | `NETDATA_URL` | The Netdata agent's address, port 19999. One agent per address; a parent node covers its children. |
| **Prometheus or Alertmanager** | Firing alerts join Needs attention: severity critical, page or error as alarms, the rest as warnings. Pending and silenced alerts stay out. | `PROMETHEUS_URL`; optional `PROMETHEUS_TOKEN` | The Prometheus address (port 9090) or the Alertmanager address (port 9093). A bearer token only if a proxy in front asks for one. |
| **UniFi Network** | A Network widget: how many clients are connected and every UniFi device, online or offline, across your sites. An offline access point, switch or gateway shows in Needs attention. | `UNIFI_URL`, `UNIFI_KEY`; optional `UNIFI_VERIFY_TLS` | A UniFi OS console with UniFi Network 9.0 or newer: Control Plane (or Settings), Integrations, Create API Key. The address is the console, e.g. https://192.168.1.1. |
| **Tailscale** | Your tailnet in the Network widget: which machines are online, and keys about to expire. A key that expires within a week warns in Needs attention; an expired one is an alarm, since that machine has dropped off. | `TAILSCALE_KEY`; optional `TAILSCALE_TAILNET` | The Tailscale admin console: Settings, Keys, Generate access token. Access tokens last 90 days at most, so Patchboard reminds you before this one runs out too. |
| **Lidarr** | The queue on the Lidarr tile, and downloads it cannot import or health errors in Needs attention. | `LIDARR_URL`, `LIDARR_KEY` | Settings, General, API Key. |
| **Readarr** | The queue on the Readarr tile, and downloads it cannot import or health errors in Needs attention. | `READARR_URL`, `READARR_KEY` | Settings, General, API Key. |
| **Prowlarr** | Health errors, such as indexers that keep failing, in Needs attention, and a word on the Prowlarr tile. | `PROWLARR_URL`, `PROWLARR_KEY` | Settings, General, API Key. |
| **Bazarr** | Missing subtitles on the Bazarr tile, and its health problems in Needs attention. | `BAZARR_URL`, `BAZARR_KEY` | Settings, General, Security, API Key. |
| **Paperless-ngx** | Documents waiting in your inbox, on the Paperless tile. | `PAPERLESS_URL`, `PAPERLESS_TOKEN` | Your profile (top right), API Auth Token, Generate. |
| **Nextcloud** | Files, users and app updates waiting, on the Nextcloud tile. App updates show in Needs attention as a quiet note. | `NEXTCLOUD_URL`, `NEXTCLOUD_USERNAME`, `NEXTCLOUD_PASSWORD` | An admin account: Personal settings, Security, Devices & sessions, Create new app password, and give Patchboard that one. |
| **Audiobookshelf** | Who is listening, to what, and how far through, in Right now as it happens, and every book in progress in Listening. | `AUDIOBOOKSHELF_URL`, `AUDIOBOOKSHELF_TOKEN` | Signed in as an admin: Settings, Users, your user, API token (or Settings, API Keys on newer versions). |
| **Navidrome** | Who is listening and to which track, in Right now, and albums played lately in Listening. Other Subsonic-compatible servers work the same way. | `NAVIDROME_URL`, `NAVIDROME_USERNAME`, `NAVIDROME_PASSWORD` | Any Navidrome user; an admin sees everyone who is listening. |
| **Gitea or Forgejo** | Unread notifications (review requests, mentions, issues you follow) on the tile, or how many repositories there are when you are caught up. | `GITEA_URL`, `GITEA_TOKEN` | Settings, Applications, Generate New Token, with read access to notifications and repositories. |
| **Calendars (iCal)** | A Calendar widget: the days ahead from every calendar you add, recurring events included. Google, iCloud, Outlook, Nextcloud, Proton and Fastmail all give an iCal address. | `CALENDAR_URLS` | Google: calendar Settings, Integrate calendar, Secret address in iCal format. iCloud: share the calendar as Public and copy the link. Outlook: Settings, Shared calendars, Publish, ICS. Nextcloud: the calendar's menu, Copy subscription link. Several calendars: separate the addresses with commas. Patchboard stores them encrypted, since they work like passwords. |
| **Hardcover** | A Books widget with what you are reading now, covers included. | `HARDCOVER_TOKEN` | hardcover.app: Settings, Hardcover API, copy the token. |
| **Goodreads** | A Books widget from your currently-reading shelf. Goodreads closed its API, so this reads the shelf's public feed: the shelf must be visible to anyone. | `GOODREADS_USER` | The number in your profile address, goodreads.com/user/show/12345678. |
| **NUT (UPS)** | A Power widget for every UPS your NUT server knows: on mains or on battery, charge, runtime left and load. When the power goes out it shows in Needs attention at once, with the minutes left; a low battery or one due for replacement does too. | `NUT_HOST` | The machine your UPS plugs into over USB runs the NUT server, port 3493: TrueNAS (Services, UPS), Unraid (UPS settings, NUT plugin), Synology (Hardware & Power, UPS, Enable network UPS server, and allow Patchboard's address), Proxmox or any Linux box with nut-server. Reading needs no login. |
| **Glances** | A Hosts widget for any machine that runs Glances, from a mini PC or a Pi to a rack server: CPU, memory, the fullest disk, network and the hottest sensor. List several addresses to watch every machine at once. A disk past your storage thresholds, or a host that stops answering, shows in Needs attention. | `GLANCES_URL` | Run Glances in web server mode (glances -w, or the nicolargo/glances image with GLANCES_OPT=-w). The address is port 61208. Several machines: separate the addresses with commas. |
| **Beszel** | Every system Beszel watches joins the Hosts widget: CPU, memory, disk, network and temperature. A system whose agent goes quiet, or a disk past your storage thresholds, shows in Needs attention. | `BESZEL_URL`, `BESZEL_USERNAME`, `BESZEL_PASSWORD` | A Beszel user that can see your systems; make one with the read-only role in Beszel’s user settings. The address is the hub, port 8090. |
| **Scrutiny** | A Drives widget: every drive's SMART verdict, temperature and age. A drive that fails its SMART check, or Scrutiny's thresholds, shows in Needs attention before it dies. | `SCRUTINY_URL` | Scrutiny's web address. It has no API key, so keep it on a private address. |
| **Proxmox VE** | A Proxmox widget: each node with its CPU and memory, and every VM and LXC container, running or stopped. Tap a guest to start, shut down or reboot it. A node that goes offline shows in Needs attention. | `PROXMOX_URL`, `PROXMOX_TOKEN_ID`, `PROXMOX_SECRET`; optional `PROXMOX_VERIFY_TLS` | Datacenter, Permissions, API Tokens: add a token and give it the PVEAuditor role on / to read. To start, shut down and reboot guests from Patchboard, give it PVEVMUser too. The ID looks like patchboard@pve!dash. |
| **Immich** | A Photos widget: how many photos and videos, how much space they take, and what Immich is working on, such as thumbnails or face detection. The Immich tile shows the photo count, or what it's processing. | `IMMICH_URL`, `IMMICH_KEY` | Immich, signed in as an admin: Account Settings, API Keys, New API Key. Give it All permissions, or at least server.statistics and job.read. |
| **Overseerr or Jellyseerr** | A Requests widget: what people asked for, with posters, and Approve or Decline on each. | `OVERSEERR_URL`, `OVERSEERR_KEY` | Settings, General, API Key, in Overseerr or Jellyseerr. |
| **Pi-hole** | An Ad blocking widget: queries and blocks today, and Pause for 5, 30 or 60 minutes. Blocking left off with no timer shows in Needs attention. | `PIHOLE_URL`; optional `PIHOLE_PASSWORD` | Pi-hole 6 or newer: Settings, Web interface / API, Configure app password. Leave the password blank if the web interface has none. |
| **AdGuard Home** | The Ad blocking widget for AdGuard Home: queries and blocks, and Pause for 5, 30 or 60 minutes. | `ADGUARD_URL`; optional `ADGUARD_USERNAME`, `ADGUARD_PASSWORD` | The username and password you sign in to AdGuard Home with. |
| **Uptime Kuma** | An Uptime widget: each monitor with its last 30 checks and 24-hour uptime. A monitor that goes down shows in Needs attention. | `UPTIME_KUMA_URL`; optional `UPTIME_KUMA_SLUG` | Uptime Kuma: Status Pages, New Status Page, then add the monitors you want. UPTIME_KUMA_SLUG is the end of its address. No key needed. |
| **Tracearr** | Needs attention hears from Tracearr: a Plex, Jellyfin or Emby server it sees as down, and each violation nobody has handled yet, such as a shared account or impossible travel, linked to its page in Tracearr. | `TRACEARR_URL`, `TRACEARR_KEY` | Tracearr: Settings, API, Generate key. The key starts with trr_pub_. |
| **Syncthing** | A Sync widget: each folder up to date or how far along, and when each device last checked in. A folder with files it can’t sync, or a device quiet for over a day, shows in Needs attention. | `SYNCTHING_URL`, `SYNCTHING_KEY`; optional `SYNCTHING_VERIFY_TLS` | Syncthing: Actions, Settings, General, API Key. The address is the web GUI, port 8384. |
| **Gatus** | Its endpoints join the Uptime widget, each with its recent results. An endpoint that fails shows in Needs attention. | `GATUS_URL` | The address of Gatus itself. No key needed. |
| **Healthchecks.io** | Your cron jobs and backups join the Uptime widget. A job that misses its check-in shows in Needs attention. | `HEALTHCHECKS_KEY`; optional `HEALTHCHECKS_URL` | Healthchecks: a project, Settings, API Access, Create API key (the read-only one is enough). Leave the address empty for healthchecks.io. |
| **Frigate** | Cameras: each one's newest frame on the board, refreshed while you look; tap one to watch it live. Online or offline, and what the cameras that detect saw today. | `FRIGATE_URL` | Frigate’s address; its API needs no key on the local network. |
| **Backup logs** | Nightly backups as a grid of nights per job, and a one-line overnight summary on Home. | nothing to set; optional `LOGS_PATH` | Mount the folder your backup scripts log to at /logs, read-only (docs/CONFIGURATION.md has the format). |
| **Diun** | Marks containers with a newer image; the mark clears once the container runs it. | nothing to set; optional `HOOK_TOKEN` | Point Diun’s webhook notifier at http://<patchboard>/api/hooks/diun. With a password on, Settings, Connections, Sign-in and keys shows the address with its token. |
| **Updates from the UI** | Pull and recreate one compose service from its page, watch each step, and roll back to the previous image afterwards if it fails or misbehaves. | nothing to set; optional `COMPOSE_ROOT` | Mount your compose folders read-only at the same path as on the host. |
| **Runbook** | The matching section of your RUNBOOK.md on each container page, moved to the top when it’s in trouble. | nothing to set; optional `DOCS_PATH` | Mount the folder holding RUNBOOK.md at /docs, read-only. |
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

[CONTRIBUTING.md](../.github/CONTRIBUTING.md#adding-an-integration) lists
every file a new integration touches.

A live number preset is one entry in [shared/presets.ts](../shared/presets.ts),
then `npm run docs`.
