# Changelog

## Unreleased

- **Hold a container at its version:** on a container with an update
  waiting, Hold at this version keeps it where it is: no update mark, badge,
  alert or summary line until you press Release. Updating it by hand still
  works, and the audit log records who held it.
- **A bad update undoes itself:** when an update's container doesn't come
  back healthy and answering within two minutes, Patchboard puts the
  previous image back on its own, and Changes says "rolled back on its own
  after a failed update". `AUTO_ROLLBACK=0` leaves it for you instead.
- **Recently added shows a show once:** when Plex lists new episodes under
  the show with its year ("Victorious, 2010") and Jellyfin lists the same
  ones as "38 new", they now merge into one poster that names both servers.
  A film keeps its year, so two films of one name stay apart.
- **Changes says it once:** the same thing happening to the same container
  again (an app updated four times today) is one line with a count, and
  something done on purpose reads "restarted by hand" instead of "restarted
  from Patchboard", which read oddly on Patchboard's own row.
- **A binge is one line:** Watched folds episodes of one show, watched one
  after another by the same person, into "S01E06 to S01E12, 7 episodes",
  so the list shows more than one show.
- **Backups read as a sentence:** "today at 1:00 AM, took 2 min. 384
  files, 17 GB." instead of "in 2 m. 384 files, 17G."
- **Poster captions keep their size:** a long episode name under a poster
  stops at two lines, so one title no longer stretches the whole row.
- **Listening in its service's colors:** an audiobook's progress bar is
  Audiobookshelf amber, as Right now already colors Plex, Jellyfin and the
  rest.
- **A public demo you can host:** `examples/public-demo.yml` runs demo mode
  for anyone on the internet, with no Docker socket, a read-only
  filesystem, dropped privileges and memory caps. Visitors can change
  anything, and `DEMO_RESET_MINUTES` starts it over on a schedule so no
  one sees another visitor's changes. In demo mode Patchboard never fetches
  an icon address a visitor typed, and doesn't warn that it's open to the
  internet, since it is on purpose.

## 1.21.0 (2026-11-28)

Setting Patchboard up now shows you what you get before you get it, and
does most of the connecting for you. Updates say what they bring, and a
weekly summary tells you how the server did.

- **Add widget shows you the widget:** every widget appears as it will on
  your board, live, in five groups you can search. One whose app isn't
  connected shows made-up data marked Sample, and says what it needs. Pick
  one and it opens large: choose its width and the preview follows, set
  its options beside it, and Add to Home. If it needs an app, Connect sits
  first, and Add turns on once it's connected. Add widget is also at
  the foot of every board now, so adding one no longer means arranging
  first. Clocks, Countdown, Markets, RSS feeds and Releases show sample
  entries until you type your own; nothing sample is saved.
- **Connect for me:** Sonarr, Radarr, Lidarr, Readarr and Prowlarr running
  here connect with one press. Patchboard reads the key from the app's own
  settings through Docker, tests it, and saves it encrypted; the key never
  reaches a browser, and the audit log records who did it and from which
  container. A socket proxy needs `ARCHIVE=1` for this; without it you
  paste the key as before.
- **It knows what you run:** connecting an app Patchboard already found in
  Docker starts with its address filled in, and says so, so you paste
  only the key. Settings, Connections opens on Running here when any app
  runs here unconnected: the whole server, one key each, on one page. A
  widget waiting on an app that is running says so by name, and its
  Connect opens that app.
- **Every connection in one list:** Settings, Connections, All connections
  lists every service Patchboard can connect, each set up in place, one
  line each, where it used to list a few and send you to Apps for the rest.
  A field's variable name shows when you point at it, not under it. A
  link to one (an alert, a widget) opens its row there. Discord, email,
  ntfy and the other ways to be told about trouble moved to Alerts, as
  Where alerts go, first on that tab; thresholds show only for what you
  have, so no tire pressures without a car. Home's "Can't see Docker." leads
  to Docker's connection.
- **What an update brings:** a container with an update waiting lists the
  releases since the version it runs, read from its image's source on
  GitHub, with Security fix or Breaking change marked up front.
- **A weekly summary:** turn it on in Settings, Alerts and it lands where
  your alerts do on the day and hour you pick: what needs you, what
  updated, what went down by itself, what waits, and how storage moved.
  The preview shows what it would say now, and Send one now tries it.
- **A widget says what it's waiting for:** a widget on a board whose app
  isn't connected used to draw nothing, so a new Home looked half empty.
  It now shows its name, which apps it needs, and Connect. Household
  screens keep it hidden, since they can't connect anything.
- **A new board says where to start:** a board with nothing to show yet
  has Add widget, Add an app and Connections where its widgets would be,
  and it goes away once anything shows. The gallery's Notes, Links and
  Chores show sample content instead of their empty state, and a sample
  preview leaves out setup hints.
- **Widget settings show the widget:** a widget's settings open beside a
  large preview of it, so a change shows before you keep it, and Cancel
  puts it back as it was. A Container widget picks its container in the
  same place.
- **A widget on your home screen:** open one widget on its own and Add to
  Home Screen installs it under its own name, opening straight to it.
- **Connect one goes somewhere:** an empty Downloads, Library, Media,
  Requests or Ad blocking page used to send you to a Settings list those
  apps aren't on. Connect one now asks which one you run, with the ones
  running here first, and opens its connection in place. Home's "Can't
  reach" line opens the one connection it means, TrueNAS's note opens
  TrueNAS, and the Wake widget and Trakt's sign-in offer to set themselves
  up instead of naming a variable.
- **Add an app adds apps:** Weather, Calendar, Trakt, Books, Wake-on-LAN and
  Other Docker hosts have nothing to open, so they're no longer offered as
  apps. Connect them from their widget or from Settings, Connections.
- **Updating Patchboard says one thing at a time:** Settings could show
  "A newer image is out" next to "Already the newest image", the result of
  an earlier Update. A newer image that comes out after that brings back
  the Update button. Check now also clears the mark when you already run
  the newest image, and an image an Update proved current is not flagged
  again an hour later.
