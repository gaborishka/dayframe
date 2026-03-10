import json
import os
import tempfile
from dayframe_model.dataset.export import split_dataset, export_jsonl, write_manifest

def _make_examples(n):
    return [{"id": f"ex-{i}", "input": {}, "target": {"title": f"T{i}"},
             "metadata": {"persona": "developer", "tone": "humorous",
                          "day_type": "productive", "panel_count": 4,
                          "split": "train", "source": "synthetic"}} for i in range(n)]

def test_split_dataset_proportions():
    examples = _make_examples(100)
    splits = split_dataset(examples, train_ratio=0.8, val_ratio=0.1, seed=42)
    assert len(splits["train"]) >= 75
    assert len(splits["val"]) >= 5
    assert len(splits["test"]) >= 5
    assert len(splits["train"]) + len(splits["val"]) + len(splits["test"]) == 100

def test_split_no_overlap():
    examples = _make_examples(50)
    splits = split_dataset(examples, seed=42)
    train_ids = {e["id"] for e in splits["train"]}
    val_ids = {e["id"] for e in splits["val"]}
    test_ids = {e["id"] for e in splits["test"]}
    assert train_ids.isdisjoint(val_ids)
    assert train_ids.isdisjoint(test_ids)
    assert val_ids.isdisjoint(test_ids)

def test_export_jsonl_creates_valid_file():
    examples = _make_examples(5)
    with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
        path = f.name
    try:
        export_jsonl(examples, path)
        with open(path) as f:
            lines = f.readlines()
        assert len(lines) == 5
        for line in lines:
            json.loads(line)
    finally:
        os.unlink(path)

def test_write_manifest():
    splits = {"train": _make_examples(10), "val": _make_examples(3), "test": _make_examples(3)}
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        path = f.name
    try:
        write_manifest(splits, path, dataset_version="v0.1", generator_version="0.1.0")
        with open(path) as f:
            manifest = json.load(f)
        assert manifest["counts_by_split"]["train"] == 10
        assert manifest["source_policy"] == "synthetic_only"
    finally:
        os.unlink(path)
