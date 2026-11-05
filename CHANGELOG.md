# Changelog

## 1.30.2 (2026-11-04)

- **A container's page puts the fix beside the logs.** What needs attention
  and the runbook sit on the left, the live logs on the right, so a stopped
  container shows its state, the Start button, the fix and the last log
  lines on one laptop screen. Image, wiring and history follow below.
- **Server uses three columns from 1200 pixels wide.** Scrolling on a
  1440 by 900 screen drops from about 970 pixels to under 500. Disks take
  one line whenever their column has room.

## 1.30.1 (2026-11-04)

- **Phones.** The tab bar has an icon over each label, and every label fits.
  Settings tabs and sort choices stay on one line and scroll sideways
  instead of wrapping. Customize sits in each page's top corner, level with
  the title. Home opens with a compact clock, so what needs you and most of
  your apps fit the first screen. Integration rows show the name and status
  on one line with a two-line description.
- **Touch targets.** On a touch screen every text button, link action,
  chip, sort button, log row and checkbox gets at least a 40-pixel tap
  area, without moving anything.
- **One toolbar on Stacks and Apps:** sort choices on the left, the page's
  other action (show image updates, Edit apps) on the right, with even
  spacing. The chip no longer crowds the title.
- **Settings, Connections on desktop:** one line per integration, with each
  status lined up in one column.

## 1.30.0 (2026-11-04)

- **Set up integrations from the UI.** Settings, Connections has **Set up**
  on every integration that talks to another app: fill in the address and
  key, press **Test connection** to see it work (or the exact error), then
  **Save**. Patchboard connects at once, with no restart. `.env` still works
  and always wins; a field it sets shows as locked.
- **Keys are encrypted at rest.** Keys typed in Settings and in Settings,
  Keys are sealed with AES-256-GCM before they reach the database. The key
  that seals them lives in `DATA_DIR/secret.key`, apart from the database,
  or in `PATCHBOARD_SECRET_KEY`. Keys saved before this release get sealed
  the next time any key is saved.
- **Keys go in, never out.** The browser can set a key but never read one;
  the setup file carries neither keys nor addresses. Sign-in settings,
  Docker access, folder mounts and the webhook token stay environment-only,
  so a session can't widen its own access. Activity records every test,
  save and removal.
- **favicon.ico** for browsers and bookmark bars that ask for it by name. It
  used to get the app's HTML page back.
- **A lighter image.** The server now installs only the four packages it
  runs (Hono, its Node adapter, ws and yaml); React, fonts and the rest live
  only in the 1.8 MB web bundle. Server packages in the image went from
  23 MB to 5.5 MB. A running container idles at about 60 MB of memory.

## 1.29.0 (2026-11-04)

- **Home Assistant.** Add a Home Assistant widget, open its settings, and
  tick the lights, switches, sensors and scenes to show. Tap a light, switch,
  fan or automation to toggle it, or a scene, script or button to run it.
  An open door shows amber with how long it's been open. Add the widget as
  many times as you like, one per room. Patchboard only reads and changes
  entities pinned on the saved board, and never locks, garage doors, alarms
  or thermostats, so a stolen session can't open the house. Activity records
  every tap.
- **Tessie, for your Tesla.** A Car widget with battery, range, charging and
  time to full, the charge limit, climate and locks. It reads Tessie's
  cached state and never wakes the car.
- **Wake-on-LAN.** List machines in `WOL_DEVICES` and the Wake widget gets a
  button for each. `examples/wake-on-lan` runs Patchboard on the host
  network, which the broadcast needs, and the new `LISTEN_HOST` picks the
  address it answers on.
- **Add a widget lists only what can show.** Home Assistant, Car, Wake and
  Next up appear once their integration is on. Adding a second copy of a
  widget that allows several no longer fails to save.
- **Feeds, rebuilt.** The count beside Feeds in the nav and on the page now
  come from Miniflux and always agree. Category filters show their unread
  counts and ask Miniflux for that category, so a filter shows everything in
  it, not just what had loaded. With nothing open, the reading pane is a
  morning edition: a lead story with its picture, then the newest three from
  each category. Articles show their picture in the list. Sorting is one
  menu, and Mark all read clears a category or everything after you confirm.
- **Thin scrollbars in the theme's colors** everywhere, instead of Windows'
  wide gray bar.
- **The tab and bookmark icon fills its square**: the four patches alone on
  a clear background, slate on a light browser bar and cream on a dark one.

## 1.28.0 (2026-11-04)

- **Light and dark app icons.** The icon now has a light version: slate and
  colored patches on warm paper. Browser tabs and bookmarks follow your
  system's mode on their own.
- **Pick the app icon per device** in Settings, Look: match the mode, dark or
  light. The choice sets the tab icon, the home-screen icon from Add to Home
  Screen, and the icon an installed app uses. A phone keeps the icon it had
  when you added Patchboard, so pick first, then add.
