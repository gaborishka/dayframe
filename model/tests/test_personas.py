from dayframe_model.dataset.personas import PERSONAS, DAY_TYPES, TONES, get_persona

def test_required_personas_exist():
    names = {p["name"] for p in PERSONAS}
    for required in ["developer", "student", "manager", "parent", "freelancer", "creator"]:
        assert required in names

def test_required_day_types():
    for dt in ["mundane", "stressful", "productive", "celebratory", "sparse_input", "recovery_day"]:
        assert dt in DAY_TYPES

def test_required_tones():
    for t in ["humorous", "adventurous", "reflective", "chaotic"]:
        assert t in TONES

def test_get_persona_returns_valid():
    p = get_persona("developer")
    assert "name" in p
    assert "calendar_patterns" in p
    assert "todo_patterns" in p
    assert "reflection_patterns" in p

def test_get_persona_unknown_raises():
    import pytest
    with pytest.raises(KeyError):
        get_persona("astronaut")
