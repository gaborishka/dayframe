"""Synthetic DayContext generation for dataset building."""
from __future__ import annotations

import random
import uuid
from datetime import datetime, timedelta

from dayframe_model.dataset.personas import get_persona

# Item counts per day-type: (min, max) inclusive for randint
_DAY_TYPE_COUNTS: dict[str, dict[str, tuple[int, int]]] = {
    "mundane":      {"cal": (2, 4), "todo": (2, 4)},
    "stressful":    {"cal": (4, 6), "todo": (4, 6)},
    "productive":   {"cal": (3, 5), "todo": (3, 5)},
    "celebratory":  {"cal": (2, 4), "todo": (1, 3)},
    "sparse_input": {"cal": (0, 1), "todo": (0, 2)},
    "recovery_day": {"cal": (1, 2), "todo": (1, 2)},
}

_TODO_SOURCES = ["google_tasks", "manual"]
_DEFAULT_DATE = "2026-03-10"
_DEFAULT_TZ = "Europe/Uzhgorod"
_DEFAULT_TZ_OFFSET = "+02:00"


def _fmt_dt(date_str: str, hour: int, minute: int, tz_offset: str) -> str:
    return f"{date_str}T{hour:02d}:{minute:02d}:00{tz_offset}"


def generate_day_context(
    persona_name: str,
    day_type: str,
    seed: int,
    date_str: str = _DEFAULT_DATE,
    tz_name: str = _DEFAULT_TZ,
) -> dict:
    """Generate a reproducible synthetic DayContext dict.

    Parameters
    ----------
    persona_name:
        One of the persona names defined in personas.PERSONAS.
    day_type:
        One of the day-type keys in DAY_TYPES.
    seed:
        RNG seed for full reproducibility.
    date_str:
        ISO date string for the generated day.
    tz_name:
        IANA timezone name stored in the ``timezone`` field.
    """
    rng = random.Random(seed)
    persona = get_persona(persona_name)
    counts = _DAY_TYPE_COUNTS.get(day_type, _DAY_TYPE_COUNTS["mundane"])
    tz_offset = _DEFAULT_TZ_OFFSET

    # --- UUIDs ---
    day_id = str(uuid.UUID(int=rng.getrandbits(128)))
    user_id = str(uuid.UUID(int=rng.getrandbits(128)))

    # --- Calendar events ---
    cal_patterns: list[tuple[str, int]] = list(persona["calendar_patterns"])
    rng.shuffle(cal_patterns)
    n_cal = min(rng.randint(*counts["cal"]), len(cal_patterns))

    calendar_events: list[dict] = []
    cur_hour, cur_min = 8, 0
    for title, duration_minutes in cal_patterns[:n_cal]:
        start_str = _fmt_dt(date_str, cur_hour, cur_min, tz_offset)
        total_end = cur_hour * 60 + cur_min + duration_minutes
        end_h, end_m = divmod(total_end, 60)
        end_str = _fmt_dt(date_str, end_h, end_m, tz_offset)
        calendar_events.append({
            "title": title,
            "start_time": start_str,
            "end_time": end_str,
            "location": None,
            "attendees": [],
        })
        cur_hour, cur_min = end_h, end_m

    # --- Todo items ---
    todo_patterns: list[str] = list(persona["todo_patterns"])
    rng.shuffle(todo_patterns)
    n_todo = min(rng.randint(*counts["todo"]), len(todo_patterns))

    todo_items: list[dict] = []
    for text in todo_patterns[:n_todo]:
        completed = rng.random() < 0.4
        source = rng.choice(_TODO_SOURCES)
        due_at: str | None = (
            _fmt_dt(date_str, 17, 0, tz_offset) if rng.random() < 0.6 else None
        )
        todo_items.append({
            "text": text,
            "completed": completed,
            "source": source,
            "due_at": due_at,
        })

    # --- Reflection (80 % probability) ---
    reflection_patterns: list[str] = persona["reflection_patterns"]
    reflection: str | None = (
        rng.choice(reflection_patterns) if rng.random() < 0.8 else None
    )

    # --- Source status ---
    source_status = {
        "calendar_fetch_status": "ok" if calendar_events else "skipped",
        "tasks_fetch_status": "ok" if todo_items else "skipped",
        "manual_input_status": "present" if reflection else "empty",
    }

    # --- Timestamps ---
    created_at = _fmt_dt(date_str, 7, 0, tz_offset)
    next_day = (
        datetime.strptime(date_str, "%Y-%m-%d") + timedelta(days=1)
    ).strftime("%Y-%m-%d")
    expires_at = _fmt_dt(next_day, 7, 0, tz_offset)

    return {
        "id": day_id,
        "user_id": user_id,
        "date": date_str,
        "timezone": tz_name,
        "calendar_events": calendar_events,
        "todo_items": todo_items,
        "reflection": reflection,
        "source_status": source_status,
        "created_at": created_at,
        "expires_at": expires_at,
    }
