"""Dataset export: train/val/test splitting, JSONL export, and manifest generation."""
from __future__ import annotations

import json
import random
from collections import Counter
from datetime import datetime, timezone


def split_dataset(
    examples: list[dict],
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
    seed: int = 42,
) -> dict[str, list]:
    """
    Shuffle and split examples into train/val/test sets.

    The test split receives all remaining examples after train and val.
    Each example's metadata["split"] field is updated in-place.

    Returns a dict with keys "train", "val", "test".
    """
    rng = random.Random(seed)
    shuffled = list(examples)
    rng.shuffle(shuffled)

    n = len(shuffled)
    train_end = int(n * train_ratio)
    val_end = train_end + int(n * val_ratio)

    splits = {
        "train": shuffled[:train_end],
        "val": shuffled[train_end:val_end],
        "test": shuffled[val_end:],
    }

    for split_name, split_examples in splits.items():
        for example in split_examples:
            if "metadata" in example:
                example["metadata"]["split"] = split_name

    return splits


def export_jsonl(examples: list[dict], path: str) -> None:
    """
    Write a list of examples to a JSONL file (one JSON object per line, UTF-8).
    """
    with open(path, "w", encoding="utf-8") as f:
        for example in examples:
            f.write(json.dumps(example, ensure_ascii=False) + "\n")


def write_manifest(
    splits: dict[str, list],
    path: str,
    dataset_version: str,
    generator_version: str,
) -> None:
    """
    Write a dataset_manifest.json file summarising the dataset.

    Includes:
      - dataset_version
      - generator_version
      - created_at (ISO 8601 UTC)
      - counts_by_split
      - total_examples
      - coverage_summary (personas, tones, day_types, panel_counts, narrative_modes)
      - language
      - source_policy
    """
    all_examples: list[dict] = []
    for split_examples in splits.values():
        all_examples.extend(split_examples)

    counts_by_split = {name: len(exs) for name, exs in splits.items()}

    # Build coverage summary from metadata fields
    personas: Counter = Counter()
    tones: Counter = Counter()
    day_types: Counter = Counter()
    panel_counts: Counter = Counter()
    narrative_modes: Counter = Counter()

    for example in all_examples:
        meta = example.get("metadata", {})
        if meta.get("persona"):
            personas[meta["persona"]] += 1
        if meta.get("tone"):
            tones[meta["tone"]] += 1
        if meta.get("day_type"):
            day_types[meta["day_type"]] += 1
        if meta.get("panel_count"):
            panel_counts[str(meta["panel_count"])] += 1

        target = example.get("target", {})
        if target.get("narrative_mode"):
            narrative_modes[target["narrative_mode"]] += 1

    manifest = {
        "dataset_version": dataset_version,
        "generator_version": generator_version,
        "created_at": datetime.now(tz=timezone.utc).isoformat(),
        "counts_by_split": counts_by_split,
        "total_examples": len(all_examples),
        "coverage_summary": {
            "personas": dict(personas),
            "tones": dict(tones),
            "day_types": dict(day_types),
            "panel_counts": dict(panel_counts),
            "narrative_modes": dict(narrative_modes),
        },
        "language": "en",
        "source_policy": "synthetic_only",
    }

    with open(path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write("\n")
