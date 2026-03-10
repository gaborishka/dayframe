from dayframe_model.dataset.enrich import enrich_day_context
from dayframe_model.dataset.synthetic_days import generate_day_context
from dayframe_model.schema_validator import validate_enriched_day_context

def test_enrich_produces_valid_schema():
    ctx = generate_day_context("developer", "productive", seed=42)
    enriched = enrich_day_context(ctx, persona_name="developer", day_index=2, seed=42)
    errors = validate_enriched_day_context(enriched)
    assert errors == [], f"Schema errors: {errors}"

def test_enrich_has_all_required_keys():
    ctx = generate_day_context("student", "mundane", seed=1)
    enriched = enrich_day_context(ctx, persona_name="student", day_index=1, seed=1)
    assert "day_context" in enriched
    assert "story_arc_snapshot" in enriched
    assert "previous_day_hooks" in enriched
    assert "weekly_context" in enriched

def test_enrich_day_index_1_has_no_previous_hooks():
    ctx = generate_day_context("developer", "mundane", seed=5)
    enriched = enrich_day_context(ctx, persona_name="developer", day_index=1, seed=5)
    assert enriched["previous_day_hooks"] is None

def test_enrich_active_threads_max_3():
    ctx = generate_day_context("developer", "stressful", seed=99)
    enriched = enrich_day_context(ctx, persona_name="developer", day_index=5, seed=99)
    assert len(enriched["story_arc_snapshot"]["active_threads"]) <= 3