- **The car draws itself:** the Car widget no longer asks you to upload
  pictures. Patchboard ships the drawings (Model 3, 2017 to 2023, and
  Model Y, 2020 to 2024, so far) with the tires and charge port already
  placed, and picks the one for the model Tessie reports. Choose a different one, or a plain
  outline, with Drawing on the Tessie connection in Settings
  (`TESSIE_CAR`). Pictures you uploaded before are no longer used; you can
  delete them from the data folder's `icons`.
- **The car shows while it sleeps:** on a phone the Car widget drew no
  car at all whenever Tessie had no tire pressures, which a sleeping car
  often sends. The car is drawn either way now, with the figures when
  there are readings.
- **The car on a phone:** the drawing is line art on a clear background,
  so it sits on the card without a white box or halo in light or dark. The
  car takes more of the width, each tire's position sits under its figure,
  and the arrows are gone: swipe to turn the car, or tap one of the dots
  under it. The unit shows once at the end of that row.
- **Every tire where it is:** each view marks all four tires, and a tire
  a view hides is listed beside the one it shares an axle with. The front
  view puts the car's left on your right, the top view runs the driver side
  along the bottom, and the leaders land on the hubs. The top view keeps
  both mirrors, and the stray guide lines by the mirrors are gone.
- **The drawing sheet's height:** the arrow that turns the car to the next
  view sits past the height figure instead of over it.
- **Adding a car's drawing:** `npm run car-art -- scripts/car-art/<id>.json`
  cuts a spec sheet and three-quarter renders into the widget's
  transparent views and prints the entry for `shared/car-art.ts`. The
  Model 3's spec is the example.
- **The car with a TV remote:** closing a part or a detail sheet marks
  the panel you opened it from again, so the next press carries on from
  there instead of starting over at the top.
- **Safer Releases widget:** a repository name has to be a GitHub
  owner/name before it reaches the request, so a saved board can't steer
  the server to another address.
- **One name for each thing:** the RSS widget is RSS feeds, so it no
  longer shares a name with Reading. Restore a setup file is one action in
  first run and in Settings. Help says connecting your apps, and the rest
  of the app says connection where it said integration.
- **Code scanning:** the check that sends a magnet link or `.torrent` to a
  torrent client, the demo's rule for which files start skipped, and the
  Pi-hole test's fake server now read in a way CodeQL can follow. Nothing
  behaves differently.

## 1.20.0 (2026-11-24)

- **The weather as an office display:** the weather widget's Display
  style fills a screen with what it's doing now, large, the next 24 hours
  as one chart of temperature over the chance of rain with night shaded and
  sunrise and sunset marked, and the week with each day's low and high on
  one scale. Show it alone on a TV or wall tablet, or start a board from
  "Wall: weather".
- **The weather as a drawing sheet:** the weather widget's Drawing style
  matches the car's engineering drawing, with the same border, pen and
  title block. It plots the conditions as a weather station does: cloud
  cover in the circle, a barb for the wind's direction and speed, and
  temperature, dew point and pressure called out at its corners. The next
  24 hours sit on the grid, and the week runs as dimension lines on one
  scale. On a screen too narrow to read it, the Display style takes its
  place. The date and time keep clear of the top-right corner, where a
  Fire TV draws its microphone indicator.
- **Cameras from a TV remote:** on a wall screen, up and down mark a
  camera, the arrows move between them without turning the page, and the
  center button opens it live. Back, or an arrow past the last camera,
  lets go, so left and right turn the page again. In the live view, the
  arrows or the new previous and next buttons go camera to camera, and
  Back closes it.
- **Fixes:** on a computer, the last app in a group no longer fades as if
  the row scrolled on past it. On a phone, the app rows and Reading's
  categories fade at their edge only while more waits past it. The live
  camera view's name reads in light mode.

## 1.19.0 (2026-11-24)

- **Your car as a live engineering drawing:** the car widget's Dashboard
  style turns the card into a drawing sheet for a wall screen, a TV or an
  e-ink frame.
  - **The sheet:** front, rear and top views across the top, the side view
    in the middle with its real dimensions in millimeters, live charge,
    range, power and temperatures beside it, and panels for status,
    charging, range by charge and the four tires. The title block gives the
    odometer, and a callout at the charge port gives the rate while it
    charges.
  - **Turn it:** swipe across the car, press an arrow key or tap the marks
    either side to step through your drawings: front, three-quarter, side,
    rear and top.
  - **Open any part:** each metric, panel and tire opens a detail sheet as
    large as the first, with the part drawn and its week or day of history
    on ruled axes. Drag along the history, or use the arrow keys, to read
    every line at one moment.
  - **Control the car:** tap a door, the frunk, the trunk, the glass, a tire
    or the charge port, and hold to lock or unlock, open the frunk or
    trunk, start or stop charging, set the limit, or switch climate or
    Sentry. Each command goes through Tessie into the audit log. A
    household device never commands the car, and unlocking or opening it
    needs sign-in.
  - **A poster for any screen:** show the car widget alone on a device and
    the sheet fills the screen, 4:3 on a squarer e-ink frame. On a TV the
    remote drives it: up and down move between the metrics, the car and
    the panels, the center button opens one, and Back closes it. Left and
    right turn the car once it's marked.
  - **Where it's been:** where the car is parked, by your name for the
    place in Tessie or else the town, never the street; the last drive,
    the week's distance and the energy per mile.
  - **Your own drawings:** Pictures takes a side, front, rear, top or
    three-quarter view. Box the part of a sheet to use and tap its tires
    and charge port. "Wall: car" sets up a board, and demo mode shows a
    Tesla drawn from every side.
- **A TV remote turns a wall screen's pages:** left and right, or rewind
  and fast-forward, move between a device's pages, so a Fire TV can show
  the same car, Monitor, weather and cameras as a wall tablet.
- **A Blueprint theme:** drafting blue with white lines on a faint grid, or
  a pale whiteprint in light.
- **Update several containers at once:** hold Update on one row after
  another. They run one at a time, and each row says what it's doing
  ("Pulling 0:42") or what it waits for. When an update can't start, the
  row says why.
