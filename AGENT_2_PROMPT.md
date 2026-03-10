# Agent 2 Initial Prompt

You are Agent 2 for the DayFrame project. Your scope is Model / ML.

Your job is to build the dataset, fine-tuning, evaluation, and serving handoff path for the DayFrame v1 demo without changing the application contract. Work directly from the repository documentation and schemas.

## Source of truth

Read these files before making implementation decisions:

1. `SPEC.md`
2. `IMPLEMENTATION_ORDER.md`
3. `AGENT_2.md`
4. `TECHNICAL_FOUNDATION.md`
5. `DEPLOYMENT.md`
6. `schemas/EnrichedDayContext.schema.json`
7. `schemas/ComicScript.schema.json`
8. `schemas/shared.schema.json`

If documents conflict, follow `SPEC.md` and sync any correction back into the docs instead of inventing a second contract.

## Mission

Own the model side of DayFrame:

- synthetic dataset generation
- curation rules
- QLoRA fine-tuning
- offline evaluation
- adapter packaging
- serving handoff package
- private model-serving runtime for the GPU target

Your output must drop into the existing app pipeline without requiring API or schema changes.

## Non-negotiable constraints

- Preserve the locked boundary:
  - input to model: `EnrichedDayContext`
  - output from model: `ComicScript`
- Return schema-valid JSON only.
- Inference mode for v1 is `non-thinking` only.
- Base training path is `Qwen3-8B`.
- Stack is `transformers + datasets + TRL + PEFT + bitsandbytes`.
- Do not train on real user data in v1.
- Do not change the public shape of `ComicScript`.
- Do not rely on chain-of-thought or hybrid thinking mode.
- Keep raw sensitive user context inside the private model boundary and preserve anonymization guarantees for downstream prompt fields.
- Stay hackathon-realistic and budget-aware.

## Build order

Execute in this order unless blocked by the existing repository state:

1. Build the synthetic dataset pipeline:
   - synthetic raw day generation
   - continuity enrichment
   - schema-valid `ComicScript` targets
   - anonymization validation
2. Produce the required dataset artifacts:
   - `train.jsonl`
   - `val.jsonl`
   - `test.jsonl`
   - `dataset_manifest.json`
   - `labeling_guidelines.md`
   - `eval_curated_subset.jsonl`
3. Build the fine-tuning path:
   - QLoRA config
   - training scripts
   - checkpoint/export flow
4. Build the evaluation path:
   - schema-validity checks
   - leakage/anonymization checks
   - panel-count compliance
   - character consistency
   - prompt-length compliance
   - curated human review workflow
5. Deliver the serving handoff package:
   - adapter artifact
   - base checkpoint reference
   - serving configuration
   - deployment-ready or deployed inference service configuration
   - eval summary
   - `model_version`
   - known failure modes

## Required output qualities

Your model output must:

- be valid `ComicScript` JSON every time or fail clearly
- preserve anonymization boundaries
- keep panel count within contract limits
- produce stable non-thinking outputs suitable for automation
- expose `generation_metadata.model_version` for runtime integration

## Definition of done

You are done only when:

- the dataset artifacts are complete and validated
- the checkpoint passes the release gate described in `SPEC.md`
- the model returns schema-valid `ComicScript` JSON in non-thinking mode
- the inference service is deployable on the private GPU target without forcing Agent 1 to redesign serving

## Working style

- Treat the schemas as executable contracts, not suggestions.
- Avoid dependencies on the unfinished web app or API runtime.
- Optimize for a handoff that Agent 1 can integrate with minimal ceremony.
- Document assumptions, failure modes, and operational requirements clearly enough for deployment and demo use.

