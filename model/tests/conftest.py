import json
import os
import pathlib
import pytest

SCHEMAS_DIR = pathlib.Path(__file__).parent.parent / "schemas"
REPO_SCHEMAS_DIR = pathlib.Path(__file__).parent.parent.parent / "schemas"

@pytest.fixture
def schemas_dir():
    """Return path to local schema copies."""
    return SCHEMAS_DIR

@pytest.fixture
def sample_day_context():
    """Minimal valid DayContext."""
    return {
        "id": "00000000-0000-0000-0000-000000000001",
        "user_id": "00000000-0000-0000-0000-000000000010",
        "date": "2026-03-10",
        "timezone": "Europe/Uzhgorod",
        "calendar_events": [
            {
                "title": "Team standup",
                "start_time": "2026-03-10T09:00:00+02:00",
                "end_time": "2026-03-10T09:30:00+02:00",
                "location": "Office",
                "attendees": ["alice@example.com"]
            }
        ],
        "todo_items": [
            {
                "text": "Review PR",
                "completed": False,
                "source": "google_tasks",
                "due_at": "2026-03-10T17:00:00+02:00"
            }
        ],
        "reflection": "Productive morning, tired afternoon.",
        "source_status": {
            "calendar_fetch_status": "ok",
            "tasks_fetch_status": "ok",
            "manual_input_status": "present"
        },
        "created_at": "2026-03-10T08:00:00+02:00",
        "expires_at": "2026-03-11T08:00:00+02:00"
    }

@pytest.fixture
def sample_story_arc_snapshot():
    """Minimal valid storyArcSnapshot."""
    return {
        "protagonist": {
            "name": "Kai",
            "role": "protagonist",
            "visual_description": "A young adventurer with a blue cloak and messy brown hair"
        },
        "world_setting": "A cozy steampunk city where everyday tasks become quests",
        "active_threads": ["The missing gear mystery"],
        "recurring_characters": [
            {
                "name": "Bolt",
                "role": "companion",
                "visual_description": "A small clockwork fox with copper fur"
            }
        ]
    }

@pytest.fixture
def sample_enriched_day_context(sample_day_context, sample_story_arc_snapshot):
    """Minimal valid EnrichedDayContext."""
    return {
        "day_context": sample_day_context,
        "story_arc_snapshot": sample_story_arc_snapshot,
        "previous_day_hooks": {
            "callback_to": "Kai found a strange gear in the market",
            "setup_for": None,
            "recurring_elements": ["the clockwork fox", "the gear mystery"]
        },
        "weekly_context": {
            "iso_week": "2026-W11",
            "day_index_in_week": 2,
            "existing_strip_dates": ["2026-03-09"],
            "missing_dates_so_far": []
        }
    }

@pytest.fixture
def sample_comic_script(sample_day_context):
    """Minimal valid ComicScript."""
    return {
        "id": "00000000-0000-0000-0000-000000000099",
        "day_context_id": sample_day_context["id"],
        "user_id": sample_day_context["user_id"],
        "date": sample_day_context["date"],
        "title": "The Gear Whisperer",
        "tone": "humorous",
        "panels": [
            {
                "sequence": i,
                "scene_description": f"Panel {i} scene",
                "dialogue": [{"speaker": "Kai", "text": f"Line {i}"}],
                "visual_prompt": f"A steampunk scene panel {i}",
                "mood": "adventurous",
                "narrative_caption": f"Caption {i}" if i == 1 else None
            }
            for i in range(1, 5)
        ],
        "characters": [
            {
                "name": "Kai",
                "role": "protagonist",
                "visual_description": "A young adventurer with a blue cloak"
            }
        ],
        "arc_hooks": {
            "callback_to": "The missing gear mystery",
            "setup_for": "The clocktower revelation",
            "recurring_elements": ["clockwork fox", "steam pipes"]
        },
        "generation_metadata": {
            "model_version": "dayframe-v0.1.0",
            "attempt_count": 1,
            "generation_time_ms": 2500,
            "prompt_tokens": 800,
            "completion_tokens": 600
        }
    }