- **Fewer false alarms:**
  - **A failed integration retries** in 30 seconds, then a minute, then
    two, so one hiccup from the weather service clears in seconds instead
    of 15 minutes.
  - **Weather, calendars, books, feeds and mail** stay a note in the list
    when they can't be reached, and Home's headline still says "All quiet".
  - **A container must fail its health check for three minutes** before it
    shows in Changes, the Monitor feed or Needs attention.
  - **Errors give the app's reason** when it sends one, as in "HTTP 503:
    Too many requests".
- **Tighter on a phone and a tablet:**
  - **App icons wrap** onto a second line on a phone, and Weather's next
    24 hours and the rows of named apps fade at the edge while more wait
    past it.
  - **Downloads name what's downloading** ("iCarly S06") and show how far
    along a stalled one is, not "0 KB/s".
  - **Right now keeps a long title readable,** and Upcoming's Search sits
    under a poster's title.
  - **Requests opens on what's moving** when nothing waits for approval.
- **Fixes:** Home stops flickering on a smaller screen where the board
  trims its lists to fit. A wall screen's page dots count each page once.
  Setting one browser to e-ink no longer makes new browsers start as e-ink.
  Icons from an address on your network load over HTTPS and a tunnel. The
  moon shows its lit side pale on a light page and e-ink. Weather's high
  and low wrap after a comma, and an hour with no rain chance shows an
  empty track.

## 1.18.0 (2026-11-23)

- **Install it your platform's way:** paste examples/truenas.yml into
  TrueNAS's Install via YAML, or add the Unraid template with the one
  command in README.
- **Every machine you run:**
  - **A Server tab for each Docker host:** its containers, stopped ones
    first, and with Beszel its CPU, memory, disks, CPU by hour and busiest
    containers. Unraid, Synology and QNAP storage shows on Server too.
  - **Mailcow:** its containers and the mail queue join the Uptime widget.
    A stopped container, or a queue past the limit you set (20 by
    default), shows in Needs attention.
- **Ignore a container you stopped on purpose:** Needs attention and the
  container's page get an Ignore button. It stays quiet until the
  container runs again, so a later crash still shows.
- **Easier to read and to hear:**
  - **Every theme passes 4.5:1:** light themes' warning, problem and OK
    colors, and the Teal and Blue accents, are a shade darker. On e-ink, a
    count in a selected tab is no longer gray on black.
  - **Screen readers** hear "40 minutes ago" instead of "40m", app groups
    and Ad blocking's Pause buttons as groups, and a name on every search
    field.
- **Pull to refresh in a phone browser,** not only in the installed app.
- **Fixes:** Reading shows in the navigation only when Miniflux is
  connected. A locally built image on another Docker host gets the right
  icon.

Ignore, Mailcow, the Server tabs, pull to refresh and both fixes come from
fir3drag0n's fork. Thank you.

## 1.17.0 (2026-11-18)

- **Every app in one place:**
  - **Press the pencil on a tile** in Apps and its sheet opens: icon,
    link, connection, the number on its tile, and where it shows up, with
    Add to Home for a widget you don't have yet. Done saves it.
  - **Add an app** lists what runs on your server and isn't on Apps yet,
    then every app Patchboard can connect, with a search. Pick Emby and you
    connect it in the same sheet.
  - **Weather, calendars, Trakt** and anything else you connected without
    a tile sit under Also connected and open the same sheet.
  - **A tile's number uses its app's connection,** so you type Sonarr's key
    once. The first choice reads "Sonarr's own number".
  - **Settings, Connections is shorter:** its Integrations list keeps the
    ways alerts reach you and what the server sets itself. Edit apps moves
    and groups apps.
- **The 2 AM fix takes one click:** "Can't reach" and a widget's Check the
  connection open that app's sheet with its connection form open.
- **Arranging the board:**
  - **Add widget shows the widget live,** with your own numbers, before
    you add it.
  - **A widget waiting on an app** opens that app's sheet over the board.
    Connect it and the widget lands where you're arranging. Next up asks
    whether you run Jellyfin or Emby; Storage asks Unraid, Synology or QNAP.
  - **Edit header opens over the board,** below the header, so you see
    each change as you make it.
- **A 3D printer widget** for Bambu Lab printers, through Home Assistant's
  Bambu Lab integration: the print and its picture, progress, layer, time
  left and finish time, nozzle and bed heat, the spool in use, and any
  error in the printer's own words. As one number it shows the progress on
  a wall screen. Search "bambu" in Add widget, Add an app or Jump to; with
  no printer yet, Home Assistant's sheet links the integration.
- **Jump to finds more:** "connect emby" opens Emby's connection, and a
  widget's name or what it shows finds the widget.
- **One name for each thing:** Edit on a widget and a connection, More for
  Arrange board's extra tools, Saved secrets for pasted keys, and Links for
  what were Bookmarks and Elsewhere.
- **Audiobookshelf shows each book's cover** in Listening.
- **Fixes:**
  - **Add widget is back on a phone:** More opened Arrange board's tools
    off the side of the bar.
  - **Enlarged text keeps the top bar in order:** with Firefox's Zoom Text
    Only, More no longer covers Home, and a widget's link drops below its
    title.
  - **Bigger taps on a phone** for Connections' parts, and Edit apps'
    sections read as headings to a screen reader.

## 1.16.0 (2026-11-17)

- **Open a library** on the Media page: its episodes or tracks, the folders
  it reads, and what came in last, with posters that open in Plex or
  Jellyfin. A show's new episodes share one poster with how many came in.
- **Downloads reads like a torrent client:** small arrows mark speeds and
  totals down and up, figures line up in columns, the bar is a thin line,
  and a finished torrent's ratio turns green at 1.00. On a phone, a torrent
  lists with Details alone, and its controls open with it.
- **Suggest an idea or report a problem from Patchboard:** Help (the `?`)
  and a phone's More open the matching GitHub form with the version, browser
  or page filled in, and nothing private.
- **Patchboard tells you when something doesn't connect:**
  - **Save tests the connection:** saving an app in Settings, Connections
    shows what it found or why it failed.
  - **A turned-away webhook raises a warning:** when Diun posts without the
    token sign-in needs, Home says so and points to the address to copy.
  - **Plex reads On** in Connections once it's saved.
