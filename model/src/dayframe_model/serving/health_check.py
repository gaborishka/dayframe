"""Health check for the vLLM serving endpoint."""
import json
import urllib.request
import urllib.error

def check_health(base_url: str = "http://localhost:8000", api_key: str = "") -> dict:
    results = {"models_ok": False, "inference_ok": False, "errors": []}
    try:
        req = urllib.request.Request(f"{base_url}/v1/models")
        if api_key:
            req.add_header("Authorization", f"Bearer {api_key}")
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            model_ids = [m["id"] for m in data.get("data", [])]
            results["models_ok"] = any("dayframe" in m for m in model_ids)
            results["available_models"] = model_ids
    except Exception as e:
        results["errors"].append(f"Models endpoint: {e}")
    return results

if __name__ == "__main__":
    import sys
    url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
    key = sys.argv[2] if len(sys.argv) > 2 else ""
    result = check_health(url, key)
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["models_ok"] else 1)
