import json
import os
import tempfile
from dayframe_model.training.export_adapter import package_adapter, mark_released

def test_package_adapter_creates_manifest():
    with tempfile.TemporaryDirectory() as tmpdir:
        adapter_dir = os.path.join(tmpdir, "adapter")
        output_dir = os.path.join(tmpdir, "output")
        os.makedirs(adapter_dir)
        manifest = package_adapter(
            adapter_dir=adapter_dir, output_dir=output_dir,
            base_model="Qwen/Qwen3-8B", dataset_version="v0.1.0",
            adapter_version="v0.1.0",
        )
        assert manifest["base_model"] == "Qwen/Qwen3-8B"
        assert manifest["release_decision"] == "pending"
        assert os.path.exists(os.path.join(output_dir, "model_artifact_manifest.json"))

def test_mark_released_updates_decision():
    with tempfile.TemporaryDirectory() as tmpdir:
        manifest_path = os.path.join(tmpdir, "manifest.json")
        with open(manifest_path, "w") as f:
            json.dump({"release_decision": "pending", "released_at": None}, f)
        mark_released(manifest_path)
        with open(manifest_path) as f:
            updated = json.load(f)
        assert updated["release_decision"] == "accept"
        assert updated["released_at"] is not None