- **Updates go smoothly:**
  - **No more "Unexpected Application Error" after an update:** a tab or
    home-screen app opened before an update asked for build files the
    update replaced. Patchboard now answers 404 for those, the app reloads
    onto the new build by itself, and any other failure shows its own page
    with Reload.
  - **Restarts take a second, not ten:** Patchboard stops when Docker asks
    and closes its live lines to Jellyfin and the rest, instead of waiting
    to be killed.
- **Fixes:**
  - **Jellyfin's newest arrivals survive a season drop:** 28 new episodes
    of one show used to leave 3 items in all. Patchboard now reads the
    newest 120 and groups them itself.
  - **Copy works at a plain http address,** such as http://your-server:3200:
    Diun's webhook, API keys, a device's link, runbook code, carried
    settings and the catalog's YAML. Diun's address sits in a field that
    selects itself if a browser still refuses.
  - **A wall page's clock is right the moment you swipe to it,** not up to a
    minute behind.
  - **Monitor trusts an app's own level:** Jellyfin's "[WRN] … error
    receiving data" shows as a warning, not an error.
  - **Posters open from anywhere:** when your app's tile uses plain http and
    Connections holds an https address, posters link through the https one.
  - **Touch targets on a wall tablet:** the busiest containers on Server
    take the whole row, and Edit board and Colors on a device's pages no
    longer overlap when they wrap.
  - **A stream's card no longer scrolls,** and hold hints no longer stretch
    the box they sit in.
  - **A show with nothing yet** reads "No episodes yet" in Library.
- **Fit, taps and hovers checked on every page:** `npm run test:fit` opens
  everything on every page at phone, tablet, laptop and desktop sizes, with
  `--full` for an iPad on its side, a wall tablet, a 1080p kiosk and Compact
  density. `FIT_BASE` points it at your own install, read-only.

## 1.15.0 (2026-11-16)

- **A page for each app you run:** manage Sonarr, Radarr, Plex and the rest
  from Patchboard instead of opening each one.
  - **Downloads:** every torrent and NZB in qBittorrent, Transmission,
    Deluge, SABnzbd and NZBGet on one list, with progress, speed, time left,
    ratio, category and tracker. Pause, resume, remove, or remove with the
    files, and add a magnet link, a web address or a file. Details opens a
    torrent: set each file to Skip, Normal or High, give it its own speed
    limits, and in qBittorrent move it to another category.
  - **Library:** Sonarr's shows and Radarr's films with posters, what's on
    disk and monitoring. Missing, Queue (with Try another release) and Add
    by name sit beside it. Open a show for its seasons and episodes, to
    monitor or search one season or one episode. History shows what was
    grabbed, imported or failed, and why.
  - **Subtitles and Indexers:** with Bazarr, what still lacks subtitles and
    in which languages, with Search. With Prowlarr, how each indexer has
    done, which are failing and when they try again, with Test and Turn off.
  - **Requests:** everything waiting for Overseerr or Jellyseerr, with
    Approve and Decline, what's on the way, and New request to find a film
    or show by name and ask for it.
  - **Media:** who's watching on Plex, Jellyfin and Emby, on what device,
    with Stop; the viewer sees a note that you stopped it. Libraries shows
    each library's size and last scan, with Scan.
  - **Ad blocking:** Pi-hole's or AdGuard Home's live query log with Allow
    and Block on each domain, your own lists, and Pause. On Pi-hole, list
    changes with an app password need `webserver.api.app_sudo` on, and the
    page says so.
  - **When an app refuses,** you read its own reason, not an error code.
- **Plex on its own:** add Plex's address and token in Settings, Connections,
  and Right now, Recently added and Watched read from Plex itself, posters
  included, with no Tautulli needed. The token stays on your server.
- **A stream's card everywhere it plays:** the card from Home's Right now
  opens on the Media page and on each media server's page too, with Stop,
  and on a phone, Open in the Plex app.
- **Finding your way:**
  - **Counts in the menu:** Downloads shows what's unfinished and Requests
    what waits for you, as Reading shows unread. More carries a dot when a
    page inside it has a count.
  - **Every app leads to its page:** Home's widgets and each app's own page
    link to its Patchboard page, so Plex leads to Media and Prowlarr to
    Indexers.
  - **Pages that don't fit go under More,** so the top bar keeps the
    Patchboard name whole.
  - **Read a chart by pointing:** hover a line, or tap it on a phone, for
    the value and the time.
  - **Jump to** lists every board, wall boards too, and a device's Edit
    board brings you back to that device.
- **Setting up:**
  - **A first run that takes a minute:** one sheet names the server, finds
    your town for the weather, ticks the apps it found and offers a
    password. Settings, Weather finds your town by name later too.
  - **Connect where the app is:** a tile for an app Patchboard can read
    shows Connect, and it opens that setup.
  - **Several Docker hosts:** add your other machines through a socket proxy
    and their containers join Stacks, named like `pihole@pi`, with logs,
    alerts, start, stop and restart.
  - **Icons for nearly everything:** each app finds its icon in two icon
    sets by image, container or name. Upload your own for any app, any
    image up to 10 MB, or replace the P with your own logo on every device.
  - **A read-only API, with MCP:** a key per tool lets scripts, Home
    Assistant or Claude read what needs you, the containers and any number.
    It changes nothing. docs/API.md has the details.
  - **The setup file in YAML,** to read, edit and keep in git. Import takes
    JSON or YAML.
  - **Search shortcuts:** `!yt`, `!gh` and the like in the Search widget,
    plus one for each app with a search page, and your own.
  - **Tire warnings on your terms** in Settings, Alerts.
  - **Settings in your language:** German, Spanish, French, Italian, Dutch
    and Brazilian Portuguese.
