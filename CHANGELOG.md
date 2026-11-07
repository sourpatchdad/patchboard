# Changelog

## Unreleased

- Fit reserves the actual space for Customize and New board, responds to
  Welcome and board-tab changes, and tightens Right now's source spacing.
  Small remaining overflows are explained in Customize. Saved boards and
  full horizontal poster rows stay intact.
- Board drawers and Jump to contain keyboard focus, close with Escape and
  return focus to their opener. Background controls are unavailable while
  a drawer is open. Board names and search have screen-reader labels;
  Skip to content bypasses navigation.

What's in Patchboard:

- **Home** offers compact and basic headers. Compact shows the otter beside
  status, CPU and memory, current weather and a small clock. Basic keeps
  time and date. Settings, Home and units adjusts each part on this device,
  including status and clock sizes or Hide, optional storage, and Current,
  Forecast or Hourly chart weather. Header pieces keep compact widths and
  wrap instead of stretching across spare space. CPU and memory link to
  Server's resources; storage links to its storage section.
  The optional chart shows the next 12 hours of temperature and rain, with
  daily forecasts without hourly data. Saved hourly preferences stay in
  place. Presets do not rewrite saved boards. Hiding status shows the
  existing Needs attention widget as a card on this device; add Weather
  separately through Customize. Below the header, a board you arrange:
  apps with live numbers, Right now,
  This week, Reading, mail, the server, changes, recently added and more.
  The board starts right under the header; Customize waits at its foot.
  Right now keeps quiet sources to one line each: nobody watching, nothing
  downloading.
  Hover, focus or tap a playback row for an artwork preview, reported
  playback time and remaining time, and a link to the configured app.
  Escape, Close or a tap outside dismisses it. Service colors identify
  playback sources; paused and buffering states stay explicit. Navidrome
  omits unavailable progress, and Tracearr remains aggregate activity.
  A widget made wider flows its list into columns instead of stretching
  one line across the screen.
  App tiles speak for more integrations: who's listening, requests waiting,
  blocking, speed, drives, sync and Tracearr reviews.
  Recently added fills one row on a wide screen, each title once even when
  Plex and Jellyfin group a season differently, and each poster opens that
  title, on Plex too.
  Each number in the Server widget opens the section that explains it,
  and an empty page links straight to the setting that fills it.
  Add as many boards as you like (twelve), each with its own name, widgets
  and columns, switched by tabs over the board. A new board starts empty or
  from a layout, and a layout leaves out widgets for integrations you
  haven't set up. Fit the window trims each board's lists to one screen,
  keeping only cuts that save room, so a poster row never loses posters.
  Fit recalculates when the window width or header height changes. When
  lists alone cannot fit the board, Customize says how far it runs over
  and what to move. Right now takes an item count like the other lists.
  A fresh install's Home is one screen at 1920 by 1080: the server, Right
  now, apps as icons, the week, reading and changes, fit to the window, with
  Customize in view. The old everything-board is the Everything layout.
  While an integration is down, Home says "Nothing wrong that Patchboard can
  see" and names it, instead of "All quiet". A board saved on one device
  redraws on every open screen. On a phone, each alert in the header shows
  why under its title.
- **Every glance leads to an action.** A stopped container is two clicks
  from its logs, a restart, an update or a rollback. Downloads pause, DNS
  blocking pauses, requests approve, Proxmox guests start and stop, all from
  the widget. Anything that takes something down asks for a press and hold.
  A container still running the old copy of an image you already pulled
  says so, by name, and Update switches it over. Patchboard updates itself
  the same way, from its own page, and Settings shows its version. It
  checks its own registry every six hours, so a new release shows up
  without Diun.
  Every alert leads somewhere specific: a pool to its storage section,
  Sonarr's import trouble to its queue, ad blocking off to the widget that
  turns it back on, a host to its own page. Removing a key or an
  integration, replacing the setup and starting Edit apps over are all a
  press and hold now. A hold lets go when focus leaves the button. Buttons
  that store something say Save; ones that hand a change to the board or
  Edit apps say Apply. On a phone, a stopped container's page opens on its
  live logs.
