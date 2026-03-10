"""Format training examples as chat messages for Qwen3 SFT."""
import json

def build_system_prompt() -> str:
    return (
        "You are DayFrame, a comic script generator. "
        "Given an EnrichedDayContext JSON object, produce a valid ComicScript JSON object. "
        "Output ONLY the JSON object. No explanation, no markdown, no thinking. "
        "Rules: 4-6 panels, fictional characters only, visual_prompt ≤500 chars, "
        "no real names/emails/locations from the input."
    )

def format_training_example(example: dict) -> list[dict]:
    system_msg = {"role": "system", "content": build_system_prompt()}
    user_msg = {"role": "user", "content": json.dumps(example["input"], ensure_ascii=False)}
    assistant_msg = {"role": "assistant", "content": json.dumps(example["target"], ensure_ascii=False)}
    return [system_msg, user_msg, assistant_msg]

def format_inference_input(enriched_context: dict) -> list[dict]:
    return [
        {"role": "system", "content": build_system_prompt()},
        {"role": "user", "content": json.dumps(enriched_context, ensure_ascii=False)},
    ]