- **How it looks:**
  - **Color e-ink** for Kaleido and Spectra panels: the still paper page,
    with status, the accent and app icons in color.
  - **A board's own colors:** set a theme, mode and accent per board in
    Arrange board, Tools, Colors.
  - **Lights only when they mean something,** so a warning or a stop stands
    out.
  - **A color pass over every theme:** e-ink meters show their track,
    Forest's accent is teal, and the Monitor's trouble colors match the rest.
  - **Hide all and Show all on Stacks,** and E-ink in Look no longer moves
    the page when picked.
- **On a phone:**
  - **Rows use the whole width:** buttons and opened panels run under the
    poster, and search boxes take a line of their own.
  - **Every tap lands where you aim:** buttons that wrap no longer cover the
    line above. The accessibility check now taps through every page as a
    phone.
  - **No text cut off** in a box; anything too long ends in an ellipsis.
- **Fixes:**
  - **Quick clicks stick:** two changes in a row to AdGuard, Pi-hole or a
    show's seasons both hold, a Deluge file set low stays low, and a speed
    limit over 2 GB/s no longer wraps around in qBittorrent.
  - **Reading's count follows Miniflux** within a minute, and hides while
    Miniflux can't be reached.
  - **Hold hints stay on screen** at the end of a row.
  - **Plainer words** across the README, the docs and the app, and
    Showcase mode is gone; the demo covers it.

## 1.14.0 (2026-11-15)

- **Needs attention can leave a board:** any board but Home can remove it, so
  a board of media stats holds only media. In Arrange board, remove the card
  like any widget, or use Tools when it sits in the header. That board's
  status line still counts problems and leads to Home's list. Home always
  keeps it. Asked for by @smoofus in #16.
- **The UPS beside the server:** with NUT connected, the Server header shows
  the UPS charge, or "On battery, 23 min left" when the power is out.
- **Wall boards stay on the wall:** Home's tabs leave out boards set For a
  wall screen. Settings, Devices lists them, each a link to edit.
- **A black-and-white app icon:** with E-ink on, the home-screen icon, the
  install manifest and the tab icon go black and white from the first paint,
  and the phone's status bar goes white. Dark becomes a white P on black,
  Light a black P on white, each with a gray leg. White on black and Black on
  white are App icon choices of their own too. A phone keeps the icon it was
  added with, so remove and add it again to switch.
- **No zoom on a phone:** pages scroll and never zoom, by pinch, double tap
  or tapping into a search box. Density in Settings, Look still makes
  everything bigger.
- **Phone and e-ink polish, from a week on e-ink:**
  - **Less to read:** captions and settings notes no longer explain colors,
    bars or dots. Settings, Server, Stacks and Upcoming say what they show in
    fewer words, and with E-ink on, Look leaves out Theme and Accent.
  - **Alerts:** the why behind an alert folds away on a phone; tap a line
    without a link to read it. A long title wraps beside its light instead
    of under it, and a low-tire alert reads "sudo ./drive's tires are low"
    with "All four at 36 psi" behind the tap.
  - **Pull to refresh:** the page follows your finger down, with the ring in
    the gap, instead of the ring drawing over the alerts.
  - **Stacks:** every stack folds and unfolds, on any screen. The sort
    choices wrap to a second row instead of clipping.
  - **One edge, one size:** in E-ink, cards drop their inset along with
    their shading, so Home, Upcoming and the app rack line up with every
    other page. Reading sits on the same edge, and section headings share
    one size on a phone.
  - **Tidier:** the Server header's five readings shrink to keep their gap
    on a tablet, a phone's board links line up on the left, and a long
    action wraps instead of running off a phone. Opening a page no longer
    draws a box around its title, and This week lays out without the nested
    grids Safari stalled on.
  - **Fewer repeats:** Reading's count shows once, and an idle torrent
    client says "qBittorrent is seeding 218, nothing downloading" in one
    line.
  - **Ink only:** playback bars lose their brand colors, the top bar and the
    phone's tab bar are solid paper with no blur, pale app icons darken until
    they read, an empty poster or unwatched day keeps a gray outline, and a
    chosen tab or chip is a filled black block everywhere.
- **Edge is the beta:** releases now come about weekly, and `edge` carries
  every change in between. An edge image's version names its commit
  (1.14.0, edge 4f2c1a9), so Settings shows exactly which build runs and wall
  tablets reload onto each new one.

## 1.13.0 (2026-11-12)

- **The house, from Home Assistant:** five widgets beside the general one.
  - **List:** a to-do list such as Shopping list. Add an item, tick one off,
    and the done ones fold away.
  - **Thermostat:** the temperature inside, the set point with minus and plus,
    and whether it's heating or cooling.
  - **Shades:** blinds, shades and curtains, how far open, with open, stop and
    close. Garage doors, gates and doors stay read-only: the server checks the
    cover's class with Home Assistant before it moves anything.
  - **People:** who's home, who's out, and since when.
  - **Rooms:** each room's last day of temperature as a strip, blue when cool
    and orange when warm, from Home Assistant's own history.
- **Chores:** name the jobs and how often (Water the plants=7). The widget
  counts the days since each, turns amber when one is due, and starts over at
  Done, with a moment to undo. It needs no Home Assistant.
- **Kitchen tablets:** a household device can keep a list, set a thermostat,
  move shades and mark chores done, all limited to what's pinned on a board.
- **The car, redrawn:** charge and range with a line of the last week, the
  cabin and outside temperatures with a line of the last day, and the four
  tires around the car with a line of each. A tire under 38 psi, or 3 psi
  under the others, turns amber, is named, and shows in Needs attention before
  the car's own warning would. A wide card splits into two columns. Range and
  odometer follow your units, and One number adds the lowest tire.
  Patchboard records each reading Tessie has for a month, without waking the
  car.
- **BitAxe:** a Miners widget for BitAxe and other AxeOS miners, from their
  local API with no key: hashrate with its last day, the ASIC temperature,
  power and joules per terahash, the best difficulty and shares. List one
  address or several. A miner turns amber at 65 °C and red at 70 °C, and one
  that runs hot or stops answering shows in Needs attention.
- **One widget on an e-paper panel:** a TRMNL, Inky or ESP32 panel can show
  one widget as a big number with its line along the bottom, in place of the
  server summary. Panel shows, in Settings, Devices, builds the address. A
  board's One number and the panel use the same code, so they always agree.
