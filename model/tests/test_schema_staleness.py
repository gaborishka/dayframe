"""Verify model/schemas/ copies match canonical schemas/ directory."""
import pathlib

MODEL_SCHEMAS = pathlib.Path(__file__).parent.parent / "schemas"
CANONICAL_SCHEMAS = pathlib.Path(__file__).parent.parent.parent / "schemas"

SCHEMA_FILES = [
    "EnrichedDayContext.schema.json",
    "ComicScript.schema.json",
    "DayContext.schema.json",
    "shared.schema.json",
]

def test_schema_copies_match_canonical():
    for name in SCHEMA_FILES:
        model_copy = MODEL_SCHEMAS / name
        canonical = CANONICAL_SCHEMAS / name
        assert model_copy.exists(), f"Missing model schema copy: {name}"
        assert canonical.exists(), f"Missing canonical schema: {name}"
        assert model_copy.read_text() == canonical.read_text(), (
            f"Schema drift detected: model/schemas/{name} differs from schemas/{name}. "
            f"Re-copy from canonical source."
        )
