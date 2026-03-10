# DayFrame Dataset Labeling Guidelines

## Overview

This document describes how the DayFrame v1 synthetic training dataset is generated, validated, and curated.

## Synthetic Day Generation

Each training example starts with a synthetic `DayContext`:
- Generated from one of 6 personas: developer, student, manager, parent, freelancer, creator
- Day types: mundane, stressful, productive, celebratory, sparse_input, recovery_day
- Calendar events drawn from persona-specific patterns
- Todo items drawn from persona-specific task lists
- Reflections sampled from persona reflection templates
- No real user data is used at any stage

## Fictionalization Enforcement

The target `ComicScript` must:
- Use only fictional character names from the story arc
- Never include real email addresses, phone numbers, or street addresses
- Transform real-world events into narrative equivalents (e.g., "team standup" becomes "council gathering")
- Keep visual prompts free of personally identifiable information

## Acceptance Criteria

A target example is acceptable when:
1. It parses as valid JSON matching the `ComicScript` schema
2. It contains 4-6 panels with sequential numbering
3. All `visual_prompt` values are ≤500 characters
4. The protagonist from the input `story_arc_snapshot` appears in the output characters
5. No email, phone, or address patterns appear in any text field
6. No blocked tokens from the input DayContext appear in the output
7. The narrative is coherent and relates to the day's events

## Rejection Reasons

- Malformed JSON
- Schema validation failure
- Panel count outside 4-6 range
- Real names, emails, or locations leaked into output
- Incoherent or nonsensical narrative
- Near-duplicate of existing example
- Visual prompts too long or unusable for image generation

## Curator Workflow

1. Run automated validation (schema + anonymization + compliance)
2. Review flagged examples manually
3. Accept, reject, or mark for regeneration
4. Update eval_curated_subset.jsonl with 20 manually reviewed examples covering:
   - mundane day, stressful day, sparse-input day, continuity day, recovery day
