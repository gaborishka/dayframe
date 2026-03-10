#!/usr/bin/env python3
"""CLI: validate serving endpoint health."""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from dayframe_model.serving.health_check import check_health
import json

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:8000")
    parser.add_argument("--api-key", default="")
    args = parser.parse_args()
    result = check_health(args.url, args.api_key)
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["models_ok"] else 1)

if __name__ == "__main__":
    main()
