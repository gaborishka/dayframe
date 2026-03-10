from dayframe_model.dataset.targets import build_generation_prompt, parse_comic_script_response
from dayframe_model.schema_validator import validate_comic_script
import json

def test_build_generation_prompt_contains_schema_instruction(sample_enriched_day_context):
    prompt = build_generation_prompt(sample_enriched_day_context, tone="humorous", panel_count=4)
    assert "ComicScript" in prompt
    assert "panels" in prompt
    assert "humorous" in prompt

def test_parse_valid_json_response(sample_comic_script):
    raw = json.dumps(sample_comic_script)
    result, error = parse_comic_script_response(raw)
    assert error is None
    assert result is not None
    assert result["title"] == sample_comic_script["title"]

def test_parse_extracts_json_from_markdown():
    script = {
        "id": "00000000-0000-0000-0000-000000000001",
        "day_context_id": "00000000-0000-0000-0000-000000000002",
        "user_id": "00000000-0000-0000-0000-000000000003",
        "date": "2026-03-10",
        "title": "Test",
        "tone": "humorous",
        "panels": [
            {"sequence": i, "scene_description": "s", "dialogue": [],
             "visual_prompt": "v", "mood": "m", "narrative_caption": None}
            for i in range(1, 5)
        ],
        "characters": [{"name": "X", "role": "protagonist", "visual_description": "d"}],
        "arc_hooks": {"callback_to": None, "setup_for": None, "recurring_elements": []},
        "generation_metadata": {
            "model_version": "synthetic",
            "attempt_count": 1,
            "generation_time_ms": 0,
            "prompt_tokens": 0,
            "completion_tokens": 0
        }
    }
    raw = f"```json\n{json.dumps(script)}\n```"
    result, error = parse_comic_script_response(raw)
    assert error is None
    assert result["title"] == "Test"

def test_parse_invalid_json_returns_error():
    result, error = parse_comic_script_response("not json at all")
    assert result is None
    assert error is not None