- **The browser bar matches the mode from the first paint**, before the app
  loads, then follows your theme.
- The install manifest no longer names one person's server.

## 1.27.1 (2026-11-04)

- **The finished app icon.** Four patches sewn into one board, one lit
  amber, with depth and stitching on home screens and a simpler version for
  browser tabs and bookmarks. It holds up on light and dark backgrounds from
  16 pixels to full size. Android gets a full-bleed copy for its icon shapes.
  The header mark matches.
- `npm run icons` renders the PNGs from `icon.svg`, so the SVG is the only
  source.

## 1.27.0 (2026-11-04)

- **Transmission, Deluge, SABnzbd and NZBGet.** Each one shows in Right now
  next to qBittorrent: what's downloading, time left, seeding for torrents,
  and failed downloads from the last day for Usenet. Their app tiles and
  container pages show the same.
- **Pause and Resume every download client** from Right now or its container
  page, in one click. Activity records who paused what. Read-only mode hides
  the button and the server refuses the request.
- **A new app icon:** four tiles, one lit amber. Everything's fine except the
  one thing that needs you. The header mark matches.

## 1.26.1 (2026-11-04)

- **Weather's week fits again.** The Upcoming calendar's day boxes leaked
  onto Weather's day names in 1.25.0 and made each day 150 pixels tall. The
  page scrolled about 900 pixels on a laptop; now it's about 150.
- **Logs fits one screen.** Each container takes one line with its status on
  the right, and the sort buttons sit inside the list.
- **Server balances its columns.** Sections flow into two columns on a laptop
  and three on a large monitor, and disks take one line when there's room.
- **Tighter detail rows** on the Server and container pages.
- **Releases are organized.** `edge` builds from every push to `main`, tags
  move `latest`, `1` and `1.26`, and pre-release tags never move `latest`.
  docs/RELEASING.md lists which tag to pull.

## 1.26.0 (2026-11-04)

- **Jellyfin and Emby.** Set `JELLYFIN_URL` and `JELLYFIN_KEY` (or the `EMBY_`
  pair) and Right now shows who is watching, Recently added mixes in their
  arrivals, and the container page lists streams and Next up. Patchboard
  sends the key in a header and proxies posters, so the browser never sees
  it. `JELLYFIN_USER` picks whose library to read; blank uses the first admin.
- **Next up**, a new widget: the next episode of each show you're watching
  on Jellyfin or Emby. The Media night layout includes it.
- **Posters open the item.** On Jellyfin and Emby a poster opens that film or
  show in the server's web app. Plex posters open Plex.
- **Recently added merges servers.** Run Plex and Jellyfin side by side and
  the shelf shows each title once, newest first, with its server's name.
- **Every tag gets a GitHub Release** with that version's notes from this
  file.

## 1.25.0 (2026-11-04)

- **Posters show on real installs.** Sonarr and Radarr keep `/MediaCover/`
  behind their web login, so every poster request ended at a login redirect.
  Patchboard now asks their API (`/api/v3/mediacover`, which takes the API
  key) and falls back to the public TheTVDB or TMDB poster they report.
  Trakt shows get posters from TVmaze by their TVDB id. The server caches
  posters for a day and misses for an hour.
- **Upcoming is a calendar** on wide screens: Monday to Sunday, every day in
  its place and empty days quiet, so weeks read across and rows line up.
  Titles wrap instead of cutting off. Phones keep the day-by-day list.
- **Image update marks clear when you're current.** Diun flags a new digest
  for a tag even when the image you run hasn't changed (a re-published
  `latest`). An update that finds nothing newer now clears the mark, and the
  container page has **Dismiss** for the rest. Activity records dismissals.

## 1.24.0 (2026-11-04)

- **OIDC sign-in** (`AUTH=oidc`) for Authentik, Authelia, Keycloak, Pocket ID,
  Zitadel, Google and other standard providers. The authorization-code flow
  with PKCE, state and nonce; Patchboard checks the ID token's RS256 or ES256
  signature against the provider's keys, and its issuer, audience, expiry and
  nonce. `OIDC_ALLOWED` limits sign-in to listed emails, usernames or groups.
  Tests run the whole flow against a fake provider, and a browser run signed
  in through one.
- **Run as non-root:** the image's `/data` belongs to the `node` user.
  `examples/hardened` now runs as `node` with a read-only root filesystem and
  a named volume.
- Clearer in-app wording in a handful of places, mostly active voice.
- 56 tests.

## 1.23.0 (2026-11-04)

- **Pi-hole 6** live numbers: blocked today, percent blocked, queries,
  active clients. Patchboard signs in with an app password, reuses one
  session until it expires, signs in again at most once after a 401, and
  waits five minutes after a refused password, so it never fills Pi-hole's
  session limit or locks you out. Tested against a fake Pi-hole.
