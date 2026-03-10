from dayframe_model.eval.report import build_eval_report

def _make_results(rate):
    return {"total": 100, "passed": int(rate * 100), "failures": 100 - int(rate * 100), "pass_rate": rate}

def test_all_passing_returns_accept():
    report = build_eval_report(
        schema_results=_make_results(0.98), leakage_results=_make_results(1.0),
        panel_results=_make_results(0.99), character_results=_make_results(0.95),
        prompt_length_results=_make_results(1.0),
        dataset_version="v0.1", base_model="Qwen/Qwen3-8B",
        adapter_version="v0.1", human_review_summary="acceptable",
    )
    assert report["release_decision"] == "accept"

def test_low_schema_rate_returns_reject():
    report = build_eval_report(
        schema_results=_make_results(0.80), leakage_results=_make_results(1.0),
        panel_results=_make_results(0.99), character_results=_make_results(0.95),
        prompt_length_results=_make_results(1.0),
        dataset_version="v0.1", base_model="Qwen/Qwen3-8B",
        adapter_version="v0.1", human_review_summary="acceptable",
    )
    assert report["release_decision"] == "reject"

def test_pending_human_review_returns_reject():
    report = build_eval_report(
        schema_results=_make_results(0.99), leakage_results=_make_results(1.0),
        panel_results=_make_results(0.99), character_results=_make_results(0.95),
        prompt_length_results=_make_results(1.0),
        dataset_version="v0.1", base_model="Qwen/Qwen3-8B",
        adapter_version="v0.1", human_review_summary="pending",
    )
    assert report["release_decision"] == "reject"

def test_low_leakage_rate_returns_reject():
    report = build_eval_report(
        schema_results=_make_results(0.99), leakage_results=_make_results(0.90),
        panel_results=_make_results(0.99), character_results=_make_results(0.95),
        prompt_length_results=_make_results(1.0),
        dataset_version="v0.1", base_model="Qwen/Qwen3-8B",
        adapter_version="v0.1", human_review_summary="acceptable",
    )
    assert report["release_decision"] == "reject"
