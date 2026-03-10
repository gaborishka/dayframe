"""Dataset curation: schema validation, leakage detection, and deduplication."""
import hashlib
import json

from dayframe_model.schema_validator import (
    validate_enriched_day_context,
    validate_comic_script,
)
from dayframe_model.dataset.anonymization import extract_blocked_tokens, check_leakage


def _content_hash(target: dict) -> str:
    """Compute MD5 hash of title + scene_descriptions for deduplication."""
    title = target.get("title", "")
    scene_descriptions = [
        panel.get("scene_description", "")
        for panel in target.get("panels", [])
    ]
    content = json.dumps({"title": title, "scene_descriptions": scene_descriptions}, sort_keys=True)
    return hashlib.md5(content.encode("utf-8")).hexdigest()


def curate_example(example: dict) -> dict:
    """
    Validate and curate a single training example.

    Returns a dict with:
      - "accepted" (bool): True if the example passes all checks
      - "reason" (str): "ok" if accepted, otherwise a description of the failure
    """
    input_data = example.get("input", {})
    target = example.get("target", {})

    # Validate input against EnrichedDayContext schema
    input_errors = validate_enriched_day_context(input_data)
    if input_errors:
        return {"accepted": False, "reason": f"Schema validation failed for input: {input_errors[0]}"}

    # Validate target against ComicScript schema
    target_errors = validate_comic_script(target)
    if target_errors:
        return {"accepted": False, "reason": f"Schema validation failed for target: {target_errors[0]}"}

    # Check panel count is 4-6
    panels = target.get("panels", [])
    panel_count = len(panels)
    if not (4 <= panel_count <= 6):
        return {"accepted": False, "reason": f"Panel count {panel_count} is outside the allowed range 4-6"}

    # Check visual_prompt lengths <= 500
    for i, panel in enumerate(panels):
        visual_prompt = panel.get("visual_prompt", "")
        if len(visual_prompt) > 500:
            return {
                "accepted": False,
                "reason": f"Panel {i + 1} visual_prompt exceeds 500 characters (length={len(visual_prompt)})",
            }

    # Run leakage check using extract_blocked_tokens + check_leakage
    day_context = input_data.get("day_context", {})
    blocked_tokens = extract_blocked_tokens(day_context)
    leakage_issues = check_leakage(target, blocked_tokens)
    if leakage_issues:
        return {"accepted": False, "reason": f"Leakage detected: {leakage_issues[0]}"}

    return {"accepted": True, "reason": "ok"}


def deduplicate_examples(examples: list[dict]) -> list[dict]:
    """
    Remove examples with duplicate content.

    Deduplication is based on MD5 hash of title + scene_descriptions.
    The first occurrence of each unique hash is kept.
    """
    seen: set[str] = set()
    deduped: list[dict] = []
    for example in examples:
        target = example.get("target", {})
        content_hash = _content_hash(target)
        if content_hash not in seen:
            seen.add(content_hash)
            deduped.append(example)
    return deduped