- **Start from a layout:** Customize and the first run offer Everything,
  Media night, Server room and Calm.
- **Download services.yaml** (Settings, Connections, Catalog) writes the apps
  as arranged in the UI, for people who keep their catalog in git.
- **The tour:** docs/TOUR.md shows every page, editor and theme and five
  phone views, 27 screenshots that `npm run screenshots` regenerates.
- **Fix:** the demo listed Patchboard with another dashboard's logo. It now
  uses its own.
- Test files run one at a time, which fixes a rare failure from two files
  sharing the test database. 51 tests.

## 1.22.0 (2026-11-04)

- **Setup file:** Settings, Home and units downloads your board, apps
  (groups, hidden apps, icons, live-number setups) and page settings as one
  JSON file, and imports one. Use it for a backup or a move to a new server.
  Keys and uploaded icons stay out of the file. Patchboard checks the whole
  file before it changes anything, and Activity records each import.
- **Settings, Connections, Catalog** now points to Edit apps for adding
  running apps in one click, before the services.yaml entries.
- Tighter wording in the app form for catalog apps.

## 1.21.1 (2026-11-04)

- **Real titles and posters in demo mode.** The demo library now holds
  well-known shows and films (Severance, The Bear, Shōgun, Slow Horses,
  Dune: Part Two, Oppenheimer and more) with their real posters, which the
  browser loads from TVmaze and Wikipedia. They replace the painted posters
  from 1.21.0. Episode labels are codes only, so the demo invents nothing
  about a real episode. The screenshots show the same library.
- Small initials tiles drop the decorative line meant for full-size posters.

## 1.21.0 (2026-11-04)

- **Poster art in demo mode.** The demo paints its own posters for its
  invented titles: a scene from words in the title (water for a harbor,
  ridges for a valley, a skyline for a night), a palette per title, the title
  set at the foot. Recently added and Upcoming show art, and so do the
  screenshots. Trakt-only items keep their initials, as on a real install.
- **Docs for whoever pulls the repo.** DESIGN.md states the goal and the
  decisions a contributor needs. ROADMAP.md holds what people ask for and
  what comes next. The planning notes about one particular server left the
  repo.
- Example values in code comments use example.com instead of real domains.

## 1.20.1 (2026-11-04)

- **Fix:** the three example compose files never reached the repo, because
  `.gitignore` excluded every `docker-compose.yml`. It now excludes only the
  root one, your own.
- The docs describe Patchboard on its own terms, without comparisons to
  other dashboards. The research notes keep what people ask for and drop
  project names, links and CVEs; their backlog shows what has shipped since.

## 1.20.0 (2026-11-04)

Docs you can trust, because the code writes part of them.

- **Settings, Connections, Integrations** lists all 18 built-in integrations:
  the ones running with their status, then the rest with the variables to set
  and where to find each key.
- **docs/INTEGRATIONS.md** covers the four ways to add apps and the three ways
  to add numbers. `npm run docs` writes its integration and preset tables
  from `shared/integrations.ts` and `shared/presets.ts`; CI fails if they go
  stale.
- **Screenshots** in `docs/screenshots`, made by `npm run screenshots` from
  demo mode: Home dark and light, the first run, a container page, Edit apps,
  a live number, Server, Upcoming, Weather, integrations, and two phone views.
- **Examples:** the compose example now holds only what a first install needs.
  `examples/everything`, `examples/hardened` (read-only socket proxy,
  `READ_ONLY=1`, localhost only) and `examples/labels` replace the
  commented-out blocks.
- **README, CONFIGURATION, SECURITY** rewritten short. SECURITY drops two
  stale claims: the JSON widget takes `${secret:NAME}` too, and the proxy
  example lives in its own file.
- **House rules in CI:** code without a CHANGELOG entry fails, and so does an
  em dash in the docs or the UI. A pull request template carries the
  checklist.
- A test checks that every integration variable exists in `server/config.ts`
  and in the env template or an example. It found `DOCKER_SOCKET` missing.
- Demo posters with long words set them smaller instead of breaking them
  mid-word.

## 1.19.0 (2026-11-04)

From a fresh install to a full board in one click; each container page the
place to fix that app.

- **First run:** with no apps yet, Home welcomes you and offers every running
  container as an app in one click, grouped by compose stack (single-app
  stacks share an Apps group), or one by one. Then where to customize Home and
  the look. Hide it any time; it leaves on its own once you've arranged apps.
  Try it with `DEMO=1 DEMO_EMPTY=1`.
- **Container pages:** this app's alerts at the top, its live number beside
  its status, and Edit app (straight to its icon and live number) or, for a
  container that isn't an app yet, Add as an app with its details filled in.
