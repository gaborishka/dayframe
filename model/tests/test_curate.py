from dayframe_model.dataset.curate import curate_example, deduplicate_examples

def test_valid_example_passes(sample_enriched_day_context, sample_comic_script):
    example = {"id": "ex-1", "input": sample_enriched_day_context, "target": sample_comic_script,
               "metadata": {"persona": "developer", "tone": "humorous", "day_type": "productive",
                            "panel_count": 4, "split": "train", "source": "synthetic"}}
    result = curate_example(example)
    assert result["accepted"]

def test_rejects_invalid_target_schema(sample_enriched_day_context, sample_comic_script):
    del sample_comic_script["panels"]
    example = {"id": "ex-2", "input": sample_enriched_day_context, "target": sample_comic_script,
               "metadata": {"persona": "developer", "tone": "humorous", "day_type": "productive",
                            "panel_count": 4, "split": "train", "source": "synthetic"}}
    result = curate_example(example)
    assert not result["accepted"]
    assert "schema" in result["reason"].lower()

def test_rejects_leaking_example(sample_enriched_day_context, sample_comic_script):
    sample_comic_script["panels"][0]["dialogue"][0]["text"] = "alice@example.com said hi"
    example = {"id": "ex-3", "input": sample_enriched_day_context, "target": sample_comic_script,
               "metadata": {"persona": "developer", "tone": "humorous", "day_type": "productive",
                            "panel_count": 4, "split": "train", "source": "synthetic"}}
    result = curate_example(example)
    assert not result["accepted"]

def test_deduplicate_removes_exact_dupes():
    examples = [
        {"id": "a", "target": {"title": "Same Title", "panels": []}},
        {"id": "b", "target": {"title": "Same Title", "panels": []}},
        {"id": "c", "target": {"title": "Different", "panels": []}},
    ]
    deduped = deduplicate_examples(examples)
    assert len(deduped) == 2
