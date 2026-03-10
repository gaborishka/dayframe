#!/usr/bin/env python3
"""CLI: evaluate fine-tuned model via inference against test split."""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from dayframe_model.eval.run_model_eval import run_model_eval
from dayframe_model.eval.report import save_eval_report, print_eval_report

def main():
    parser = argparse.ArgumentParser(description="Run model inference eval")
    parser.add_argument("--test-path", default="data/test.jsonl")
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--api-key", default=os.environ.get("PRIVATE_MODEL_API_KEY", ""))
    parser.add_argument("--dataset-version", default="v0.1.0")
    parser.add_argument("--base-model", default="Qwen/Qwen3-8B")
    parser.add_argument("--adapter-version", default="v0.1.0")
    parser.add_argument("--human-review", default="pending")
    parser.add_argument("--output", default="artifacts/model_eval_report.json")
    args = parser.parse_args()
    print(f"Running model inference eval against {args.base_url}...")
    report = run_model_eval(
        args.test_path, args.base_url, args.api_key,
        args.dataset_version, args.base_model, args.adapter_version,
        args.human_review,
    )
    print_eval_report(report)
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    save_eval_report(report, args.output)
    print(f"Model eval report saved to {args.output}")

if __name__ == "__main__":
    main()
