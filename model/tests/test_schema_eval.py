from dayframe_model.eval.schema_eval import evaluate_schema_validity

def test_valid_scripts_pass(sample_comic_script):
    results = evaluate_schema_validity([sample_comic_script])
    assert results["pass_rate"] == 1.0
    assert results["total"] == 1

def test_invalid_scripts_fail(sample_comic_script):
    bad = dict(sample_comic_script)
    del bad["panels"]
    results = evaluate_schema_validity([sample_comic_script, bad])
    assert results["pass_rate"] == 0.5
    assert results["failures"] == 1
