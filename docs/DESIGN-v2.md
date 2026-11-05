# Patchboard v2: your dashboard, our judgment

Proposal, 2026-11-04. Status: in progress. Shipped: label discovery (1.8.0), the board with edit mode and the Server and Container widgets (1.9.0). Next: JSON stat widget, board export and import, presets, catalog editor, weather.

## The problem

Patchboard 1.x is one fixed, opinionated layout. It is good for one server
and wastes space on wide screens. Other self-hosters can only change which
apps appear (the YAML catalog) and how it looks (Settings). They can't put a
KPI from their own service on the page, choose what goes where, or make it
fit a 1920px screen or a phone in their own way.

## What we keep, no matter what

These define Patchboard. Customization must not dilute them.

1. **Exceptions, not inventory.** Healthy things are quiet. Color means
   trouble. A customized board still obeys this: a widget is gray until its
   threshold is crossed.
2. **Needs attention is pinned** at the top of Home and can't be removed.
   It's the one thing a glance must always answer.
3. **Depth behind every tile.** Container pages, runbooks, actions, health
   history and updates stay built in. A widget is a doorway to a page, not a
   dead end.
4. **One screen.** Home should fit a desktop screen without scrolling
   (Stephen Few's first rule of dashboards). Customization helps fit more in,
   not pile more on.

## How people add their own things: three paths

Ranked by effort for the user. All three end up as the same catalog entry.

| Path | Effort | Best for | Example |
|---|---|---|---|
| **Docker labels** | Add three lines to a compose file | Registering an app and its link | `patchboard.name: Sonarr`, `patchboard.group: Media`, `patchboard.href: http://...` |
| **Settings, Catalog** | Click, paste, preview | Anything, without touching files | "Add app" drawer with a live preview of the tile |
| **services.yaml** | Edit a file | Git-managed setups, bulk changes | As today |

- **Labels** travel with the container, which is why they're the most robust
  way to register. Patchboard also reads `homepage.*` labels, so moving from
  Homepage is one step. Labels are for identity (name, group, link, icon) and
  a preset stat; anything more complex goes in the UI or YAML.
- **The UI edits the same YAML.** One source of truth. That needs the config
  folder mounted writable; read-only installs keep the UI in view mode and say so.
  Dashy's "saved to this browser or to the server?" confusion is what this avoids.

## How people add their own numbers: widgets

A widget is a tile with a size and a data source. Four kinds:

1. **Built-in** (today's integrations): Plex streams, Sonarr queue, pool
   capacity, backups, cameras. Deep and correct; nothing to configure.
2. **Container**: any container's CPU, memory, uptime, restarts, health
   squares and response time, from the Docker socket. Pick a container,
   done. This alone covers most "KPI for my thing" wishes.
3. **JSON stat**: call any HTTP JSON endpoint and map up to four fields
   (`data.users.active`, formatted as number, bytes, duration, percent or
   relative time), with a threshold that turns it amber or red. The editor
   runs the request and previews the value before you save. Keys go in the
   environment and are referenced by name, never typed into the browser.
4. **Prometheus** (optional, for people who run it): up to four PromQL values.

Every widget answers the same three questions in the same places: what is it
(name), what's the number (the line), is it OK (color only when not).

## Layout: a grid that measures itself

- **A 12-column grid**, 24 on screens 1680px and wider. Rows are a fixed
  height unit. Widgets snap to sizes: small (3 columns), medium (6), large
  (12). No free placement, so no ragged gaps.
- **Two zones on Home:** a pinned top band (status, Needs attention) and the
  board below it. The board is yours; the band is ours.
- **Edit mode.** An Edit button, then drag, resize (snapping to sizes), add
  from a drawer, remove; Save or Cancel. Arrow keys move a selected widget,
  Shift+arrow resizes it. In view mode there are no handles at all.
- **Breakpoints derived, not duplicated.** You arrange the desktop board;
  tablet and phone layouts are generated from it (stacked in reading
  order), with an optional phone override.
- **Presets.** Start from "Media server", "Homelab ops", "Family" or "Blank"
  instead of an empty grid.
- Library: react-grid-layout v2 (TypeScript, vertical compaction), with our
  own keyboard support. It needs a spike first; if its accessibility falls
  short, dnd-kit with our own packing.

## Where settings live

| Kind | Stored | Why |
|---|---|---|
| Catalog, widgets, board layout | Server (YAML + SQLite), exportable | Same on every device; can live in git |
| Theme, density, units, clock | This device | A phone and a desktop want different things |
| Collapsed panels, last tab | This device | Convenience only |

Board layouts export and import as one YAML file, so a setup can be shared
on GitHub or Reddit and loaded by someone else.

## Sorting and flow

- **Home keeps your order.** Things never move under your hand; trouble is
  shown in place (color, dot) and collected in Needs attention. Muscle memory
  beats re-sorting.
- **Diagnostic pages sort by urgency.** Stacks and the Apps page default to
  problems first, with your order and A to Z one click away.
- **Every number explains itself** on hover and in the key: "29 ms" is how
  fast the app answered; "Up 6 days" is uptime, shown only when there's no
  link to check.

## Weather, done with purpose

Weather earns its place only when it changes what you do, or what the server
does:

- **Next 12 hours** as a strip of hourly squares (rain chance as intensity),
  with one sentence: "Rain from 3 PM, about 2 hours."
- **Severe weather and power**: National Weather Service alerts (US) or
  Open-Meteo warnings. A storm warning becomes a Needs attention item
  ("Thunderstorm warning until 9 PM. UPS on battery?"), the one case weather
  is an exception.
- **Sunrise and sunset**, and an automatic switch between dark and light at
  those times (a theme option).
- **Heat and the hardware**: on hot days, disk temperatures next to the
  outdoor high, so "drives running warm" has context.

## Order of work

1. Docker label discovery (`patchboard.*` and `homepage.*`), merged into the
   catalog, with the audit showing where each entry came from.
2. Container widget and JSON stat widget, with the preview.
3. The grid board with edit mode, presets, export and import.
4. The catalog editor in Settings (writes the YAML when mounted writable).
5. Weather: next 12 hours, alerts into Needs attention, sunrise and sunset theme.
