"""JSON Schema validation for DayFrame contracts."""
import json
import pathlib
from typing import Any

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

SCHEMAS_DIR = pathlib.Path(__file__).parent.parent.parent / "schemas"

def _build_registry() -> Registry:
    resources = []
    for schema_file in SCHEMAS_DIR.glob("*.schema.json"):
        with open(schema_file) as f:
            schema = json.load(f)
        uri = schema.get("$id", f"https://dayframe.local/schemas/{schema_file.name}")
        resources.append((uri, Resource.from_contents(schema)))
    # Also register by filename for $ref resolution
    for schema_file in SCHEMAS_DIR.glob("*.schema.json"):
        with open(schema_file) as f:
            schema = json.load(f)
        resources.append((schema_file.name, Resource.from_contents(schema)))
    return Registry().with_resources(resources)

_registry = _build_registry()

def _load_schema(name: str) -> dict:
    with open(SCHEMAS_DIR / name) as f:
        return json.load(f)

def _validate(instance: Any, schema_name: str) -> list[str]:
    schema = _load_schema(schema_name)
    validator = Draft202012Validator(schema, registry=_registry)
    return [e.message for e in validator.iter_errors(instance)]

def validate_enriched_day_context(data: Any) -> list[str]:
    return _validate(data, "EnrichedDayContext.schema.json")

def validate_comic_script(data: Any) -> list[str]:
    return _validate(data, "ComicScript.schema.json")

def validate_day_context(data: Any) -> list[str]:
    return _validate(data, "DayContext.schema.json")
