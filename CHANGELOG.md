# Changelog

## Unreleased

The first public release, 1.0.0. What's in it:

- **Home** answers before you ask: the time, today's weather and the week,
  and "All quiet" or "4 things need you" with each problem linked to its
  fix. Below it, a board you arrange: apps with live numbers, Right now,
  This week, Reading, mail, the server, changes, recently added and more.
- **Every glance leads to an action.** A stopped container is two clicks
  from its logs, a restart, an update or a rollback. Downloads pause, DNS
  blocking pauses, requests approve, Proxmox guests start and stop, all from
  the widget.
- **One compose file, no config files.** Add every running container as an
  app in one click, arrange them in Edit apps, connect integrations and turn
  on a password in Settings, with keys encrypted on the server. Mounts at
  /pool, /docs and /logs turn on by being there. A `services.yaml`, Docker
  labels and environment variables still work, and Settings can copy them
  in so the files can go. Coming from Homepage, paste its `services.yaml`
  and the apps come over.
- **61 integrations,** among them Sonarr, Radarr, Lidarr, Readarr, Prowlarr, Bazarr, Plex through Tautulli,
  Jellyfin, Emby, qBittorrent, SABnzbd, TrueNAS, Unraid, Synology, QNAP, Proxmox, Portainer, Glances, NUT, Scrutiny, Beszel, Netdata, Prometheus, UniFi, Tailscale, Immich, Paperless-ngx, Nextcloud, Audiobookshelf, Navidrome, Gitea, iCal calendars, Hardcover, Goodreads, Home
  Assistant, Frigate, Uptime Kuma, Gatus, Healthchecks.io, Pi-hole, AdGuard Home, Speedtest Tracker,
  Overseerr, Miniflux and Trakt, plus a live number from any JSON API.
- **Pages:** Server (pools, disks, backups, CPU by hour; four columns that fit
  one 1920 by 1080 screen), Stacks, Reading,
  Upcoming (a calendar that fits one screen), Logs, Apps, Weather and a
  page for every container.
- **Alerts you tune:** Settings, Alerts sets when storage counts as nearly
  full, when a drive is running hot, and which of your domains get link
  checks, with a warning and an alarm level for each. Meters everywhere turn
  amber and red at the same numbers.
- **For the household:** a Calendar widget from any iCal address (Google,
  iCloud, Outlook, Nextcloud), and Notes the house shares, with checklists
  you tick right on the board.
- **Notifications** through ntfy, Gotify, Pushover or email for problems that last two
  minutes, and again when they clear. Updates and restarts never count as
  outages.
- **The otter** keeps watch in the header and the browser tab: calm, eyes
  open when updates wait, asleep at night, alert or worried when something
  needs you.
- **Yours to style:** six themes plus your own colors, three type pairings,
  three densities, and light and dark, per device. Give it your own name,
  with or without the otter. Works on a phone and installs as an app.
- **Safe to trust:** sign-in with a password, forward auth or OIDC, a read-only mode, a
  socket proxy example, an activity log, and keys that never reach the
  browser. SECURITY.md has the details.

For contributors: the otter artwork stays outside the repo. Build the icons
with `npm run icons -- /path/to/otter-art`; the built images in `web/public`
are what ship.

The screenshots show the 1920 by 1080 desktop and an iPhone 17 Pro, with
boards for your machines and your household and a sheet of the otter's moods.
