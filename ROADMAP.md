# Roadmap: v2, "the server's own instrument"

Written 2026-11-04, the day v1 went live. v1 is a good start page. It is not
yet a good tool for running HomeNAS. This is the plan to make it one.

## What v1 gets wrong, seen on real data

- **The server is one line.** CPU, storage, uptime. No memory, no disks, no
  pool health, no per-container resources.
- **Storage is wrong.** It shows 7% used. The pool is 55% full (4.0 TB of
  7.1 TB). `statfs` on a non-recursive bind sees only the root dataset (240 G),
  not `media`, `immich` or `security`, which are child datasets.
- **The patch row shows inventory.** Forty green LEDs say nothing. The colored
  icons turn the row into a sticker sheet, and the one thing that matters (a
  red LED) has to compete with them.
- **It covers 33 of 60 containers.** The catalog lists only the apps carried over at setup.
  Databases, `finance`, `acme`, `timesheet`, `jellyfin`, `seerr`, `notes-api`
  and `trivia-night` are invisible.
- **Clicking a service leaves Patchboard.** There's nowhere to go *into*.
- **The server's alerts arrive in the Inbox.** TrueNAS emails show up as mail
  from "HomeNAS". Patchboard should be the place those land, not Fastmail.
- **Everything the ops layer already knows is ignored.** Nineteen cron jobs,
  nightly dumps of 12 databases and 6 file sets, Healthchecks.io watching from
  outside, a thrice-weekly audit, a bulk updater, Diun, a 66 KB runbook. All of
  that is on disk and none of it is on the dashboard.

## The idea

HomeNAS already has a careful ops practice. It's just written down in
scripts, logs, cron jobs and markdown, and read by email. v2 makes Patchboard
the place that practice is *visible*: the server, every stack, every container,
what ran overnight, what's watching from outside, and what to do when
something breaks, all in one place, in the same quiet voice.

## Visual direction: graphite

Monotone, and stricter than v1.

- **Color means trouble.** Healthy things are ink, not green. A healthy LED is
  a dim neutral dot; only warn and crit get color. "All quiet" then *looks*
  quiet, and one amber dot in sixty is impossible to miss.
- **Icons go monochrome** (grayscale, matched to ink weight) and get their
  color back on hover or focus. The patch row becomes a panel, not a sticker
  sheet.
- **Blue stays the interaction color only:** links, focus, the active page.
- **Numbers are the texture.** DM Mono, tabular figures, hairline sparklines
  in ink at 40%. No filled charts, no gradients, no gauges. A chart earns its
  place by answering a question ("is memory climbing?"), not by decorating.
- **One new structural device: the ledger row.** Label in mono on the left,
  value right-aligned, hairline between. Used for every detail page, so the
  whole tool reads like one instrument.

## Information architecture

```
Home        glance: status, overnight, attention, inbox, feeds, releases
Server      the box: pool, disks, datasets, resources, TrueNAS alerts
Stacks      every compose project and its containers (replaces Apps as the default)
  └ /c/:name   container detail: the drill-in
Ops         the diary: cron runs, backups, updates, checks, deploys
Feeds · Upcoming · Logs   as in v1
```

Apps (the launcher grid) stays, reached from the palette and the dock.

### Server

- **Pool:** real capacity from the TrueNAS API, `ONLINE`, the mirror's two
  disks, last scrub (Nov 1, 13 h 26 m, 0 errors), snapshot count (313).
- **Datasets** as one stacked hairline bar plus a ledger: media 2.37 T,
  immich 430 G, security 116 G, ix-apps 92 G, nextcloud 89 G, appdata 40 G.
- **Forecast:** daily pool samples in SQLite give a growth rate and a plain
  sentence, for example "At the 30-day rate, the pool reaches 80% in about
  14 months." (`run-audit.sh` already tracks used bytes for the hardlink
  check, so there may be history to seed it from.)
- **Disks:** temperature and SMART status per drive.
- **Resources:** CPU, memory, network, with 24 h sparklines from Patchboard's own
  samples.
- **TrueNAS alerts** natively, so they can leave the inbox.
- **B2 cloud sync:** last run, result, bytes.

### Stacks

Containers grouped by compose project, read from Docker's own labels
(`com.docker.compose.project`), so all 60 appear with no catalog edits. Each
stack is a block: its containers, state, CPU and memory, image age, and whether
it's in `update-containers.sh`'s bulk list or updated by hand. The catalog
still supplies names, icons and links where it has them.

### Container detail (`/c/:name`)

The drill-in. One page, ledger style:

- **State line:** "Running for 13 days. Healthy. Restarted 0 times."
- **Resources:** CPU and memory now, with a 24 h sparkline.
- **Logs:** the last 200 lines inline, live, with the v1 filter, plus "Open in
  Logs" and "Open in Dozzle".