- **Five more languages:** German, Spanish, Italian, Dutch and Brazilian
  Portuguese for the boards, the wall screens and the Monitor, chosen in
  Settings, Look, Language and region, or set for a wall device in Settings,
  Devices.
- **Fixed:** a Home Assistant widget showed its entities only at the next
  poll, up to 15 seconds after the board was saved. They show at once now.

## 1.12.0 (2026-11-12)

- **Five new widgets** for apps that had only a number on their tile:
  - **Media managers:** Lidarr, Readarr, Prowlarr and Bazarr, a line each,
    healthy or what's wrong, with the queue or the missing subtitles.
  - **Documents:** the Paperless-ngx inbox and how many documents it holds.
  - **Nextcloud:** files, people on today, free space and app updates.
  - **Git:** notifications waiting in Gitea or Forgejo, and the repositories.
  - **Monitoring alerts:** what's firing in Netdata or Prometheus, critical
    first, each linking back.

  Each can show as one number too, and Add widget offers them once their app
  is set up. Files and work is a new group there.

## 1.11.1 (2026-11-12)

- **One number, level in a row:** every number gets the room of the largest
  and keeps space for its line, so the labels under a row of them sit on one
  line and the cards end level, whatever the figure's length.
- **One number on e-ink:** a critical number is underlined and a warning's
  line is bold, as problems are marked everywhere else on an e-ink screen.

## 1.11.0 (2026-11-12)

- **Show as, on every widget that has more than one way:** Detailed is the
  whole widget. Compact keeps the top three items and drops the small print.
  One number shows the figure that matters, as large as the card allows, with
  a faint line of its day under it where there is one.
- **One number for 17 widgets:** Server (CPU, memory, storage or uptime),
  Needs attention, Weather (now, the high or the chance of rain), Markets
  (the first price, so one coin is one line), Countdown, Car, Ad blocking,
  Internet, Power, Photos, Requests, Docker hosts, Network, Drives, Sync,
  Inbox and Reading. Which number is in the widget's settings.
- **One widget on a screen:** Settings, Devices offers every widget on every
  board as a page of its own, filling the screen with nothing around it. For
  a Pi with a 3.5 inch display, or one page among a wall tablet's others.

## 1.10.1 (2026-11-12)

- **New widget settings load at once:** Markets, Feeds and Releases fetch
  again as soon as you save the board. Before, a coin you just added showed
  nothing for up to two minutes, feeds up to five and releases up to half an
  hour. Before you save, the widget says to save the board instead of
  sitting blank.

## 1.10.0 (2026-11-12)

- **Settings, Devices:** every wall tablet, e-ink panel and family phone in
  one place. Pick a device to set the page it opens on and the pages it
  swipes through, in order, with Edit board beside each board; its screen,
  night dimming and Monitor colors; and its theme, mode, density, time
  format, temperature, language, region and currency. The device follows
  within a second, and a device can be renamed or given a new link.
- **Settings, sorted:** time format and temperature moved to Language and
  region under Look, beside the rest of the region. The Name shows it applies
  to every device. Connections' Apps part is now App catalog, so it isn't
  mistaken for the Apps page. On a phone, the six tabs sit in two rows.
- **Cameras on a compact tablet:** a camera opened full screen fills the
  screen at Compact and Large density too. Five other full-height panels got
  the same fix.

## 1.9.4 (2026-11-12)

- **Wall boards on a swipe:** a household device fetches every board's layout
  before it draws the pages out of sight, so the next page shows as a wall
  board straight away. Before, it could flash the top bar and board tabs for
  half a second.

## 1.9.3 (2026-11-12)

- **Faster swiping on wall tablets:** a household device draws each of its
  pages once and keeps them, so a swipe shows the next page instead of
  building it. On a Fire HD 8, going between the Monitor and a board took
  over two seconds. While you drag, only the page showing moves.
- **Swipes on a busy tablet:** a quick flick counts by when your finger
  moved, so a slow page no longer drops it.
- **Updating Patchboard from the UI:** after the update hands off, the sheet
  says Patchboard is restarting and loads the new version when it's back.
  Before, the Update button came back as if nothing had happened. Patchboard
  also checks for a newer image of itself every hour, up from every six.

## 1.9.2 (2026-11-12)

- **Cameras full screen:** tapping a camera fills the screen with it, black
  around the picture and nothing cut off, on a wall tablet as on a desktop.
  A tap on the picture closes it.

## 1.9.1 (2026-11-12)

- **Smoother swiping on wall tablets:** the page leans with your finger as it
  moves, boards you've seen draw at once, and a tablet fetches all its pages
  ahead, so the first swipe is as quick as the rest. The touch that ends a
  swipe no longer opens a preview or link underneath, and long-press menus
  stay out of the way.
- **Large camera frames:** the Cameras widget can show its frames as big as
  the card allows, without today's detections. The wall cameras board starts
  that way.

## 1.9.0 (2026-11-12)

- **Scan to join:** a new household link comes with a QR code, so a tablet
  or phone opens it with its camera instead of someone typing it.

## 1.8.1 (2026-11-12)

- **Sign-in never falls open:** `AUTH=Password` or a password set without
  `AUTH` used to leave Patchboard with no sign-in. Now `AUTH` reads in any
  case, a password turns sign-in on by itself, and a value Patchboard
  doesn't know stops it from starting. With sign-in off, a visitor from the
  internet puts a warning at the top of Needs attention.
- **Keys stay with their servers:** pointing an integration at a new address
  asks for its key again, and a key an API widget uses goes only to the
  server it was first sent to. Keys typed into an app's live number move to
  the key store, as they already did on boards.
- **Stricter single sign-on:** `OIDC_ALLOWED` matches an email only once the
  provider has verified it, and takes typed entries (`email:`, `group:`,
  `user:`, `sub:`) so a username can't pass for a group. An empty list
  shows a warning until you fill it or set `OIDC_ALLOW_ANYONE=1`.
- **Sign-in behind a tunnel:** wrong passwords count per visitor, not per
  proxy, so a stranger can't lock you out; failures from many addresses
  slow every try instead. Settings' current-password check counts the same.
