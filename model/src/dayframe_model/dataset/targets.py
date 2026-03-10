"""ComicScript target generation for DayFrame dataset building."""
from __future__ import annotations

import json
import re
import time
import uuid
from typing import Optional


def build_generation_prompt(enriched_context: dict, tone: str, panel_count: int) -> str:
    """Build a detailed prompt for Claude to generate a ComicScript.

    Args:
        enriched_context: An EnrichedDayContext dict.
        tone: Desired tone for the comic strip (e.g. "humorous", "adventurous").
        panel_count: Number of panels to generate (4-6).

    Returns:
        A prompt string suitable for an LLM.
    """
    day_ctx = enriched_context.get("day_context", {})
    arc = enriched_context.get("story_arc_snapshot", {})
    hooks = enriched_context.get("previous_day_hooks")
    weekly = enriched_context.get("weekly_context", {})

    protagonist = arc.get("protagonist", {})
    world_setting = arc.get("world_setting", "")
    active_threads = arc.get("active_threads", [])
    recurring_characters = arc.get("recurring_characters", [])

    events = day_ctx.get("calendar_events", [])
    todos = day_ctx.get("todo_items", [])
    reflection = day_ctx.get("reflection", "")
    date = day_ctx.get("date", "")
    day_context_id = day_ctx.get("id", str(uuid.uuid4()))
    user_id = day_ctx.get("user_id", str(uuid.uuid4()))

    # Format events
    events_text = ""
    for ev in events:
        events_text += f"  - {ev.get('title', '')} ({ev.get('start_time', '')} - {ev.get('end_time', '')})\n"

    # Format todos
    todos_text = ""
    for td in todos:
        status = "done" if td.get("completed") else "pending"
        todos_text += f"  - [{status}] {td.get('text', '')}\n"

    # Format recurring characters
    chars_text = ""
    for ch in recurring_characters:
        chars_text += f"  - {ch.get('name')} ({ch.get('role')}): {ch.get('visual_description')}\n"

    # Format previous hooks
    hooks_text = "None"
    if hooks:
        hooks_text = (
            f"  callback_to: {hooks.get('callback_to')}\n"
            f"  setup_for: {hooks.get('setup_for')}\n"
            f"  recurring_elements: {hooks.get('recurring_elements', [])}"
        )

    prompt = f"""You are a comic strip writer for DayFrame, a service that transforms a user's real day into a fictional comic strip.

Your task is to generate a ComicScript JSON object for the following day's context. The output MUST be valid JSON matching the ComicScript schema exactly.

## Context

**Date:** {date}
**Tone:** {tone}
**Panel count:** {panel_count}

### World Setting
{world_setting}

### Protagonist
Name: {protagonist.get('name', '')}
Role: {protagonist.get('role', '')}
Visual: {protagonist.get('visual_description', '')}

### Active Story Threads
{chr(10).join(f"  - {t}" for t in active_threads) if active_threads else "  (none)"}

### Recurring Characters
{chars_text or "  (none)"}

### Today's Events
{events_text or "  (none)"}

### Today's To-Do Items
{todos_text or "  (none)"}

### User Reflection
{reflection or "(no reflection provided)"}

### Previous Day Hooks
{hooks_text}

### Weekly Context
ISO week: {weekly.get('iso_week', '')}
Day {weekly.get('day_index_in_week', 1)} of 7
Existing strips this week: {weekly.get('existing_strip_dates', [])}
Missing dates so far: {weekly.get('missing_dates_so_far', [])}

## Instructions

Generate a ComicScript with exactly {panel_count} panels in a {tone} tone. Map today's real activities (events, todos, reflection) onto fictional story events in the established world setting. Use the protagonist and recurring characters. Respect active story threads and weave in previous day hooks if present.

## Required Output Format

Return ONLY a JSON object with this exact ComicScript structure:

```json
{{
  "id": "<new UUID v4>",
  "day_context_id": "{day_context_id}",
  "user_id": "{user_id}",
  "date": "{date}",
  "title": "<short evocative title>",
  "tone": "{tone}",
  "panels": [
    {{
      "sequence": 1,
      "scene_description": "<description of the scene>",
      "dialogue": [
        {{"speaker": "<character name>", "text": "<spoken line>"}}
      ],
      "visual_prompt": "<detailed image generation prompt under 500 chars>",
      "mood": "<mood of this panel>",
      "narrative_caption": "<optional caption or null>"
    }}
  ],
  "characters": [
    {{
      "name": "<character name>",
      "role": "<role>",
      "visual_description": "<visual description>"
    }}
  ],
  "arc_hooks": {{
    "callback_to": "<reference to a prior event or null>",
    "setup_for": "<hint at future event or null>",
    "recurring_elements": ["<element1>", "<element2>"]
  }},
  "generation_metadata": {{
    "model_version": "synthetic-claude",
    "attempt_count": 1,
    "generation_time_ms": 0,
    "prompt_tokens": 0,
    "completion_tokens": 0
  }}
}}
```

Important rules:
- The `panels` array MUST have exactly {panel_count} items with `sequence` values 1 through {panel_count}.
- All UUIDs must be valid UUID v4 format.
- `visual_prompt` must be under 500 characters.
- `narrative_caption` must be a string or null.
- Do NOT include any real names, emails, phone numbers, or addresses from the user's data.
- Output ONLY the JSON — no markdown, no explanation.
"""
    return prompt


