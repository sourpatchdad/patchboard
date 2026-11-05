# Examples

Complete compose files. Copy one next to your `.env` as `docker-compose.yml`.

| Folder | For |
|---|---|
| [everything](everything/docker-compose.yml) | Every optional mount: pool usage, runbook, backup logs, updates from the UI. |
| [hardened](hardened/docker-compose.yml) | Look but don't touch: a read-only socket proxy, `READ_ONLY=1`, localhost only, behind forward auth. |
| [labels](labels/docker-compose.yml) | Labels on your own apps so they list themselves. |

For HTTPS on a private network, which installing Patchboard as a phone app
needs, see [deploy/Caddyfile.example](../deploy/Caddyfile.example).