- **Household devices:** a panel picture gets its own address, which can't
  join as a device; a signed-in browser asks before becoming a household
  device; and household devices no longer receive the inbox.
- **Logs:** passwords, keys, cookies and tokens in more spellings are masked.

- **Safer to trust:** release images now carry a signed record of how they
  were built and a list of what's inside them, and GitHub's code scanning
  reads every change. Report a security problem privately from the
  repository's Security tab.

## 1.8.0 (2026-11-12)

- **Français:** Settings, Look, Language switches the boards, the wall
  screens, the Monitor, the navigation and the Home header to French, with
  dates and numbers written the French way to match. Settings and the
  problem titles the server writes stay in English for now. Another language
  is one file in `web/i18n`, and a check in CI catches any string it misses.

- **A picture for panels with no browser:** a TRMNL, an Inky or an ESP32
  e-paper screen can show the server as a one-bit PNG or BMP: the status
  and what needs you, the weather, and CPU, memory and the pool. Make a
  household device for it and Settings shows the picture's address beside
  the link; `?w=` and `?h=` set the size. It's drawn on the server in a
  bitmap font, with nothing added to the image.

## 1.7.0 (2026-11-12)

- **Wall tablets swipe between pages:** give a household device more pages
  in Settings, next to Opens: the Monitor, any board, Server, Weather. A
  swipe or an arrow key moves between them, dots show where it is, and it
  can turn them by itself every 30 seconds to 10 minutes, waiting three
  minutes after anyone touches it.
- **Boards for the wall:** New board offers five layouts made for a screen
  on the wall: clock and weather, markets, house, cameras, and media. A
  board set For a wall screen trades the header for one status line and
  drops the tabs; on a household device the navigation goes too.
- **Markets:** coins, stocks, funds, indexes and currencies, each with its
  price, the day's change and a line of the day. Write `BTC`, `AAPL`,
  `^GSPC` or `EUR/USD`; no key needed. Big numbers draws a tile for each.
- **Sun and moon:** sunrise, sunset, how long the day is and how it changes
  tomorrow, and tonight's moon, from the weather's place.
- **Countdown:** days until the dates you name; a date without a year comes
  round every year.
- **Big clock:** Clocks can show your own time and date large, for across
  the room, with other places underneath.
- **E-ink:** set a household device's Screen to E-ink in Settings, or turn
  on E-ink under Look on any browser. The page goes black on white with no
  motion, problems show as a solid square or a ring as well as by color,
  photos turn gray, and what changes is drawn once a minute instead of
  flashing the panel all day. The Monitor gets a paper version and drops
  its seconds.
- **Region:** Settings, Look sets how dates, times, numbers and prices are
  written, from 28 regions, and the currency for prices. It follows the
  browser until you pick, and 24-hour time now starts on where the browser
  uses it. On the hour, a 24-hour clock reads 21:00 instead of 21.

## 1.6.1 (2026-11-12)

- **Wall tablets pick up updates:** after you update Patchboard, a household
  device loads the new version by itself. Before, it reconnected but kept
  the old page, so a new setting such as the Monitor's Color did nothing
  until someone reloaded it by hand.

## 1.6.0 (2026-11-12)

