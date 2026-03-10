"""Schema validity evaluation for model outputs."""
from dayframe_model.schema_validator import validate_comic_script

def evaluate_schema_validity(scripts: list[dict]) -> dict:
    total = len(scripts)
    passed = 0
    failed_details = []
    for i, script in enumerate(scripts):
        errors = validate_comic_script(script)
        if not errors:
            passed += 1
        else:
            failed_details.append({"index": i, "errors": errors[:3]})
    return {
        "total": total, "passed": passed, "failures": total - passed,
        "pass_rate": passed / total if total > 0 else 0.0,
        "failed_details": failed_details,
    }