- 43 tests, including one that caught Add all re-adding apps on a second run.

## 1.18.0 (2026-11-04)

A calendar you can trust, and Settings you can find your way around.

- **No more doubles:** Trakt entries are matched to Sonarr's and Radarr's by
  TVDB and TMDB id, and by title when ids are missing ("The Traitors (US)"
  is "The Traitors"); a Trakt film matches any of Radarr's release dates.
  Sonarr and Radarr win, since they know what's downloaded.
- **Season drops are one row:** "S01E01 to E06, 6 episodes", counted as one
  release.
- **Posters on Upcoming**, from Sonarr's and Radarr's own cached 250px
  covers, fetched by the server so keys stay there. Anything without art
  gets a quiet initials tile. Each row: title, episode, then time and source.
- **Weather widget** for the board: now, the next 12 hours, three days, any
  alert. With it on the board, the header leaves the weather to it.
- **The date opens Upcoming.**
- **Settings in four tabs:** Look, Home and units, Connections, Activity.
  Old #catalog links land on Connections.
- 42 tests.

## 1.17.0 (2026-11-04)

A board that holds its shape, and weather worth clicking.

- **Columns:** the board has the number of columns you choose (2 to 6,
  default 3); each widget spans 1 to all of them. Narrower windows drop
  columns automatically (never under 320px each); phones show one. Older
  boards convert on their own.
- **Widgets fit their width:** each one adapts to its own size (container
  queries), not the window's: wide feeds, mail and changes flow into
  columns; a narrow inbox puts the subject under the sender; the Server
  numbers go 2 or 4 across.
- **Cards:** every widget is a card with the same padding and the same 24px
  between them.
- **Masthead** tightened: smaller clock and weather, less space below.
- **Weather page** (click the weather): active US alerts from the National
  Weather Service, feels like, wind, humidity, UV, sunrise and sunset with
  hours of light, the next 24 hours with rain chances, and the week as
  temperature ranges on one scale. An active alert shows under the
  masthead weather too.
- **Everything leads somewhere:** the Server widget's numbers open Server;
  Right now's headings open Plex and qBittorrent; posters open Plex; "N
  things need you" jumps to Needs attention.

## 1.16.0 (2026-11-04)

Every page, your way.

- **Customize on every page**, one consistent panel: tick sections on or
  off and drag them into order (Server, grouped by column); tap feeds,
  categories, sources, shows or stacks to hide them (Feeds, Upcoming,
  Stacks).
- Home follows: the Feeds widget leaves out hidden feeds and categories, This
  week leaves out hidden sources and shows.
- Saved on the server and pushed live to every open tab. Hiding never
  silences an alert.
- 41 tests.

## 1.15.0 (2026-11-04)

A live number on any app, set up by clicking.

- **Live numbers:** in Edit apps, any app's ⋯, Icon and live number. Fifteen
  presets (Jellyfin, Immich, Paperless-ngx, Overseerr/Jellyseerr, Tautulli,
  Sonarr/Radarr, Lidarr/Readarr/Prowlarr, Bazarr, Audiobookshelf, Linkding,
  Nextcloud, Home Assistant, AdGuard Home, Pi-hole 5, Glances), suggested by
  the app's name, or any JSON API. Paste the key once, choose the value,
  Test, done. Shows on the tile ("42,506 photos") and in the icon bubble.
- **Keys** pasted in the UI are stored on the server, listed by name in
  Settings, Keys (add, replace, remove), referenced as `${secret:NAME}` and
  never sent back to the browser; checked by test across every endpoint.
  API numbers widgets can use them too, alongside `${env:WIDGET_*}`.
- Fetching keeps the API numbers guard rails: only saved setups are
  fetched, no redirects, link-local and metadata addresses refused, 8 s and
  512 KB limits, errors never echo the URL.
- 39 tests.

## 1.14.0 (2026-11-04)

Customizing for anyone, no YAML required.

- **Drag that feels direct**, everywhere: widgets on Home, apps and groups on
  Apps. Items move live under the pointer; works with a mouse anywhere on the
  item and with touch by its grip; the page scrolls at the edges.
- **Resize a widget by dragging its right edge**; it snaps to the widths that
  widget allows and shows the size while you drag.
- **Edit apps** (was Rearrange): add apps with a name, link, container and
  group; add a running container in one click; hide any app or bookmark and
  show it again; change any app's icon by name, URL or upload. Catalog apps
  are labeled with where they come from.
- **Icon uploads:** stored in `DATA_DIR/icons` under a content hash, served
  with a sandboxing Content-Security-Policy so an SVG can't run script.
- **Patch bay without labels** by default: even spacing, the name in a bubble
  on hover or focus. Widget setting: names Always.
- **Bookmarks (Elsewhere)** can be hidden from Edit apps.
- 34 tests.

