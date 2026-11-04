# TODO

## To go live
- [X] Copy `env.example` to `.env` and fill in keys (reuse the ones in Homepage's `services.yaml`)
- [X] Copy `docker-compose.example.yml` to `docker-compose.yml`, `docker compose up -d --build`
- [ ] Check port 3200 is free on the NAS
- [ ] Caddy with the Cloudflare DNS module, `dash.example.com` A record to 192.168.1.10 (DNS only)
- [ ] Mark one-shot containers with `expectStopped: true` in `config/services.yaml`
- [ ] Install on the phone (Share > Add to Home Screen) once HTTPS is up

## 1.1 deploy
- [ ] Create a TrueNAS API key for a read-only user, set `TRUENAS_API_KEY` in `.env`
- [ ] `sudo docker compose up -d --build` (picks up the new `system-docs` and `logs` mounts)
- [ ] Check Server: pool shows about 55%, disks show temperatures, scrub date matches Nov 1

## Next
- Phase 2 of ROADMAP.md: Healthchecks.io, the Ops diary, "while you were asleep",
  root-cause folding, Diun, exposure map, backups on container pages
- [ ] Diun: "updates available" as a quiet bucket under Needs attention
- [ ] Fastmail deep links to individual messages (URL format to confirm)
- [ ] Trakt OAuth device flow in-app instead of a pasted token
- [ ] Home Assistant: a few chosen entity states (doors, garage, car charging)
- [ ] Immich, Audiobookshelf recently added alongside Plex
- [ ] Run as non-root with the Docker socket's group via `group_add`

## Later
- [ ] Container restart from the Logs view, behind a confirm (needs a decision first, see DESIGN.md)
- [ ] Layout preferences per device (hide sections, reorder) stored in SQLite
- [ ] Public demo deploy for the portfolio (DEMO=1, no socket)
- [ ] Tests: adapter parsing against recorded fixtures, alert rules
