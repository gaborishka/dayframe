from dayframe_model.dataset.anonymization import check_leakage

def test_clean_script_passes(sample_comic_script):
    issues = check_leakage(sample_comic_script, blocked_tokens=[])
    assert issues == []

def test_detects_email_in_visual_prompt(sample_comic_script):
    sample_comic_script["panels"][0]["visual_prompt"] = "alice@example.com at desk"
    issues = check_leakage(sample_comic_script, blocked_tokens=[])
    assert any("email" in i.lower() for i in issues)

def test_detects_blocked_token_in_dialogue(sample_comic_script):
    sample_comic_script["panels"][0]["dialogue"][0]["text"] = "Meet John Smith at the office"
    issues = check_leakage(sample_comic_script, blocked_tokens=["John Smith"])
    assert any("blocked" in i.lower() or "john smith" in i.lower() for i in issues)

def test_detects_raw_location_pattern(sample_comic_script):
    sample_comic_script["panels"][0]["scene_description"] = "123 Main Street, Springfield"
    issues = check_leakage(sample_comic_script, blocked_tokens=[])
    assert any("address" in i.lower() or "location" in i.lower() for i in issues)
