# Tour

Every screen, from demo mode. `npm run screenshots` makes these images, so
they match the current code.

## Home

The header tells you whether anything needs you. Below it sits a board of
widgets on the columns you choose. Right now shows who is watching Plex,
Jellyfin or Emby and what each download client is doing, with a Pause button
per client. Recently added merges every server newest first. A file Plex and
Jellyfin both added shows once, labeled Plex + Jellyfin, even when the two
name it a little differently.

![Home](screenshots/home.webp)

**The otter** follows the server in the header and the browser tab: calm,
asleep on quiet nights, alert with an amber dot, worried with a red one. The
tab title counts what needs you, as in "(2) Patchboard". When nothing does,
it sits beside "All quiet" and keeps watch. Settings, Look hides it.

**Needs attention** sits in Home's header, one line per problem under the
status line, worst first, with three showing and the rest a click away. To
keep it as a card on the board instead, open Customize, then its settings,
and pick A card on the board.

## Pages

**Server:** pools, datasets, backups, disks, CPU by hour, and when the pool
fills at this rate.

![Server](screenshots/server.webp)

**A container:** what's wrong and the runbook's fix on the left, the live
logs beside them, and buttons to start, restart, update or roll back.

![A container page](screenshots/container.webp)

**Stacks:** every container by compose project. Sort by problems, CPU or
memory.

![Stacks](screenshots/stacks.webp)

**Upcoming:** Sonarr, Radarr and Trakt in one calendar, Monday to Sunday,
with posters and no doubles. A phone gets a day-by-day list.

![Upcoming](screenshots/upcoming.webp)

**Weather:** the next 24 hours, the week, sunrise and sunset, US alerts.

![Weather](screenshots/weather.webp)

**Feeds:** your Miniflux unread as a morning edition: a lead story, then the
newest from each category, with pictures. Filter by category, sort, or mark a
category read. Open an article to read it here; `j` and `k` move, `o` opens
the original.

![Feeds, the edition](screenshots/feeds-edition.webp)

![Feeds, reading](screenshots/feeds.webp)

**The house:** Home Assistant lights, sensors and scenes, the car, and Wake
buttons, on the Home board. Tap a light or a scene; a lock or a garage door
only shows its state.

![Home Assistant, the car and Wake on the board](screenshots/house.webp)

**The network:** Uptime lists Uptime Kuma monitors with problems first, each
with its last 30 checks; one that goes down joins Needs attention. Internet
shows the latest speed test and the last day as a line. Ad blocking shows
what Pi-hole or AdGuard Home blocked today and pauses it for 5, 30 or 60
minutes; it turns itself back on when the time runs out. Requests lists
what people asked for in Overseerr or Jellyseerr, with Approve and Decline.

![Requests, Internet, Uptime and ad blocking on the board](screenshots/network.webp)

**Logs:** live from Docker.

![Logs](screenshots/logs.webp)

**Jump to:** `Ctrl K` or `/` reaches any app, page, container, article or
message.

![Jump to](screenshots/jump-to.webp)

## Making it yours

**Customize the board.** Drag widgets, drag an edge to resize, choose the
columns, or start from a layout.

![Customize](screenshots/customize.webp)

**Widget settings:** a name, how many items, how wide, which look.

![Widget settings](screenshots/widget-settings.webp)

**Edit apps.** Drag apps between groups, rename groups, hide anything, add
apps.

![Edit apps](screenshots/edit-apps.webp)

**A live number on any app.** Pick the app, paste its key, press Test.

![Live number](screenshots/live-number.webp)

**Customize any page.** Here, the Server page's sections.

![Customize a page](screenshots/page-customize.webp)

**Settings** has themes, colors, type, density and units, saved per device.
A new browser or home-screen app starts from the last look you saved.

![Settings](screenshots/settings-look.webp)

**Connections** shows which integrations run. **Set up** takes an address and
a key, tests the connection, and saves. Keys are encrypted on the server and
never shown again; anything set in the environment file shows as locked.

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

| | | | | |
|---|---|---|---|---|
| ![Home](screenshots/phone-home.webp) | ![A container](screenshots/phone-container.webp) | ![Upcoming](screenshots/phone-upcoming.webp) | ![Weather](screenshots/phone-weather.webp) | ![Server](screenshots/phone-server.webp) |

## First run

Patchboard finds your running containers and adds them all in one click,
grouped by compose stack.

![First run](screenshots/first-run.webp)
