# Tour

Every screen, from demo mode. `npm run screenshots` makes these images, so
they match the current code.

## Home

The header tells you whether anything needs you. Below it sits a board of
widgets on the columns you choose. Right now shows who is watching Plex,
Jellyfin or Emby and what each download client is doing, with a Pause button
per client.

![Home](screenshots/home.png)

## Pages

**Server:** pools, datasets, backups, disks, CPU by hour, and when the pool
fills at this rate.

![Server](screenshots/server.png)

**A container:** its alerts, the runbook section with the fix, logs, and
buttons to start, restart, update or roll back.

![A container page](screenshots/container.png)

**Stacks:** every container by compose project. Sort by problems, CPU or
memory.

![Stacks](screenshots/stacks.png)

**Upcoming:** Sonarr, Radarr and Trakt in one calendar, Monday to Sunday,
with posters and no doubles. A phone gets a day-by-day list.

![Upcoming](screenshots/upcoming.png)

**Weather:** the next 24 hours, the week, sunrise and sunset, US alerts.

![Weather](screenshots/weather.png)

**Feeds:** your Miniflux unread as a morning edition: a lead story, then the
newest from each category, with pictures. Filter by category, sort, or mark a
category read. Open an article to read it here; `j` and `k` move, `o` opens
the original.

![Feeds, the edition](screenshots/feeds-edition.png)

![Feeds, reading](screenshots/feeds.png)

**The house:** Home Assistant lights, sensors and scenes, the car, and Wake
buttons, on the Home board. Tap a light or a scene; a lock or a garage door
only shows its state.

![Home Assistant, the car and Wake on the board](screenshots/house.png)

**Logs:** live from Docker.

![Logs](screenshots/logs.png)

**Jump to:** `Ctrl K` or `/` reaches any app, page, container, article or
message.

![Jump to](screenshots/jump-to.png)

## Making it yours

**Customize the board.** Drag widgets, drag an edge to resize, choose the
columns, or start from a layout.

![Customize](screenshots/customize.png)

**Widget settings:** a name, how many items, how wide, which look.

![Widget settings](screenshots/widget-settings.png)

**Edit apps.** Drag apps between groups, rename groups, hide anything, add
apps.

![Edit apps](screenshots/edit-apps.png)

**A live number on any app.** Pick the app, paste its key, press Test.

![Live number](screenshots/live-number.png)

**Customize any page.** Here, the Server page's sections.

![Customize a page](screenshots/page-customize.png)

**Settings** has themes, colors, type, density and units, saved per device.

![Settings](screenshots/settings-look.png)

**Connections** shows which integrations run and what the rest need.

![Integrations](screenshots/integrations.png)

## Themes

| | |
|---|---|
| ![Graphite, light](screenshots/theme-graphite-light.png) Graphite, light | ![Midnight](screenshots/theme-midnight-dark.png) Midnight |
| ![Forest](screenshots/theme-forest-dark.png) Forest | ![Dusk](screenshots/theme-dusk-dark.png) Dusk |
| ![Paper](screenshots/theme-paper-light.png) Paper | |

Every theme comes in dark and light. A Custom theme starts from three
colors.

## On a phone

| | | | | |
|---|---|---|---|---|
| ![Home](screenshots/phone-home.png) | ![A container](screenshots/phone-container.png) | ![Upcoming](screenshots/phone-upcoming.png) | ![Weather](screenshots/phone-weather.png) | ![Server](screenshots/phone-server.png) |

## First run

Patchboard finds your running containers and adds them all in one click,
grouped by compose stack.

![First run](screenshots/first-run.png)
