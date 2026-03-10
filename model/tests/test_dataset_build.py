"""Dataset build checks per SPEC.md §10.11. Run after dataset generation."""
import json
import os
import pathlib
import pytest

DATA_DIR = pathlib.Path(__file__).parent.parent / "data"

def _skip_if_no_data():
    if not (DATA_DIR / "train.jsonl").exists():
        pytest.skip("Dataset not yet generated")

class TestDatasetBuild:
    def setup_method(self):
        _skip_if_no_data()

    def _load_jsonl(self, name):
        path = DATA_DIR / name
        examples = []
        with open(path) as f:
            for line in f:
                examples.append(json.loads(line))
        return examples

    def test_jsonl_files_parse(self):
        for name in ["train.jsonl", "val.jsonl", "test.jsonl"]:
            examples = self._load_jsonl(name)
            assert len(examples) > 0, f"{name} is empty"

    def test_no_empty_splits(self):
        for name in ["train.jsonl", "val.jsonl", "test.jsonl"]:
            examples = self._load_jsonl(name)
            assert len(examples) > 0

    def test_no_duplicate_ids_across_splits(self):
        all_ids = set()
        for name in ["train.jsonl", "val.jsonl", "test.jsonl"]:
            for ex in self._load_jsonl(name):
                eid = ex["id"]
                assert eid not in all_ids, f"Duplicate ID: {eid}"
                all_ids.add(eid)

    def test_no_content_overlap_between_splits(self):
        train_titles = {ex["target"]["title"] for ex in self._load_jsonl("train.jsonl")}
        val_titles = {ex["target"]["title"] for ex in self._load_jsonl("val.jsonl")}
        test_titles = {ex["target"]["title"] for ex in self._load_jsonl("test.jsonl")}
        assert train_titles.isdisjoint(val_titles), "train/val title overlap"
        assert train_titles.isdisjoint(test_titles), "train/test title overlap"

    def test_manifest_counts_match(self):
        with open(DATA_DIR / "dataset_manifest.json") as f:
            manifest = json.load(f)
        for split in ["train", "val", "test"]:
            actual = len(self._load_jsonl(f"{split}.jsonl"))
            expected = manifest["counts_by_split"][split]
            assert actual == expected, f"{split}: {actual} != {expected}"

    def test_curated_subset_exists(self):
        path = DATA_DIR / "eval_curated_subset.jsonl"
        assert path.exists()
        examples = []
        with open(path) as f:
            for line in f:
                examples.append(json.loads(line))
        assert len(examples) >= 20
