# Patchboard

A start page and control center for a home server. Open it and you know in
five seconds whether anything is broken, what's new, and what's coming. Click
anything and you land where you can fix it.

![Patchboard's Home: apps with live numbers, Needs attention, Right now, the week's releases, the server, feeds and recently added](docs/screenshots/home.png)

Healthy apps stay quiet. The space goes to what needs you: a stopped
container, a full pool, a stuck import, tonight's episodes.

## Try it

Demo data, nothing to configure. The demo's only outside requests load
posters from TVmaze and Wikipedia:

```sh
docker run --rm -p 127.0.0.1:3200:3200 -e DEMO=1 ghcr.io/sourpatchdad/patchboard:latest
```

Open <http://localhost:3200>.

## Install

```sh
mkdir patchboard && cd patchboard
base=https://raw.githubusercontent.com/sourpatchdad/patchboard/main
curl -fsSL $base/docker-compose.example.yml -o docker-compose.yml
curl -fsSL $base/env.example -o .env
docker compose up -d
```

For a read-only install or a small disk, use the `latest-slim` image. It
skips the Docker CLI, so it can't update containers, and it is about 90 MB
smaller. Either image idles at about 50 MB of memory.

Open Patchboard and press **Add all**. It turns every running container into
an app, grouped by compose stack.

![First run: Patchboard finds 20 running containers and offers to add them all](docs/screenshots/first-run.png)

Then add what you use from Settings, Connections: press **Set up**, paste
the address and key, test, save. Or set them in `.env`. Sonarr, Radarr,
Plex through Tautulli, Jellyfin, Emby, qBittorrent, Transmission, Deluge,
SABnzbd, NZBGet, Home Assistant, Tessie, Uptime Kuma, Pi-hole, AdGuard Home, Speedtest Tracker, Overseerr, TrueNAS, weather and more. Settings, Connections lists
each integration, whether it's on, and the variables that turn it on.
[docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) has the full list.

`latest` follows releases. Pin `1` to stay on 1.x, or a version like
`1.26.1` to stay put. `edge` tracks unreleased code.
[docs/RELEASING.md](docs/RELEASING.md) lists every tag.

Before you expose it anywhere, read [SECURITY.md](SECURITY.md). Sign-in is off
by default, for a private address. Turn it on with `AUTH=password`, or
`AUTH=forward` behind Authelia, Authentik or Cloudflare Access.

## What you get

**It answers before you ask.** The top of Home says "All quiet" or "4 things
need you", with each problem on its own line under it, linked to its fix. A container that crashed at
3 AM still shows under Changes at breakfast. Turn on ntfy or Gotify and a
problem that lasts two minutes reaches your phone, then again when it
clears.

**Everything leads somewhere.** Each container has a page with its alerts, its
runbook section, live logs, a 30-day health strip, and buttons to restart,
update or roll back.

![A container page: the alert, the runbook section with the fix, logs, update and start buttons](docs/screenshots/container.png)

**It's yours without config files.** Drag apps between groups, rename groups,
hide what you don't use, upload icons. Paste an API key and a tile shows
"42,506 photos" or "3 queued". Sixteen apps have presets; any JSON API works.

![Edit apps: drag between groups, rename them, hide or edit any app](docs/screenshots/edit-apps.png)

Home is a board of widgets on 2 to 6 columns. Start from a layout, drag to
move, drag an edge to resize, rename any widget, choose how many items it
shows. Every other page has a Customize button too. Six themes, each dark and
light, or build your own from three colors.

**An otter keeps watch.** The otter in the corner follows your server: calm
when all is quiet, asleep at night, looking up with an amber dot when
something needs you, worried with a red one when something is down. Your
browser tab follows along, so a pinned tab tells you from across the room.

**It's safe to run.** Keys stay on the server. Read-only mode, a Docker socket
proxy, forward auth and an activity log let you decide how much it can do and
see who did what.

## Pages

| | |
|---|---|
| **Home** | The board: apps, Needs attention, Right now, This week, inbox, feeds, server, weather, changes, recently added, Next up, any container or JSON API. |
| **Server** | TrueNAS pools, datasets, disks, temperatures, scrubs, backups, CPU by hour, and when the pool fills at this rate. |
| **Stacks** | Every container by compose project, sortable by problems, CPU or memory. |
| **Feeds** | A Miniflux reader with keyboard navigation. |
| **Upcoming** | Sonarr, Radarr and Trakt in one calendar, without doubles, with posters. |
| **Weather** | The next 24 hours, the week, sunrise and sunset, US weather alerts. |
| **Logs** | Live container logs, with a hand-off to Dozzle. |

Press `Ctrl K` or `/` to jump to any app, page, container or article.

| Server | Upcoming | Phone |
|---|---|---|
| ![Server page](docs/screenshots/server.png) | ![Upcoming calendar](docs/screenshots/upcoming.png) | ![Home on a phone](docs/screenshots/phone-home.png) |

**[Take the tour](docs/TOUR.md):** every page, every editor, every theme and
the phone views.

## Docs

- [TOUR.md](docs/TOUR.md): every screen.
- [INTEGRATIONS.md](docs/INTEGRATIONS.md): getting apps and numbers onto Patchboard.
- [CONFIGURATION.md](docs/CONFIGURATION.md): every setting, the catalog file, mounts, themes.
- [SECURITY.md](SECURITY.md): what it can do and how to narrow it.
- [examples/](examples/): complete compose files for a full install, a hardened one, and labels on your own apps.
- [RELEASING.md](docs/RELEASING.md): branches, tags, images and how a release ships.
- [ROADMAP.md](ROADMAP.md) and [CHANGELOG.md](CHANGELOG.md)
- [CONTRIBUTING.md](CONTRIBUTING.md): running it locally, and what a new integration or widget needs.

## Development

```sh
npm run dev:demo      # invented data, hot reload
npm test              # node:test
npm run typecheck
npm run docs          # regenerate the tables in docs/INTEGRATIONS.md
npm run screenshots   # regenerate docs/screenshots from demo mode
```

TypeScript on Node 24 without a build step for the server, Hono, React 19,
Vite and SQLite. [DESIGN.md](DESIGN.md) records why.

Demo and screenshot posters come from [TVmaze](https://www.tvmaze.com) and
Wikipedia and belong to their studios. Demo article photos come from
Wikimedia Commons under the licenses credited in `server/demo.ts`.

## License

MIT. See [LICENSE](LICENSE).
