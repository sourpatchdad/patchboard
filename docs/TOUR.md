# Tour

Every screen, from demo mode. `npm run screenshots` makes these images, so
they match the current code.

## Home

The default header puts status beside full server graphs, then the time and
date above the weather in a centered card. All three header cards share one
surface and line up along their top and bottom edges. On a desktop, the
quiet status stays on one line. Edit header, at the foot of Home, opens Settings,
Home: four checkboxes, with sizing and forecasts in Sizes and forecast
details. Header preferences apply to this device. Arrange board controls the
shared widget layout and leaves saved boards as they are.

The version sits at the foot of Home, on the left. It reads "Update to v1.2.0" when a
newer release is out, and "What's new in v1.2.0" once after you update.
Either opens what each release changed, with Update right there when
Patchboard can update itself. If your compose file pins an exact version, it
tells you which tag to switch to instead.

Below the header sits a board of widgets on the columns you choose. Right
now shows who is watching Plex, Jellyfin or Emby and what each download client is doing, with a Pause button
per client. Recently added merges every server newest first. A file Plex and
Jellyfin both added shows once, labeled Plex + Jellyfin, even when the two
name it a little differently.

Hover, focus or tap a playback row in Right now to see its artwork and
playback details. The preview shows artwork, never a live video frame. Time
played and remaining appear when the service reports them; Navidrome shows
no progress it doesn't have. Open the app from the preview. Close it with Escape, Close or a
tap outside. Service colors identify Plex, Jellyfin, Emby, Audiobookshelf
and Navidrome; Tracearr has its own marker for aggregate activity.

![Home with the compact header](screenshots/home.webp)

![Home with the basic header](screenshots/home-basic.webp)

![Playback details on hover, focus or tap](screenshots/playback-preview.webp)

**Status** stays explicit: the header names problems, and the tab title counts
what needs you, as in "(2) Patchboard". The tab icon adds an amber dot for
warnings or a red dot for critical alerts.

**Needs attention** sits in Home's header, with problem links wrapping under
the status line, worst first. Three show, and the rest wait in a panel a
click away, so the board never moves. To keep it as a card on the board
instead, open Arrange board, then Tools, then Needs attention settings,
and pick A card on the board. Hiding header status also shows this widget
as a card on this device, without changing its saved setting.

## Pages

**Server:** pools, datasets, backups, disks, CPU by hour, and when the pool
fills at this rate. On a short landscape screen, such as a tablet on the
wall, the page packs into three columns and fits without scrolling. Open it
from a household link and the tablet can look but not change anything.

![Server](screenshots/server.webp)

**A container:** what's wrong and the runbook's fix on the left, the live
logs beside them, and buttons to start, restart, update or roll back.

![A container page](screenshots/container.webp)

**Stacks:** every container by compose project. Sort by problems, CPU or
memory.

![Stacks](screenshots/stacks.webp)

**Upcoming:** Sonarr, Radarr and Trakt in one calendar that starts today,
two weeks in two rows, with posters and no doubles. A phone gets a
day-by-day list.

![Upcoming](screenshots/upcoming.webp)

**Weather:** the next 24 hours, the week, sunrise and sunset, US alerts.

![Weather](screenshots/weather.webp)

**Reading:** your Miniflux unread as a morning edition: a lead story, then the
newest from each category, with pictures and a link to the rest of each.
Search, filter by feed or time, sort, or mark a category read; on a phone
these fold under Filter and sort. Open an article and the list sits beside
it; `j` and `k` move, `o` opens the original.

![Reading, the edition](screenshots/reading-edition.webp)

![Reading, one article](screenshots/reading.webp)

**The house:** Home Assistant lights, sensors and scenes, the car, Frigate's
cameras and Wake buttons, on the Home board. Tap a light or a scene; a lock
or a garage door only shows its state. Cameras shows each camera's newest
frame, refreshed every few seconds while it's on screen, and, for cameras
that detect, who and what came by today. Tap a camera to watch it live
right there; Escape, Close or switching tabs ends it.

![Home Assistant, the car, Cameras and Wake on the board](screenshots/house.webp)

**The network:** Uptime lists Uptime Kuma monitors with problems first, each
with its last 30 checks; one that goes down joins Needs attention. Internet
shows the latest speed test and the last day as a line. Ad blocking shows
what Pi-hole or AdGuard Home blocked today and pauses it for 5, 30 or 60
minutes; it turns itself back on when the time runs out. Requests lists
what people asked for in Overseerr or Jellyseerr, with Approve and Decline.
Downloads lists every unfinished download with Pause, Resume and Remove, and
whatever Sonarr or Radarr is stuck on with Try another release. This week
offers Search for an episode that aired and never arrived.

![Requests, Downloads, Internet, Uptime and ad blocking on the board](screenshots/network.webp)

**The machines:** Hosts shows CPU, memory, the fullest disk, network and
temperature for every machine running Glances. Storage covers Unraid,
Synology and QNAP in one widget, volumes and every disk. Power shows each UPS
through NUT, Drives each disk's health through Scrutiny, Proxmox its nodes and
guests, Docker hosts every Portainer environment, Network your UniFi devices
and Tailscale machines. Each one raises its own trouble in Needs attention,
at the thresholds in Settings, Alerts.

![Hosts, Power, Storage, Proxmox, Drives, Docker hosts, Network and Photos on the board](screenshots/machines.webp)

