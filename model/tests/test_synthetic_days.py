import pytest
from dayframe_model.dataset.synthetic_days import generate_day_context
from dayframe_model.schema_validator import validate_day_context

def test_generate_day_context_returns_valid_schema():
    ctx = generate_day_context(persona_name="developer", day_type="productive", seed=42)
    errors = validate_day_context(ctx)
    assert errors == [], f"Schema errors: {errors}"

def test_generate_day_context_has_required_fields():
    ctx = generate_day_context(persona_name="student", day_type="mundane", seed=1)
    assert "id" in ctx
    assert "calendar_events" in ctx
    assert "todo_items" in ctx
    assert "reflection" in ctx

def test_sparse_input_day_has_minimal_data():
    ctx = generate_day_context(persona_name="developer", day_type="sparse_input", seed=7)
    total_items = len(ctx["calendar_events"]) + len(ctx["todo_items"])
    assert total_items <= 3

def test_different_seeds_produce_different_contexts():
    ctx1 = generate_day_context(persona_name="developer", day_type="productive", seed=1)
    ctx2 = generate_day_context(persona_name="developer", day_type="productive", seed=2)
    assert ctx1["id"] != ctx2["id"]

def test_all_personas_generate_valid():
    from dayframe_model.dataset.personas import PERSONAS
    for p in PERSONAS:
        ctx = generate_day_context(persona_name=p["name"], day_type="mundane", seed=0)
        errors = validate_day_context(ctx)
        assert errors == [], f"Persona {p['name']} failed: {errors}"
