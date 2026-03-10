"""EvalReport generation per SPEC.md §10.9."""
import json

def build_eval_report(
    schema_results: dict, leakage_results: dict, panel_results: dict,
    character_results: dict, prompt_length_results: dict,
    dataset_version: str, base_model: str, adapter_version: str,
    human_review_summary: str = "pending",
) -> dict:
    schema_ok = schema_results["pass_rate"] >= 0.95
    leakage_ok = leakage_results["pass_rate"] >= 0.98
    panel_ok = panel_results["pass_rate"] >= 0.95
    human_ok = human_review_summary not in ("pending", "reject")
    release = "accept" if (schema_ok and leakage_ok and panel_ok and human_ok) else "reject"
    return {
        "dataset_version": dataset_version,
        "base_model": base_model,
        "adapter_version": adapter_version,
        "schema_pass_rate": schema_results["pass_rate"],
        "leakage_pass_rate": leakage_results["pass_rate"],
        "panel_count_pass_rate": panel_results["pass_rate"],
        "character_consistency_pass_rate": character_results["pass_rate"],
        "visual_prompt_length_pass_rate": prompt_length_results["pass_rate"],
        "human_review_summary": human_review_summary,
        "release_decision": release,
    }

def save_eval_report(report: dict, path: str) -> None:
    with open(path, "w") as f:
        json.dump(report, f, indent=2)

def print_eval_report(report: dict) -> None:
    print("\n=== DayFrame Eval Report ===")
    print(f"  Dataset:    {report['dataset_version']}")
    print(f"  Base model: {report['base_model']}")
    print(f"  Adapter:    {report['adapter_version']}")
    print(f"  Schema:     {report['schema_pass_rate']:.1%}")
    print(f"  Leakage:    {report['leakage_pass_rate']:.1%}")
    print(f"  Panels:     {report['panel_count_pass_rate']:.1%}")
    print(f"  Characters: {report['character_consistency_pass_rate']:.1%}")
    print(f"  Prompts:    {report['visual_prompt_length_pass_rate']:.1%}")
    print(f"  Human:      {report['human_review_summary']}")
    print(f"  Decision:   {report['release_decision']}")
    print("===========================\n")
