"""Panel count, prompt length, and character consistency evaluation."""

def evaluate_panel_count(scripts: list[dict]) -> dict:
    total = len(scripts)
    passed = sum(1 for s in scripts if 4 <= len(s.get("panels", [])) <= 6)
    return {"total": total, "passed": passed, "failures": total - passed,
            "pass_rate": passed / total if total else 0.0}

def evaluate_prompt_length(scripts: list[dict], max_length: int = 500) -> dict:
    total = len(scripts)
    passed = sum(1 for s in scripts
                 if all(len(p.get("visual_prompt", "")) <= max_length
                        for p in s.get("panels", [])))
    return {"total": total, "passed": passed, "failures": total - passed,
            "pass_rate": passed / total if total else 0.0}

def evaluate_character_consistency(examples: list[dict]) -> dict:
    total = len(examples)
    passed = 0
    for ex in examples:
        protagonist_name = (ex.get("input", {}).get("story_arc_snapshot", {})
                           .get("protagonist", {}).get("name", ""))
        output_names = {c.get("name", "") for c in ex.get("target", {}).get("characters", [])}
        if protagonist_name and protagonist_name in output_names:
            passed += 1
        elif not protagonist_name:
            passed += 1
    return {"total": total, "passed": passed, "failures": total - passed,
            "pass_rate": passed / total if total else 0.0}
