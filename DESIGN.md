# Design decisions

Settled in a design review on 2026-11-03, before any code was written. Each
entry gives the choice and the reason. Revisit an entry when its reason stops
being true.

## Purpose

**A browser home page that is glance-first, with depth behind each glance.**
It's opened dozens of times a day, so the first screen has to answer "is
anything wrong, what's new, what's next" in about two seconds. Every glance
links to a deeper view (Feeds reader, Upcoming calendar, Logs, Apps) instead of
squeezing detail onto Home.

**Exceptions and changes, not inventory.** Homepage gives every service a tile
whether or not anything is happening. Here a healthy container gets no space of
its own; it's a lit LED in the patch row and part of "All quiet. 38 containers
running." Space goes to what's broken, new, in progress or upcoming.

**A command palette instead of a wall of tiles.** Launching is fastest by
typing. The palette also reaches containers, articles and mail, which a tile
grid can't.

## Architecture

**A server holds every credential; the browser only talks to that server.**
Fastmail's token can read the whole mailbox, and Trakt needs OAuth, so a static
page calling APIs directly was never an option.

**TypeScript end to end, one container.** The server is Hono on Node 24, which
runs the TypeScript directly. The client is React and Vite, served by the same
process. SQLite (`node:sqlite`) holds what the integrations can't supply:
container state history.

**One adapter per integration, each with a real and a demo implementation.**
The interface keeps integrations isolated, so one failing doesn't affect
another. It also makes demo mode a startup switch rather than a retrofit.

**Polling on the server, push to the browser (SSE).** Every open tab gets
updates without each one polling every integration.

**Secrets come in through `env_file:` in compose, never from YAML.** Homepage
kept keys in `services.yaml`. Here the catalog file is safe to commit or share.

## Access

**Tailscale only, no login in the app.** It's never used off the tailnet, and a
login on a browser home page is friction many times a day. If it's ever
exposed, Cloudflare Access goes in front; the app won't get its own auth.

**HTTPS with a real certificate, using a public DNS name that points at the
Tailscale address.** `dash.nbnstack.com` resolves to 100.112.9.9, which only
routes inside the tailnet. Caddy gets a Let's Encrypt certificate with the
DNS-01 challenge through Cloudflare. HTTPS is required for the PWA to install.

**PWA, no push notifications.** The phone needs a fast-opening app shell, not
an alerting system. The service worker caches the shell and never caches live
data.

## Data choices

- **Mail is read-only.** It shows the unread count and newest messages, and
  links into Fastmail. It never sends or modifies anything.
- **Miniflux stays the RSS backend.** It already does fetching, dedupe and
  read state well. Patchboard is a better reader on top of it.
- **Logs stream from the Docker socket directly; Dozzle remains for heavy use.**
  Logs are one click from an alert, without embedding another app.
- **Weather moved to Open-Meteo**, which needs no key.
- **Memory isn't shown.** On TrueNAS the ZFS ARC makes "used memory" look
  alarming when it isn't, which is why the Homepage widget had it off too.
- **Container control (restart/stop) is deliberately absent for now.** The
  socket is mounted read-only in intent, and a button that can restart Plex
  from a browser tab deserves its own decision.

## Themes (v1.2, 2026-11-04)

Patchboard stopped being styled after nbnstack.com. On his own server it can
wear his brand; as a project other people might run, it should look like a
neutral tool and let them choose. So the look is now a set of themes:

- **Graphite** (default): near-black neutral grays with no warm tint, Geist
  for everything, Geist Mono as the data layer, one accent. Sockets are flat
  rounded squares; no tape, no screws.
- **nbnstack**: the v1 look (warm palette, DM Serif titles, patch-bay
  hardware), kept as a theme rather than deleted.

A theme is a token block on `:root[data-theme=...]` with a light variant on
`[data-scheme='light']`. Accent and icon style are independent attributes.
The scheme is resolved by an inline script before first paint.

**Square grids** carry the contribution-chart idea where the data really is
a grid: one square per day of health per container (Stacks rows, container
pages), and CPU by hour of the week (Server). Health squares follow the color
rule: a good day is a quiet gray square, only bad days get color. Heat
squares are the only place the accent fills an area, in five steps.

## Visual direction, v1.1: graphite (2026-11-04)

v1 used green for healthy. On real data that made the patch row forty green
dots, which is inventory, not information. v1.1 makes the rule strict: **color
means trouble.** Healthy is a dim neutral dot (`--quiet`); only warning and
error get a tone. Service icons rest in grayscale and regain color on hover or
focus, so the row reads as one instrument rather than a sticker sheet.

Detail pages are built from one device, the **ledger row**: a label in DM Mono
on the left, the value beside it, a hairline between rows. Charts are hairline
sparklines in ink, no fill, no axes; the exact value is always in text next
to them. Memory and dataset breakdowns use a thin split bar in three ink
weights, never a palette.

The rest of v1 below still holds.

## Visual direction (v1, 2026-11-03)

**The nbnstack.com system, with a patch bay as the one loud element.**
Patchboard runs at dash.nbnstack.com and is presented on nbnstack.com as a
project, so it uses that site's design system rather than its own. v0.1 used
Barlow on an anodized-blue panel with amber accents. It looked fine on its own
and wrong next to everything else Nathan has built, and the site retired amber
the same day.

- **Tokens come from nbnstack.com's `style.css`:** near-black `#0e1114` and
  warm white `#e8e5dc`, with the site's light theme (`#f5f2eb` and charcoal) for
  daytime. Keep the two in step when the site's tokens change.
- **Blue `#69aee8` is used thinly, as on the site:** links, the active-page
  line, focus rings, the selected row, the patch cable in the mark. It is never
  a fill, a background or a glow.
- **Status colors are the site's success, warning and error tones.** They
  appear only on things that have a state: LEDs, alert rules, meters, change
  dots.
- **Three faces with fixed jobs.** DM Serif Display carries names and titles:
  the clock, the status sentence, section and page titles, the fallback poster
  covers. DM Sans is for reading. DM Mono is the label and data layer: times,
  counts, speeds, container names, episode codes, tape labels, logs. All three
  are self-hosted (fontsource), so there are no third-party requests and the PWA
  works offline.
- **Not a terminal theme.** Mono marks identifiers and data. Everything you
  read is in a proportional face. A terminal look would be a costume.
- **The patch row** is the signature: recessed sockets, LEDs, rack screws, and
  label-maker tape in DM Mono. Each service can set a short `label` for its tape.
- **No tinted panels.** Alerts are a neutral raised row with a 2px colored rule.
- **Hover follows the site:** links underline with a 1px rule, and app cards
  lift 2px and gain a 1px blue top edge.
- **One motion moment:** the palette opening. LEDs for down services pulse.
  Both respect reduced motion.
- **Home is dense:** single-line inbox and release rows, so the first screen
  holds the whole morning.
- **The phone reorders Home** to Attention, Inbox, This week, Feeds, Right now,
  Changes, with a bottom tab bar and a thumb-reach search button.
