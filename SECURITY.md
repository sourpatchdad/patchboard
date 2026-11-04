# Security model

Patchboard is built to run on a private network (a Tailscale tailnet) and has
no login of its own. The network is the access control. Read this before
exposing it anywhere else.

## What it can do

- **Read:** container state, stats, logs and inspect data through the Docker
  socket; host CPU and memory; read-only mounts of the server's docs and logs;
  the APIs of configured integrations.
- **Act:** start, stop, restart and update containers (pull and recreate one
  compose service, or roll it back), and sign in to Trakt. Nothing else
  changes state.

The Docker socket is equivalent to root on the host, mounted read-only or
not (`:ro` protects the socket file, not the API behind it). Treat access to
Patchboard as access to the server.

## Protections

- **Bound to the tailnet address only** in the example compose file, never
  `0.0.0.0`.
- **DNS rebinding is blocked.** The API answers only requests addressed to
  an IP address, `localhost`, or a hostname in `ALLOWED_HOSTS`. A hostile
  page that rebinds its own name to this server still sends its own name in
  `Host`, and is refused. Changes with an `Origin` header must match `Host`.
- **State-changing requests** are POSTs that require an `X-Patchboard: action`
  header. Browsers won't send a custom header cross-origin without a CORS
  preflight, which Patchboard never grants, so another site can't trigger an
  action through your browser.
- **Every action is recorded** as an event with the container and the verb.
- **Updates are fenced:** only compose projects whose folder and compose files
  sit under `COMPOSE_ROOT` (mounted read-only). TrueNAS-managed apps, locally
  built images and Patchboard itself are refused. One update runs at a time.
- **Child processes get a minimal environment** (`PATH`, `HOME`). Patchboard's
  own variables hold API keys; compose would otherwise let them override a
  stack's `.env` values of the same name. Compose reads each stack's `.env`
  itself; Patchboard never opens those files.
- **Secrets stay server-side.** Keys live in the environment. The browser
  never receives them; images (Plex posters) are proxied. Container inspect
  output deliberately omits environment variables. Error messages from
  integrations never include URLs, since some APIs carry keys in the query
  string.
- **Notes are read-only.** Runbook and log folders are mounted `:ro`, and
  only named files are read.
- **Service checks** follow no redirects and read no response bodies.
- **CI** scans the full git history for secrets with gitleaks.

## Reporting

Open a private security advisory on the GitHub repository.
