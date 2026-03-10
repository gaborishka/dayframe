"""Model inference evaluation — runs the fine-tuned model on test inputs and evaluates outputs."""
import json
import urllib.request
import urllib.error

from dayframe_model.training.formatting import format_inference_input
from dayframe_model.dataset.targets import parse_comic_script_response
from dayframe_model.eval.schema_eval import evaluate_schema_validity
from dayframe_model.eval.leakage_eval import evaluate_leakage
from dayframe_model.eval.compliance_eval import (
    evaluate_panel_count, evaluate_prompt_length, evaluate_character_consistency,
)
from dayframe_model.eval.report import build_eval_report

def _build_inference_payload(messages: list[dict], model_name: str = "dayframe-adapter") -> dict:
    return {
        "model": model_name,
        "messages": messages,
        "max_tokens": 4096,
        "temperature": 0.3,
        "top_p": 0.9,
        "extra_body": {"chat_template_kwargs": {"enable_thinking": False}},
    }

def run_model_inference(
    enriched_context: dict,
    base_url: str,
    api_key: str = "",
    model_name: str = "dayframe-adapter",
) -> tuple[dict | None, str | None]:
    messages = format_inference_input(enriched_context)
    payload = _build_inference_payload(messages, model_name)
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url}/v1/chat/completions",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    if api_key:
        req.add_header("Authorization", f"Bearer {api_key}")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
        raw_text = result["choices"][0]["message"]["content"]
        return parse_comic_script_response(raw_text)
    except Exception as e:
        return None, str(e)

def run_model_eval(
    test_path: str, base_url: str, api_key: str = "",
    dataset_version: str = "v0.1.0", base_model: str = "Qwen/Qwen3-8B",
    adapter_version: str = "v0.1.0", human_review_summary: str = "pending",
    model_name: str = "dayframe-adapter",
) -> dict:
    examples = []
    with open(test_path, "r", encoding="utf-8") as f:
        for line in f:
            examples.append(json.loads(line))
    model_outputs = []
    eval_examples = []
    parse_failures = 0
    for i, ex in enumerate(examples):
        enriched = ex["input"]
        script, error = run_model_inference(enriched, base_url, api_key, model_name)
        if script is None:
            parse_failures += 1
            model_outputs.append({})
            eval_examples.append({"input": enriched, "target": {}})
        else:
            model_outputs.append(script)
            eval_examples.append({"input": enriched, "target": script})
        print(f"  [{i+1}/{len(examples)}] {'OK' if script else f'FAIL: {error}'}")
    schema_results = evaluate_schema_validity(model_outputs)
    leakage_results = evaluate_leakage(eval_examples)
    panel_results = evaluate_panel_count(model_outputs)
    character_results = evaluate_character_consistency(eval_examples)
    prompt_results = evaluate_prompt_length(model_outputs)
    report = build_eval_report(
        schema_results=schema_results, leakage_results=leakage_results,
        panel_results=panel_results, character_results=character_results,
        prompt_length_results=prompt_results, dataset_version=dataset_version,
        base_model=base_model, adapter_version=adapter_version,
        human_review_summary=human_review_summary,
    )
    report["parse_failures"] = parse_failures
    return report
