# What self-hosters ask for

Notes from November 2026: feature requests and issues across self-hosted
dashboard projects, r/selfhosted and r/homelab threads, and comparison posts
from 2024 to 2026. They shape the backlog below.

## Why people stop using a dashboard

1. **Editing YAML by hand.** One bad indent and a widget breaks without a word.
2. **Heavy memory use** for what is mostly a static page.
3. **Upgrades that break** a working setup or empty a board.
4. **It stops telling them anything.** It turns into bookmarks the browser
   already has, and they stop opening it.
5. **Stale data** that needs a reload.
6. **Missing integrations,** or ones removed in an update.
7. **Config locked in a database,** out of reach of git.
8. **Items that move or overlap.**
9. **Weak or missing sign-in.**

Patchboard answers 4 first: Needs attention, root causes, runbooks and the
overnight line give you a reason to open it every day.

## What engineers expect before they deploy one

- A [socket proxy](https://github.com/Tecnativa/docker-socket-proxy) option,
  because the Docker socket gives root and `:ro` doesn't limit the API.
- Protection for API proxies against DNS rebinding and SSRF, the most
  reported class of dashboard vulnerability.
- Forward-auth headers (Authelia, Authentik, Cloudflare Access) and OIDC,
  with a rate-limited built-in password as a fallback.
- Keys out of config files, pinned image tags, and a non-root image.

## Backlog

Shipped items show their version.

### Trust and safety

- [x] DNS-rebinding host check and cross-origin refusal (1.9.1)
- [x] Actions behind a custom header, every action recorded (1.4.0)
- [x] Read-only mode, socket proxy support, sign-in, activity log, CSP (1.10.0)
- [x] Keys pasted in the UI, kept on the server (1.15.0)
- [ ] OIDC sign-in
- [ ] Non-root image variant

### Making it yours

- [x] Docker-label discovery, Homepage labels included (1.8.0)
- [x] API numbers widget (1.10.0)
- [x] Board with columns, drag to move and resize, widget settings (1.13.0 to 1.17.0)
- [x] Edit apps in the UI: add, hide, regroup, icons, live numbers (1.14.0, 1.15.0)
- [x] Customize on every page (1.16.0)
- [x] One-click first run (1.19.0)
- [ ] Board export and import as one file, plus starter boards
- [ ] Write UI changes back to services.yaml for people who keep it in git
- [ ] Homepage import in the UI (the CLI exists)
- [ ] A search box with `!` shortcuts
- [ ] iCal and CalDAV calendar widget
- [ ] Wake-on-LAN
- [ ] Several Docker hosts
- [ ] Notes and to-do widget

### Integrations

- [x] Live number presets: Jellyfin, Immich, Home Assistant, AdGuard Home, Pi-hole 5, Glances and more (1.15.0)
- [ ] Pi-hole 6 (session sign-in)
- [ ] Proxmox VMs and containers
- [ ] Uptime Kuma, and history for Patchboard's own checks
- [ ] Jellyfin and Emby sessions on Right now
- [ ] Unraid, UPS (NUT), Scrutiny, Speedtest Tracker
- [ ] Outgoing alerts through ntfy or Pushover, opt-in

### Polish

- [ ] Accessibility audit: keyboard paths, screen-reader labels, contrast in every theme
- [ ] Translations
- [ ] A read-only API for scripts and AI tools

## Where Patchboard should lead

- **What needs you,** as the point of the whole app.
- **Safe actions:** scoped, confirmed and recorded container control, and
  updates with rollback.
- **The UI and files together:** click to change things, and keep a file in
  git if you want one.