## 1.13.0 (2026-11-04)

Make every widget yours.

- **Widget settings:** ⚙ on any widget in Customize. Rename its header
  ("Feeds" to "Reading"), choose how many items it shows, one week or two of
  releases, icons or tiles for Apps (overriding the Settings default).
- **Two-thirds width**, so a row can be 2/3 + 1/3. Every widget now offers
  every width that suits it; wide feed, mail and change lists flow into
  columns.
- **Apps, Rearrange, grown up:** rename groups in place, move apps between
  groups (drag, or the ⋯ Move to menu on a phone), make new groups. Apps
  added to services.yaml later land in their catalog group, under its new
  name. Home's Apps widget settings link straight into it.
- **Patch bay:** jacks widen to fit their names, so nothing is cut off
  ("Audioboo..." is Audiobookshelf again), and healthy apps no longer show a
  grey dot; only trouble lights up.
- README: sign-in and customizing brought up to date. 32 tests.

## 1.12.0 (2026-11-04)

Every page uses the screen it's on.

- **Fix: Home on phones.** The board's single column could be stretched by
  a wide widget (the poster strip) to about 1,090px, cutting every widget
  off on the right. Widgets now match the screen at every phone width.
- **Upcoming is a grid of days:** five or six days across on a wide screen
  instead of one stretched list, a single column on a phone. Filter to
  episodes or films (counts on each), with this week's total at the top.
- **Feeds overview:** with no article open, the reading pane shows unread
  articles as cards with an excerpt instead of empty space. Sort by
  newest, oldest or quick reads; the sort and category stay in the URL, and
  opening an article no longer resets them.
- **Server balanced:** Disks moved to the side column with the model on its
  own line, so the two columns end close together and no model name is
  cut off.

## 1.11.0 (2026-11-04)

Arrange it your way.

- **Rearrange apps:** Apps, Rearrange. Drag apps within a group or a group
  by its name; arrows do the same on a phone or keyboard. Saved on the
  server, so Home, the Apps page and the command palette all follow, on
  every device. "Use catalog order" goes back to services.yaml. New apps
  you add later land after the arranged ones, never hidden. Recorded in
  Activity; refused in read-only mode.
- **Sorts stay put:** the sort on Apps, Stacks and Logs is kept in the URL,
  so it survives reloads, the back button and shared links.
- **Logs list:** sort by problems first, A to Z or newest; the filter also
  matches compose project names; statuses shortened to match Stacks.
- 30 tests.

## 1.10.0 (2026-11-04)

Safe to hand to someone else.

- **Sign-in** (`AUTH`): `forward` trusts a reverse proxy's user header
  (Authelia, Authentik, Cloudflare Access); `password` adds a sign-in page
  with hashed session tokens in an HttpOnly, SameSite=Strict cookie and
  per-address lockout after five wrong tries. Webhooks use `HOOK_TOKEN`.
- **Read-only mode** (`READ_ONLY=1`): every change refused and every change
  control hidden; a Read-only marker in the top bar.
- **Docker socket proxy** support (`DOCKER_HOST=tcp://...`), with a commented
  tecnativa/docker-socket-proxy service in the example compose file.
- **Activity log** in Settings: who restarted, stopped, updated or rolled
  back what, board changes, Trakt sign-ins, sign-ins and failed attempts.
  Kept 180 days.
- **Security headers:** a strict Content-Security-Policy that allows the one
  inline script by its hash, plus nosniff, frame denial and no referrer.
  Every view checked in a browser with no violations.
- **API numbers widget:** up to four values from any JSON API with dot paths
  (`queries.blocked`, `items[0].count`), formats (number, percent, bytes,
  duration, relative time, text) and amber/red thresholds in either
  direction. Test it before saving; the preview shows the response to map
  from. The server fetches only URLs saved in the board; secrets come only
  from `WIDGET_*` variables; redirects, link-local and cloud-metadata
  addresses are refused.
- **Stacks sorting:** problems first, A to Z, busiest CPU, most memory. Kept
  in the URL.
- SECURITY.md rewritten as a deployment guide. 26 tests.

## 1.9.1 (2026-11-04)

- **Fixed: Trakt said "Can't reach" while Settings said connected.** Trakt's
  API refuses requests without a proper User-Agent (HTTP 403); its sign-in
  host doesn't. The calendar calls now send one.
- **Fixed: board widgets overlapped at Compact and Large density.** The board
  measured heights through the density zoom; it now measures in layout pixels.
- **DNS-rebinding protection.** The API answers only requests addressed to an
  IP address, localhost, or a hostname in `ALLOWED_HOSTS`, and refuses
  cross-origin changes. If you put Patchboard behind a reverse proxy name, add that
  name to `ALLOWED_HOSTS`.
