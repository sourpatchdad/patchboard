# Security

Patchboard reads your server and can act on it. Read this before you expose
it anywhere.

## What it can do

- **Read:** container state, stats, logs and inspect data through the Docker
  API (never containers' environment variables), host CPU and memory,
  read-only mounts of notes and logs, and the APIs you connect. When you
  press Connect for me on Sonarr, Radarr, Lidarr, Readarr or Prowlarr, it
  also reads that one app's `/config/config.xml` through Docker's archive
  endpoint, and only from a running container whose image or name is that
  app.
- **Change:** start, stop, restart, update or roll back a container; save the
  board, the app layout and page settings; store keys you paste; sign in to
  Trakt. With those integrations on: pause, resume or remove a download (its
  files stay) or pause a whole client, turn qBittorrent's speed limits on or
  off, try another release or search in Sonarr and Radarr, toggle the
  Home Assistant lights and scenes you pinned, set a pinned thermostat
  within its own range, open, stop or close pinned blinds and shades (never
  a garage door, gate or door: the server checks the cover's class with
  Home Assistant first), add to or tick off a pinned to-do list, mark a
  chore done, wake a machine you listed,
  pause Pi-hole or AdGuard Home for at most an hour, approve or decline
  a waiting Overseerr request, and, through Tessie, lock or unlock the car,
  open its frunk or trunk, open or close its charge port, start or stop
  charging, set its charge limit, turn its climate or Sentry on or off,
  flash its lights or honk. Each is a POST with the action header, and
  each lands in the audit log. The car's commands are held to confirm,
  only for a car Tessie listed, and never from a household device.
  Unlocking it and opening its frunk or trunk also need sign-in: with
  `AUTH=none` the server refuses them, so an address anyone can reach
  never lets someone into the car.

## Three choices when you deploy

### Who can reach it

| `AUTH` | Use it when |
|---|---|
| `none` (default) | Only you can reach the address: Tailscale, or a LAN you control. On a shared network, publish the port on a private address only, such as `"100.64.0.5:3200:3200"`. |
| `forward` | A reverse proxy (Authelia, Authentik, Cloudflare Access, oauth2-proxy) signs people in and passes the user in `TRUSTED_USER_HEADER`. Bind Patchboard to `127.0.0.1` or a network only the proxy shares, or anyone can send that header. |
| `oidc` | You have an identity provider: Authentik, Authelia, Keycloak, Pocket ID, Zitadel, Google. Patchboard uses the authorization-code flow with PKCE and checks the ID token's signature, issuer, audience, expiry and nonce. Set `OIDC_ALLOWED` to who may sign in: `email:you@example.com` (or a bare address) matches an email your provider has verified; `group:admins` (or a bare name) a group or the provider's own user id; `user:name` a username, only where people can't pick their own. Without it, anyone your provider signs in gets in, and Needs attention says so until you list people or set `OIDC_ALLOW_ANYONE=1`. |
| `password` | You have no proxy or provider. Turn it on in Settings, Connections, Sign-in and keys, which stores a salted scrypt hash, or set `PATCHBOARD_PASSWORD` (which turns password sign-in on by itself). A new password signs out every other device; changing or removing it needs the current one. Sessions use random 256-bit tokens in an HttpOnly, SameSite=Strict cookie, stored hashed, for 30 days. After five wrong tries, Patchboard locks that address out for a doubling wait, up to 15 minutes. Behind a tunnel or proxy on your network it counts each visitor by the address the proxy passes on, so a stranger's guesses never lock you out, and recent failures from anywhere slow every new try. The current password asked for in Settings counts the same way. |

With sign-in on, webhooks send `HOOK_TOKEN` as `Authorization: Bearer <token>`
or `?token=`. Turning on a password in Settings generates one.

OIDC sessions use the same hashed tokens with a SameSite=Lax cookie, so the
cookie arrives on the redirect back from the provider. Changes still need the
`X-Patchboard` header, which other sites can't send.

### Whether it can change anything

`READ_ONLY=1` refuses every change for everyone and hides the controls.
Marking articles read still works.

For one device instead of everyone, make it a household device: Settings,
Devices, Make a link, then open the link once on that phone or tablet. It
sees the boards, cameras, the Server and Monitor pages, reading and
calendar. It can switch the Home Assistant lights and scenes pinned to a
board, set a pinned thermostat, move pinned shades, keep a pinned to-do list
and mark chores done. Locks, garage doors and alarms stay read-only to it,
as to everyone. From the logs it gets only the Monitor feed: warning and
error lines, masked like every log line, at most twelve a minute from each
container. The server refuses every other change from it, and refuses the
reads meant for you: logs, container pages, settings, keys and the activity
log. A route added later stays closed to it until it's allowed
by name.

The link is the credential, and it signs the device in even when sign-in is
on, so send it only to the device it's for. A browser that's signed in asks
before it becomes a household device, so a link someone sends you can't
switch yours. A household device never receives your inbox.

Patchboard stores the hash of a device's link (SHA-256) and keeps the link's
token in an HttpOnly, SameSite=Lax cookie for 400 days. Settings, Devices
sets each device's pages, Monitor color and look; the device follows at
once, and no other browser hears about it. New link there retires the old
link, and Remove ends the device on its next request. With sign-in off, a
removed device goes back to full access like any browser on your network;
with sign-in on, it sees the sign-in page.

An e-paper panel with no browser gets its own address, `/panel/<token>.png`,
from Settings, Devices. That token shows the picture and nothing else: it
can't join as a household device. A new panel address retires the last.

### How much of Docker it can touch

The Docker socket gives root on the host, and `:ro` on the mount doesn't
change that. For a narrower boundary, run a
[socket proxy](https://github.com/Tecnativa/docker-socket-proxy) and set
`DOCKER_HOST=tcp://socket-proxy:2375`.
[examples/hardened.yml](examples/hardened.yml) does this with
read-only access and runs Patchboard as the unprivileged `node` user with a
read-only root filesystem. For restart buttons, the proxy needs `POST=1`,
`ALLOW_START`, `ALLOW_STOP` and `ALLOW_RESTARTS`. Updates need image pulls and
container creation, which comes close to full access. Connect for me needs
`ARCHIVE=1`; without it the button says so and you paste the key instead.

**Connect for me, in detail.** Patchboard reads at most 256 KB of the one
settings file and keeps only a 32-character hex `ApiKey` from it. The key
is only ever sent to an address Docker reports for that container: its
name on a network Patchboard shares with it, or its published port through
the Docker host (the gateway, loopback, or a configured remote host). The
request names the container, never an address, so nobody can point the
key at a server of their own. It is tested there before anything is saved,
and kept encrypted: never logged, never sent to a browser, and the audit
log records who pressed the button and which container it read, not the
key. Each try counts toward the same one-per-two-seconds limit as Test.

- **Keys don't follow redirects off their host.** A request that carries a
  key, token or cookie follows a redirect only on the same host (http to
  https included), three at most; one that points elsewhere is refused, so
  a service can't hand your key on with a 302.
- **Release notes are text and links.** Notes come from other people's
  repositories, so images, embeds, inline styles and forms are stripped
  before they're drawn, and their links open in a new tab with no
  referrer.

## Protections that are always on

- **DNS rebinding:** the API answers only requests addressed to an IP
  address, `localhost` or a name in `ALLOWED_HOSTS`, and refuses cross-origin
  changes.
- **Changes need the `X-Patchboard: action` header.** A browser won't send it
  cross-origin without a CORS preflight, and Patchboard grants none.
- **Activity log:** Settings, Activity records every change and who made it.
- **Content-Security-Policy:** scripts load only from Patchboard. The single
  inline script runs by its SHA-256 hash. No frames, no plugins, no form
  posts elsewhere, `nosniff`, no referrer.
- **Connection details stay on your box.** Patchboard sends no telemetry.
  It talks to the apps you connect, plus the public services you turn on
  (weather from Open-Meteo and the US National Weather Service, Tessie,
  Trakt, Fastmail, TVmaze and TMDB for posters). For its own updates it asks
  the GitHub container registry about its image and reads its release notes
  from GitHub, at most once an hour; neither request carries anything about
  you. A container with an update waiting has its project's release notes
  read from GitHub's API, once an hour at most, and only when the image's
  `org.opencontainers.image.source` label names a github.com owner/name:
  a label can't point the server at any other address.
  Patchboard fetches app icons named from the dashboard-icons set from
  jsDelivr once (and again monthly, in case the set redrew one) and keeps
  them in `DATA_DIR`, so your browser gets them from Patchboard. Fonts ship inside the image. Article pictures in Reading load
  through Patchboard too, from public addresses only, so publishers never
  see your browser. The one thing your browser loads from elsewhere is an
  icon you give as a full address. None of those requests carries a key or
  an address.
- **Notifications are opt-in and go where you point them.** With a notifier
  set up, an alert's title and detail (a container name, a disk
  temperature) go to that service. A self-hosted ntfy, Gotify or webhook
  keeps them on your network. On the public ntfy.sh, anyone who guesses the
  topic can read it, so use a long random topic name or a token. A Discord
  webhook address works like a password: Patchboard stores it encrypted,
  sends only to discord.com, and turns off @mentions in what it posts.
- **Keys are write-only.** Typed in Settings, they live encrypted in the
  database in `DATA_DIR`; set in the environment, they live there. The
  browser can set a key but never read one back: the API says whether a key
  is set, never what it is.
- **A key goes only to its own server.** Point an integration at a new
  address and Settings asks for its key again. A key an API widget names
  goes only to the server it was first sent to; saving the key again lets it
  move. A key typed into a widget's or an app's header moves to the key
  store on save.
- **Sign-in never falls open.** `AUTH` is read in any case, and a value
  Patchboard doesn't know stops it from starting rather than running with no
  sign-in. With sign-in off, a visitor from the internet puts "Patchboard is
  open to the internet" at the top of Needs attention.
  The setup file export carries no keys and no addresses.
- **Saved keys are encrypted at rest** with AES-256-GCM. The key that seals
  them sits apart from the database, in `DATA_DIR/secret.key` (owner-only),
  or in `PATCHBOARD_SECRET_KEY` if you set one. A copy of `patchboard.db` on
  its own reveals nothing. Anyone who can read both files, or the running
  process, can read the keys, the same as an env file; protect `DATA_DIR`
  the same way.
- **Setting up an integration in the UI gets the same guards as any
  change:** sign-in when it's on, the action header, refused under `READ_ONLY`, recorded in
  Activity. An environment variable always wins and shows as locked.
  Settings can turn a password on, and change or remove it with the current
  one. A reverse proxy, OIDC, Docker access and folder mounts come only from
  the environment, so a session can't hand itself a new way in. If you
  forget the password, set `AUTH=none` or `PATCHBOARD_PASSWORD` in the
  environment; it wins. **Test connection** runs one request with the values
  in the form, on a scoped copy of the settings, so live polling never sees
  unsaved values. Patchboard allows one test every two seconds per
  integration.
- **Requests fill in keys late.** Requests refer to keys as
  `${secret:NAME}` or `${env:WIDGET_NAME}`, and the server fills them in only
  when it makes the call. A connected app's tile number refers to its
  integration's own values as `${setup:SONARR_URL}` and `${setup:SONARR_KEY}`:
  the address may only start a URL, and the key goes only to that address. A key typed straight into an API numbers widget's
  header or URL moves to the encrypted key store when the board is saved,
  leaving a reference behind, so a board, a browser and a setup file never
  hold it. Error messages never include URLs, because some APIs put keys in
  the query string. Patchboard proxies Plex and calendar artwork for the
  same reason.
- **Fetching on your behalf is fenced.** The server fetches only addresses
  it already holds: URLs saved in a board or the app layout, and pictures
  from articles it served. The browser asks by id. API numbers follow no
  redirects and stop at 8 seconds or 512 KB; feeds follow up to three
  redirects and stop at 8 seconds or 1 MB; both refuse link-local and
  cloud-metadata addresses, however they're written. Article pictures go
  to public addresses only, checked as each connection opens, and stop at
  10 seconds or 5 MB.
- **Logs are masked on the server.** Apps write their own keys into their
  logs (Sonarr's indexer URLs carry the API key and torrent passkey, Plex
  logs its token). Patchboard masks API keys, tokens, passkeys, passwords,
  auth headers and passwords in URLs in every log line, health-check output
  and update log before a browser sees them.
- **Uploaded icons** get a name from their content hash, and Patchboard serves
  them with a sandboxing policy, so an uploaded SVG can't run script.
- **Updates run only where you mounted the compose folder,** read-only, at
  its host path; `COMPOSE_ROOT` narrows that to one folder. Patchboard
  refuses TrueNAS apps and locally built images, and runs compose with only
  `PATH`, `HOME` and `DOCKER_HOST`, so its keys never reach a stack. To update
  itself it starts a one-off helper from the image it just pulled, with the
  same Docker socket and the compose folder read-only, which recreates
  Patchboard and removes itself. Behind a socket proxy it skips the
  self-update.
- **CI** runs gitleaks over the full history on every push.

## Reporting a vulnerability

[Report it privately](https://github.com/sourpatchdad/patchboard/security/advisories/new)
from the repository's Security tab, not in a public issue. You'll hear back
within a few days, and the fix ships in a release with credit to you unless
you'd rather not.

Release images carry build provenance and a software bill of materials:
`docker buildx imagetools inspect ghcr.io/sourpatchdad/patchboard:latest
--format '{{ json .Provenance }}'` shows how an image was built.
