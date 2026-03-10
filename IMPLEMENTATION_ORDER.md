# DayFrame Implementation Order

Purpose: Define the recommended build order for DayFrame based on [`SPEC.md`](./SPEC.md), with work split between two parallel agents.

## 1. Delivery Model

The project should be executed in two parallel tracks:

- `Agent 1: App / Platform`
  - Owns web client, API, worker, queue/runtime, Google integrations, storage, sharing, weekly issues, torn pages, and DigitalOcean deployment.

- `Agent 2: Model / ML`
  - Owns synthetic dataset generation, curation, fine-tuning, offline evaluation, checkpoint packaging, and model-serving handoff contract.

Both agents must treat the following interface as locked:

- Input to model: `EnrichedDayContext`
- Output from model: `ComicScript`
- Runtime metadata: `model_version`, JSON validity, anonymization constraints, latency/error expectations

## 2. Global Rules

- [`SPEC.md`](./SPEC.md) is the source of truth for product behavior and technical contracts.
- Delivery is `demo-first`: build the smallest end-to-end path early, then replace temporary internals with final components.
- DigitalOcean is the deployment target for core runtime services.
- Budget cap is `$200`; GPU usage must be intentional and time-boxed.
- `doctl` is available and should be used for operational checks and deployment workflows.

## 3. Phase Order

### Phase 0: Contract Lock

Owner:

- Agent 1 and Agent 2 jointly

Deliverables:

- Confirm the `EnrichedDayContext -> ComicScript` contract from [`SPEC.md`](./SPEC.md).
- Confirm `GenerationJob` status vocabulary and API polling contract.
- Confirm the privacy boundary and anonymization expectations.

Exit criteria:

- Both agents agree they can work independently against the same model interface.

### Phase 1: App Skeleton and Mocked Model Path

Owner:

- Agent 1 primary

Deliverables:

- Project skeleton for web client, API, worker, and database.
- Auth flow scaffold.
- `PUT /api/day/{date}/context`
- `POST /api/day/{date}/generate`
- `GET /api/day/{date}/status`
- PostgreSQL-backed `GenerationJob` flow with worker lease/heartbeat/recovery behavior.
- Temporary mocked or deterministic `ComicScript` provider that satisfies the schema.

Exit criteria:

- User can submit context and see an async job move through stages.
- A stub strip can be produced end-to-end without the final fine-tuned model.

### Phase 2: Synthetic Dataset Pipeline

Owner:

- Agent 2 primary

Deliverables:

- Dataset generator for `TrainingExample` JSONL.
- `train.jsonl`, `val.jsonl`, `test.jsonl`
- `dataset_manifest.json`
- `labeling_guidelines.md`
- `eval_curated_subset.jsonl`
- Validation scripts for schema and anonymization checks.

Exit criteria:

- Synthetic dataset builds cleanly and passes the offline dataset checks defined in [`SPEC.md`](./SPEC.md).

### Phase 3: Real App Integrations

Owner:

- Agent 1 primary

Deliverables:

- Google Calendar ingestion.
- Google Tasks ingestion.
- Daily view with status polling.
- Spaces upload flow.
- Signed URL access for private media.
- Public share creation and revocation.

Exit criteria:

- Real daily context can flow into the pipeline.
- Private and public media access follow the spec.

### Phase 4: Fine-Tuning and Offline Eval

Owner:

- Agent 2 primary

Deliverables:

- `Qwen3-8B` QLoRA training pipeline.
- Adapter artifacts.
- `EvalReport`
- `ModelArtifactManifest`
- Offline held-out evaluation results.
- Serving handoff package for inference integration.
- Model-serving runtime on the GPU droplet, including the inference process, serving configuration, and health validation.

Exit criteria:

- Checkpoint passes the release gate from [`SPEC.md`](./SPEC.md).
- Model output is stable in `non-thinking` mode and returns valid `ComicScript` JSON.
- The private inference endpoint is reachable and validated before Agent 1 integration begins.

### Phase 5: Model Integration

Owner:

- Agent 1 primary
- Agent 2 support

Deliverables:

