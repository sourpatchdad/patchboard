# Changelog

## Unreleased

- Fixed: Forward to a page you'd left at its top opened it partway down.
- A container you stopped from Patchboard is read as "stopped from
  Patchboard", not as a job that runs on a schedule.
- Moving to another page puts focus on its heading, so screen readers
  announce the new page.
- An update waiting reads in neutral text: color stays for trouble. A
  paused download's bar is quiet, not amber. Update locks while a start,
  stop or restart is on its way.
- Integration setup marks the empty fields when it asks for them. Edit
  apps names each group's field by its group; the Apps filter has a name
  and doesn't open the keyboard on a phone. The demo's restarts finish.

- Fixed: opening Patchboard fresh could land partway down the page, at
  where the previous full load was left. Only Back and Forward restore a
  position now.
- A container you stopped from Patchboard reads as stopped on purpose
  everywhere: its app icon and tile go dark instead of red, and a page with
  only notes says "One note below, nothing urgent" instead of "Everything
  is running".
- Jump to finds words in any order ("sonarr restart"), ignores letters
  scattered across a name, starts empty each time, and with nothing of
  yours matching selects nothing, so Enter can't send your words to a
  search engine.
- Integration setup: a failed test puts focus on the first empty field, or
  back on Test. Arrange board opens without scrolling the board away.
  Changing Settings tabs drops a Connections part from the address.
- Smaller: a stopped container's Logs links to its page to start it; the
  Trakt section is Signed-in accounts; the container page's log preview is
  one log to screen readers; Not found names itself in the tab; the
  playback details' Close is a full-size target.

- Edit apps moves focus to its toolbar only when focus had nowhere else to
  go, so it never pulls focus from a field or menu you've already moved to.

- Back and Forward return to where you were on the page; a new page starts
  at its top, and a sort or filter change stays put. Settings tabs are
  steps in history, so Back leaves Connections for the tab before it.
- Settings, Connections, Integrations is two columns that stand on their
  own: opening a setup form grows only its column.
- Focus after actions: a container's state line holds focus when its
  buttons swap, Approve and Decline move focus to what happened, and
  Cancel or Discard in Arrange board returns it to Arrange board.
- Logs lights each container by its problem's tone. Changes greys a stop
  that's over once the container runs again.
- Mark all read is a press-and-hold, like the other changes you can't take
  back in one tap. Jump to on a phone has a Cancel.
- The Server page's heading is Server, with the machine's name under it.
  Log times follow the Time format setting. Settings tabs announce
  selected rather than pressed.

- Fixed: in the two minutes after a stop, before Patchboard settles on it,
  a container with no recorded history showed every watched day as down.
  A stop not yet settled counts from when it began.
- Logs treats a container you stopped from Patchboard as stopped on
  purpose: a dark light, below real problems in Problems first.
- Screen readers: each Approve, Decline, Search, Try another release, Add
  and Show button names its title or app; Upcoming's days are read in full
  ("Monday, November 9 (2 releases)"); an integration test's result is
  announced.
- Saving Arrange board returns focus to Arrange board. On a phone, a
  container's buttons keep their own row while its state line changes.
  Audiobookshelf and Navidrome in Right now link to their apps, like Plex
  and Jellyfin. A hold button showing its hint drops the tooltip that
  repeated it. The weather advisory says "until" once. A missing page
  names itself in the tab. Jump to matches articles and mail by their
  words, and lists ties A to Z.

- Fixed: stopping a container from Patchboard painted its whole health
  history red. Stops and starts are recorded again; Changes still shows
  one line for each.
