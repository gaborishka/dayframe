import pytest
from dayframe_model.schema_validator import validate_enriched_day_context, validate_comic_script

def test_valid_enriched_day_context(sample_enriched_day_context):
    errors = validate_enriched_day_context(sample_enriched_day_context)
    assert errors == []

def test_invalid_enriched_day_context_missing_field(sample_enriched_day_context):
    del sample_enriched_day_context["day_context"]
    errors = validate_enriched_day_context(sample_enriched_day_context)
    assert len(errors) > 0

def test_valid_comic_script(sample_comic_script):
    errors = validate_comic_script(sample_comic_script)
    assert errors == []

def test_invalid_comic_script_too_few_panels(sample_comic_script):
    sample_comic_script["panels"] = sample_comic_script["panels"][:2]
    errors = validate_comic_script(sample_comic_script)
    assert len(errors) > 0

def test_invalid_comic_script_too_many_panels(sample_comic_script):
    sample_comic_script["panels"] = sample_comic_script["panels"] * 3
    errors = validate_comic_script(sample_comic_script)
    assert len(errors) > 0

def test_visual_prompt_length(sample_comic_script):
    sample_comic_script["panels"][0]["visual_prompt"] = "x" * 501
    errors = validate_comic_script(sample_comic_script)
    assert len(errors) > 0
