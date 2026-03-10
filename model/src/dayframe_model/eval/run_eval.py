"""Full evaluation pipeline runner."""
import json

from dayframe_model.eval.schema_eval import evaluate_schema_validity
from dayframe_model.eval.leakage_eval import evaluate_leakage
from dayframe_model.eval.compliance_eval import (
    evaluate_panel_count, evaluate_prompt_length, evaluate_character_consistency,
)
from dayframe_model.eval.report import build_eval_report

def run_full_eval(
    test_path: str, dataset_version: str, base_model: str,
    adapter_version: str, human_review_summary: str = "pending",
) -> dict:
    examples = []
    with open(test_path, "r", encoding="utf-8") as f:
        for line in f:
            examples.append(json.loads(line))
    scripts = [ex["target"] for ex in examples]
    schema_results = evaluate_schema_validity(scripts)
    leakage_results = evaluate_leakage(examples)
    panel_results = evaluate_panel_count(scripts)
    character_results = evaluate_character_consistency(examples)
    prompt_results = evaluate_prompt_length(scripts)
    return build_eval_report(
        schema_results=schema_results, leakage_results=leakage_results,
        panel_results=panel_results, character_results=character_results,
        prompt_length_results=prompt_results, dataset_version=dataset_version,
        base_model=base_model, adapter_version=adapter_version,
        human_review_summary=human_review_summary,
    )
