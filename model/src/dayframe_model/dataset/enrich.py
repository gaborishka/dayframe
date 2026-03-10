"""EnrichedDayContext assembly for dataset building."""
import datetime
import random
from typing import Optional

from dayframe_model.dataset.personas import get_persona

_THREAD_POOL = [
    "The missing gear mystery",
    "The forgotten library quest",
    "The rival's challenge",
    "The enchanted garden project",
    "The broken bridge repair",
    "The secret recipe search",
    "The mentor's final lesson",
    "The market day festival",
]

_RECURRING_CHAR_POOL = [
    {
        "name": "Bolt",
        "role": "companion",
        "visual_description": "A small clockwork fox with copper fur",
    },
    {
        "name": "Sage",
        "role": "mentor",
        "visual_description": "An elderly figure with a glowing staff",
    },
    {
        "name": "Flicker",
        "role": "trickster",
        "visual_description": "A mischievous shadow creature",
    },
    {
        "name": "Ember",
        "role": "rival",
        "visual_description": "A confident warrior with flame-red armor",
    },
]

_CALLBACK_TEMPLATES = [
    "The protagonist recalled a clue from yesterday's adventure",
    "An unresolved encounter from before loomed large",
    "Yesterday's discovery led to a new revelation",
    "The loose thread from the previous day finally surfaced",
]

_SETUP_TEMPLATES = [
    "A mysterious figure left a cryptic note",
    "The horizon hinted at tomorrow's challenge",
    "An unfinished task promised further intrigue",
    "Seeds of a new quest were planted",
    None,
]

_RECURRING_ELEMENTS = [
    ["the clockwork fox", "the gear mystery"],
    ["the glowing staff", "the ancient library"],
    ["the rival's gauntlet", "the training grounds"],
    ["the enchanted seeds", "the moonlit garden"],
    ["the broken bridge stones", "the river current"],
]


def _week_dates(iso_week: str) -> list[str]:
    """Return 7 date strings (Mon-Sun) for the given ISO week string (e.g. '2026-W11')."""
    year_str, week_str = iso_week.split("-W")
    year = int(year_str)
    week = int(week_str)
    # ISO week Monday
    jan4 = datetime.date(year, 1, 4)
    monday = jan4 - datetime.timedelta(days=jan4.isoweekday() - 1) + datetime.timedelta(weeks=week - 1)
    return [(monday + datetime.timedelta(days=i)).isoformat() for i in range(7)]


def enrich_day_context(
    day_context: dict,
    persona_name: str,
    day_index: int,
    seed: int,
    iso_week: Optional[str] = None,
    existing_strip_dates: Optional[list] = None,
) -> dict:
    """Build an EnrichedDayContext from a DayContext and continuity state."""
    rng = random.Random(seed)
    persona = get_persona(persona_name)

    # Derive iso_week from day_context date if not provided
    if iso_week is None:
        date = datetime.date.fromisoformat(day_context["date"])
        year, week, _ = date.isocalendar()
        iso_week = f"{year}-W{week:02d}"

    if existing_strip_dates is None:
        existing_strip_dates = []

    # Build story_arc_snapshot
    thread_count = rng.randint(1, 3)
    threads = rng.sample(_THREAD_POOL, thread_count)

    char_count = rng.randint(1, 3)
    recurring_characters = rng.sample(_RECURRING_CHAR_POOL, char_count)

    story_arc_snapshot = {
        "protagonist": persona["protagonist_template"],
        "world_setting": persona["world_setting"],
        "active_threads": threads,
        "recurring_characters": recurring_characters,
    }

    # Build previous_day_hooks
    if day_index <= 1:
        previous_day_hooks = None
    else:
        callback_to = rng.choice(_CALLBACK_TEMPLATES)
        setup_for = rng.choice(_SETUP_TEMPLATES)
        recurring_elements = rng.choice(_RECURRING_ELEMENTS)
        previous_day_hooks = {
            "callback_to": callback_to,
            "setup_for": setup_for,
            "recurring_elements": recurring_elements,
        }

    # Build weekly_context
    all_week_dates = _week_dates(iso_week)
    day_index_in_week = max(1, min(7, day_index if day_index <= 7 else ((day_index - 1) % 7) + 1))

    # Compute missing dates: days before day_index_in_week that aren't in existing_strip_dates
    expected_so_far = all_week_dates[:day_index_in_week - 1]
    missing_dates_so_far = [d for d in expected_so_far if d not in existing_strip_dates]

    weekly_context = {
        "iso_week": iso_week,
        "day_index_in_week": day_index_in_week,
        "existing_strip_dates": list(existing_strip_dates),
        "missing_dates_so_far": missing_dates_so_far,
    }

    return {
        "day_context": day_context,
        "story_arc_snapshot": story_arc_snapshot,
        "previous_day_hooks": previous_day_hooks,
        "weekly_context": weekly_context,
    }
