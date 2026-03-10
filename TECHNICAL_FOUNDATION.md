# DayFrame Technical Foundation

Purpose: lock the implementation-facing technical decisions that are not fully explicit in `SPEC.md`, without creating the runtime scaffold yet.

## 1. Contract Status

This document is an implementation contract.
It is not a brainstorming note and it is not optional guidance.
Any future scaffold must conform to the repo shape, tooling, and commands defined here unless `SPEC.md` is updated first.

## 2. Locked Repo Shape

The future repository layout is:

```text
apps/
  web/
  api/
  worker/
packages/
  contracts/
  config/
```

Ownership by workspace:

- `apps/web`
  - stack: `React 18+`, `TypeScript`, `Vite`, `Tailwind CSS`, `React Query`, `Zustand`
  - owns: onboarding, daily view, comic viewer, weekly issue view, library, torn-page unlock, share preview

- `apps/api`
  - stack: `Node.js`, `TypeScript`, `Express`
  - owns: Google OAuth callbacks, HttpOnly cookie-based JWT session issuance, user endpoints, day-context endpoints, generation-job creation, share creation/revocation, signed URL issuance, issue/torn-page read APIs
  - owns database schema and Drizzle migrations in the first scaffold

- `apps/worker`
  - stack: `Node.js`, `TypeScript`
  - owns: PostgreSQL job claiming, leases, heartbeats, retries, recovery sweep, generation pipeline, weekly compilation, torn-page retroactive generation, purge jobs

- `packages/contracts`
  - owns: `openapi.yaml`, JSON Schema files, generated contract types, and any future request/response fixtures derived from the contracts

- `packages/config`
  - owns: shared environment parsing, validation, config defaults, base TypeScript configuration, and shared tooling presets

## 3. Tooling And Runtime Baseline

- Package manager: `pnpm`
- Repo mode: workspaces-based monorepo
- Runtime language: `TypeScript`
- API framework: `Express`
- Database: `PostgreSQL`
- ORM and migrations: `Drizzle` with checked-in SQL migrations
- Unit/integration tests: `Vitest`
- Browser smoke tests: `Playwright`

These choices are locked for the first implementation pass.

## 4. Database And Queue Expectations

- `GenerationJob` rows in PostgreSQL are the only queue source of truth for v1.
- Drizzle schema definitions and SQL migrations are owned by `apps/api` initially.
- `apps/worker` consumes the same database contract and must not fork the schema.
- Lease, heartbeat, retry, and recovery values must match `SPEC.md`:
  - lease TTL: `120 seconds`
  - heartbeat interval: `30 seconds`
  - recovery sweep: `60 seconds`
  - signed URL TTL: `15 minutes`
  - `DayContext` default TTL after completion/failure: `24 hours`

## 5. Canonical Developer Commands

The first scaffold must expose these root-level commands:

- `pnpm install`
- `pnpm db:start`
- `pnpm db:migrate`
- `pnpm dev`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm db:stop`

Expected behavior:

- `pnpm db:start`: starts local PostgreSQL for development.
- `pnpm db:migrate`: runs Drizzle migrations against `DATABASE_URL`.
- `pnpm dev`: runs web, api, and worker together.
- `pnpm test`: runs all Vitest suites.
- `pnpm test:e2e`: runs Playwright happy-path smoke coverage.

These commands are part of the contract and must exist even if their internal implementation evolves.

## 6. Contract Boundary Between Agents

The only locked cross-agent payload boundary is:

- input to model: `EnrichedDayContext`
- output from model: `ComicScript`

Rules:

- Agent 1 may mock the model, but the mock must be schema-valid.
- Agent 2 may build training and serving independently, but must not change `EnrichedDayContext` or `ComicScript`.
- `openapi.yaml` is the canonical HTTP contract.
- `schemas/*.schema.json` are the canonical shared payload contracts.

## 7. Implementation Defaults

Unless `SPEC.md` changes first, the scaffold must assume:

- local web URL: `http://localhost:3000`
- local API URL: `http://localhost:4000`
- private model endpoint exposed only to trusted runtime environments
- all `/api/*` routes use an HttpOnly session cookie carrying the JWT except explicitly public routes
- public share rendering uses `/s/{share_id}`
- the runtime begins with mocked or deterministic script generation before the real model handoff is integrated

## 8. Non-Goals Of This Document

This document does not:

- create the monorepo scaffold
- define UI styling details
- replace the product and privacy rules in `SPEC.md`
- redefine ML training artifacts that already belong to Agent 2's brief
