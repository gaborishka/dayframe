"""Export and package LoRA adapter for serving."""
import json
import hashlib
import os
from datetime import datetime, timezone

def package_adapter(
    adapter_dir: str,
    output_dir: str,
    base_model: str,
    dataset_version: str,
    adapter_version: str,
    eval_report_path: str | None = None,
) -> dict:
    os.makedirs(output_dir, exist_ok=True)
    config_path = os.path.join(os.path.dirname(adapter_dir), "training_config.json")
    config_hash = ""
    if os.path.exists(config_path):
        with open(config_path, "rb") as f:
            config_hash = hashlib.sha256(f.read()).hexdigest()[:16]
    manifest = {
        "base_model": base_model,
        "adapter_version": adapter_version,
        "training_config_hash": config_hash,
        "dataset_version": dataset_version,
        "eval_report_path": eval_report_path or "",
        "release_decision": "pending",
        "released_at": None,
    }
    manifest_path = os.path.join(output_dir, "model_artifact_manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    return manifest

def mark_released(manifest_path: str) -> None:
    with open(manifest_path) as f:
        manifest = json.load(f)
    manifest["release_decision"] = "accept"
    manifest["released_at"] = datetime.now(timezone.utc).isoformat()
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
