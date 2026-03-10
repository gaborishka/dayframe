import json
from dayframe_model.training.formatting import format_training_example, build_system_prompt

def test_format_returns_messages_list(sample_enriched_day_context, sample_comic_script):
    example = {"input": sample_enriched_day_context, "target": sample_comic_script}
    messages = format_training_example(example)
    assert isinstance(messages, list)
    assert len(messages) == 3
    assert messages[0]["role"] == "system"
    assert messages[1]["role"] == "user"
    assert messages[2]["role"] == "assistant"

def test_assistant_message_is_valid_json(sample_enriched_day_context, sample_comic_script):
    example = {"input": sample_enriched_day_context, "target": sample_comic_script}
    messages = format_training_example(example)
    parsed = json.loads(messages[2]["content"])
    assert "panels" in parsed

def test_system_prompt_mentions_non_thinking():
    prompt = build_system_prompt()
    assert "JSON" in prompt
