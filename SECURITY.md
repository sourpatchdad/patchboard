# Security

Patchboard reads your server and can act on it. Read this before you expose
it anywhere.

## What it can do

- **Read:** container state, stats, logs and inspect data through the Docker
  API (never containers' environment variables), host CPU and memory,
  read-only mounts of notes and logs, and the APIs you connect.
- **Change:** start, stop, restart, update or roll back a container; save the
  board, the app layout and page settings; store keys you paste; sign in to
  Trakt.

## Three choices when you deploy

### Who can reach it

| `AUTH` | Use it when |
|---|---|
| `none` (default) | Only you can reach the address: Tailscale, or a LAN you control. Set `BIND_ADDRESS` to that address, never `0.0.0.0` on a shared network. |
| `forward` | A reverse proxy (Authelia, Authentik, Cloudflare Access, oauth2-proxy) signs people in and passes the user in `TRUSTED_USER_HEADER`. Bind Patchboard to `127.0.0.1` or a network only the proxy shares, or anyone can send that header. |
| `oidc` | You have an identity provider: Authentik, Authelia, Keycloak, Pocket ID, Zitadel, Google. Patchboard uses the authorization-code flow with PKCE and checks the ID token's signature, issuer, audience, expiry and nonce. Set `OIDC_ALLOWED` to the emails, usernames or groups that may sign in; without it, anyone your provider signs in gets in. |
| `password` | You have no proxy or provider. Sessions use random 256-bit tokens in an HttpOnly, SameSite=Strict cookie, stored hashed, for 30 days. After five wrong tries, Patchboard locks that address out for a doubling wait, up to 15 minutes. |

With sign-in on, webhooks send `HOOK_TOKEN` as `Authorization: Bearer <token>`
or `?token=`.

OIDC sessions use the same hashed tokens with a SameSite=Lax cookie, so the
cookie arrives on the redirect back from the provider. Changes still need the
`X-Patchboard` header, which other sites can't send.

### Whether it can change anything

`READ_ONLY=1` refuses every change for everyone and hides the controls.
Marking articles read still works.

### How much of Docker it can touch

The Docker socket gives root on the host, and `:ro` on the mount doesn't
change that. For a narrower boundary, run a
[socket proxy](https://github.com/Tecnativa/docker-socket-proxy) and set
`DOCKER_HOST=tcp://socket-proxy:2375`.
[examples/hardened](examples/hardened/docker-compose.yml) does this with
read-only access and runs Patchboard as the unprivileged `node` user with a
read-only root filesystem. For restart buttons, the proxy needs `POST=1`,
`ALLOW_START`, `ALLOW_STOP` and `ALLOW_RESTARTS`. Updates need image pulls and
container creation, which comes close to full access.

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
- **Keys stay on the server.** They live in `.env`, or, when you paste them in
  the UI, in the database in `DATA_DIR`. Protect that folder like `.env`. The
  API lists key names, never values. Requests refer to keys as
  `${secret:NAME}` or `${env:WIDGET_NAME}`, and the server fills them in only
  when it makes the call. Error messages never include URLs, because some
  APIs put keys in the query string. Patchboard proxies Plex and calendar
  artwork for the same reason.
- **Fetching on your behalf is fenced.** The server fetches only URLs saved
  in the board or the app layout; the browser asks by id. It follows no
  redirects, refuses link-local and cloud-metadata addresses, and stops at
  8 seconds or 512 KB.
- **Uploaded icons** get a name from their content hash, and Patchboard serves
  them with a sandboxing policy, so an uploaded SVG can't run script.
- **Updates stay inside `COMPOSE_ROOT`,** mounted read-only. Patchboard
  refuses TrueNAS apps, locally built images and itself, and runs compose
  with only `PATH`, `HOME` and `DOCKER_HOST`, so its keys never reach a stack.
- **CI** runs gitleaks over the full history on every push.

## Reporting a vulnerability

Open a private security advisory on the GitHub repository.