- **Room to breathe.** Pages use the width from 1100px up. The board shows
  three columns only from 1680px; between 1100 and 1680px third-width widgets
  become halves. More space between widgets.
- **Settings** is a responsive grid of panels; the theme picker and catalog
  span the full width, the rest sit two or three across.

## 1.9.0 (2026-11-04)

Home is a board you arrange.

- **Widgets:** every Home section is a widget (Apps, Needs attention, Right
  now, This week, Inbox, Feeds, Changes, Recently added) with a width of a
  quarter, a third, a half or the full row. They pack like masonry on a
  12-column grid (6 on laptops, 1 on phones), so tall and short widgets
  leave no gaps.
- **New widgets:** Server (CPU, memory, storage, uptime, with the last 24
  hours) and Container (any container's CPU, memory, response time, a
  24-hour CPU line and 14 days of health). Add as many containers as you like.
- **Customize** on Home: drag by the handle or use the arrows, pick a width,
  remove, add from a drawer; Save, Cancel or Reset to default. View mode has
  no handles at all. Needs attention can move but never leave.
- The board is stored on the server, so every device shows the same one;
  phones show it as one column in the same order. Saving needs the action
  header, like every other change.
- Settings no longer lists Home sections; Customize replaces it.
- Tests for board validation (22 total).

## 1.8.0 (2026-11-04)

First piece of v2: a customizable board.

- **Docker label discovery:** a container registers itself with
  `patchboard.name`, `.group`, `.href`, `.icon` and friends in its own
  compose file. Homepage's `homepage.*` labels work unchanged (never its
  widget credentials). Label entries join a catalog group of the same name or
  start new ones; the YAML file wins when both describe a container. Open
  tabs pick up catalog changes live.
- Trakt's calendar loads the moment sign-in completes, not on the next
  30-minute poll.
- Phones: ledger labels and tile lines wrap instead of clipping.

## 1.7.2 (2026-11-04)

- **Trakt works with only a Client ID.** Trakt stopped issuing client
  secrets to new apps in 2026; the code sign-in now needs none (one is still
  sent if configured). OAuth calls moved to auth.trakt.tv, as Trakt requires
  from February 2027. Tokens last 7 days and refresh a day early; refreshes
  never overlap, because Trakt's refresh tokens are single-use.

## 1.7.1 (2026-11-04)

A clean-up pass, checked by a script that finds clipped text on every page at
three widths, against real data.

- Removed the nbnstack theme; the patch bay stays as a Home layout.
- One duration style: Docker's "About an hour" and "Less than a second"
  become "1 hour" and "seconds".
- A key under the app tiles: what the dots, the arrow (newer image
  available), "29 ms" (how fast the app answered) and "Up 6 days" (uptime,
  for apps with no link to check) mean.
- Apps page sorts by your order, problems first, or A to Z. Home keeps your
  order so tiles never move under your hand.
- Nothing clipped: poster titles take two lines, cloud sync tasks get full
  rows, disk models and Stacks rows wrap on phones, long titles wrap on
  Upcoming, app names take two lines on phones.
- Wide screens (1600px and up): pages widen to 1720px and Home flows into
  three columns.

## 1.7.0 (2026-11-04)

Make it yours, and run it anywhere.

- **Themes are data** (web/lib/themes.ts): Graphite, Midnight, Forest, Dusk,
  Paper and nbnstack, each dark and light, plus **Custom** from any
  background, text and accent, with a live contrast check. Theme cards show a
  miniature of each theme.
- **Settings:** any accent color, four type pairings (Geist, DM, system,
  mono everywhere), three densities, 12/24-hour clock, °F/°C/both for weather
  and disks, which Home sections show, tiles or patch bay. Copy settings to
  another device as a string; reset to defaults.
- The saved theme paints before any script loads, for dark and light alike.
- **Contrast:** Graphite surfaces, lines and quiet text spread further apart;
  healthy days in the health squares are solid accent, unwatched days are
  outlines; meters are thicker with a visible track; charts use the accent;
  app tiles sit on their own surface.
- **Self-hosting:** generic env.example, docker-compose.example.yml and
  Caddyfile.example; docs/CONFIGURATION.md covers every variable, mount and
  file format; a release workflow publishes amd64 and arm64 images to
  ghcr.io on version tags; the README starts with a one-line demo run.
- Weather is fetched in Celsius and shown in the unit you choose.

## 1.6.0 (2026-11-04)

Apps that say something.

- **App tiles** replace the patch row on Home (the patch bay is still a
  setting). Each tile has the full name and one live line: Plex streams,
  Sonarr/Radarr queue, qBittorrent speed, Miniflux unread, Frigate cameras,
  otherwise response time or uptime. Trouble overrides it: stopped, failing
  its health check, not answering, stuck imports, or a catalog entry that
  points at no container. Only trouble gets color; an image update is a
  small arrow by the name. Group headers count only what needs attention.