- A container you stop from Patchboard is a note in Needs attention ("You
  stopped it from Patchboard"), not an outage, until it runs again. An
  update starts a stopped container, as compose does.
- Keyboard: Enter on a playing item takes focus into its details; Settings
  tabs move with the arrow keys, Home and End; Edit apps puts focus on its
  toolbar.
- Logs' Problems first ranks what Needs attention flags too, such as an
  app not answering or a camera offline. A running container's line reads
  "Up 6 days".
- Integration setup: one Close (the row's) and a Cancel in the form, the
  variable name describes its field for screen readers instead of being
  part of its name, and a button that can't be pressed looks it.
- Right now's download heading no longer contains its Pause button. Widget
  settings put Column after width. On a phone, an app row stays inside its
  card while arranging. "Less than a second" reads "under a minute".
- Demo: the day's low matches the hourly line, a crashed Unpackerr's logs
  end on its error, and no warning on first load.

- Saving a board pins each card to the column it's shown in, so what you
  arranged is what stays: a card no longer hops columns when a neighbour
  grows or shrinks with live data, such as a paused download client.

- Fixed: Tab got stuck on Right now. Focusing a playing item opened its
  details and pulled Tab into them; now Enter or Down opens them and Tab
  always moves on.
- An update clears its "Update available" mark as soon as it finishes.
- Arrange board's Cancel becomes a held Discard changes once you've
  changed something; changing columns keeps your place on the page.
- Add widget: Down from the search moves into the list. Integration setup
  opens on its first field, and a test refused for a missing field doesn't
  make the next one wait.
- Screen readers: Upcoming's days are headings one level under the page,
  read as "Wednesday, 2 releases"; Edit apps names each Hide and Remove
  button by its app; Jump to's "Nothing here matches" is a note, not an
  option.
- Smaller things: a busy hold button drops its tooltip, a widget's Column
  setting sits as a field, the narrowest phones show the header's server
  numbers two by two, Reading's sort row lines up and its categories fade
  where they scroll, and the header date has a full tap area. Demo apps
  write their own kind of logs.

- Fixed: tapping a hold button once, then holding it, failed: its hint is
  wider than its label, and the label changing under the finger ended the
  hold. A hold now keeps the pointer until you let go.
- Hold buttons show a short track under the label, a quarter lit, in place
  of the ring that looked like a loading spinner.
- A container stopped with Docker's stop signal (exit code 143) reads
  "Stopped, cleanly" everywhere; 137 reads as killed when it didn't stop in
  time. A container page's logs reconnect when it starts or stops, and its
  buttons lock while an update or an action is in progress.
- Downloads groups each client's items under it, names every button by its
  item ("Pause The.Bear..."), and says what Remove removed.
- Widget settings say when Fit the window is showing fewer items than set.
  Width buttons have full names for screen readers.
- Every page names itself in the tab title ("Stacks - HomeNAS"), Home
  has a page heading for screen readers, and app groups sit one level
  under the page's heading.
- Focus stays put: Escape from an article in Reading and opening Edit apps
  no longer drop focus. Settings, Connections's parts look like the other
  Settings tabs.

- A stopped container shows its last lines with "It stopped here", where
  it used to say "No output": every line now reaches the page before the
  stream closes. A stopped container leads with Start.
- Right now says "1 more on Plex" when Fit or a limit hides rows, as a link
  to the app.
- Every Needs attention item is a link; a camera offline or a stuck import
  opens its app's page when Patchboard doesn't know the app's address.
- Activity reads as sentences with their subject: "approved Poor Things",
  "removed the download The.Bear...", "saved the settings for Emby".
- Integration setup names the fields it needs ("Fill in the address and
  API key first"), not environment variables. Each Settings and Set up
  button names its integration for screen readers, Escape closes an open
  panel, and the address placeholder is an example, not a port.
- Reading: Previous, Back to the edition and Next under every article, and
  Escape goes back. The Reading card's link says Open Reading.
- Arrange board: focus lands on the board's name, a new widget is scrolled
  to and focused, and on a phone the bar no longer covers the last cards.
- Jump to opens on the views, finds every Settings tab, and only ranks a
  container in trouble first once you type.
- This week and Upcoming count the same way: the next seven days, a season
  drop once. Weather is back in the phone's More.
- Settings shows Update only when there is one, or when Patchboard can't
  tell. Selected buttons are filled, so they never look merely focused.
  Grayscale icons stay visible in light themes; the header weather's small
  lines are 12px; a phone's app rows fade at the edge that scrolls.

- Reading's article view has Keep unread, beside Open original: the
  article goes back to unread in Miniflux and stays that way while you're
  on it.
- Widget settings say when a value can't be used: an item count outside
  its range, or feeds, places or projects with nothing usable in them.
- Arranging on a phone takes one short bar (name, Tools, Cancel, Save);
  the rest of the tools open from Tools, so the board stays in view.

- Settings, Connections is four parts instead of one long page:
  Integrations, Sign-in and keys, Apps, and Backup. Links to an
  integration's setup or to the Homepage import still land in place.

- Approve and Decline say what happened ("Approved Poor Things. It's on
  the way.") and the approved title joins On the way at once.
- Changes shows one line for a start or stop sent from Patchboard, not
  two.
- Jump to asks with a second Enter instead of a browser dialog, puts a
  container that's down first, and says "Nothing here matches" before
  offering a web search.
- Add widget has a search box: "plex", "disks", "cameras".
- Hold buttons carry a small ring that says press and hold before you
  try. Widget settings in Arrange close with a Done button. On a phone,
  where the board is one column, cards move with up and down arrows.
- A download client you paused shows a dark light; amber stays for stale
  data. Mark all read's question stays on one line.

- Start, Stop and Restart show their progress: the state line says
  "Starting..." with a pulsing light until Docker reports the change, or
  says plainly if nothing changed after 30 seconds. A container that just
  started says so.
- Jump to runs actions by name: "Restart sonarr", "Stop plex", "Start
  unpackerr". Stop and restart ask first.
- Help in the top bar on wide screens: guides and every keyboard shortcut.
  "." opens the worst thing that needs you.
- Hold buttons say "Hold to restart" when you point at them, before you
  press.
- On a touch screen, apps shown as icons carry their names, since there is
  no hover to show them.
- On a phone, the header's server numbers sit in one row, and a container
  with a problem and a runbook shows the runbook before the logs.
- Reading lives at /reading; /feeds still lands there. Stacks says
  "Stopped (error 1)" instead of Docker's "Exited (1)". Arrange board says
  "A little too tall to fit" instead of a pixel count. First run counts the
  containers that look like apps out of all of them.
- Fixed: on a phone, tapping "3 more" under Needs attention opened the
  backups page, because the link below it had a tap area that reached up
  over it.

- One status light across Patchboard: a light in a patch-panel socket, the
  socket the patch-bay launcher uses. Every board widget wears one before
  its name, showing its integration's health, or for a widget built from
  several, whether Patchboard is live; a dropped connection turns the board
  amber at once. Right now, Changes, Logs and a container's state use the
  same light. Healthy glows quietly; amber and red still mean trouble.
- On a phone each app group in the patch bay is one row you swipe
  sideways, so a big launcher takes a few rows instead of a screen.

- A widget whose integration fails says what broke, in words a phone can
  read ("Miniflux: Timed out after 8s"), and links to Check the
  connection in Settings.
- Settings opened from a widget have Cancel and Save. Escape or a click
  outside throws the change away.
- Leaving the page or switching boards with unsaved arranging asks first.
- Reading sorts with the same buttons as Logs and Stacks: Newest, Oldest,
  Quick reads.
- Help sits where you look for it: in Jump to (a tour, setting up
  integrations, keyboard shortcuts), in the phone's More, and beside the
  version in Settings.

- Cameras: a widget for Frigate. Each camera's newest frame, refreshed
  every 20 seconds, with Offline when one stops; tap for its live view in
  Frigate. Cameras that detect add today's people, cars and animals, with
  a thumbnail each, opening in Frigate's Explore. Pick which cameras in
  the widget's settings. Pictures come through Patchboard, so the browser
  never needs Frigate's address.
- Requests lists approved requests still on the way, each linked to its
  page in Overseerr or Jellyseerr, and stays on the board while any are.
- An empty widget opens its own settings: "Pick lights, switches and
  scenes", "Add places", "Add feed addresses". Closing them saves the
  board; no trip through Arrange.
- The Home Assistant picker keeps what you ticked at the top, filters by
  kind (lights, switches, scenes and more), and says when a search shows
  80 of more.
- Right now drops "Nobody is watching Jellyfin" while Plex or anything
  else is playing; the idle line shows only when nothing plays.

- Five widgets that need no integration. Bookmarks puts your links on the
  board; they were only on the Apps page before. Search sends words to
  DuckDuckGo, Google, Bing, Kagi, Startpage or a site you name. Clocks shows
  the time in the places you list, with the day when it differs. Feeds
  reads any RSS or Atom feeds, fetched by the server every 15 minutes
  through the same address fence as API numbers. Releases shows the newest
  GitHub release of the projects you follow. Widget settings take these as
  text, checked when the board is saved.
- The header's toggle says what it hides: "2 more, 1 note" instead of
  counting quiet notes as problems.
- On a phone, Apps takes Reading's tab until Miniflux is set up.
- Remove, Stop and the other hold-to-confirm text buttons read red before
  you touch them, so they no longer look like Pause.
- A container page has one link to its full logs, called Full logs.
- Stacks counts the same way in every group: "3 running", or "7 of 8
  running" when something is down.
- The smallest labels (hourly weather, pills on a phone) grew to 11px.
- On a phone, More sits at the end of the tab bar and opens every other
  page and Settings. Reading keeps its tab once Miniflux is set up;
  Upcoming holds it until then.
- On a touch screen every button, chip, field and link is at least 44
  pixels to tap, including hold buttons like Pause and Remove.
- Settings in the top bar is a word on a wide screen, not a lone icon.
- Logs show each line's time where you are. The app's own timestamp,
  often in UTC or the container's zone, moves to the hover.
- Customize marks what shows with a tick, and what's hidden fades.
- Reading's feed, time and order menus share one row (two on the
  narrowest screens); on a phone the categories scroll sideways so the
  articles start higher.
- The two otter settings say which is which: "Otter beside the name" for
  the header, The otter section for calm screens on this device.
- Subheadings in panels and drawers stand out from the text under them.

- Watched, a new widget: what was played lately on Plex, Jellyfin and Emby,
  newest first, with who and when; each opens in its app. Listening, a new
  widget: Audiobookshelf books in progress with how far along, and albums
  played lately on Navidrome. A media server's page shows how big its
  library is. History and counts refresh every few minutes, not every poll.

- Nothing hides behind an ellipsis any more: episode titles and grouped
  seasons in This week, article titles in Reading (two lines), release
  names in Downloads, host names in Docker hosts and Network, and drive
  models on the Server page wrap instead of being cut. Docker hosts gives
  names the wide column it was meant to have. Upcoming starts today, so two
  weeks fit in two rows with no empty past days. The Search button in This
  week sits in the source column and keeps the row's alignment.

- Downloads, a new widget: every unfinished download across your clients,
  with Pause, Resume and Remove for each qBittorrent torrent (the files
  stay) and Limit speed for its alternative limits, plus whatever Sonarr or
  Radarr is stuck on, with why and Try another release, which blocklists it
  and searches again. With it on the board, Right now leaves downloads to
  it. This week has Search for an episode or film that is out and still
  missing, and Sonarr's and Radarr's pages search for everything missing.
  Declining a request is a press and hold.

- Updates: two quick clicks on Update start one update, not two. Roll back
  appears only once the container was recreated, since a failed pull
  changes nothing, and it is a press and hold like Stop and Restart. When
  Patchboard finds a newer image of itself, the link opens the commits
  behind edge or dev, or the release notes for a version.
  A waiting update shows under the container's state, with What changed
  and Dismiss, and its Update button stands out; without one it stays
  quiet. The Stacks updates view updates each container from its row.
  Settings says whether Patchboard is up to date, has Check now, and
  updates it in place. When it can't check, such as for a private image,
  it says why instead of staying silent.
- Notifications: each channel keeps its own record of what it sent. One
  that fails, such as a deleted Discord webhook, retries on its own and
  catches up when it's back; the others never repeat a message. A channel
  that keeps failing logs its error once.

- Enlarged text no longer overlaps in Home weather, Reading metadata or
  calendar times. Calendar rows share expanding time and source columns.
  Browser checks now exercise actual 200% and 400% zoom, reachable editor
  actions and a 24px minimum font without changing saved boards.

- Usage and playback bars now expose names with their percentage values.
  Empty charts announce when history is unavailable. High-contrast palettes
  retain usage bars, memory segments and the boundaries of Home header cards.
  CI checks accessible names, landmarks, narrow reflow and high-contrast graphics.

- Release tags must match the package and both lockfile versions, with one
  exact changelog section containing release notes. This preflight runs
  before publishing images, and the release page uses the same validated
  notes rather than a loose version-pattern match.

- App editing, page customization, Homepage import and keyboard help now
  contain keyboard focus, close with Escape, and return focus to their
  opener. Background scrolling is locked without shifting the board.
  Form errors are announced, keyboard help has a visible Close button, and
  importing a setup file works from the keyboard.

- Status, server details, and time with weather now use matching header
  cards with aligned top and bottom edges. Time and weather are centered
  together inside one card, with a single outer edge and no nested box.
  The quiet status stays on one desktop line and the compact height is kept.

- The default header uses full server graphs in a shorter card, a quiet
  status line that fits on one desktop line, and time and date stacked
  above weather. Existing numeric header preferences adopt this layout;
  explicit off choices stay off. New boards avoid duplicate Server cards;
  saved boards stay intact.
- Header settings and Arrange board name their separate jobs. Settings,
  Home starts with four header on/off switches; sizing and forecast detail
  live in a secondary disclosure. Appearance export lives in Look and setup
  backups in Connections.
- Editing outlines leave clear gutters between cards. Resize handles show
  on the active card. Reading and This week use steady row baselines and
  close-height neighboring cards align when there is room.
- An unreachable integration leads with “Can't reach Nextcloud.” rather
  than “Nothing wrong.” The attention card also names the connection issue.

- Fit can shrink poster artwork after trimming vertical lists, preserving
  each cover's proportions and every item in the full horizontal row.

- Board dragging places a card in a column and above or below its neighbors,
  with a live layout preview. Columns stay where you place them after Save,
  with automatic clamping on narrower screens. Existing boards keep their
  arrangement until you move a card. Widget settings also offer a Column
  picker for keyboard placement.

- Arrange board preserves fitted item counts, full card heights and the visible
  widget set. Its controls float over the board and its arrange bar stays
  at the bottom, so entering edit mode no longer repacks the layout.
  Needs attention settings remain available without inserting a placeholder
  card. Fit keeps useful height savings even in widgets with large headings.

- Reading counts use locale grouping throughout navigation, Home and the
  reader: 1,006 unread instead of 1006. Shared plural counts do the same.

- Fit reserves the actual space for Arrange board and New board, responds to
  Welcome and board-tab changes, and tightens Right now's source spacing.
  Small remaining overflows are explained in Arrange board. Saved boards and
  full horizontal poster rows stay intact.
- Board drawers and Jump to contain keyboard focus, close with Escape and
  return focus to their opener. Background controls are unavailable while
  a drawer is open. Board names and search have screen-reader labels;
  Skip to content bypasses navigation.

What's in Patchboard:

- **Home** has a compact graphical header by default: status beside CPU
  history, memory, storage and uptime, with time and date above weather.
  Header settings leads to four per-device on/off switches in Settings,
  Home; sizes and forecasts are secondary choices. Existing saved boards
  stay intact. Below the header, arrange apps with live numbers, Right now,
  This week, Reading, mail, changes, recently added and more.
  The board starts right under the header; Arrange board waits at its foot.
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
  When an integration is unreachable, Home names the connection problem
  directly, without an all-clear lead-in. A board saved on one device
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
