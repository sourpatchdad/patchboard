# Changelog

## Unreleased

- Home shows Patchboard's version beside Header settings. When a newer
  release is out it reads "Update to v1.2.0" and opens what each release
  changed, with Update right there; after you update, it shows what's new
  once. A compose file that pins an exact version is told which tag to use.
- Lists in Reading articles, runbooks and release notes show their bullets
  and numbers again.
- GitHub Releases are titled by their tag (v1.0.0).
- An app in trouble pulses three times when it goes down, then holds
  still; Live and running updates still pulse while they move.
- Widget titles step up a size, long text no longer leaves one word alone
  on its last line, and quiet text on a selected row keeps its contrast.
- Logs' container rows are a full finger tall on a phone.

## 1.0.0 (2026-11-10)

The first public release.

- **Home answers before you ask.** What needs you, the server, your apps,
  what's playing, the week's releases, your reading and what changed, fitted
  to one screen. Add boards for the TV, the rack or the house, on 2 to 6
  columns, each widget sized and placed by dragging.
- **Live without weight.** Jellyfin, Emby and Audiobookshelf push playback as
  it happens; Plex (through Tautulli) and Navidrome poll every 5 seconds while
  something plays. Camera frames refresh while on screen, and a tap opens
  one live.
- **Everything leads somewhere.** Each container has a page with its alerts,
  runbook section, live logs, a 30-day health strip, and restart, update and
  roll back. Jump to (Ctrl K) reaches any app, page or action.
- **Set up in the browser.** Add every running container in one click,
  connect any of 84 integrations from Settings with keys encrypted on the
  server, or import Homepage's `services.yaml`. Environment variables and
  `services.yaml` keep working underneath.
- **Alerts reach you** through ntfy, Gotify, Pushover, Discord, email or a
  webhook when a problem lasts two minutes, and again when it clears.
- **Yours to style:** five themes in dark and light plus a custom one, accent
  colors, three densities, a phone layout with a tab bar, and an installable
  app with its own icon.
- **Safe to run:** sign in with a password, OIDC or your reverse proxy; a
  read-only mode; an activity log of every change; a strict Content Security
  Policy. Your browser talks only to Patchboard: icons, posters and article
  pictures all come through it.
- One container, about 50 MB of memory, for amd64 and arm64, plus a slim
  image without the Docker CLI.