- **History:** this container's state changes from SQLite.
- **Image:** tag, digest age, Diun's "update available", and when the bulk
  updater last recreated it (from `update-containers.log`).
- **Wiring:** ports, mounts (read-only marked), networks, `depends_on`.
- **Backups:** if its database is in the nightly dump set, the latest dump's
  age and size, and the 31-day streak as a row of ticks.
- **Exposure:** public through the Cloudflare tunnel (with the endpoint check's
  last result) or tailnet-only.
- **Runbook:** the matching section of `RUNBOOK.md` ("Immich Unresponsive"),
  rendered with copy buttons on each command.
- **The app's own panel** where an integration exists (Sonarr queue, Plex
  streams, Frigate cameras).

### Ops: the diary

One timeline of everything the server did, merged from:

- TrueNAS cron jobs and their last result (all 19)
- `db-backup.log`, `file-backup.log`: what was dumped, how big
- `update-containers.log`: which stacks updated, which containers recreated
- Healthchecks.io: each check's state as seen from *outside* the server
- the audit reports in `logs/audit`
- container events Patchboard already records
- `nbnstack-deploy.log`

## Ideas that make it more than a dashboard

1. **Runbook-aware alerts.** When `immich-server` goes unhealthy, the alert
   doesn't just say so; it opens to "Immich Unresponsive" from the runbook,
   with the commands ready to copy. Everything the runbook has learned,
   surfaced at the exact moment it's needed.
2. **While you were asleep.** A single line on Home each morning: "Overnight:
   12 databases and 6 file sets backed up, 3 stacks updated (sonarr, radarr
   recreated), all 5 outside checks green." Click for the diary.
3. **Root-cause folding.** Compose's `depends_on` labels give the dependency
   graph. If `immich-postgres` is down, Patchboard shows one alert ("Immich
   is down because its database is") instead of four.
4. **Seen from outside.** A Healthchecks.io strip: the server's own view says
   "fine", the outside view agrees or doesn't. It's the one signal Patchboard
   can't fake, because it doesn't come from the box.
5. **Exposure map.** Every jack marked public or tailnet-only, from the
   endpoint list in `public-endpoints-ping.sh`. A glance answers "what's on the
   internet right now?"
6. **The palette becomes a command line.** `logs plex`, `runbook b2`,
   `backup joplin`, `stack media`, `restart sonarr` (the only write action,
   behind a confirm, deferred until the DESIGN.md decision is made).
7. **Docs in the palette.** RUNBOOK.md and HomeNAS.md indexed by heading,
   so "restore a database" jumps to the procedure.

## Data sources and what each needs

| Source | Gives | Needs |
| --- | --- | --- |
| Docker API (have) | stats, labels, inspect, events | nothing new |
| TrueNAS API | pool, disks, SMART, scrub, snapshots, alerts, cron, cloud sync | a read-only API key |
| Healthchecks.io API | outside checks | a read-only API key |
| `logs` share | backup, update, deploy, audit logs | read-only mount |
| `system-docs` share | runbook, system doc | read-only mount |
| `scripts` share | endpoint list, bulk-update list | read-only mount |
| backup folders | dump ages and sizes | read-only mount, **filenames and sizes only** |
| Diun | updates available | its read-only db, or its webhook |

Never mounted: the `compose` share, because every stack has a `.env` in it.
Compose metadata comes from Docker's labels instead. The `compose-envs`
backup tarballs are listed by name and size and never opened.

## Order of work

Phase 1 shipped as 1.1.0 on 2026-11-04 (see CHANGELOG). From phase 2,
1.3.0 shipped backups, the overnight line and service checks (an idea from
other dashboards: a running container isn't proof the app answers). 1.4.0 added
root-cause folding, Diun updates and container actions. Still to do in
phase 2: Healthchecks.io, the Ops diary, exposure map; `update-containers.log` is root-only on the NAS, so updates
need either a readable copy or Diun. Not in it yet:
SMART status per disk (TrueNAS 25.10 moved SMART; temperatures and pool
error counts cover the urgent cases) and per-disk history.

**Phase 1: see the server**

- Fix storage (TrueNAS API).
- Memory, per-container stats, compose grouping from labels.
- The Server page and Stacks.
- `/c/:name` with logs, history, wiring, image.
- The graphite pass.

**Phase 2: know the ops**

- Healthchecks.io, the logs share, Ops diary, "while you were asleep".
- Runbook-aware alerts.
- Diun, exposure map, backups on detail pages.
- Root-cause folding.

**Phase 3: the life layer**

- Trakt device login.
- Seerr requests waiting.
- Frigate's latest events as a thumbnail strip.
- Immich "on this day".
- Home Assistant entities.
- Palette commands.

## Someday

- **A pet.** A small pixel sprite of Nathan's dog that lives on Home: asleep
  when all is quiet, alert when something needs attention. Pure delight, way
  down the line, after everything above.