- **Catalog audit** in Settings and on Apps: entries naming a container that
  doesn't exist, and running apps the catalog doesn't list (databases,
  caches, workers and anything another container depends on are skipped),
  with drafted YAML: a name and icon guessed from the image and a link from
  the published port.
- Apps page uses the same tiles, plus "Running, not in the catalog".
- Settings: Apps on Home (tiles or patch bay).
- Tests for the audit and name guessing (18 total).

## 1.5.3 (2026-11-04)

- Removed the bookmark dock from Home. It was start-page furniture with a
  white key behind every logo; Home is about the server now. Bookmarks are
  still in Jump to and under Elsewhere on Apps.
- Fixed: the phone top bar's search button showed a default button box.

## 1.5.2 (2026-11-04)

Dependencies, all majors tested together.

- Node 26 (current LTS) in the image and CI
- Vite 8 with @vitejs/plugin-react 6: client builds in about 0.25 s (was 2.4 s)
- @hono/node-server 2, marked 18, concurrently 10, @types/node 26
- GitHub Actions: checkout 7, setup-node 7, setup-buildx 4, build-push 7,
  which also clears the Node 20 deprecation warnings

## 1.5.1 (2026-11-04)

Phones.

- Nothing scrolls sideways any more. The page clips horizontally, and the
  bookmark dock (which pushed real Home to 490px on a 390px phone) wraps.
- The patch row is a wrapping grid on phones: every app visible, no
  sideways strip inside a vertical page.
- Phone Home order: status, Needs attention, apps, then the rest.
- Search moved from the floating button into the top bar; it opens as a
  sheet at the top. The page behind search and the shortcut list stays put.
- Inputs are 16px on phones, so iOS no longer zooms in on focus.
- Long episode titles, image names and identifiers truncate or wrap instead
  of widening their row; inner log panes don't drag the page when they hit
  their end.
- CI: secret scan uses the gitleaks CLI over the full history (the GitHub
  action crashed on a range starting at the first commit).

## 1.5.0 (2026-11-04)

Update containers from the UI.

- **Update** on container pages (two-step confirm): pulls the image, recreates
  only that service with `docker compose up -d --no-deps`, then waits until it
  is running, healthy, and answering its service check, live-tested rather
  than taken from the last minute's result. Each step streams to the page with
  the old and new image ids and the raw output.
- **Roll back:** a failed update offers the previous image; Patchboard points
  the tag back at it and recreates on it without pulling.
- **Guard rails:** only compose stacks under `COMPOSE_ROOT`; TrueNAS apps,
  locally built images and Patchboard itself are refused with the reason on
  the page. One job at a time. Compose runs with only `PATH` and `HOME`, so
  Patchboard's own keys can never leak into, or override, a stack's variables.
- The runtime image now includes the docker CLI and compose plugin.
- Repository: CI (typecheck, tests, build, Docker image), gitleaks over the
  full history, Dependabot, SECURITY.md.

## 1.4.0 (2026-11-04)

Acting on what it sees.

- **Container actions:** Restart, Stop and Start on container pages. The first
  click arms the button ("Restart sonarr?"), the second sends it; it disarms
  after four seconds. Every action is recorded in the container's history
  and on Home. The API requires a custom header, so another site can't
  trigger it through your browser.
- **Image updates from Diun:** Diun's webhook notifier posts to
  `/api/hooks/diun`. Containers running that image get an "update" tag on
  Stacks (with a filter) and a note on their page, and one quiet line in
  Needs attention. The flag clears by itself once the container runs a new
  image id.
- **Root-cause folding:** when a container and something it depends on are
  both down, only the dependency alerts, listing what went down with it.
- **Live Docker events:** container lifecycle events trigger a refresh within
  half a second instead of waiting for the 10-second poll.
- **Trakt sign-in** from Settings with the device-code flow; tokens are kept
  in SQLite and refreshed before they expire. A pasted token still works.
- **Keyboard:** `g` then `h s k f u l a ,` to jump between views, `?` for the list.
- **Tests:** `npm test` runs Node's built-in test runner over the backup-log,
  audit and runbook parsers and the alert, check and update rules (16 tests,
  no test framework).

## 1.3.0 (2026-11-04)

Does it answer, and did the backups run.

- **Service checks:** each service link is requested once a minute. Any
  answer below HTTP 500 counts (a login redirect still means the app is up);
  5xx, timeouts and refused connections don't. Two misses in a row raise
  "Sonarr isn't answering" even when the container looks fine, and turn its
  jack amber. Apps shows uptime and response time ("Up 6 days · 21 ms");
  container pages show the last answer and a 24-hour response-time line.
  Checked by default: private and tailnet addresses, plus `CHECK_DOMAINS`.
  Per service: `check: false`, `check: true`, or `check: <url>`.
