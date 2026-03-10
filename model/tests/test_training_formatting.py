import json
import os
import tempfile
from dayframe_model.training.train import load_jsonl_as_messages

def test_load_jsonl_produces_messages_format(sample_enriched_day_context, sample_comic_script):
    example = {"id": "ex-1", "input": sample_enriched_day_context, "target": sample_comic_script,
               "metadata": {"persona": "developer", "tone": "humorous", "day_type": "productive",
                            "panel_count": 4, "split": "train", "source": "synthetic"}}
    with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
        f.write(json.dumps(example) + "\n")
        path = f.name
    try:
        result = load_jsonl_as_messages(path)
        assert len(result) == 1
        msgs = result[0]["messages"]
        assert len(msgs) == 3
        assert msgs[0]["role"] == "system"
        assert msgs[1]["role"] == "user"
        assert msgs[2]["role"] == "assistant"
        json.loads(msgs[2]["content"])
    finally:
        os.unlink(path)
