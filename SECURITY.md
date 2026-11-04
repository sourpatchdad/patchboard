# Security model

Patchboard watches and can act on a server, so it is built to be safe to run
by someone who reads the code first. This is what it does, what protects it,
and the choices you make when you deploy it.

## What it can do

- **Read:** container state, stats, logs and inspect data (never environment
  variables) through the Docker API; host CPU and memory; read-only mounts of
  notes and logs; the APIs of configured integrations.
- **Act:** start, stop, restart and update containers (pull and recreate one
  compose service, or roll it back); save the Home board; sign in to Trakt.
  Nothing else changes state.

## Decide three things when you deploy

### 1. Who can reach it

`AUTH` chooses how people sign in:

| `AUTH` | Use when |
|---|---|
| `none` (default) | The network is the gate: Tailscale, or a LAN only you use. Bind the port to that address (`BIND_ADDRESS`), never `0.0.0.0` on a shared network. |
| `forward` | A reverse proxy (Authelia, Authentik, Cloudflare Access, oauth2-proxy) signs people in and passes the user in a header (`TRUSTED_USER_HEADER`, default `Remote-User`). **Only safe if Patchboard is reachable solely through that proxy**: bind it to `127.0.0.1` or a Docker network the proxy shares, so nobody can send the header directly. |
| `password` | No proxy. One shared password (`PATCHBOARD_PASSWORD`). Sessions are random 256-bit tokens in an HttpOnly, SameSite=Strict cookie, stored hashed, valid 30 days. Five wrong attempts from an address lock it out with a doubling wait, up to 15 minutes. |

With sign-in on, webhooks (Diun) authenticate with `HOOK_TOKEN`, sent as
`Authorization: Bearer <token>` or `?token=`.

### 2. Whether it can change anything

`READ_ONLY=1` refuses every change (container actions, updates, board edits,
integration sign-ins) for everyone, and the interface hides those controls.
Marking feed articles read still works.

### 3. How much of Docker it can touch

The Docker socket is root on the host. Mounting it `:ro` protects the socket
file, not the API behind it. For a tighter boundary, put a
[socket proxy](https://github.com/Tecnativa/docker-socket-proxy) in front and
point Patchboard at it with `DOCKER_HOST=tcp://socket-proxy:2375`:

- **Read-only install:** allow `CONTAINERS`, `IMAGES`, `EVENTS`, `INFO` and
  `NETWORKS`; leave `POST=0`. Pair it with `READ_ONLY=1`.
- **With actions:** add `POST=1` and `ALLOW_START`, `ALLOW_STOP`,
  `ALLOW_RESTARTS`. Updates also need image pulls and create (`IMAGES`,
  `POST`), which is close to full access; decide whether you want updates
  from the UI at all.

docker-compose.example.yml has a commented proxy service to start from.

## What protects it regardless

- **DNS rebinding is blocked.** The API answers only requests addressed to an
  IP address, `localhost`, or a hostname in `ALLOWED_HOSTS`, and refuses
  cross-origin changes. (Homepage's CVE-2024-42364 was this attack.)
- **Changes need a custom header** (`X-Patchboard: action`). Browsers won't
  send it cross-origin without a CORS preflight, which Patchboard never
  grants.
- **Every change is recorded** with who made it: Settings, Activity.
- **Strict Content-Security-Policy.** Scripts only from Patchboard itself;
  the one inline script (the theme painter) is allowed by its SHA-256 hash,
  computed at startup. No frames, no plugins, no form posts elsewhere.
  Plus `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`.
- **Secrets stay server-side.** Keys live in the environment. The browser
  never receives them; Plex posters are proxied. Error messages never include
  URLs, since some APIs carry keys in the query string.
- **The JSON widget can't be turned into a proxy.** The server only fetches
  URLs saved in the board; the browser asks by widget id. Header values may
  reference `${env:WIDGET_*}` variables only, so a board edit can't reach
  Patchboard's own keys. http and https only, no redirects followed,
  link-local and cloud-metadata addresses refused, 8 s timeout, 512 KB cap.
- **Updates are fenced** to compose projects under `COMPOSE_ROOT` (mounted
  read-only); TrueNAS apps, locally built images and Patchboard itself are
  refused. Compose runs with only `PATH` and `HOME` (plus `DOCKER_HOST` if
  set), so Patchboard's keys never leak into a stack.
- **Notes are read-only mounts**, and only named files are read.
- **CI** runs gitleaks over the full history on every push.

## Reporting

Open a private security advisory on the GitHub repository.
