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
- Logs' container rows are 44px tall on a phone, a comfortable tap.
- Jump to: typing an app's name and pressing Enter opens its page, with
  the runbook and logs, instead of starting or restarting it. An action
  leads once you type its verb ("start unpack").
- Arrange board's controls are the regular small control size, and
  Connections' parts read as tabs under the Settings tabs.
- Add all leaves Patchboard itself out, and names AdGuard Home, Portainer,
  Paperless-ngx and SABnzbd properly.
- A widget waiting on an integration you haven't connected draws nothing,
  instead of an empty card, on a fresh install.
- The README leads with what Patchboard does, a demo you can open from
  another machine, and plain section names.
- App icons show their own colors by default; Settings, Look still turns
  them gray.
- Reading's Mark all read sits on its own row instead of over the sort
  buttons. Hold buttons show their track only when you point at or tab to
  them.
- A chosen sort or filter is edged in the accent instead of a ring that
  looked like keyboard focus. Stacks gives icon-less containers a letter.
- Sizes keep their unit on the same line ("64.0 GB"), times drop a zero
  part ("14 h"), and disk models stay on one line.
- On Home's icon rack, an app with a problem shows its name under the icon
  in its warning or down color; healthy apps stay icons.

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