- **Backups:** the nightly database and file backup logs are parsed into a
  Backups section on Server, with one square per night per item. Alerts for a
  failed item, a run that never finished, or no run in 36 hours.
- **Overnight line** under the status on Home: "Backed up overnight: 12
  databases, 7 file sets." It turns amber when something failed.

## 1.2.0 (2026-11-04)

Themes and square grids.

- **Graphite** is the new default theme: plain dark, one accent, Geist and
  Geist Mono, flat square sockets. The nbnstack look is kept as a theme.
- **Settings** page (sliders icon in the top bar, or "Settings" in Jump to):
  theme, dark/light/system, accent (blue, green, amber, violet, rose, none),
  grayscale or color service icons. Saved per device, applied before first
  paint so there's no flash.
- **Health squares:** 30 days per container on its page, 14 days on every
  Stacks row. A day turns amber or red when the container spent 5+ minutes
  unhealthy or down; days before Patchboard was watching are outlines.
- **CPU by hour:** a seven-day heatmap on the Server page.
- Temperatures in °C and °F
- Fixed: datasets listed twice; memory values wrapping in Busiest containers

## 1.1.0 (2026-11-04)

Phase 1 of the roadmap: see the server.

- **Server page:** pool capacity and health from the TrueNAS API (replacing
  the statfs figure, which saw one dataset), last scrub, snapshots, datasets,
  disks with temperatures, TrueNAS alerts, cloud sync tasks, CPU and memory
  with 24-hour history, network rates, busiest containers
- **Storage forecast:** growth per week and when the pool reaches the next
  threshold, seeded from the audit reports in `logs/audit`
- **Stacks page:** every container grouped by compose project from Docker's
  labels, with CPU and memory per container and per stack
- **Container pages** (`/c/:name`): state sentence, resources with 24-hour
  sparklines, live log tail, health-check output, image, restarts, ports,
  mounts, networks, depends-on and used-by, history, the app's own panel
  (Sonarr, Radarr, Plex, qBittorrent, Frigate, Miniflux), and the matching
  RUNBOOK.md section with copy buttons; it leads the page when something is wrong
- **Memory** shown honestly: in use, ZFS cache and free, from /proc/meminfo
  and the ARC stats
- **Alerts:** degraded pool, disk errors, scrub errors, hot disks and
  TrueNAS's own warnings; container alerts open the container page
- **Graphite pass:** healthy states are neutral instead of green, service
  icons rest in grayscale and get their color back on hover
- Patch row, Apps, Changes and the palette open container pages; the palette
  lists Server and Stacks
- Phone tab bar: Home, Server, Stacks, Feeds, Upcoming
- Minute-by-minute samples in SQLite (containers kept 2 days, host 8 days)
- New read-only mounts: `system-docs` and `logs`

## 1.0.1 (2026-11-04)

First deploy fixes.

- qBittorrent: accept the 5.x login reply (204, empty body) as well as 4.x's
  "Ok."; one login at a time, and a 30-minute pause after a failed login so
  Patchboard can't get the shared IP banned
- Dockerfile: runtime dependencies come from their own `npm ci --omit=dev`
  stage instead of `npm prune`, which stalled the build on TrueNAS

## 1.0.0 (2026-11-03)

The nbnstack.com design system, ahead of first deploy.

- Visual system moved to nbnstack.com tokens: near-black and warm white, one
  blue accent used thinly, the site's success/warning/error tones for status
- Type: DM Serif Display for names and titles, DM Sans for reading, DM Mono as
  the label and data layer; fonts self-hosted, no Google Fonts requests
- Container names, episode codes, times and counts set in mono
- Patch row: label-maker tape in DM Mono, optional short `label` per service
- Home is denser: single-line inbox and release rows
- Alerts: neutral rows with a colored rule; stopped containers show the exit
  code and image instead of repeating the time
- Nav marks the current page with a thin blue line, as on nbnstack.com
- Fallback posters set as serif title pages on muted slates
- Icons and PWA colors updated (the patch cable is now blue)

## 0.1.0 (2026-11-03)

First version.

- Home: masthead (clock, weather, status, dock), patch row, Needs attention,
  Inbox, Feeds, Right now, This week, Changes, Recently added
- Views: Feeds reader, Upcoming, Logs, Apps
- Command palette (Ctrl/Cmd+K, `/`)
- Integrations: Docker, host stats, Open-Meteo, Sonarr, Radarr, Trakt,
  Tautulli, qBittorrent, Miniflux, Fastmail (JMAP), Frigate
- Demo mode with fixture data for every integration
- PWA manifest, service worker and icons
- `import-homepage` script to carry over a Homepage catalog without its secrets