- **Showcase mode:** before you share a screenshot, turn it on in Settings,
  Look. Addresses, domain names, email and MAC addresses become made-up ones
  that read like real ones, camera pictures blur, and you list the rest
  (your server's name, family names, your town) for stand-ins. It covers
  every page and widget, and fields you type in keep their real values.
- **Wall tablets dim at night:** pick night hours for each household device
  in Settings, next to Opens and Monitor color. The screen darkens through
  them, and a tap brightens it for two minutes without pressing anything
  underneath.

## 1.5.0 (2026-11-12)

- **Monitor in color:** a third Monitor color in Settings, Household
  devices. Each part of the server gets one cool hue (blue CPU, violet
  memory, cyan network, ice storage) on a near-black that suits a tablet
  screen. Amber and red stay the only warm colors, so trouble still stands
  out from across the room, colorblind or not.

## 1.4.0 (2026-11-11)

- **Remote control for household devices:** in Settings, Connections,
  Sign-in and keys, set where each device opens (Home, any board, Monitor,
  Server, Upcoming, Reading or Weather) and the Monitor's color, gray or
  blue. The device follows within a second, with nobody touching it, and
  opens there again after a restart.
- **Lighter on open screens:** a source whose data didn't change since its
  last poll isn't sent again for a minute, so a tablet on the wall, or any
  tab left open, redraws only when something moved.
- **Monitor on a big screen:** on a TV or a large monitor, labels, numbers,
  lines, squares and bars all step up, so it reads from across the room.
- **Monitor:** the network tile shows the latest recorded reading while
  TrueNAS's live feed reconnects, instead of a blank.

## 1.3.3 (2026-11-11)

- **Monitor feed:** lines from before today show their day ("tue 22:13"),
  and apps that log JSON, such as autobrr, show their message instead of
  the raw line.
- **Monitor, no cut rows:** busiest now, needs you and updates waiting show
  only rows that fit whole. With room for none, the block hides, heading
  and all.

## 1.3.2 (2026-11-11)

- **Monitor feed:** Unpackerr's status line ("0 failed") no longer counts as
  an error, and Immich lines lose their own date prefix like the rest.
- **Monitor fills the screen:** the left column ends with the busiest
  containers right now, the middle with what needs you and the containers
  waiting for an update. Each shows as many rows as fit, and the last one
  fades instead of being cut in half.

## 1.3.1 (2026-11-11)

- **Monitor:** quiet grays now carry everything healthy, so only amber and
  red stand out. CPU and memory waffles and the CPU week sit together on the
  left, backups, cloud sync and the fleet in the middle. Uptime ticks by the
  second, the network line starts with two hours of history, and the pool
  shows its last 30 days.
- **A calmer feed:** the same message from the same app shows once, with a
  count, and apps' own dates, levels and process numbers come off the front.
  A Python crash counts once, by its last line, and errors named like
  `ConnectionError` count as errors.
- **Fixes:** Jellyfin 10.11's live playback works again: Patchboard sends
  its key the way 10.11 expects, which also stops "Token is required" in
  Jellyfin's log. Goodreads, Patchboard and Tailnet keep their capital
  letters in setup messages.

## 1.3.0 (2026-11-11)

- **Monitor:** the server on one full screen for a tablet on the wall, at
  `/monitor`. CPU, memory and network draw live lines, and CPU and memory
  also fill a hundred squares each. Every container, backup night and disk
  gets its own square or bar, beside the CPU week. A feed down the side shows
  container events and the warning and error lines from every log. Household
  devices see it too, and get only those masked problem lines.
- **Signing out:** Settings, Connections, Sign-in and keys has Sign out of
  this browser. Opening a household link signs that browser out too, so a
  wall tablet never keeps full access underneath.
- **Server at a glance:** long container names in Busiest containers give
  way instead of pushing the numbers off the edge, and TrueNAS alerts match
  the rest of the page. A household device no longer shows All stacks.

## 1.2.1 (2026-11-11)

- **Server at a glance:** on a short landscape screen, such as a wall tablet,
  the Server page packs into three tight columns and fits without
  scrolling: storage, datasets, backups, cloud sync, resources, the busiest
  containers, disks and the CPU week.

## 1.2.0 (2026-11-11)

- **Household devices:** a link for a family phone or a wall tablet, made in
  Settings, Connections, Sign-in and keys. Open it once and that device sees
  the boards, cameras, the Server page, reading and calendar, and switches
  the lights and scenes pinned to a board. It gets no update, restart or stop
  buttons, no Settings, logs or container pages, and the server refuses those
  from it too. Remove a device and its link stops working.

## 1.1.3 (2026-11-11)

- **Logs:** apps that color their output, such as Immich, read as plain
  text instead of showing terminal codes.
- **Jump to:** an action matches on its container's name, so "son" finds
  Sonarr's actions and not "Stop nextcloud".
- **Reading:** cards skip feed boilerplate, such as Hacker News link lines
  and affiliate notices, and keep paragraphs apart.
- **Under the hood:** TypeScript 7, cross-env 10, and patch updates to Hono,
  Vite, Playwright, concurrently and ws.

## 1.1.2 (2026-11-10)

- **Fixes:** the board tabs on a phone scroll only sideways, so a swipe
  down the page no longer catches on them. Browsers fetch the icons and
  install files again after an update instead of showing last release's
  copy.
- **App icon:** Dark is the default, and reads on light and dark home
  screens. A phone in dark mode could darken the Light icon until its P
  disappeared.

## 1.1.1 (2026-11-10)

- **New app icon:** a P with a blue tab, in dark and light, on the browser
  tab, home screens and the install prompt. A phone that already added
  Patchboard keeps the old icon until you add it again.
- **Home's foot:** your version on the left; Edit header, Arrange board and
  New board together on the right. On a phone, the version takes its own
  line.
- **Leaner examples:** examples/ holds the plain compose file and a
  hardened one. CONFIGURATION.md covers mounts, host networking for
  Wake-on-LAN, and HTTPS for the phone app. Import from Homepage in
  Settings replaces the command-line importer.

## 1.1.0 (2026-11-10)

- **Version and updates on Home:** Patchboard's version sits beside Header
  settings. When a newer release is out it reads "Update to v1.2.0" and
  opens what each release changed, with Update right there. After you
  update, it shows what's new once.
- **Accessibility:** hold-to-confirm buttons work with screen readers,
  voice control and switches (press twice). Single-key shortcuts can be
  turned off in Settings, Look. Focus stays put after you move or remove a
  widget, open an article or press a busy button. Failed backup nights are
  named in words, and form fields have edges you can see.
- **Security:** Reading fetches pictures only from public addresses,
  checked as each connection opens, including addresses written as IPv6.
  The API widget refuses metadata addresses however they're written, and
  feed downloads stop at 1 MB.
- **Look:** app icons show their own colors by default, and an app with a
  problem shows its name on Home's icon rack. Paper's accent is slate blue,
  apart from its amber warnings, and the accent presets drop green, rose
  and sand, which read as ok, down and warning. Floating panels share one
  shadow, and a chosen sort or filter is edged in the accent.
- **Fixes:** Reading's Mark all read no longer covers the sort buttons.
  Lists in articles, runbooks and release notes show their bullets again.
  Jump to opens an app's page on Enter instead of restarting it. A fresh
  install draws no empty cards, and Add all leaves Patchboard itself out.
- **Faster first load:** about 30 KB smaller; the update notes load when
  you open them.

## 1.0.0 (2026-11-10)

The first public release.

- **Home:** what needs you, the server, your apps,
  what's playing, the week's releases, your reading and what changed, fitted
  to one screen. Add boards for the TV, the rack or the house, on 2 to 6
  columns, each widget sized and placed by dragging.
- **Live playback and cameras:** Jellyfin, Emby and Audiobookshelf push playback as
  it happens; Plex (through Tautulli) and Navidrome poll every 5 seconds while
  something plays. Camera frames refresh while on screen, and a tap opens
  one live.
- **Container pages:** each container has a page with its alerts,
  runbook section, live logs, a 30-day health strip, and restart, update and
  roll back. Jump to (Ctrl K) reaches any app, page or action.
- **Setup in the browser:** add every running container in one click,
  connect any of 68 integrations from Settings with keys encrypted on the
  server, or import Homepage's `services.yaml`. Environment variables and
  `services.yaml` keep working underneath.
- **Alerts** through ntfy, Gotify, Pushover, Discord, email or a
  webhook when a problem lasts two minutes, and again when it clears.
- **Themes:** five themes in dark and light plus a custom one, accent
  colors, three densities, a phone layout with a tab bar, and an installable
  app with its own icon.
- **Security:** sign in with a password, OIDC or your reverse proxy; a
  read-only mode; an activity log of every change; a strict Content Security
  Policy. Your browser talks only to Patchboard: icons, posters and article
  pictures all come through it.
- One container, about 50 MB of memory, for amd64 and arm64, plus a slim
  image without the Docker CLI.
