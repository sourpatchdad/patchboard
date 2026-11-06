# Changelog

## Unreleased

The first public release, 1.0.0. What's in it:

- **Home** answers before you ask: the time, today's weather and the week,
  and "All quiet" or "4 things need you" with each problem linked to its
  fix. Below it, a board you arrange: apps with live numbers, Right now,
  This week, Reading, mail, the server, changes, recently added and more.
- **Every glance leads to an action.** A stopped container is two clicks
  from its logs, a restart, an update or a rollback. Downloads pause, DNS
  blocking pauses, requests approve, all from the widget.
- **Set up in the UI.** Add every running container as an app in one click,
  arrange them in Edit apps, and connect integrations in Settings,
  Connections, with keys encrypted on the server. A `services.yaml`, Docker
  labels and environment variables still work, and Settings can copy them
  in so the files can go.
- **35 integrations,** among them Sonarr, Radarr, Plex through Tautulli,
  Jellyfin, Emby, qBittorrent, SABnzbd, TrueNAS, Proxmox, Immich, Home
  Assistant, Frigate, Uptime Kuma, Pi-hole, AdGuard Home, Speedtest Tracker,
  Overseerr, Miniflux and Trakt, plus a live number from any JSON API.
- **Pages:** Server (pools, disks, backups, CPU by hour), Stacks, Reading,
  Upcoming (a calendar that fits one screen), Logs, Apps, Weather and a
  page for every container.
- **Notifications** through ntfy or Gotify for problems that last two
  minutes, and again when they clear. Updates and restarts never count as
  outages.
- **The otter** keeps watch in the header and the browser tab: calm, eyes
  open when updates wait, asleep at night, alert or worried when something
  needs you.
- **Yours to style:** six themes plus your own colors, three type pairings,
  three densities, and light and dark, per device. Works on a phone and
  installs as an app.
- **Safe to trust:** sign-in with forward auth or OIDC, a read-only mode, a
  socket proxy example, an activity log, and keys that never reach the
  browser. SECURITY.md has the details.

For contributors: the otter artwork stays outside the repo. Build the icons
with `npm run icons -- /path/to/otter-art`; the built images in `web/public`
are what ship.
