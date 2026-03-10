from dayframe_model.eval.compliance_eval import (
    evaluate_panel_count, evaluate_prompt_length, evaluate_character_consistency
)

def test_panel_count_valid(sample_comic_script):
    results = evaluate_panel_count([sample_comic_script])
    assert results["pass_rate"] == 1.0

def test_panel_count_too_few(sample_comic_script):
    sample_comic_script["panels"] = sample_comic_script["panels"][:2]
    results = evaluate_panel_count([sample_comic_script])
    assert results["pass_rate"] == 0.0

def test_prompt_length_valid(sample_comic_script):
    results = evaluate_prompt_length([sample_comic_script])
    assert results["pass_rate"] == 1.0

def test_prompt_length_too_long(sample_comic_script):
    sample_comic_script["panels"][0]["visual_prompt"] = "x" * 501
    results = evaluate_prompt_length([sample_comic_script])
    assert results["pass_rate"] == 0.0

def test_character_consistency_valid(sample_enriched_day_context, sample_comic_script):
    examples = [{"input": sample_enriched_day_context, "target": sample_comic_script}]
    results = evaluate_character_consistency(examples)
    assert results["pass_rate"] == 1.0
