from dayframe_model.eval.leakage_eval import evaluate_leakage

def test_clean_examples_pass(sample_enriched_day_context, sample_comic_script):
    examples = [{"input": sample_enriched_day_context, "target": sample_comic_script}]
    results = evaluate_leakage(examples)
    assert results["pass_rate"] == 1.0

def test_leaking_example_fails(sample_enriched_day_context, sample_comic_script):
    sample_comic_script["panels"][0]["visual_prompt"] = "john@example.com walks in"
    examples = [{"input": sample_enriched_day_context, "target": sample_comic_script}]
    results = evaluate_leakage(examples)
    assert results["pass_rate"] == 0.0
