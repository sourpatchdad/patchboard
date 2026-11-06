# Examples

Complete compose files. Save one as `docker-compose.yml`; none needs a
`.env`. [docker-compose.yml](docker-compose.yml) is the plain install.
For config as code, [env.example](env.example) lists every variable and
[services.example.yaml](services.example.yaml) starts a `services.yaml`.

| Folder | For |
|---|---|
| [everything](everything/docker-compose.yml) | Every optional mount: pool usage, runbook, backup logs, updates from the UI. |
| [hardened](hardened/docker-compose.yml) | Look but don't touch: a read-only socket proxy, `READ_ONLY=1`, localhost only, behind forward auth. |
| [labels](labels/docker-compose.yml) | Labels on your own apps so they list themselves. |
| [wake-on-lan](wake-on-lan/docker-compose.yml) | Host networking, so the Wake widget's packets reach your LAN. |

For HTTPS on a private network, which installing Patchboard as a phone app
needs, see [Caddyfile](Caddyfile).