- Replace mocked model provider with the packaged fine-tuned checkpoint.
- Wire the worker to the private model-serving endpoint.
- Capture `generation_metadata.model_version`.
- Verify privacy and schema validation against real model output.

Exit criteria:

- End-to-end daily generation works with the fine-tuned model in the real pipeline.
- Agent 1 does not own model training or serving internals; Agent 1 owns only runtime integration with the already validated private model endpoint.

### Phase 6: Weekly Narrative Loop

Owner:

- Agent 1 primary

Deliverables:

- Weekly compilation job.
- Torn-page creation at cutoff.
- Torn-page unlock flow.
- Retroactive generation path.
- In-place weekly recompilation rules.

Exit criteria:

- A week can compile, show missed days, accept unlock input, and update the same weekly issue after retroactive generation.

### Phase 7: Hardening and Demo Readiness

Owner:

- Agent 1 and Agent 2 jointly

Deliverables:

- Validation matrix coverage from [`SPEC.md`](./SPEC.md).
- Deployment scripts/checks using `doctl`.
- Budget-aware runtime plan for demo day.
- Demo seed data and rehearsal flow.

Exit criteria:

- The system is deployable on DigitalOcean and can be demonstrated reliably within budget.

## 4. Parallel Work Split

### Agent 1: App / Platform Scope

Build in this order:

1. Database models and migrations
2. API skeleton
3. Worker + queue lease runtime
4. Daily context flows
5. Mocked generation pipeline
6. Google integrations
7. Spaces uploads + signed URLs
8. Sharing
9. Weekly issue compilation
10. Torn page unlock and retroactive recomposition
11. Deployment and operational tooling

Agent 1 may proceed before fine-tuning is complete by using:

- mocked `ComicScript` fixtures, or
- a deterministic placeholder generator that honors the JSON schema

### Agent 2: Model / ML Scope

Build in this order:

1. Synthetic input generator
2. Synthetic target generator
3. Dataset validation and curation scripts
4. Dataset artifact export
5. QLoRA training config and run scripts
6. Offline evaluation and human review flow
7. Adapter packaging and serving handoff documentation

Agent 2 must not depend on the finished UI or app runtime. The only required upstream contract is the schema in [`SPEC.md`](./SPEC.md).

## 5. Handoff Points Between Agents

### Handoff A: Mock Contract Ready

Producer:

- Agent 1

Consumer:

- Agent 2

What is handed off:

- Confirmed `EnrichedDayContext` example payloads
- Confirmed `ComicScript` response schema
- Known stage timing/error expectations for the worker

### Handoff B: Training Artifacts Ready

Producer:

- Agent 2

Consumer:

- Agent 1

What is handed off:

- base checkpoint reference
- adapter artifact
- serving config
- `model_version`
- eval summary
- known limitations or bad-case patterns

### Handoff C: Final Integration Signoff

Producer:

- Agent 1 and Agent 2 jointly

What is verified:

- real model output passes app validation
- latency is acceptable for demo use
- output remains anonymized and schema-valid in the live pipeline

## 6. Temporary vs Final Components

Temporary components allowed early:

- mocked `ComicScript` generator
- placeholder panel images
- simplified weekly cover behavior

Final components required before demo-complete:

- real private fine-tuned model
- signed private media access
- weekly recompilation behavior
- validated share flow

## 7. Demo-First Milestones

### Milestone A: Vertical Slice

- auth works
- context submission works
- async job runs
- stub comic strip renders

### Milestone B: Real Inputs

- Google Calendar and Tasks flow in
- storage and private media access work

### Milestone C: Real Model

- fine-tuned model is integrated
- schema/anonymization checks pass

### Milestone D: Story Loop

- weekly issue + torn page + unlock flow all work

### Milestone E: Demo Freeze

- deployment is stable on DigitalOcean
- GPU runtime plan fits budget
- critical scenarios have been rehearsed

## 8. Definition of Done for Implementation Order

The implementation order is complete when:

- Agent 1 can ship the app pipeline without waiting for unfinished ML experiments.
- Agent 2 can train and evaluate the model without waiting for unfinished frontend work.
- The final integration point between both agents is explicit, stable, and already covered by the spec.
