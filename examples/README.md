# Examples

Each is a complete `docker-compose.yml`. None needs a `.env` file.

| File | For |
|---|---|
| [docker-compose.yml](docker-compose.yml) | The plain install. |
| [everything](everything/docker-compose.yml) | Every optional mount: storage use, runbook, backup logs, updates from the UI. |
| [hardened](hardened/docker-compose.yml) | Read-only, behind a reverse proxy that signs people in. |
| [wake-on-lan](wake-on-lan/docker-compose.yml) | Host networking for the Wake widget. |
| [Caddyfile](Caddyfile) | HTTPS on a private network, so phones can install Patchboard as an app. |
| [env.example](env.example) | Every setting as a variable, for keeping config in a file. |
