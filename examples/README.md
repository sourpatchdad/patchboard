# Examples

Complete compose files. Copy one next to your `.env` as `docker-compose.yml`.
[docker-compose.yml](docker-compose.yml) is the plain install, and
[env.example](env.example) is the `.env` template for all of them; it needs
only the server settings at the top, since integrations are set up in
Settings, Connections. [services.example.yaml](services.example.yaml) starts
a `services.yaml` if you'd rather keep your apps in a file.

| Folder | For |
|---|---|
| [everything](everything/docker-compose.yml) | Every optional mount: pool usage, runbook, backup logs, updates from the UI. |
| [hardened](hardened/docker-compose.yml) | Look but don't touch: a read-only socket proxy, `READ_ONLY=1`, localhost only, behind forward auth. |
| [labels](labels/docker-compose.yml) | Labels on your own apps so they list themselves. |
| [wake-on-lan](wake-on-lan/docker-compose.yml) | Host networking, so the Wake widget's packets reach your LAN. |

For HTTPS on a private network, which installing Patchboard as a phone app
needs, see [Caddyfile](Caddyfile).
