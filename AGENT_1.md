# Agent 1 Brief: App / Platform

Purpose: Build the DayFrame application runtime, user flows, async pipeline, storage, and deployment path described in [`SPEC.md`](./SPEC.md).

## Mission

Own the product-facing system:

- web client
- API
- worker
- PostgreSQL queue/runtime
- Google integrations
- Spaces storage
- sharing
- weekly issues and torn pages
- DigitalOcean deployment

Your job is to make the app work end-to-end even before the final fine-tuned model is fully integrated.

## Locked Interfaces

You must treat these as fixed contracts:

- Input to model: `EnrichedDayContext`
- Output from model: `ComicScript`
- Async job record: `GenerationJob`
- Private media access: signed URLs only
- Public sharing: `/s/{share_id}` public artifact route

When the fine-tuned model is not ready, use:

- mocked `ComicScript` fixtures, or
- a deterministic placeholder generator that produces schema-valid output

## Build Order

### 1. Core Runtime

- database schema and migrations
- API skeleton
- worker process
- PostgreSQL queue with lease, heartbeat, retry, and recovery sweep

### 2. Daily Flow

- auth scaffold
- `PUT /api/day/{date}/context`
- `POST /api/day/{date}/generate`
- `GET /api/day/{date}/status`
- daily view polling behavior

### 3. Temporary End-to-End Path

- mocked or deterministic `ComicScript` provider
- panel placeholder flow if needed
- strip composition path

### 4. Real Integrations

- Google Calendar
- Google Tasks
- Spaces upload
- signed private media URLs

### 5. Narrative Features

- weekly compilation
- torn-page creation
- torn-page unlock
- retroactive generation
- in-place weekly recompilation

### 6. Sharing and Deployment

- share creation and revocation
- public share page
- DigitalOcean deployment
- `doctl` operational checks

## Required Deliverables

- Running API and worker pipeline
- Daily comic flow working with either mocked or real model backend
- Signed private media access
- Public strip sharing
- Weekly issue and torn-page mechanics
- Deployment notes aligned with [`DEPLOYMENT.md`](./DEPLOYMENT.md)

## Definition of Done

You are done when:

- the app can run end-to-end with async jobs
- the runtime respects the queue/lease/media contracts from [`SPEC.md`](./SPEC.md)
- the app can later swap the mocked model provider for the real fine-tuned model without schema changes

## Important Constraints

- Do not invent a new model I/O contract.
- Do not replace signed URLs with public-but-unlisted media.
- Do not collapse the system into synchronous generation.
- Treat `$200` as a real budget cap.