def parse_comic_script_response(raw_response: str) -> tuple[Optional[dict], Optional[str]]:
    """Parse a raw LLM response into a ComicScript dict.

    Handles both plain JSON and JSON wrapped in markdown code blocks.

    Args:
        raw_response: The raw string response from an LLM.

    Returns:
        A (script_dict, error_string) tuple. On success, error is None.
        On failure, script_dict is None and error is a descriptive string.
    """
    if not raw_response or not raw_response.strip():
        return None, "Empty response received"

    text = raw_response.strip()

    # Try to extract JSON from markdown code block (```json ... ``` or ``` ... ```)
    md_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if md_match:
        text = md_match.group(1).strip()

    # Attempt JSON parse
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        # Try to find a JSON object anywhere in the original text as a fallback
        brace_match = re.search(r"\{.*\}", raw_response, re.DOTALL)
        if brace_match:
            try:
                parsed = json.loads(brace_match.group(0))
            except json.JSONDecodeError:
                return None, f"JSON decode error: {exc}"
        else:
            return None, f"JSON decode error: {exc}"

    if not isinstance(parsed, dict):
        return None, f"Expected a JSON object, got {type(parsed).__name__}"

    return parsed, None


async def generate_target(
    enriched_context: dict,
    tone: str,
    panel_count: int,
    api_key: Optional[str] = None,
    max_retries: int = 2,
) -> tuple[Optional[dict], Optional[str]]:
    """Call the Claude API to generate a ComicScript target.

    Args:
        enriched_context: An EnrichedDayContext dict.
        tone: Desired tone string.
        panel_count: Number of panels (4-6).
        api_key: Anthropic API key. If None, uses ANTHROPIC_API_KEY env var.
        max_retries: Maximum number of generation attempts.

    Returns:
        A (script_dict, error_string) tuple. On success, error is None.
        On failure, script_dict is None and error is a descriptive string.
    """
    try:
        import anthropic
    except ImportError:
        return None, "anthropic package is not installed; run: pip install anthropic"

    prompt = build_generation_prompt(enriched_context, tone=tone, panel_count=panel_count)

    client_kwargs: dict = {}
    if api_key is not None:
        client_kwargs["api_key"] = api_key

    client = anthropic.Anthropic(**client_kwargs)

    last_error: Optional[str] = None

    for attempt in range(1, max_retries + 1):
        start_ms = int(time.time() * 1000)
        try:
            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as exc:  # noqa: BLE001
            last_error = f"API call failed (attempt {attempt}): {exc}"
            continue

        elapsed_ms = int(time.time() * 1000) - start_ms

        raw_text = response.content[0].text if response.content else ""
        script, parse_error = parse_comic_script_response(raw_text)

        if parse_error:
            last_error = f"Parse error (attempt {attempt}): {parse_error}"
            continue

        # Ensure IDs are proper UUIDs
        if not script.get("id"):
            script["id"] = str(uuid.uuid4())
        else:
            try:
                uuid.UUID(str(script["id"]))
            except ValueError:
                script["id"] = str(uuid.uuid4())

        day_ctx = enriched_context.get("day_context", {})
        if not script.get("day_context_id"):
            script["day_context_id"] = day_ctx.get("id", str(uuid.uuid4()))
        if not script.get("user_id"):
            script["user_id"] = day_ctx.get("user_id", str(uuid.uuid4()))

        # Set model_version and populate generation_metadata
        gen_meta = script.setdefault("generation_metadata", {})
        gen_meta["model_version"] = "synthetic-claude"
        gen_meta["attempt_count"] = attempt
        gen_meta["generation_time_ms"] = elapsed_ms

        # Capture token usage if available
        usage = getattr(response, "usage", None)
        if usage is not None:
            gen_meta["prompt_tokens"] = getattr(usage, "input_tokens", 0)
            gen_meta["completion_tokens"] = getattr(usage, "output_tokens", 0)
        else:
            gen_meta.setdefault("prompt_tokens", 0)
            gen_meta.setdefault("completion_tokens", 0)

        return script, None

    return None, last_error or "Generation failed after all retries"
