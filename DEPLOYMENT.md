# DayFrame Deployment Notes

Purpose: Capture the practical deployment assumptions for running DayFrame on DigitalOcean within the current hackathon constraints.

## Platform Assumptions

- Cloud provider: DigitalOcean
- Budget cap: `$200`
- CLI available: `doctl`
- Core services:
  - App Platform static site for web client
  - App Platform service for API
  - Worker process for async jobs
  - Managed PostgreSQL
  - Spaces for media
  - GPU Droplet for the private model

## Deployment Priorities

### Always-On

- web client
- API
- worker
- PostgreSQL
- Spaces

### Budget-Aware / On-Demand

- GPU runtime should be minimized outside active testing, training, and demo windows.
- Optional stretch features should not be allowed to expand inference/storage cost without a clear reason.

## Operational Guidance

- Use `doctl` for environment inspection, deployment checks, and demo-day verification.
- Keep the model endpoint private to DigitalOcean networking.
- Keep public share artifacts separate from private user media paths.
- Prefer the smallest stable runtime footprint that still supports the demo.
- If App Platform uses repository sources, ensure the DigitalOcean account has source access to the configured repo. If not, switch the spec to an image-based deploy path.

## Current Scaffold Path

- App Platform spec: [deploy/digitalocean/app-platform.yaml](/Users/Ivan_Habor/myprojects/day_frame/deploy/digitalocean/app-platform.yaml)
- Render command: `pnpm do:render-spec`
- Deploy command: `pnpm do:deploy`
- Operator check script: [scripts/do/check.sh](/Users/Ivan_Habor/myprojects/day_frame/scripts/do/check.sh)
- Root command: `pnpm do:check`

The current scaffold assumes:

- `apps/web` builds to `apps/web/dist`
- `apps/api` serves the authenticated HTTP contract
- `apps/worker` owns queue consumption and weekly compilation
- App Platform provisions a managed PostgreSQL cluster via the app spec
- The deployment script can bind App Platform to an existing managed PostgreSQL cluster named `dayframe-db`
- API owns migrations during startup for the demo deployment path
- App routes `/api`, `/auth`, `/health`, `/media`, `/public`, and `/s` to the API service, while `/` stays on the static web client
- private strip assets can live in Spaces with signed URLs when Spaces credentials are configured
- public share artifacts live under `public/shares/{share_id}/...`

## Demo-Day Readiness Checklist

- API, worker, and web client are deployed and reachable.
- Database and Spaces credentials are valid.
- Private model endpoint is healthy.
- Signed private media URLs resolve correctly.
- Public share page works and revoked shares stop resolving.
- Weekly compilation and torn-page flow have been tested with seed data.

## References

- [`SPEC.md`](./SPEC.md)
- [`IMPLEMENTATION_ORDER.md`](./IMPLEMENTATION_ORDER.md)
- [DigitalOcean DevPost resources](https://digitalocean.devpost.com/resources)