**The household:** a Calendar from any iCal address, Notes with checklists
the house shares, what you are reading on Hardcover or Goodreads, what
everyone watched lately on Plex, Jellyfin and Emby, and the audiobooks in
progress and albums played lately on Audiobookshelf and Navidrome.

![Calendar, Notes, Books, Watched, Listening and This week on the board](screenshots/household.webp)

**No setup needed:** Bookmarks puts your links on the board, Search sends
words to the engine you pick, Clocks shows the time where your people are,
Feeds reads any RSS or Atom feed without a reader app, and Releases follows
the newest version of the GitHub projects you name.

![Bookmarks, Search, Clocks, Feeds and Releases on the board](screenshots/everyday.webp)

**Logs:** live from Docker, each line stamped in your own time, whatever
zone the container runs in.

![Logs](screenshots/logs.webp)

**Jump to:** `Ctrl K` or `/` reaches any app, page, container, article or
message. Before you type, it lists what needs attention and what you opened
last. Each app is one row: Enter opens it, the right arrow reaches its
details and logs, and typing "sonarr logs" lands on the logs.

![Jump to](screenshots/jump-to.webp)

Press `?` for keyboard shortcuts. Each app group on Home is one Tab stop;
arrow keys move between its apps. Help and the editors contain focus, close
with Escape, and return focus to where you opened them. Closing an editor
without saving leaves its settings intact.

![Keyboard help with a visible Close button](screenshots/keyboard-shortcuts.webp)

## Making it yours

**Arrange the board.** Drag widgets, drag an edge to resize, choose the
columns, or start over from a layout. Drag into a column, above or below
its neighbors; the layout updates while you drag. Hover or focus a card for
its controls, or choose a Column in its settings. Editing keeps the full
card preview and the same fitted counts; the arrange bar floats at the
bottom instead of pushing the board down. Its row holds the everyday moves,
Add widget, Cancel and Save; columns, Fit, layouts and Reset sit under
Tools. Fit the window trims lists until the board ends at the bottom of the
screen. Recently added keeps every selected poster in one horizontal row,
rather than losing titles to fit. Right now folds to one line per service
before the other lists lose much. If lists alone can't fit the board, they
keep their full length, the page scrolls, and Arrange board reports how far
it runs over. Fit recalculates when the window width or header height
changes. New board, at the foot of any board, adds another with its own
name, starting empty or from a layout; tabs over the board switch between
them.

![Arrange board with clear card gutters](screenshots/customize.webp)

**Widget settings:** a name, how wide, which column, and how many items.

![Widget settings](screenshots/widget-settings.webp)

**Edit apps.** Drag apps between groups, rename groups, hide anything, add
apps. Each board's Apps widget can show only the groups you tick in its
settings: Home with what you use every day, a Work board with only that.
Cameras picks its cameras the same way.

![Edit apps](screenshots/edit-apps.webp)

**A live number on any app.** Pick the app, paste its key, press Test.

![Live number](screenshots/live-number.webp)

**Customize any page.** Here, the Server page's sections.

![Customize a page](screenshots/page-customize.webp)

**Settings** has themes, colors, type and density, saved per device; units
and the header are under Home. A new browser or home-screen app starts from
the last look you saved.

![Settings](screenshots/settings-look.webp)

![Settings, Home: the header switches, app appearance, units and time](screenshots/settings-home.webp)

**Connections** shows which integrations run. **Set up** takes an address and
a key, tests the connection, and saves. The server encrypts keys and never
shows them again; anything set in the environment file shows as locked.

**Settings, Alerts** sets when storage counts as full and a drive as hot,
with a warning and an alarm level for each, for every device at once.

![Settings, Alerts](screenshots/settings-alerts.webp)

![Integrations](screenshots/integrations.webp)

![Setting up an integration](screenshots/integration-setup.webp)

## Themes

| | |
|---|---|
| ![Graphite, light](screenshots/theme-graphite-light.webp) Graphite, light | ![Midnight](screenshots/theme-midnight-dark.webp) Midnight |
| ![Forest](screenshots/theme-forest-dark.webp) Forest | ![Dusk](screenshots/theme-dusk-dark.webp) Dusk |
| ![Paper](screenshots/theme-paper-light.webp) Paper | |

Every theme comes in dark and light. A Custom theme starts from three
colors.

## On a phone

The tab bar holds Home, Server, Stacks and Reading (Upcoming until Miniflux
is set up). More opens every other page and Settings. Every button and link
takes a full fingertip.

| | | | | |
|---|---|---|---|---|
| ![Home](screenshots/phone-home.webp) | ![A container](screenshots/phone-container.webp) | ![Upcoming](screenshots/phone-upcoming.webp) | ![Weather](screenshots/phone-weather.webp) | ![Server](screenshots/phone-server.webp) |

## First run

Patchboard finds your running containers and adds them all in one click,
grouped by compose stack.

![First run](screenshots/first-run.webp)

If you're coming from Homepage, paste its `services.yaml` in Settings,
Connections, and your apps, groups, icons and links come over. Its widget keys stay
behind; Patchboard names the integrations worth connecting instead.

![Import from Homepage](screenshots/import-homepage.webp)

### Server details in the header

Server details are in the header by default, including CPU history, memory,
storage, uptime and the Details link. Use Edit header on Home to turn
parts off for this device. If your saved board still has a Server card,
Arrange board can remove that copy.

![Server graphs with status and time above weather](screenshots/home-header-server.webp)
