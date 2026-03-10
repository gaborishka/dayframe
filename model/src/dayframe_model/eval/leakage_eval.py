"""Anonymization/leakage evaluation."""
from dayframe_model.dataset.anonymization import check_leakage, extract_blocked_tokens

def evaluate_leakage(examples: list[dict]) -> dict:
    total = len(examples)
    passed = 0
    failed_details = []
    for i, ex in enumerate(examples):
        day_ctx = ex.get("input", {}).get("day_context", {})
        blocked = extract_blocked_tokens(day_ctx)
        issues = check_leakage(ex.get("target", {}), blocked)
        if not issues:
            passed += 1
        else:
            failed_details.append({"index": i, "issues": issues[:3]})
    return {
        "total": total, "passed": passed, "failures": total - passed,
        "pass_rate": passed / total if total > 0 else 0.0,
        "failed_details": failed_details,
    }
