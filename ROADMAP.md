# Roadmap

What comes next, and why. CHANGELOG.md has what has shipped.

## What people ask a dashboard for

From feature requests and issues across self-hosted dashboard projects and
r/selfhosted and r/homelab threads, 2024 to 2026. People stop using a
dashboard when:

1. Editing YAML by hand breaks a widget without a word.
2. It uses a lot of memory for a mostly static page.
3. An upgrade breaks a working setup.
4. It stops telling them anything and turns into bookmarks.
5. Data goes stale until a reload.
6. Integrations they rely on go missing.
7. Config sits where git can't reach it.
8. Items move or overlap.
9. Sign-in is weak or missing.

Before they deploy one, engineers expect a socket proxy option, protection
against DNS rebinding and SSRF, forward auth or OIDC, keys out of config
files, and a non-root image.

## Next

### Making it yours

- [ ] Homepage config import in the UI (the CLI exists)
- [ ] A search box with `!` shortcuts
- [ ] iCal and CalDAV calendar widget
- [ ] Notes and to-do widget
- [ ] Several Docker hosts

### Integrations

- [ ] Proxmox VMs and containers
- [ ] Speedtest Tracker, Scrutiny, UPS (NUT), Unraid
- [ ] Immich library stats
- [ ] Pi-hole and AdGuard Home, with a Pause button
- [ ] Overseerr and Jellyseerr requests, with Approve
- [ ] Hardcover and Goodreads: what you are reading
- [ ] Outgoing alerts through ntfy or Pushover, opt-in

### Running it anywhere

- [ ] A slim image without the Docker CLI, for read-only installs
- [ ] Unraid and TrueNAS app templates
- [ ] A Proxmox LXC script, and running from Node without Docker

### Polish

- [ ] Accessibility audit: keyboard paths, screen-reader labels, contrast in every theme
- [ ] Translations
- [ ] A read-only API for scripts and AI tools

Want something here sooner, or something missing? Open an issue.
