# What self-hosters ask dashboards for

Research, November 2026: GitHub feature requests and issues for Homepage,
Glance, Homarr, Dashy, Heimdall, Homer and Dashdot; r/selfhosted, r/homelab
and r/unRAID threads (via mirrors); comparison posts from 2024 to 2026. Vote
and reaction counts are approximate. Sources are linked where it matters.

## Why people leave a dashboard

1. **YAML is tedious and brittle.** One bad indent and a widget silently
   breaks ([homepage#3650](https://github.com/gethomepage/homepage/discussions/3650)).
2. **Memory bloat.** Homarr at about 1 GB for "a mostly static page"
   ([homarr#3759](https://github.com/homarr-labs/homarr/issues/3759)).
3. **Upgrades that break things.** Homepage 1.0's host check, Homarr's
   migration that emptied boards, Dashy 3.0 failing to start.
4. **The novelty wears off.** It turns into "just bookmarks" the browser
   already has, and stops being opened.
5. **Stale data:** no live refresh (Glance).
6. **Integrations removed or missing:** Homarr 1.0 dropped ping and Uptime
   Kuma.
7. **Bus factor:** projects that stall.
8. **Config locked in a database,** so it can't be kept in git.
9. **Layout jank:** items that move or overlap.
10. **Auth that's fake or missing.**

Reason 4 is the one that matters most and is least addressed: people stop
opening a dashboard that doesn't tell them anything. Patchboard's whole
premise ("what needs you", root-cause folding, runbooks, the overnight line)
answers it, and no other dashboard competes there.

## Security expectations

- **The Docker socket is root on the host.** `:ro` doesn't limit the API.
  Engineers expect a [socket proxy](https://github.com/Tecnativa/docker-socket-proxy)
  option with writes disabled.
- **API proxies get attacked.** Homepage CVE-2024-42364 (DNS rebinding leaked
  keys); Homarr CVE-2026-25123 (unauthenticated SSRF) and CVE-2026-27796
  (unauthenticated listing of internal URLs).
- **Client-side "auth" is worse than none** (Dashy's).
- **Expected auth:** forward-auth headers (Authelia, Authentik, Cloudflare
  Access) and OIDC, with built-in password as a fallback, rate-limited.
- **Secrets stay out of config files.**
- **Pinned, immutable image tags.** Running as non-root where possible.

## Backlog, ranked

Done items are marked with the version they shipped in.

### Trust and safety (first, because they gate everything else)
- [x] DNS-rebinding host check, cross-origin refusal (1.9.1)
- [x] Actions behind a custom header, every action recorded (1.4.0)
- [x] Secrets only in the environment; inspect output never includes env (1.1.0)
- [ ] **Read-only mode** (`READ_ONLY=1`): no actions, no updates, no board edits
- [ ] **Docker socket proxy support** (`DOCKER_HOST=tcp://socket-proxy:2375`), documented with writes off for read-only installs
- [ ] **Authentication:** trusted forward-auth header, OIDC, or a built-in password with rate limiting; actions can require it even when viewing doesn't
- [ ] **Audit log page:** every action, update, sign-in and board change, with who and when
- [ ] **Content-Security-Policy** and other security headers
- [ ] Non-root image variant (works with a socket proxy)

### Making it yours (the top capability asks)
- [x] Docker-label discovery, Homepage labels included (1.8.0)
- [x] Drag-and-drop board, widths, live refresh (1.9.0)
- [ ] **JSON widget:** any API, up to four values, thresholds, test before saving (in progress)
- [ ] **Board export and import** as one file, plus starter presets
- [ ] **Catalog editor in the UI** that writes clean, diffable YAML (fixes reason 1 without giving up git)
- [ ] **Homepage importer in the UI** (the CLI exists)
- [ ] Search box that works like an address bar, with `!` shortcuts
- [ ] iCal/CalDAV calendar widget
- [ ] Wake-on-LAN for listed machines
- [ ] Multiple Docker hosts (remote sockets or a small agent)
- [ ] To-do / notes widget (local)

### Integrations, by demand
- [ ] Pi-hole, AdGuard Home, Technitium
- [ ] Proxmox VMs and LXCs, with open-console links
- [ ] Uptime Kuma, plus response-time history for Patchboard's own checks
- [ ] Host metrics agents: Beszel, Glances, Netdata
- [ ] Jellyfin and Emby sessions and recently added
- [ ] Immich stats and "on this day"
- [ ] Home Assistant entities
- [ ] Unraid
- [ ] UPS (NUT), Scrutiny (SMART), Speedtest Tracker
- [ ] Ollama and Open WebUI
- [ ] ntfy or Pushover for outgoing alerts (opt-in)

### Polish
- [ ] Accessibility audit (keyboard paths, screen-reader labels, contrast in every theme)
- [ ] Translations
- [ ] A read-only API (and MCP) for AI tools, scoped to GET

## What nobody does well, and Patchboard should own

- **"What needs my attention"** as the product, not a widget.
- **Safe write actions:** scoped, confirmed, audited container control and
  updates with rollback. Others are either read-only or socket-root with no
  guard rails.
- **Hybrid config:** a GUI that writes back clean YAML, so people stop
  running two dashboards.
- **Version drift for services that aren't containers.**
