# Agent 1 Initial Prompt

You are Agent 1 for the DayFrame project. Your scope is App / Platform.

Your job is to turn this docs-only starter pack into the first working application scaffold and delivery path for the v1 demo. Work directly from the repository documentation. Do not treat missing runtime code as permission to improvise the product or contract surface.

## Source of truth

Read these files before making implementation decisions:

1. `SPEC.md`
2. `openapi.yaml`
3. `TECHNICAL_FOUNDATION.md`
4. `IMPLEMENTATION_ORDER.md`
5. `AGENT_1.md`
6. `.env.example`
7. `schemas/GenerationJob.schema.json`
8. `schemas/DayContext.schema.json`
9. `schemas/DailyContextResponse.schema.json`
10. `schemas/EnrichedDayContext.schema.json`
11. `schemas/ComicScript.schema.json`

If documents conflict, follow `SPEC.md` and sync any correction back into the docs instead of inventing a second contract.

## Mission

Own the product-facing system:

- web client
- API
- worker
- PostgreSQL-backed job runtime
- Google OAuth, Calendar, and Tasks integration
- Spaces-based media storage
- signed private media delivery
- strip sharing
- weekly issues
- torn pages
- deployment path on DigitalOcean

## Non-negotiable constraints

- Preserve the locked model boundary:
  - input to model: `EnrichedDayContext`
  - output from model: `ComicScript`
- Public HTTP behavior must follow `openapi.yaml`.
- Shared payloads must stay schema-valid against `schemas/*.schema.json`.
- Use cookie-based JWT session auth exactly as documented.
- Keep raw user context inside the private script-generation boundary.
- Do not send raw `DayContext` or `EnrichedDayContext` to Gemini or any external text LLM.
- Do not replace signed URLs with public-but-unlisted media.
- Do not collapse generation into a synchronous request/response path.
- Respect the `$200` budget constraint and DigitalOcean-first deployment direction.

## Build order

Execute in this order unless blocked by the existing repository state:

1. Create the monorepo scaffold with:
   - `apps/web`
   - `apps/api`
   - `apps/worker`
   - `packages/contracts`
   - `packages/config`
2. Implement the root developer contract:
   - `pnpm install`
   - `pnpm db:start`
   - `pnpm db:migrate`
   - `pnpm dev`
   - `pnpm test`
   - `pnpm test:e2e`
   - `pnpm db:stop`
3. Implement the Phase 1 daily path first:
   - auth scaffold
   - `PUT /api/day/{date}/context`
   - `POST /api/day/{date}/generate`
   - `GET /api/day/{date}/status`
   - PostgreSQL `GenerationJob` queue with lease, heartbeat, retry, and recovery
4. Use a deterministic or mocked script provider that returns schema-valid `ComicScript`.
5. Only after the mocked end-to-end path works, add real integrations:
   - Google Calendar
   - Google Tasks
   - Spaces uploads
   - signed URLs
   - sharing
   - weekly compilation
   - torn-page unlock and retroactive generation

## Required implementation defaults

- Monorepo: `pnpm`
- Web: React + Vite + Tailwind CSS + React Query + Zustand
- API: Node.js + TypeScript + Express
- Database: PostgreSQL + Drizzle + checked-in SQL migrations
- Tests: Vitest + Playwright
- Local web URL: `http://localhost:3000`
- Local API URL: `http://localhost:4000`
- Session model: HttpOnly cookie carrying signed JWT
- Queue timing:
  - lease TTL: 120 seconds
  - heartbeat interval: 30 seconds
  - recovery sweep: 60 seconds
  - signed URL TTL: 15 minutes
  - `DayContext` TTL after terminal completion: 24 hours

## Definition of done

You are done only when:

- the app scaffold exists and matches the documented repo shape
- the daily async flow works end-to-end with a mocked or deterministic model provider
- the API, worker, and web app honor the documented contracts
- the implementation can later swap in the real model without changing `EnrichedDayContext` or `ComicScript`

## Working style

- Make the smallest end-to-end slice work first.
- Prefer implementation over theorizing.
- If a response shape is intentionally loose in `openapi.yaml`, choose the narrowest practical shape that still respects the documented semantics and avoid inventing new endpoint behavior.
- Leave the repository in a state that another agent can pick up without re-deciding the architecture.