- **One compose file, no config files.** Add every running container as an
  app in one click, arrange them and add links in Edit apps, connect integrations and turn
  on a password in Settings, with keys encrypted on the server. Mounts at
  /pool, /docs and /logs turn on by being there. Integrations sit in
  categories, A to Z, with a search and On or Not set up, and say when a
  saved one is set aside for another (Goodreads under Hardcover). A `services.yaml`, Docker
  labels and environment variables still work, and Settings can copy them
  in so the files can go. Coming from Homepage, paste its `services.yaml`
  and the apps come over.
  The welcome asks for a name (empty keeps Patchboard), stays through the
  integrations step, and says so when no containers are running. The otter
  beside the name in the header is off unless you turn it on in Settings;
  Home's status line keeps its own. Add widget lists the widgets waiting on an
  integration, each linking to its setup, and a layout says which widgets it
  left out. Apps added in one click link to the address you opened
  Patchboard by, so they work from a phone. Glances takes several addresses.
  The setup file carries notes and alert thresholds too. Pages other than
  Home load when first opened, so Home's download is a third smaller.
  The examples are complete compose files with a line or two of comment
  each; the env template lists every variable in Settings' order, with the
  secret key near the top.
- **65 integrations,** among them Sonarr, Radarr, Lidarr, Readarr, Prowlarr, Bazarr, Plex through Tautulli,
  Jellyfin, Emby, qBittorrent, SABnzbd, TrueNAS, Unraid, Synology, QNAP, Proxmox, Portainer, Glances, NUT, Scrutiny, Beszel, Syncthing, Netdata, Prometheus, UniFi, Tailscale, Immich, Paperless-ngx, Nextcloud, Audiobookshelf, Navidrome, Gitea, iCal calendars, Hardcover, Goodreads, Home
  Assistant, Frigate, Uptime Kuma, Gatus, Healthchecks.io, Pi-hole, AdGuard Home, Speedtest Tracker,
  Overseerr, Tracearr, Miniflux and Trakt, plus a live number from any JSON API.
- **Pages:** Server (pools, disks, backups, CPU by hour; four columns that fit
  one 1920 by 1080 screen), Stacks, Logs (opens on whatever is in trouble), Reading,
  Upcoming (a calendar that fits one screen), Apps, Weather and a
  page for every container, with what that app itself says: Sonarr's
  queue, Immich's jobs, Nextcloud's updates, who's listening, Tracearr's
  servers and more.
- **Alerts you tune:** Settings, Alerts sets when storage counts as nearly
  full, when a drive is running hot, and which of your domains get link
  checks, with a warning and an alarm level for each. Meters everywhere turn
  amber and red at the same numbers.
- **For the household:** a Calendar widget from any iCal address (Google,
  iCloud, Outlook, Nextcloud), and Notes the house shares, with checklists
  you tick right on the board.
- **Notifications** through ntfy, Gotify, Pushover, Discord, email or any webhook for problems that last two
  minutes, and again when they clear. Updates and restarts never count as
  outages.
- **The otter** keeps watch in the header, the browser tab and beside the
  status line on Home: calm, eyes open when updates wait, asleep at night,
  alert or worried when something needs you.
- **Yours to style:** six themes plus your own colors, three type pairings,
  three densities, and light and dark, per device. Give it your own name,
  with or without the otter. Works on a phone, where healthy stacks fold
  and the app rack packs tight, and installs as an app,
  with pull to refresh and room under the status bar.
- **Safe to trust:** sign-in with a password, forward auth or OIDC, a read-only mode, a
  socket proxy example, an activity log, and keys that never reach the
  browser, and keys an app writes into its own logs are masked before
  Patchboard shows them. Setting `PATCHBOARD_SECRET_KEY` later moves saved keys over
  instead of locking them away. A key pasted into an API numbers widget
  moves to the key store when the board is saved, so boards and setup files
  never carry one. TrueNAS honors Check the certificate set in Settings.
  SECURITY.md has the details.

Patchboard is licensed under the AGPL-3.0.

For contributors: the otter artwork stays outside the repo. Build the icons
with `npm run icons -- /path/to/otter-art`; the built images in `web/public`
are what ship.

The screenshots show the 1920 by 1080 desktop and an iPhone 17 Pro, with
boards for your machines and your household and a sheet of the otter's moods.
