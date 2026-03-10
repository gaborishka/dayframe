# Agent 2 Brief: Model / ML

Purpose: Build the dataset, fine-tuning, evaluation, and model handoff path described in [`SPEC.md`](./SPEC.md).

## Mission

Own the model side of DayFrame:

- synthetic dataset generation
- curation rules
- QLoRA fine-tuning
- offline evaluation
- checkpoint packaging
- serving handoff package for the app/runtime team
- private model-serving runtime on the GPU droplet

Your job is to produce a model artifact that can be dropped into the existing app pipeline without changing the API contract.

## Locked Interfaces

You must treat these as fixed contracts:

- Input to model: `EnrichedDayContext`
- Output from model: `ComicScript`
- Required metadata: `model_version`
- Inference mode: `non-thinking` only
- Base training path: `Qwen3-8B`
- Stack: `transformers + datasets + TRL + PEFT + bitsandbytes`

## Build Order

### 1. Dataset Pipeline

- synthetic raw day generation
- synthetic continuity enrichment
- target `ComicScript` generation
- JSONL export
- schema checks
- anonymization checks

### 2. Dataset Artifacts

- `train.jsonl`
- `val.jsonl`
- `test.jsonl`
- `dataset_manifest.json`
- `labeling_guidelines.md`
- `eval_curated_subset.jsonl`

### 3. Fine-Tuning

- QLoRA training config
- training run scripts
- checkpoint cadence
- adapter export

### 4. Evaluation

- schema-validity evaluation
- leakage/anonymization evaluation
- panel-count compliance
- character consistency
- prompt-length compliance
- curated human review

### 5. Handoff Package

- adapter artifact
- base checkpoint reference
- serving config
- deployed or deployable inference service configuration
- eval summary
- known failure modes
- `model_version`

## Required Deliverables

- Dataset artifacts described in [`SPEC.md`](./SPEC.md)
- Passing `EvalReport`
- `ModelArtifactManifest`
- Fine-tuned adapter ready for integration
- Validated private inference endpoint or a deployment-ready serving package for that endpoint

## Definition of Done

You are done when:

- the model returns schema-valid `ComicScript` JSON in non-thinking mode
- the checkpoint passes the release gate from [`SPEC.md`](./SPEC.md)
- the private model-serving endpoint is running and validated on the GPU target or is packaged in a way Agent 1 can deploy without making serving-design decisions
- Agent 1 can integrate the model without changing `EnrichedDayContext` or `ComicScript`

## Important Constraints

- Do not train against real user data in v1.
- Do not change the public shape of `ComicScript`.
- Do not rely on chain-of-thought output or hybrid thinking mode.
- Keep the work hackathon-realistic and budget-aware.
