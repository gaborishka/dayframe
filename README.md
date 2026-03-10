# DayFrame Agent Starter Pack

DayFrame is a web application that turns a user's day into a comic strip.
This repository still contains the source-of-truth product and architecture docs, and it now also includes the first working scaffold for the v1 daily generation loop.
The goal of this starter pack is still the same: remove ambiguity before parallel development begins, while leaving the repo in a runnable shape.

## Current Source Of Truth

- `SPEC.md`: product behavior, domain rules, privacy boundary, API semantics, and acceptance criteria.
- `IMPLEMENTATION_ORDER.md`: delivery phases and cross-agent handoffs.
- `AGENT_1.md`: App / Platform brief.
- `AGENT_2.md`: Model / ML brief.
- `TECHNICAL_FOUNDATION.md`: locked repo shape, toolchain, and execution contract for the future scaffold.
- `openapi.yaml`: canonical HTTP API contract.
- `schemas/*.schema.json`: canonical shared payload contracts, especially the locked `EnrichedDayContext -> ComicScript` handoff.
- `.env.example`: canonical environment-variable contract for local and deployed environments.

If any new document contradicts `SPEC.md`, sync the contradiction back into `SPEC.md` instead of creating a second truth source.

## Locked Decisions

- Repo shape: `pnpm` monorepo.
- Public HTTP contract: `openapi.yaml`.
- Shared payload contract: JSON Schema files under `schemas/`.
- App stack: `React + Vite + Tailwind CSS + React Query + Zustand`.
- Runtime stack: `Node.js + TypeScript + Express`.
- Database and migrations: `PostgreSQL + Drizzle + SQL migrations`.
- Test baseline: `Vitest` for unit/integration, `Playwright` for happy-path smoke coverage.

## Monorepo Shape

The scaffold now follows this structure:

```text
apps/
  web/
  api/
  worker/
packages/
  contracts/
  config/
```

Workspace responsibilities:

- `apps/web`: authenticated UI, polling UX, comic viewer, weekly issue views, torn-page unlock flow, and share preview flow.
- `apps/api`: Express API, cookie-based JWT session auth, Google OAuth + Google integrations, idempotent job creation, signed URL issuance, sharing, and weekly/torn-page user-facing reads.
- `apps/worker`: async job executor, queue lease runtime, retries, weekly compilation, torn-page recovery, purge jobs, private model integration, Gemini rendering, and composition flow.
- `packages/contracts`: contract validators and shared TypeScript types derived from the canonical docs-first schemas.
- `packages/config`: shared configuration loading, environment validation, and base tooling presets.

## Canonical Local Workflow

These commands are now implemented as the root developer contract for the scaffold.

```bash
pnpm install
cp .env.example .env
pnpm db:start
pnpm db:migrate
pnpm dev
pnpm test
pnpm test:e2e
pnpm db:stop
```

Command expectations:

- `pnpm install`: installs all workspace dependencies for the monorepo.
- `pnpm db:start`: starts the local PostgreSQL dependency used by `apps/api` and `apps/worker`.
- `pnpm db:migrate`: applies Drizzle-managed SQL migrations to `DATABASE_URL`.
- `pnpm dev`: starts `apps/web`, `apps/api`, and `apps/worker` together.
- `pnpm test`: runs all Vitest unit and integration suites across workspaces.
- `pnpm test:e2e`: runs Playwright happy-path smoke coverage against the local stack.
- `pnpm db:stop`: stops the local PostgreSQL dependency cleanly.

Notes:

- Local env loading falls back to `.env.example` when `.env` is absent.
- The current end-to-end slice uses a deterministic mocked script provider that preserves the locked `EnrichedDayContext -> ComicScript` boundary.
- The worker owns all generation stage transitions; the API does not perform synchronous generation.

## How Agent 1 Starts

1. Read `SPEC.md`, `openapi.yaml`, `schemas/GenerationJob.schema.json`, `schemas/DayContext.schema.json`, `schemas/DailyContextResponse.schema.json`, and `TECHNICAL_FOUNDATION.md`.
2. Extend the scaffold for `apps/web`, `apps/api`, `apps/worker`, `packages/contracts`, and `packages/config`.
3. Keep iterating on the daily async path first before widening into sharing, weekly issues, torn pages, and real integrations.
4. Preserve the locked `EnrichedDayContext -> ComicScript` boundary so the model handoff can be swapped in later without API or schema changes.

## How Agent 2 Starts

1. Read `SPEC.md`, `schemas/EnrichedDayContext.schema.json`, `schemas/ComicScript.schema.json`, and `AGENT_2.md`.
2. Treat the JSON Schemas as the locked payload boundary for dataset generation, training, evaluation, and serving handoff.
3. Build the synthetic dataset and evaluation pipeline independently of the web scaffold.
4. Return a schema-valid, anonymized `ComicScript` payload in non-thinking mode without changing the contract surface.

## Notes For Implementers

- Raw user context may exist only inside the private script-generation boundary.
- Public HTTP behavior must follow `openapi.yaml`; do not add incompatible endpoint semantics in code.
- Shared payload validation must follow the JSON Schema files before any contract is considered complete.
- The initial async scaffold is intentionally narrow; do not infer that missing weekly or torn-page runtime features make the locked contracts optional.
