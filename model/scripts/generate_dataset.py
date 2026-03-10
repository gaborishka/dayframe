#!/usr/bin/env python3
"""End-to-end synthetic dataset generation for DayFrame v1."""
import argparse
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from dayframe_model.dataset.personas import PERSONAS, DAY_TYPES, TONES
from dayframe_model.dataset.synthetic_days import generate_day_context
from dayframe_model.dataset.enrich import enrich_day_context
from dayframe_model.dataset.targets import generate_target
from dayframe_model.dataset.curate import curate_example, deduplicate_examples
from dayframe_model.dataset.export import split_dataset, export_jsonl, write_manifest

async def generate_single_example(
    persona_name: str, day_type: str, tone: str,
    panel_count: int, seed: int, day_index: int,
) -> dict | None:
    ctx = generate_day_context(persona_name, day_type, seed=seed)
    enriched = enrich_day_context(ctx, persona_name, day_index=day_index, seed=seed)
    target, error = await generate_target(enriched, tone=tone, panel_count=panel_count)
    if error:
        print(f"  SKIP: {error}")
        return None
    example = {
        "id": f"{persona_name}-{day_type}-{tone}-{panel_count}p-{seed}",
        "input": enriched,
        "target": target,
        "metadata": {
            "persona": persona_name, "tone": tone, "day_type": day_type,
            "panel_count": panel_count, "split": "", "source": "synthetic",
        },
    }
    result = curate_example(example)
    if not result["accepted"]:
        print(f"  REJECT: {result['reason']}")
        return None
    return example

async def main():
    parser = argparse.ArgumentParser(description="Generate DayFrame synthetic dataset")
    parser.add_argument("--target-count", type=int, default=500)
    parser.add_argument("--output-dir", default="data")
    parser.add_argument("--dataset-version", default="v0.1.0")
    args = parser.parse_args()
    os.makedirs(args.output_dir, exist_ok=True)
    examples = []
    seed = 0
    combos = [
        (p["name"], dt, tone, pc)
        for p in PERSONAS for dt in DAY_TYPES for tone in TONES for pc in [4, 5, 6]
    ]
    print(f"Generating up to {args.target_count} examples from {len(combos)} combinations...")
    for persona_name, day_type, tone, panel_count in combos:
        if len(examples) >= args.target_count:
            break
        seed += 1
        day_index = (seed % 7) + 1
        print(f"[{len(examples)+1}/{args.target_count}] {persona_name}/{day_type}/{tone}/{panel_count}p")
        ex = await generate_single_example(persona_name, day_type, tone, panel_count, seed, day_index)
        if ex:
            examples.append(ex)
    examples = deduplicate_examples(examples)
    print(f"\nAfter dedup: {len(examples)} examples")
    splits = split_dataset(examples, train_ratio=0.8, val_ratio=0.1, seed=42)
    for name, exs in splits.items():
        print(f"  {name}: {len(exs)}")
    for split_name, split_examples in splits.items():
        path = os.path.join(args.output_dir, f"{split_name}.jsonl")
        export_jsonl(split_examples, path)
        print(f"Wrote {path}")
    eval_subset = (splits["val"] + splits["test"])[:20]
    eval_path = os.path.join(args.output_dir, "eval_curated_subset.jsonl")
    export_jsonl(eval_subset, eval_path)
    print(f"Wrote {eval_path}")
    manifest_path = os.path.join(args.output_dir, "dataset_manifest.json")
    write_manifest(splits, manifest_path, args.dataset_version, "0.1.0")
    print(f"Wrote {manifest_path}")

if __name__ == "__main__":
    asyncio.run(main())
