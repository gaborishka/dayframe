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
