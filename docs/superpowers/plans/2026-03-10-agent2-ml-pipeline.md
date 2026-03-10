# Agent 2: ML Pipeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete synthetic dataset, fine-tuning, evaluation, and serving handoff path for DayFrame v1 so the private model produces schema-valid `ComicScript` JSON from `EnrichedDayContext` input.

**Architecture:** Python package `model/` at repo root, independent of the Node.js monorepo. Synthetic data generated via template + Claude API calls. QLoRA fine-tuning on Qwen3-8B using TRL/PEFT. Offline eval suite validates schema, anonymization, panel counts, character consistency. Serving via vLLM on DO GPU Droplet.

**Tech Stack:** Python 3.11+, transformers, datasets, TRL, PEFT, bitsandbytes, vLLM, jsonschema, pytest

---

## File Structure

```
model/
├── pyproject.toml                          # Project config, dependencies
├── requirements.txt                        # Pinned deps for training env
├── README.md                               # Agent 2 operational docs
├── schemas/                                # Copied JSON schemas for validation
│   ├── EnrichedDayContext.schema.json
│   ├── ComicScript.schema.json
│   ├── DayContext.schema.json
│   └── shared.schema.json
├── src/
│   └── dayframe_model/
│       ├── __init__.py
│       ├── schema_validator.py             # JSON Schema validation helpers
│       ├── dataset/
│       │   ├── __init__.py
│       │   ├── personas.py                 # Persona definitions + day templates
│       │   ├── synthetic_days.py           # Synthetic DayContext generation
│       │   ├── enrich.py                   # EnrichedDayContext assembly
│       │   ├── targets.py                  # ComicScript target generation (via Claude API)
│       │   ├── anonymization.py            # Leakage detection + validation
│       │   ├── curate.py                   # Quality filtering + dedup
│       │   └── export.py                   # Split + JSONL export + manifest
│       ├── training/
│       │   ├── __init__.py
│       │   ├── config.py                   # QLoRA + SFT config
│       │   ├── formatting.py              # Chat template formatting
│       │   ├── train.py                    # Training entry point
│       │   └── export_adapter.py           # Merge/export adapter
│       ├── eval/
│       │   ├── __init__.py
│       │   ├── schema_eval.py             # Schema validity checks
│       │   ├── leakage_eval.py            # Anonymization eval
│       │   ├── compliance_eval.py         # Panel count, prompt length, character consistency
│       │   ├── run_eval.py                # Full eval pipeline (dataset targets)
│       │   ├── run_model_eval.py          # Model inference eval (actual model outputs)
│       │   └── report.py                  # EvalReport + ModelArtifactManifest generation
│       └── serving/
│           ├── __init__.py
│           ├── vllm_config.py             # vLLM launch config
│           ├── health_check.py            # Endpoint health probe
│           └── deploy.sh                  # GPU droplet deployment script
├── tests/
│   ├── __init__.py
│   ├── conftest.py                        # Shared fixtures
│   ├── test_schema_validator.py
│   ├── test_personas.py
│   ├── test_synthetic_days.py
│   ├── test_enrich.py
│   ├── test_anonymization.py
│   ├── test_curate.py
│   ├── test_export.py
│   ├── test_formatting.py
│   ├── test_schema_eval.py
│   ├── test_leakage_eval.py
│   ├── test_compliance_eval.py
│   ├── test_config.py
│   ├── test_training_formatting.py
│   ├── test_export_adapter.py
│   ├── test_report.py
│   └── test_schema_staleness.py
├── data/                                   # Generated artifacts (gitignored except manifest)
│   ├── .gitkeep
│   ├── train.jsonl
│   ├── val.jsonl
│   ├── test.jsonl
│   ├── eval_curated_subset.jsonl
│   └── dataset_manifest.json
├── artifacts/                              # Training outputs (gitignored)
│   └── .gitkeep
├── labeling_guidelines.md
└── scripts/
    ├── generate_dataset.py                # CLI: end-to-end dataset build
    ├── run_training.py                    # CLI: launch training
    ├── run_eval.py                        # CLI: run eval suite (dataset targets)
    ├── run_model_eval.py                  # CLI: run eval suite (model inference)
    └── check_serving.py                   # CLI: validate serving endpoint
```

---

## Chunk 1: Project Scaffold + Schema Validation

### Task 1: Project scaffold

**Files:**
- Create: `model/pyproject.toml`
- Create: `model/requirements.txt`
- Create: `model/src/dayframe_model/__init__.py`
- Create: `model/tests/__init__.py`
- Create: `model/tests/conftest.py`
- Create: `model/data/.gitkeep`
- Create: `model/artifacts/.gitkeep`

- [ ] **Step 1: Create pyproject.toml**

```toml
[build-system]
requires = ["setuptools>=68.0"]
build-backend = "setuptools.build_meta"

[project]
name = "dayframe-model"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "jsonschema>=4.20.0",
    "referencing>=0.31.0",
]

[project.optional-dependencies]
dataset = [
    "anthropic>=0.39.0",
]
train = [
    "torch>=2.1.0",
    "transformers>=4.45.0",
    "datasets>=2.16.0",
    "trl>=0.12.0",
    "peft>=0.13.0",
    "bitsandbytes>=0.44.0",
    "accelerate>=0.34.0",
]
serve = [
    "vllm>=0.6.0",
]
dev = [
    "pytest>=8.0.0",
    "pytest-cov>=4.1.0",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["src"]

[tool.setuptools.packages.find]
where = ["src"]
```

- [ ] **Step 2: Create requirements.txt**

```text
jsonschema>=4.20.0
referencing>=0.31.0
torch>=2.1.0
transformers>=4.45.0
datasets>=2.16.0
trl>=0.12.0
peft>=0.13.0
bitsandbytes>=0.44.0
accelerate>=0.34.0
vllm>=0.6.0
pytest>=8.0.0
```

- [ ] **Step 3: Create package init and test fixtures**

`model/src/dayframe_model/__init__.py`:
```python
"""DayFrame Model - synthetic dataset, fine-tuning, and serving pipeline."""
```

`model/tests/__init__.py`: empty

`model/tests/conftest.py`:
```python
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
```

- [ ] **Step 4: Copy schemas into model/schemas/**

```bash
mkdir -p model/schemas
cp schemas/EnrichedDayContext.schema.json model/schemas/
cp schemas/ComicScript.schema.json model/schemas/
cp schemas/DayContext.schema.json model/schemas/
cp schemas/shared.schema.json model/schemas/
```

- [ ] **Step 5: Create data/.gitkeep and artifacts/.gitkeep**

- [ ] **Step 6: Verify setup**

```bash
cd model && pip install -e ".[dev]" && pytest --co -q
```

- [ ] **Step 7: Commit**

```bash
git add model/
git commit -m "feat(model): scaffold Agent 2 ML project structure"
```

---

### Task 2: Schema validator module

**Files:**
- Create: `model/src/dayframe_model/schema_validator.py`
- Create: `model/tests/test_schema_validator.py`

- [ ] **Step 1: Write failing tests**

`model/tests/test_schema_validator.py`:
```python
import pytest
from dayframe_model.schema_validator import validate_enriched_day_context, validate_comic_script

def test_valid_enriched_day_context(sample_enriched_day_context):
    errors = validate_enriched_day_context(sample_enriched_day_context)
    assert errors == []

def test_invalid_enriched_day_context_missing_field(sample_enriched_day_context):
    del sample_enriched_day_context["day_context"]
    errors = validate_enriched_day_context(sample_enriched_day_context)
    assert len(errors) > 0

def test_valid_comic_script(sample_comic_script):
    errors = validate_comic_script(sample_comic_script)
    assert errors == []

def test_invalid_comic_script_too_few_panels(sample_comic_script):
    sample_comic_script["panels"] = sample_comic_script["panels"][:2]
    errors = validate_comic_script(sample_comic_script)
    assert len(errors) > 0

def test_invalid_comic_script_too_many_panels(sample_comic_script):
    sample_comic_script["panels"] = sample_comic_script["panels"] * 3
    errors = validate_comic_script(sample_comic_script)
    assert len(errors) > 0

def test_visual_prompt_length(sample_comic_script):
    sample_comic_script["panels"][0]["visual_prompt"] = "x" * 501
    errors = validate_comic_script(sample_comic_script)
    assert len(errors) > 0
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd model && pytest tests/test_schema_validator.py -v
```

- [ ] **Step 3: Implement schema_validator.py**

```python
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
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd model && pytest tests/test_schema_validator.py -v
```

- [ ] **Step 5: Commit**

```bash
git add model/src/dayframe_model/schema_validator.py model/tests/test_schema_validator.py
git commit -m "feat(model): add JSON schema validator for EnrichedDayContext and ComicScript"
```

---

## Chunk 2: Synthetic Dataset Generation

### Task 3: Persona definitions

**Files:**
- Create: `model/src/dayframe_model/dataset/__init__.py`
- Create: `model/src/dayframe_model/dataset/personas.py`
- Create: `model/tests/test_personas.py`

- [ ] **Step 1: Write failing tests**

`model/tests/test_personas.py`:
```python
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
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement personas.py**

```python
"""Persona definitions and day-type/tone catalogs for synthetic generation."""

TONES = ["humorous", "adventurous", "reflective", "chaotic"]

DAY_TYPES = [
    "mundane", "stressful", "productive", "celebratory",
    "sparse_input", "recovery_day"
]

PERSONAS = [
    {
        "name": "developer",
        "calendar_patterns": [
            ("Team standup", 30), ("Sprint planning", 60), ("Code review sync", 30),
            ("1:1 with manager", 30), ("Lunch break", 60), ("Deep work block", 120),
        ],
        "todo_patterns": [
            "Fix authentication bug", "Review PR #42", "Update API docs",
            "Deploy staging build", "Write unit tests", "Refactor database queries",
        ],
        "reflection_patterns": [
            "Productive morning coding, hit a wall after lunch.",
            "Debugging all day, finally found the race condition.",
            "Shipped the feature, feels good. Need to write tests tomorrow.",
            "Slow day, mostly meetings. Got one small PR merged.",
        ],
        "world_setting": "A neon-lit cyberpunk code forge where bugs are literal creatures",
        "protagonist_template": {
            "name": "Hex",
            "role": "protagonist",
            "visual_description": "A hoodie-wearing hacker with glowing circuit tattoos"
        },
    },
    {
        "name": "student",
        "calendar_patterns": [
            ("Calculus lecture", 90), ("Study group", 60), ("Lab session", 120),
            ("Office hours", 30), ("Club meeting", 60),
        ],
        "todo_patterns": [
            "Finish problem set 4", "Read chapter 7", "Start essay draft",
            "Submit lab report", "Email professor about extension",
        ],
        "reflection_patterns": [
            "Crammed for the exam, feeling okay about it.",
            "Missed the study group, caught up with notes instead.",
            "Great lab session, the experiment actually worked!",
            "Procrastinated all day, panic mode tomorrow.",
        ],
        "world_setting": "A magical academy where knowledge literally glows",
        "protagonist_template": {
            "name": "Lumen",
            "role": "protagonist",
            "visual_description": "A curious student with ink-stained fingers and floating book companions"
        },
    },
    {
        "name": "manager",
        "calendar_patterns": [
            ("All-hands meeting", 60), ("1:1 with report", 30), ("Strategy session", 90),
            ("Budget review", 60), ("Cross-team sync", 45), ("Hiring panel", 60),
        ],
        "todo_patterns": [
            "Approve Q2 budget", "Write performance review", "Schedule team offsite",
            "Review hiring pipeline", "Prepare board update", "Follow up on project delays",
        ],
        "reflection_patterns": [
            "Back-to-back meetings, no time to think strategically.",
            "Had a great coaching session with a junior team member.",
            "Budget cuts are stressful, need to figure out priorities.",
            "Hired a great candidate, excited for the team.",
        ],
        "world_setting": "A grand clockwork castle where each gear represents a team",
        "protagonist_template": {
            "name": "Captain Gears",
            "role": "protagonist",
            "visual_description": "A tall figure in a brass-buttoned coat with a monocle that shows status dashboards"
        },
    },
    {
        "name": "parent",
        "calendar_patterns": [
            ("School drop-off", 30), ("Pediatrician appointment", 60),
            ("Grocery run", 45), ("Soccer practice pickup", 30),
            ("PTA meeting", 60), ("Family dinner", 60),
        ],
        "todo_patterns": [
            "Pack school lunches", "Schedule dentist appointment", "Buy birthday gift",
            "Fix leaky faucet", "Plan weekend activities", "Order school supplies",
        ],
        "reflection_patterns": [
            "Exhausting day but kids were happy. Small wins.",
            "Managed to squeeze in 30 minutes of reading. Miracle.",
            "Chaotic morning, smooth afternoon. Balance restored.",
            "Kid's first goal at soccer. Best day in weeks.",
        ],
        "world_setting": "A whimsical treehouse village where daily chores are mini-adventures",
        "protagonist_template": {
            "name": "Oak",
            "role": "protagonist",
            "visual_description": "A warm-eyed guardian with a tool belt and a tiny sidekick on their shoulder"
        },
    },
    {
        "name": "freelancer",
        "calendar_patterns": [
            ("Client call", 30), ("Design review", 60), ("Invoice deadline", 15),
            ("Networking event", 120), ("Coworking space block", 180),
        ],
        "todo_patterns": [
            "Send invoice to client A", "Revise mockups", "Update portfolio",
            "Reply to new lead email", "File quarterly taxes", "Research new tool",
        ],
        "reflection_patterns": [
            "Landed a new client! Revenue looking better this month.",
            "Spent too long on revisions, need to set boundaries.",
            "Quiet day, worked on personal project. Felt creative.",
            "Invoices are overdue, chasing payments is draining.",
        ],
        "world_setting": "A floating market of sky-islands where each island is a project",
        "protagonist_template": {
            "name": "Drift",
            "role": "protagonist",
            "visual_description": "A wind-swept traveler with a messenger bag full of glowing contracts"
        },
    },
    {
        "name": "creator",
        "calendar_patterns": [
            ("Content brainstorm", 60), ("Recording session", 120),
            ("Editing block", 180), ("Sponsor call", 30), ("Live stream", 90),
        ],
        "todo_patterns": [
            "Edit latest video", "Write newsletter", "Plan next series",
            "Respond to comments", "Update social media", "Research trending topics",
        ],
        "reflection_patterns": [
            "Creative flow state today, got so much done.",
            "Burned out on editing, need a break tomorrow.",
            "Positive feedback on the latest post, very motivating.",
            "Algorithm changes are frustrating, focus on the craft.",
        ],
        "world_setting": "A vibrant canvas-world where creations come to life",
        "protagonist_template": {
            "name": "Pixel",
            "role": "protagonist",
            "visual_description": "An energetic artist with paint-splattered overalls and a brush that trails light"
        },
    },
]

_PERSONA_INDEX = {p["name"]: p for p in PERSONAS}

def get_persona(name: str) -> dict:
    """Get persona by name. Raises KeyError if not found."""
    return _PERSONA_INDEX[name]
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add model/src/dayframe_model/dataset/ model/tests/test_personas.py
git commit -m "feat(model): add persona definitions and day-type/tone catalogs"
```

---

### Task 4: Synthetic DayContext generation

**Files:**
- Create: `model/src/dayframe_model/dataset/synthetic_days.py`
- Create: `model/tests/test_synthetic_days.py`

- [ ] **Step 1: Write failing tests**

`model/tests/test_synthetic_days.py`:
```python
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
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement synthetic_days.py**

```python
"""Generate synthetic DayContext instances from persona templates."""
import random
import uuid
from datetime import datetime, timedelta, timezone

from dayframe_model.dataset.personas import get_persona, DAY_TYPES

# Day-type controls how many calendar/todo items to include
_DAY_TYPE_PARAMS = {
    "mundane":       {"cal_range": (2, 4), "todo_range": (2, 4)},
    "stressful":     {"cal_range": (4, 6), "todo_range": (4, 6)},
    "productive":    {"cal_range": (3, 5), "todo_range": (3, 5)},
    "celebratory":   {"cal_range": (2, 4), "todo_range": (1, 3)},
    "sparse_input":  {"cal_range": (0, 1), "todo_range": (0, 2)},
    "recovery_day":  {"cal_range": (1, 2), "todo_range": (1, 2)},
}

def generate_day_context(
    persona_name: str,
    day_type: str,
    seed: int,
    date_str: str = "2026-03-10",
    tz_name: str = "Europe/Uzhgorod",
) -> dict:
    """Generate a single synthetic DayContext."""
    rng = random.Random(seed)
    persona = get_persona(persona_name)
    params = _DAY_TYPE_PARAMS[day_type]

    ctx_id = str(uuid.UUID(int=rng.getrandbits(128), version=4))
    user_id = str(uuid.UUID(int=rng.getrandbits(128), version=4))

    # Generate calendar events
    cal_count = rng.randint(*params["cal_range"])
    cal_patterns = persona["calendar_patterns"]
    chosen_events = rng.sample(cal_patterns, min(cal_count, len(cal_patterns)))

    hour = 8
    calendar_events = []
    for title, duration_min in chosen_events:
        start = f"{date_str}T{hour:02d}:00:00+02:00"
        end_hour = hour + duration_min // 60
        end_min = duration_min % 60
        end = f"{date_str}T{end_hour:02d}:{end_min:02d}:00+02:00"
        calendar_events.append({
            "title": title,
            "start_time": start,
            "end_time": end,
            "location": rng.choice(["Office", "Remote", "Conference room", None]),
            "attendees": [f"person{rng.randint(1,20)}@example.com"]
        })
        hour = end_hour + 1
        if hour > 18:
            break

    # Generate todo items
    todo_count = rng.randint(*params["todo_range"])
    todo_patterns = persona["todo_patterns"]
    chosen_todos = rng.sample(todo_patterns, min(todo_count, len(todo_patterns)))

    todo_items = []
    for text in chosen_todos:
        completed = rng.random() < 0.4
        source = rng.choice(["google_tasks", "manual"])
        due_at = f"{date_str}T17:00:00+02:00" if rng.random() < 0.6 else None
        todo_items.append({
            "text": text,
            "completed": completed,
            "source": source,
            "due_at": due_at,
        })

    # Reflection
    reflection = rng.choice(persona["reflection_patterns"]) if rng.random() < 0.8 else None

    # Source status
    cal_status = "ok" if calendar_events else "skipped"
    tasks_status = "ok" if todo_items else "skipped"
    manual_status = "present" if reflection else "empty"

    return {
        "id": ctx_id,
        "user_id": user_id,
        "date": date_str,
        "timezone": tz_name,
        "calendar_events": calendar_events,
        "todo_items": todo_items,
        "reflection": reflection,
        "source_status": {
            "calendar_fetch_status": cal_status,
            "tasks_fetch_status": tasks_status,
            "manual_input_status": manual_status,
        },
        "created_at": f"{date_str}T07:00:00+02:00",
        "expires_at": f"{date_str}T23:59:59+02:00",
    }
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add model/src/dayframe_model/dataset/synthetic_days.py model/tests/test_synthetic_days.py
git commit -m "feat(model): synthetic DayContext generator with persona-based templates"
```

---

### Task 5: EnrichedDayContext assembly

**Files:**
- Create: `model/src/dayframe_model/dataset/enrich.py`
- Create: `model/tests/test_enrich.py`

- [ ] **Step 1: Write failing tests**

`model/tests/test_enrich.py`:
```python
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
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement enrich.py**

```python
"""Assemble EnrichedDayContext from a DayContext + synthetic continuity state."""
import random
from datetime import datetime, timedelta

from dayframe_model.dataset.personas import get_persona

_THREAD_POOL = [
    "The missing gear mystery", "The forgotten library quest",
    "The rival's challenge", "The enchanted garden project",
    "The broken bridge repair", "The secret recipe search",
    "The mentor's final lesson", "The market day festival",
]

_RECURRING_CHARS = [
    {"name": "Bolt", "role": "companion", "visual_description": "A small clockwork fox with copper fur"},
    {"name": "Sage", "role": "mentor", "visual_description": "An elderly figure with a glowing staff and star-map cloak"},
    {"name": "Flicker", "role": "trickster", "visual_description": "A mischievous shadow creature with glowing eyes"},
    {"name": "Ember", "role": "rival", "visual_description": "A confident warrior with flame-red armor"},
]

_CALLBACK_TEMPLATES = [
    "Yesterday, {protagonist} discovered a clue about {thread}",
    "{protagonist} left a task unfinished: {thread}",
    "The {companion} reminded {protagonist} about {thread}",
]

def enrich_day_context(
    day_context: dict,
    persona_name: str,
    day_index: int,
    seed: int,
    iso_week: str | None = None,
    existing_strip_dates: list[str] | None = None,
) -> dict:
    """Build an EnrichedDayContext around a raw DayContext."""
    rng = random.Random(seed)
    persona = get_persona(persona_name)

    # Story arc snapshot
    protagonist = dict(persona["protagonist_template"])
    world_setting = persona["world_setting"]
    thread_count = rng.randint(1, 3)
    active_threads = rng.sample(_THREAD_POOL, thread_count)
    char_count = rng.randint(1, 3)
    recurring_characters = rng.sample(_RECURRING_CHARS, char_count)

    story_arc_snapshot = {
        "protagonist": protagonist,
        "world_setting": world_setting,
        "active_threads": active_threads,
        "recurring_characters": recurring_characters,
    }

    # Previous day hooks
    if day_index <= 1:
        previous_day_hooks = None
    else:
        thread = rng.choice(active_threads)
        companion = recurring_characters[0]["name"] if recurring_characters else "a friend"
        template = rng.choice(_CALLBACK_TEMPLATES)
        callback = template.format(
            protagonist=protagonist["name"],
            thread=thread,
            companion=companion,
        )
        previous_day_hooks = {
            "callback_to": callback if rng.random() < 0.7 else None,
            "setup_for": rng.choice(active_threads) if rng.random() < 0.5 else None,
            "recurring_elements": [c["name"] for c in recurring_characters[:2]],
        }

    # Weekly context
    if iso_week is None:
        iso_week = "2026-W11"
    if existing_strip_dates is None:
        existing_strip_dates = []

    date_str = day_context["date"]
    all_week_dates = _week_dates(iso_week)
    missing = [d for d in all_week_dates[:day_index - 1] if d not in existing_strip_dates and d != date_str]

    weekly_context = {
        "iso_week": iso_week,
        "day_index_in_week": day_index,
        "existing_strip_dates": existing_strip_dates,
        "missing_dates_so_far": missing,
    }

    return {
        "day_context": day_context,
        "story_arc_snapshot": story_arc_snapshot,
        "previous_day_hooks": previous_day_hooks,
        "weekly_context": weekly_context,
    }

def _week_dates(iso_week: str) -> list[str]:
    """Return 7 date strings for the given ISO week."""
    year, week = int(iso_week[:4]), int(iso_week[6:])
    jan4 = datetime(year, 1, 4)
    start = jan4 - timedelta(days=jan4.isoweekday() - 1) + timedelta(weeks=week - 1)
    return [(start + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add model/src/dayframe_model/dataset/enrich.py model/tests/test_enrich.py
git commit -m "feat(model): EnrichedDayContext assembly with synthetic continuity state"
```

---

### Task 6: Anonymization validation

**Files:**
- Create: `model/src/dayframe_model/dataset/anonymization.py`
- Create: `model/tests/test_anonymization.py`

- [ ] **Step 1: Write failing tests**

`model/tests/test_anonymization.py`:
```python
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
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement anonymization.py**

```python
"""Leakage detection for ComicScript outputs."""
import re

_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_ADDRESS_RE = re.compile(r"\d{1,5}\s+[A-Z][a-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln)", re.IGNORECASE)
_PHONE_RE = re.compile(r"\+?\d[\d\s\-()]{7,}\d")

def check_leakage(comic_script: dict, blocked_tokens: list[str]) -> list[str]:
    """Check a ComicScript for anonymization violations. Returns list of issue strings."""
    issues = []
    text_fields = _extract_text_fields(comic_script)

    for field_path, text in text_fields:
        # Email check
        if _EMAIL_RE.search(text):
            issues.append(f"Email pattern found in {field_path}: {_EMAIL_RE.search(text).group()}")

        # Address check
        if _ADDRESS_RE.search(text):
            issues.append(f"Address/location pattern found in {field_path}")

        # Phone check
        if _PHONE_RE.search(text):
            issues.append(f"Phone number pattern found in {field_path}")

        # Blocked token check
        text_lower = text.lower()
        for token in blocked_tokens:
            if token.lower() in text_lower:
                issues.append(f"Blocked token '{token}' found in {field_path}")

    return issues

def _extract_text_fields(script: dict) -> list[tuple[str, str]]:
    """Extract all text fields from a ComicScript for leakage scanning."""
    fields = []
    fields.append(("title", script.get("title", "")))

    for i, panel in enumerate(script.get("panels", [])):
        prefix = f"panels[{i}]"
        fields.append((f"{prefix}.scene_description", panel.get("scene_description", "")))
        fields.append((f"{prefix}.visual_prompt", panel.get("visual_prompt", "")))
        fields.append((f"{prefix}.mood", panel.get("mood", "")))
        if panel.get("narrative_caption"):
            fields.append((f"{prefix}.narrative_caption", panel["narrative_caption"]))
        for j, line in enumerate(panel.get("dialogue", [])):
            fields.append((f"{prefix}.dialogue[{j}].text", line.get("text", "")))
            fields.append((f"{prefix}.dialogue[{j}].speaker", line.get("speaker", "")))

    for i, char in enumerate(script.get("characters", [])):
        fields.append((f"characters[{i}].name", char.get("name", "")))
        fields.append((f"characters[{i}].visual_description", char.get("visual_description", "")))

    hooks = script.get("arc_hooks", {})
    if hooks.get("callback_to"):
        fields.append(("arc_hooks.callback_to", hooks["callback_to"]))
    if hooks.get("setup_for"):
        fields.append(("arc_hooks.setup_for", hooks["setup_for"]))
    for i, elem in enumerate(hooks.get("recurring_elements", [])):
        fields.append((f"arc_hooks.recurring_elements[{i}]", elem))

    return fields

def extract_blocked_tokens(day_context: dict) -> list[str]:
    """Extract real-world tokens from DayContext that must not appear in ComicScript output."""
    tokens = []
    for event in day_context.get("calendar_events", []):
        for attendee in event.get("attendees", []):
            tokens.append(attendee)
            # Also add name portion of email
            name_part = attendee.split("@")[0]
            if len(name_part) > 2:
                tokens.append(name_part)
        if event.get("location") and event["location"] not in ("Office", "Remote", "Conference room"):
            tokens.append(event["location"])
    return tokens
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add model/src/dayframe_model/dataset/anonymization.py model/tests/test_anonymization.py
git commit -m "feat(model): anonymization leakage detection for ComicScript outputs"
```

---

### Task 7: ComicScript target generation (via Claude API)

**Files:**
- Create: `model/src/dayframe_model/dataset/targets.py`
- Create: `model/tests/test_targets.py`

- [ ] **Step 1: Write failing tests (unit-testable parts only)**

`model/tests/test_targets.py`:
```python
from dayframe_model.dataset.targets import build_generation_prompt, parse_comic_script_response
from dayframe_model.schema_validator import validate_comic_script
import json

def test_build_generation_prompt_contains_schema_instruction(sample_enriched_day_context):
    prompt = build_generation_prompt(sample_enriched_day_context, tone="humorous", panel_count=4)
    assert "ComicScript" in prompt
    assert "panels" in prompt
    assert "humorous" in prompt

def test_parse_valid_json_response(sample_comic_script):
    raw = json.dumps(sample_comic_script)
    result, error = parse_comic_script_response(raw)
    assert error is None
    assert result is not None
    assert result["title"] == sample_comic_script["title"]

def test_parse_extracts_json_from_markdown():
    script = {
        "id": "00000000-0000-0000-0000-000000000001",
        "day_context_id": "00000000-0000-0000-0000-000000000002",
        "user_id": "00000000-0000-0000-0000-000000000003",
        "date": "2026-03-10",
        "title": "Test",
        "tone": "humorous",
        "panels": [
            {"sequence": i, "scene_description": "s", "dialogue": [],
             "visual_prompt": "v", "mood": "m", "narrative_caption": None}
            for i in range(1, 5)
        ],
        "characters": [{"name": "X", "role": "protagonist", "visual_description": "d"}],
        "arc_hooks": {"callback_to": None, "setup_for": None, "recurring_elements": []},
        "generation_metadata": {
            "model_version": "synthetic",
            "attempt_count": 1,
            "generation_time_ms": 0,
            "prompt_tokens": 0,
            "completion_tokens": 0
        }
    }
    raw = f"```json\n{json.dumps(script)}\n```"
    result, error = parse_comic_script_response(raw)
    assert error is None
    assert result["title"] == "Test"

def test_parse_invalid_json_returns_error():
    result, error = parse_comic_script_response("not json at all")
    assert result is None
    assert error is not None
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement targets.py**

```python
"""Generate ComicScript targets using Claude API for synthetic dataset creation."""
import json
import os
import re
import uuid

def build_generation_prompt(enriched_context: dict, tone: str, panel_count: int) -> str:
    """Build the prompt for Claude to generate a ComicScript target."""
    ctx_json = json.dumps(enriched_context, indent=2)

    return f"""You are a comic script writer for DayFrame. Given an EnrichedDayContext (a user's day data enriched with story continuity), produce a ComicScript JSON object.

RULES:
- Output ONLY valid JSON matching the ComicScript schema. No extra text.
- Exactly {panel_count} panels (sequence 1 to {panel_count}).
- Tone: {tone}
- Characters must be FICTIONAL. Never use real names, emails, or locations from the input.
- visual_prompt must be ≤500 characters and describe the scene for image generation.
- narrative_caption can be null or a short narrator line.
- arc_hooks should connect to story threads from the input.
- generation_metadata.model_version must be "synthetic-claude".
- Use the protagonist and recurring characters from story_arc_snapshot.
- Transform real events into fictional narrative equivalents.

INPUT (EnrichedDayContext):
{ctx_json}

OUTPUT (ComicScript JSON):"""

def parse_comic_script_response(raw_response: str) -> tuple[dict | None, str | None]:
    """Parse a raw LLM response into a ComicScript dict."""
    text = raw_response.strip()

    # Try to extract JSON from markdown code block
    md_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if md_match:
        text = md_match.group(1).strip()

    try:
        parsed = json.loads(text)
        return parsed, None
    except json.JSONDecodeError as e:
        return None, f"JSON parse error: {e}"

async def generate_target(
    enriched_context: dict,
    tone: str,
    panel_count: int,
    api_key: str | None = None,
    max_retries: int = 2,
) -> tuple[dict | None, str | None]:
    """Call Claude API to generate a ComicScript target. Returns (script, error)."""
    try:
        import anthropic
    except ImportError:
        return None, "anthropic package not installed"

    key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None, "ANTHROPIC_API_KEY not set"

    client = anthropic.Anthropic(api_key=key)
    prompt = build_generation_prompt(enriched_context, tone, panel_count)

    for attempt in range(max_retries + 1):
        try:
            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
            )
            raw_text = response.content[0].text
            result, error = parse_comic_script_response(raw_text)
            if result is not None:
                # Ensure IDs are proper UUIDs
                result.setdefault("id", str(uuid.uuid4()))
                result["day_context_id"] = enriched_context["day_context"]["id"]
                result["user_id"] = enriched_context["day_context"]["user_id"]
                result["date"] = enriched_context["day_context"]["date"]
                result.setdefault("generation_metadata", {})
                result["generation_metadata"]["model_version"] = "synthetic-claude"
                result["generation_metadata"]["attempt_count"] = attempt + 1
                result["generation_metadata"].setdefault("generation_time_ms", 0)
                result["generation_metadata"].setdefault("prompt_tokens", response.usage.input_tokens)
                result["generation_metadata"].setdefault("completion_tokens", response.usage.output_tokens)
                return result, None
        except Exception as e:
            if attempt == max_retries:
                return None, f"API error after {max_retries + 1} attempts: {e}"

    return None, "Max retries exceeded"
```

- [ ] **Step 4: Run tests — expect PASS** (unit tests only, no API call)

- [ ] **Step 5: Commit**

```bash
git add model/src/dayframe_model/dataset/targets.py model/tests/test_targets.py
git commit -m "feat(model): ComicScript target generation with Claude API and JSON parsing"
```

---

### Task 8: Dataset curation and quality filtering

**Files:**
- Create: `model/src/dayframe_model/dataset/curate.py`
- Create: `model/tests/test_curate.py`

- [ ] **Step 1: Write failing tests**

`model/tests/test_curate.py`:
```python
from dayframe_model.dataset.curate import curate_example, deduplicate_examples

def test_valid_example_passes(sample_enriched_day_context, sample_comic_script):
    example = {"id": "ex-1", "input": sample_enriched_day_context, "target": sample_comic_script,
               "metadata": {"persona": "developer", "tone": "humorous", "day_type": "productive",
                            "panel_count": 4, "split": "train", "source": "synthetic"}}
    result = curate_example(example)
    assert result["accepted"]

def test_rejects_invalid_target_schema(sample_enriched_day_context, sample_comic_script):
    del sample_comic_script["panels"]
    example = {"id": "ex-2", "input": sample_enriched_day_context, "target": sample_comic_script,
               "metadata": {"persona": "developer", "tone": "humorous", "day_type": "productive",
                            "panel_count": 4, "split": "train", "source": "synthetic"}}
    result = curate_example(example)
    assert not result["accepted"]
    assert "schema" in result["reason"].lower()

def test_rejects_leaking_example(sample_enriched_day_context, sample_comic_script):
    sample_comic_script["panels"][0]["dialogue"][0]["text"] = "alice@example.com said hi"
    example = {"id": "ex-3", "input": sample_enriched_day_context, "target": sample_comic_script,
               "metadata": {"persona": "developer", "tone": "humorous", "day_type": "productive",
                            "panel_count": 4, "split": "train", "source": "synthetic"}}
    result = curate_example(example)
    assert not result["accepted"]

def test_deduplicate_removes_exact_dupes():
    examples = [
        {"id": "a", "target": {"title": "Same Title", "panels": []}},
        {"id": "b", "target": {"title": "Same Title", "panels": []}},
        {"id": "c", "target": {"title": "Different", "panels": []}},
    ]
    deduped = deduplicate_examples(examples)
    assert len(deduped) == 2
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement curate.py**

```python
"""Dataset curation: validate, filter, and deduplicate training examples."""
import hashlib
import json

from dayframe_model.schema_validator import validate_enriched_day_context, validate_comic_script
from dayframe_model.dataset.anonymization import check_leakage, extract_blocked_tokens

def curate_example(example: dict) -> dict:
    """Validate a single training example. Returns {"accepted": bool, "reason": str}."""
    # Check input schema
    input_errors = validate_enriched_day_context(example.get("input", {}))
    if input_errors:
        return {"accepted": False, "reason": f"Input schema errors: {input_errors[:3]}"}

    # Check target schema
    target_errors = validate_comic_script(example.get("target", {}))
    if target_errors:
        return {"accepted": False, "reason": f"Target schema errors: {target_errors[:3]}"}

    target = example["target"]

    # Panel count compliance
    panel_count = len(target.get("panels", []))
    if panel_count < 4 or panel_count > 6:
        return {"accepted": False, "reason": f"Panel count {panel_count} outside 4-6 range"}

    # Visual prompt length
    for i, panel in enumerate(target.get("panels", [])):
        vp = panel.get("visual_prompt", "")
        if len(vp) > 500:
            return {"accepted": False, "reason": f"Panel {i} visual_prompt exceeds 500 chars"}

    # Leakage check
    day_ctx = example.get("input", {}).get("day_context", {})
    blocked = extract_blocked_tokens(day_ctx)
    leakage_issues = check_leakage(target, blocked)
    if leakage_issues:
        return {"accepted": False, "reason": f"Leakage: {leakage_issues[0]}"}

    return {"accepted": True, "reason": "ok"}

def deduplicate_examples(examples: list[dict]) -> list[dict]:
    """Remove examples with duplicate target content."""
    seen = set()
    result = []
    for ex in examples:
        key = _content_hash(ex.get("target", {}))
        if key not in seen:
            seen.add(key)
            result.append(ex)
    return result

def _content_hash(target: dict) -> str:
    title = target.get("title", "")
    panel_texts = "|".join(
        p.get("scene_description", "") for p in target.get("panels", [])
    )
    return hashlib.md5(f"{title}:{panel_texts}".encode()).hexdigest()
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add model/src/dayframe_model/dataset/curate.py model/tests/test_curate.py
git commit -m "feat(model): dataset curation with schema, leakage, and dedup checks"
```

---

### Task 9: Dataset export (split + JSONL + manifest)

**Files:**
- Create: `model/src/dayframe_model/dataset/export.py`
- Create: `model/tests/test_export.py`

- [ ] **Step 1: Write failing tests**

`model/tests/test_export.py`:
```python
import json
import os
import tempfile
from dayframe_model.dataset.export import split_dataset, export_jsonl, write_manifest

def _make_examples(n):
    return [{"id": f"ex-{i}", "input": {}, "target": {"title": f"T{i}"},
             "metadata": {"persona": "developer", "tone": "humorous",
                          "day_type": "productive", "panel_count": 4,
                          "split": "train", "source": "synthetic"}} for i in range(n)]

def test_split_dataset_proportions():
    examples = _make_examples(100)
    splits = split_dataset(examples, train_ratio=0.8, val_ratio=0.1, seed=42)
    assert len(splits["train"]) >= 75
    assert len(splits["val"]) >= 5
    assert len(splits["test"]) >= 5
    assert len(splits["train"]) + len(splits["val"]) + len(splits["test"]) == 100

def test_split_no_overlap():
    examples = _make_examples(50)
    splits = split_dataset(examples, seed=42)
    train_ids = {e["id"] for e in splits["train"]}
    val_ids = {e["id"] for e in splits["val"]}
    test_ids = {e["id"] for e in splits["test"]}
    assert train_ids.isdisjoint(val_ids)
    assert train_ids.isdisjoint(test_ids)
    assert val_ids.isdisjoint(test_ids)

def test_export_jsonl_creates_valid_file():
    examples = _make_examples(5)
    with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
        path = f.name
    try:
        export_jsonl(examples, path)
        with open(path) as f:
            lines = f.readlines()
        assert len(lines) == 5
        for line in lines:
            json.loads(line)  # must be valid JSON
    finally:
        os.unlink(path)

def test_write_manifest():
    splits = {"train": _make_examples(10), "val": _make_examples(3), "test": _make_examples(3)}
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        path = f.name
    try:
        write_manifest(splits, path, dataset_version="v0.1", generator_version="0.1.0")
        with open(path) as f:
            manifest = json.load(f)
        assert manifest["counts_by_split"]["train"] == 10
        assert manifest["source_policy"] == "synthetic_only"
    finally:
        os.unlink(path)
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement export.py**

```python
"""Dataset splitting, JSONL export, and manifest generation."""
import json
import random
from datetime import datetime, timezone

def split_dataset(
    examples: list[dict],
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
    seed: int = 42,
) -> dict[str, list[dict]]:
    """Split examples into train/val/test."""
    rng = random.Random(seed)
    shuffled = list(examples)
    rng.shuffle(shuffled)

    n = len(shuffled)
    n_train = int(n * train_ratio)
    n_val = int(n * val_ratio)

    splits = {
        "train": shuffled[:n_train],
        "val": shuffled[n_train:n_train + n_val],
        "test": shuffled[n_train + n_val:],
    }

    # Tag each example with its split
    for split_name, split_examples in splits.items():
        for ex in split_examples:
            ex.setdefault("metadata", {})["split"] = split_name

    return splits

def export_jsonl(examples: list[dict], path: str) -> None:
    """Write examples as JSONL."""
    with open(path, "w", encoding="utf-8") as f:
        for ex in examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")

def write_manifest(
    splits: dict[str, list[dict]],
    path: str,
    dataset_version: str,
    generator_version: str,
) -> None:
    """Write dataset_manifest.json."""
    all_examples = []
    for split_examples in splits.values():
        all_examples.extend(split_examples)

    # Coverage summary
    personas = set()
    tones = set()
    day_types = set()
    panel_counts = set()
    for ex in all_examples:
        meta = ex.get("metadata", {})
        if meta.get("persona"):
            personas.add(meta["persona"])
        if meta.get("tone"):
            tones.add(meta["tone"])
        if meta.get("day_type"):
            day_types.add(meta["day_type"])
        if meta.get("panel_count"):
            panel_counts.add(meta["panel_count"])

    manifest = {
        "dataset_version": dataset_version,
        "generator_version": generator_version,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "language": "en",
        "source_policy": "synthetic_only",
        "counts_by_split": {
            split: len(exs) for split, exs in splits.items()
        },
        "coverage_summary": {
            "personas": sorted(personas),
            "tones": sorted(tones),
            "day_types": sorted(day_types),
            "panel_counts": sorted(panel_counts),
            "narrative_modes": ["standalone", "continuity"],
        },
    }

    with open(path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add model/src/dayframe_model/dataset/export.py model/tests/test_export.py
git commit -m "feat(model): dataset splitting, JSONL export, and manifest generation"
```

---

### Task 10: End-to-end dataset generation script

**Files:**
- Create: `model/scripts/generate_dataset.py`

- [ ] **Step 1: Implement the CLI script**

```python
#!/usr/bin/env python3
"""End-to-end synthetic dataset generation for DayFrame v1."""
import argparse
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from dayframe_model.dataset.personas import PERSONAS, DAY_TYPES, TONES
from dayframe_model.dataset.synthetic_days import generate_day_context
from dayframe_model.dataset.enrich import enrich_day_context
from dayframe_model.dataset.targets import generate_target
from dayframe_model.dataset.curate import curate_example, deduplicate_examples
from dayframe_model.dataset.export import split_dataset, export_jsonl, write_manifest

async def generate_single_example(
    persona_name: str, day_type: str, tone: str,
    panel_count: int, seed: int, day_index: int,
) -> dict | None:
    """Generate one training example."""
    ctx = generate_day_context(persona_name, day_type, seed=seed)
    enriched = enrich_day_context(ctx, persona_name, day_index=day_index, seed=seed)

    target, error = await generate_target(enriched, tone=tone, panel_count=panel_count)
    if error:
        print(f"  SKIP: {error}")
        return None

    example = {
        "id": f"{persona_name}-{day_type}-{tone}-{panel_count}p-{seed}",
        "input": enriched,
        "target": target,
        "metadata": {
            "persona": persona_name,
            "tone": tone,
            "day_type": day_type,
            "panel_count": panel_count,
            "split": "",  # assigned during export
            "source": "synthetic",
        },
    }

    result = curate_example(example)
    if not result["accepted"]:
        print(f"  REJECT: {result['reason']}")
        return None

    return example

async def main():
    parser = argparse.ArgumentParser(description="Generate DayFrame synthetic dataset")
    parser.add_argument("--target-count", type=int, default=500,
                        help="Target total examples (default: 500)")
    parser.add_argument("--output-dir", default="data",
                        help="Output directory (default: data)")
    parser.add_argument("--dataset-version", default="v0.1.0")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    examples = []
    seed = 0
    combos = [
        (p["name"], dt, tone, pc)
        for p in PERSONAS
        for dt in DAY_TYPES
        for tone in TONES
        for pc in [4, 5, 6]
    ]

    print(f"Generating up to {args.target_count} examples from {len(combos)} combinations...")

    for persona_name, day_type, tone, panel_count in combos:
        if len(examples) >= args.target_count:
            break
        seed += 1
        day_index = (seed % 7) + 1
        print(f"[{len(examples)+1}/{args.target_count}] {persona_name}/{day_type}/{tone}/{panel_count}p")
        ex = await generate_single_example(persona_name, day_type, tone, panel_count, seed, day_index)
        if ex:
            examples.append(ex)

    # Deduplicate
    examples = deduplicate_examples(examples)
    print(f"\nAfter dedup: {len(examples)} examples")

    # Split
    splits = split_dataset(examples, train_ratio=0.8, val_ratio=0.1, seed=42)
    for name, exs in splits.items():
        print(f"  {name}: {len(exs)}")

    # Export
    for split_name, split_examples in splits.items():
        path = os.path.join(args.output_dir, f"{split_name}.jsonl")
        export_jsonl(split_examples, path)
        print(f"Wrote {path}")

    # Curated eval subset (first 20 from val+test)
    eval_subset = (splits["val"] + splits["test"])[:20]
    eval_path = os.path.join(args.output_dir, "eval_curated_subset.jsonl")
    export_jsonl(eval_subset, eval_path)
    print(f"Wrote {eval_path}")

    # Manifest
    manifest_path = os.path.join(args.output_dir, "dataset_manifest.json")
    write_manifest(splits, manifest_path, args.dataset_version, "0.1.0")
    print(f"Wrote {manifest_path}")

if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Commit**

```bash
git add model/scripts/generate_dataset.py
git commit -m "feat(model): end-to-end dataset generation CLI script"
```

---

## Chunk 3: Fine-Tuning Pipeline

### Task 11: Chat template formatting

**Files:**
- Create: `model/src/dayframe_model/training/__init__.py`
- Create: `model/src/dayframe_model/training/formatting.py`
- Create: `model/tests/test_formatting.py`

- [ ] **Step 1: Write failing tests**

`model/tests/test_formatting.py`:
```python
import json
from dayframe_model.training.formatting import format_training_example, build_system_prompt

def test_format_returns_messages_list(sample_enriched_day_context, sample_comic_script):
    example = {"input": sample_enriched_day_context, "target": sample_comic_script}
    messages = format_training_example(example)
    assert isinstance(messages, list)
    assert len(messages) == 3  # system, user, assistant
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
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement formatting.py**

```python
"""Format training examples as chat messages for Qwen3 SFT."""
import json

def build_system_prompt() -> str:
    return (
        "You are DayFrame, a comic script generator. "
        "Given an EnrichedDayContext JSON object, produce a valid ComicScript JSON object. "
        "Output ONLY the JSON object. No explanation, no markdown, no thinking. "
        "Rules: 4-6 panels, fictional characters only, visual_prompt ≤500 chars, "
        "no real names/emails/locations from the input."
    )

def format_training_example(example: dict) -> list[dict]:
    """Convert a TrainingExample into a chat messages list for SFT."""
    system_msg = {"role": "system", "content": build_system_prompt()}
    user_msg = {"role": "user", "content": json.dumps(example["input"], ensure_ascii=False)}
    assistant_msg = {"role": "assistant", "content": json.dumps(example["target"], ensure_ascii=False)}
    return [system_msg, user_msg, assistant_msg]

def format_inference_input(enriched_context: dict) -> list[dict]:
    """Format an EnrichedDayContext for inference (no assistant message)."""
    return [
        {"role": "system", "content": build_system_prompt()},
        {"role": "user", "content": json.dumps(enriched_context, ensure_ascii=False)},
    ]
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add model/src/dayframe_model/training/ model/tests/test_formatting.py
git commit -m "feat(model): chat template formatting for Qwen3 SFT"
```

---

### Task 12: QLoRA training config

**Files:**
- Create: `model/src/dayframe_model/training/config.py`

- [ ] **Step 1: Implement config.py**

```python
"""QLoRA and SFT training configuration for DayFrame v1."""
from dataclasses import dataclass, field

@dataclass
class DayFrameTrainingConfig:
    """Canonical v1 training configuration per SPEC.md §10.8."""
    # Base model
    base_model: str = "Qwen/Qwen3-8B"

    # QLoRA
    lora_r: int = 16
    lora_alpha: int = 32
    lora_dropout: float = 0.05
    target_modules: list[str] = field(default_factory=lambda: [
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ])
    quantization_bits: int = 4
    bnb_4bit_compute_dtype: str = "bfloat16"
    bnb_4bit_quant_type: str = "nf4"

    # Training
    max_seq_length: int = 4096
    per_device_train_batch_size: int = 2
    gradient_accumulation_steps: int = 8  # effective batch = 16
    num_train_epochs: int = 3
    learning_rate: float = 1.5e-4
    lr_scheduler_type: str = "cosine"
    warmup_ratio: float = 0.03
    weight_decay: float = 0.01

    # Checkpointing
    save_steps: int = 100
    save_total_limit: int = 5

    # Eval
    eval_strategy: str = "steps"
    eval_steps: int = 50

    # Output
    output_dir: str = "artifacts/training_run"

    # Misc
    bf16: bool = True
    gradient_checkpointing: bool = True
    logging_steps: int = 10
    seed: int = 42

def to_dict(config: DayFrameTrainingConfig) -> dict:
    """Convert config to serializable dict for artifact storage."""
    import dataclasses
    return dataclasses.asdict(config)
```

- [ ] **Step 2: Commit**

```bash
git add model/src/dayframe_model/training/config.py
git commit -m "feat(model): QLoRA training config per SPEC.md §10.8"
```

- [ ] **Step 3: Add config tests**

`model/tests/test_config.py`:
```python
from dayframe_model.training.config import DayFrameTrainingConfig

def test_defaults_match_spec():
    """Verify config defaults match SPEC.md §10.8."""
    cfg = DayFrameTrainingConfig()
    assert cfg.base_model == "Qwen/Qwen3-8B"
    assert cfg.max_seq_length == 4096
    assert cfg.per_device_train_batch_size == 2
    assert cfg.gradient_accumulation_steps == 8
    assert 1e-4 <= cfg.learning_rate <= 2e-4
    assert cfg.lr_scheduler_type == "cosine"
    assert cfg.warmup_ratio == 0.03
    assert cfg.num_train_epochs == 3
    assert cfg.save_steps == 100
    assert cfg.quantization_bits == 4

def test_effective_batch_size():
    cfg = DayFrameTrainingConfig()
    effective = cfg.per_device_train_batch_size * cfg.gradient_accumulation_steps
    assert effective == 16
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd model && pytest tests/test_config.py -v
```

- [ ] **Step 5: Commit config tests**

```bash
git add model/tests/test_config.py
git commit -m "test(model): verify training config defaults match SPEC.md §10.8"
```

---

### Task 13: Training entry point

**Files:**
- Create: `model/src/dayframe_model/training/train.py`
- Create: `model/scripts/run_training.py`

- [ ] **Step 1: Implement train.py**

```python
"""DayFrame QLoRA SFT training pipeline."""
import json
import os

def load_jsonl_as_messages(path: str) -> list[dict]:
    """Load a JSONL file and format each example as chat messages."""
    from dayframe_model.training.formatting import format_training_example

    examples = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            ex = json.loads(line)
            messages = format_training_example(ex)
            examples.append({"messages": messages})
    return examples

def run_training(
    train_path: str,
    val_path: str,
    output_dir: str,
    config_overrides: dict | None = None,
):
    """Execute the QLoRA SFT training run."""
    import torch
    from datasets import Dataset
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from transformers import (
        AutoModelForCausalLM,
        AutoTokenizer,
        BitsAndBytesConfig,
    )
    from trl import SFTConfig, SFTTrainer

    from dayframe_model.training.config import DayFrameTrainingConfig, to_dict

    cfg = DayFrameTrainingConfig()
    if config_overrides:
        for k, v in config_overrides.items():
            if hasattr(cfg, k):
                setattr(cfg, k, v)
    cfg.output_dir = output_dir

    # Save config snapshot
    os.makedirs(output_dir, exist_ok=True)
    with open(os.path.join(output_dir, "training_config.json"), "w") as f:
        json.dump(to_dict(cfg), f, indent=2)

    # Load data
    train_data = Dataset.from_list(load_jsonl_as_messages(train_path))
    val_data = Dataset.from_list(load_jsonl_as_messages(val_path))

    # Quantization config
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=getattr(torch, cfg.bnb_4bit_compute_dtype),
        bnb_4bit_quant_type=cfg.bnb_4bit_quant_type,
        bnb_4bit_use_double_quant=True,
    )

    # Load model and tokenizer
    tokenizer = AutoTokenizer.from_pretrained(cfg.base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        cfg.base_model,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
    )
    model = prepare_model_for_kbit_training(model)

    # LoRA config
    lora_config = LoraConfig(
        r=cfg.lora_r,
        lora_alpha=cfg.lora_alpha,
        lora_dropout=cfg.lora_dropout,
        target_modules=cfg.target_modules,
        bias="none",
        task_type="CAUSAL_LM",
    )

    # SFT config
    sft_config = SFTConfig(
        output_dir=cfg.output_dir,
        num_train_epochs=cfg.num_train_epochs,
        per_device_train_batch_size=cfg.per_device_train_batch_size,
        gradient_accumulation_steps=cfg.gradient_accumulation_steps,
        learning_rate=cfg.learning_rate,
        lr_scheduler_type=cfg.lr_scheduler_type,
        warmup_ratio=cfg.warmup_ratio,
        weight_decay=cfg.weight_decay,
        bf16=cfg.bf16,
        gradient_checkpointing=cfg.gradient_checkpointing,
        logging_steps=cfg.logging_steps,
        save_steps=cfg.save_steps,
        save_total_limit=cfg.save_total_limit,
        eval_strategy=cfg.eval_strategy,
        eval_steps=cfg.eval_steps,
        max_seq_length=cfg.max_seq_length,
        seed=cfg.seed,
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
    )

    # Trainer
    trainer = SFTTrainer(
        model=model,
        args=sft_config,
        train_dataset=train_data,
        eval_dataset=val_data,
        peft_config=lora_config,
        processing_class=tokenizer,
    )

    trainer.train()
    trainer.save_model(os.path.join(output_dir, "final_adapter"))
    tokenizer.save_pretrained(os.path.join(output_dir, "final_adapter"))

    print(f"Training complete. Adapter saved to {output_dir}/final_adapter")
```

- [ ] **Step 2: Create run_training.py CLI wrapper**

```python
#!/usr/bin/env python3
"""CLI entry point for DayFrame QLoRA training."""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from dayframe_model.training.train import run_training

def main():
    parser = argparse.ArgumentParser(description="Run DayFrame QLoRA fine-tuning")
    parser.add_argument("--train-path", default="data/train.jsonl")
    parser.add_argument("--val-path", default="data/val.jsonl")
    parser.add_argument("--output-dir", default="artifacts/training_run")
    parser.add_argument("--epochs", type=int, default=None)
    parser.add_argument("--learning-rate", type=float, default=None)
    args = parser.parse_args()

    overrides = {}
    if args.epochs:
        overrides["num_train_epochs"] = args.epochs
    if args.learning_rate:
        overrides["learning_rate"] = args.learning_rate

    run_training(args.train_path, args.val_path, args.output_dir, overrides or None)

if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Add test for load_jsonl_as_messages**

`model/tests/test_training_formatting.py`:
```python
import json
import os
import tempfile
from dayframe_model.training.train import load_jsonl_as_messages

def test_load_jsonl_produces_messages_format(sample_enriched_day_context, sample_comic_script):
    example = {"id": "ex-1", "input": sample_enriched_day_context, "target": sample_comic_script,
               "metadata": {"persona": "developer", "tone": "humorous", "day_type": "productive",
                            "panel_count": 4, "split": "train", "source": "synthetic"}}
    with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
        f.write(json.dumps(example) + "\n")
        path = f.name
    try:
        result = load_jsonl_as_messages(path)
        assert len(result) == 1
        msgs = result[0]["messages"]
        assert len(msgs) == 3
        assert msgs[0]["role"] == "system"
        assert msgs[1]["role"] == "user"
        assert msgs[2]["role"] == "assistant"
        # Assistant content must be valid JSON
        json.loads(msgs[2]["content"])
    finally:
        os.unlink(path)
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd model && pytest tests/test_training_formatting.py -v
```

- [ ] **Step 5: Commit**

```bash
git add model/src/dayframe_model/training/train.py model/scripts/run_training.py model/tests/test_training_formatting.py
git commit -m "feat(model): QLoRA SFT training pipeline with TRL/PEFT"
```

---

### Task 14: Adapter export utility

**Files:**
- Create: `model/src/dayframe_model/training/export_adapter.py`

- [ ] **Step 1: Implement export_adapter.py**

```python
"""Export and package LoRA adapter for serving."""
import json
import hashlib
import os
from datetime import datetime, timezone

def package_adapter(
    adapter_dir: str,
    output_dir: str,
    base_model: str,
    dataset_version: str,
    adapter_version: str,
    eval_report_path: str | None = None,
) -> dict:
    """Package adapter with manifest for serving handoff."""
    os.makedirs(output_dir, exist_ok=True)

    # Read training config if exists
    config_path = os.path.join(os.path.dirname(adapter_dir), "training_config.json")
    config_hash = ""
    if os.path.exists(config_path):
        with open(config_path, "rb") as f:
            config_hash = hashlib.sha256(f.read()).hexdigest()[:16]

    manifest = {
        "base_model": base_model,
        "adapter_version": adapter_version,
        "training_config_hash": config_hash,
        "dataset_version": dataset_version,
        "eval_report_path": eval_report_path or "",
        "release_decision": "pending",
        "released_at": None,
    }

    manifest_path = os.path.join(output_dir, "model_artifact_manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    return manifest

def mark_released(manifest_path: str) -> None:
    """Mark a manifest as released."""
    with open(manifest_path) as f:
        manifest = json.load(f)
    manifest["release_decision"] = "accept"
    manifest["released_at"] = datetime.now(timezone.utc).isoformat()
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
```

- [ ] **Step 2: Add tests for export_adapter**

`model/tests/test_export_adapter.py`:
```python
import json
import os
import tempfile
from dayframe_model.training.export_adapter import package_adapter, mark_released

def test_package_adapter_creates_manifest():
    with tempfile.TemporaryDirectory() as tmpdir:
        adapter_dir = os.path.join(tmpdir, "adapter")
        output_dir = os.path.join(tmpdir, "output")
        os.makedirs(adapter_dir)

        manifest = package_adapter(
            adapter_dir=adapter_dir,
            output_dir=output_dir,
            base_model="Qwen/Qwen3-8B",
            dataset_version="v0.1.0",
            adapter_version="v0.1.0",
        )
        assert manifest["base_model"] == "Qwen/Qwen3-8B"
        assert manifest["release_decision"] == "pending"
        assert os.path.exists(os.path.join(output_dir, "model_artifact_manifest.json"))

def test_mark_released_updates_decision():
    with tempfile.TemporaryDirectory() as tmpdir:
        manifest_path = os.path.join(tmpdir, "manifest.json")
        with open(manifest_path, "w") as f:
            json.dump({"release_decision": "pending", "released_at": None}, f)

        mark_released(manifest_path)

        with open(manifest_path) as f:
            updated = json.load(f)
        assert updated["release_decision"] == "accept"
        assert updated["released_at"] is not None
```

- [ ] **Step 3: Run tests — expect PASS**

```bash
cd model && pytest tests/test_export_adapter.py -v
```

- [ ] **Step 4: Commit**

```bash
git add model/src/dayframe_model/training/export_adapter.py model/tests/test_export_adapter.py
git commit -m "feat(model): adapter packaging and ModelArtifactManifest generation"
```

---

## Chunk 4: Evaluation Pipeline

### Task 15: Schema evaluation

**Files:**
- Create: `model/src/dayframe_model/eval/__init__.py`
- Create: `model/src/dayframe_model/eval/schema_eval.py`
- Create: `model/tests/test_schema_eval.py`

- [ ] **Step 1: Write failing tests**

`model/tests/test_schema_eval.py`:
```python
from dayframe_model.eval.schema_eval import evaluate_schema_validity

def test_valid_scripts_pass(sample_comic_script):
    results = evaluate_schema_validity([sample_comic_script])
    assert results["pass_rate"] == 1.0
    assert results["total"] == 1

def test_invalid_scripts_fail(sample_comic_script):
    bad = dict(sample_comic_script)
    del bad["panels"]
    results = evaluate_schema_validity([sample_comic_script, bad])
    assert results["pass_rate"] == 0.5
    assert results["failures"] == 1
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement schema_eval.py**

```python
"""Schema validity evaluation for model outputs."""
from dayframe_model.schema_validator import validate_comic_script

def evaluate_schema_validity(scripts: list[dict]) -> dict:
    """Evaluate schema validity across a list of ComicScript outputs."""
    total = len(scripts)
    passed = 0
    failed_details = []

    for i, script in enumerate(scripts):
        errors = validate_comic_script(script)
        if not errors:
            passed += 1
        else:
            failed_details.append({"index": i, "errors": errors[:3]})

    return {
        "total": total,
        "passed": passed,
        "failures": total - passed,
        "pass_rate": passed / total if total > 0 else 0.0,
        "failed_details": failed_details,
    }
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add model/src/dayframe_model/eval/ model/tests/test_schema_eval.py
git commit -m "feat(model): schema validity evaluation for ComicScript outputs"
```

---

### Task 16: Leakage evaluation

**Files:**
- Create: `model/src/dayframe_model/eval/leakage_eval.py`
- Create: `model/tests/test_leakage_eval.py`

- [ ] **Step 1: Write failing tests**

`model/tests/test_leakage_eval.py`:
```python
from dayframe_model.eval.leakage_eval import evaluate_leakage

def test_clean_examples_pass(sample_enriched_day_context, sample_comic_script):
    examples = [{"input": sample_enriched_day_context, "target": sample_comic_script}]
    results = evaluate_leakage(examples)
    assert results["pass_rate"] == 1.0

def test_leaking_example_fails(sample_enriched_day_context, sample_comic_script):
    sample_comic_script["panels"][0]["visual_prompt"] = "john@example.com walks in"
    examples = [{"input": sample_enriched_day_context, "target": sample_comic_script}]
    results = evaluate_leakage(examples)
    assert results["pass_rate"] == 0.0
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement leakage_eval.py**

```python
"""Anonymization/leakage evaluation."""
from dayframe_model.dataset.anonymization import check_leakage, extract_blocked_tokens

def evaluate_leakage(examples: list[dict]) -> dict:
    """Evaluate anonymization compliance across examples."""
    total = len(examples)
    passed = 0
    failed_details = []

    for i, ex in enumerate(examples):
        day_ctx = ex.get("input", {}).get("day_context", {})
        blocked = extract_blocked_tokens(day_ctx)
        issues = check_leakage(ex.get("target", {}), blocked)
        if not issues:
            passed += 1
        else:
            failed_details.append({"index": i, "issues": issues[:3]})

    return {
        "total": total,
        "passed": passed,
        "failures": total - passed,
        "pass_rate": passed / total if total > 0 else 0.0,
        "failed_details": failed_details,
    }
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add model/src/dayframe_model/eval/leakage_eval.py model/tests/test_leakage_eval.py
git commit -m "feat(model): anonymization leakage evaluation"
```

---

### Task 17: Compliance evaluation (panels, prompts, characters)

**Files:**
- Create: `model/src/dayframe_model/eval/compliance_eval.py`
- Create: `model/tests/test_compliance_eval.py`

- [ ] **Step 1: Write failing tests**

`model/tests/test_compliance_eval.py`:
```python
from dayframe_model.eval.compliance_eval import (
    evaluate_panel_count, evaluate_prompt_length, evaluate_character_consistency
)

def test_panel_count_valid(sample_comic_script):
    results = evaluate_panel_count([sample_comic_script])
    assert results["pass_rate"] == 1.0

def test_panel_count_too_few(sample_comic_script):
    sample_comic_script["panels"] = sample_comic_script["panels"][:2]
    results = evaluate_panel_count([sample_comic_script])
    assert results["pass_rate"] == 0.0

def test_prompt_length_valid(sample_comic_script):
    results = evaluate_prompt_length([sample_comic_script])
    assert results["pass_rate"] == 1.0

def test_prompt_length_too_long(sample_comic_script):
    sample_comic_script["panels"][0]["visual_prompt"] = "x" * 501
    results = evaluate_prompt_length([sample_comic_script])
    assert results["pass_rate"] == 0.0

def test_character_consistency_valid(sample_enriched_day_context, sample_comic_script):
    examples = [{"input": sample_enriched_day_context, "target": sample_comic_script}]
    results = evaluate_character_consistency(examples)
    assert results["pass_rate"] == 1.0
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement compliance_eval.py**

```python
"""Panel count, prompt length, and character consistency evaluation."""

def evaluate_panel_count(scripts: list[dict]) -> dict:
    """Check that each script has 4-6 panels."""
    total = len(scripts)
    passed = 0
    for script in scripts:
        count = len(script.get("panels", []))
        if 4 <= count <= 6:
            passed += 1
    return {"total": total, "passed": passed, "failures": total - passed,
            "pass_rate": passed / total if total else 0.0}

def evaluate_prompt_length(scripts: list[dict], max_length: int = 500) -> dict:
    """Check that all visual_prompt values are within length limit."""
    total = len(scripts)
    passed = 0
    for script in scripts:
        ok = all(
            len(p.get("visual_prompt", "")) <= max_length
            for p in script.get("panels", [])
        )
        if ok:
            passed += 1
    return {"total": total, "passed": passed, "failures": total - passed,
            "pass_rate": passed / total if total else 0.0}

def evaluate_character_consistency(examples: list[dict]) -> dict:
    """Check that protagonist from input appears in output characters."""
    total = len(examples)
    passed = 0
    for ex in examples:
        protagonist_name = (
            ex.get("input", {})
            .get("story_arc_snapshot", {})
            .get("protagonist", {})
            .get("name", "")
        )
        output_names = {
            c.get("name", "") for c in ex.get("target", {}).get("characters", [])
        }
        if protagonist_name and protagonist_name in output_names:
            passed += 1
        elif not protagonist_name:
            passed += 1  # no protagonist to check
    return {"total": total, "passed": passed, "failures": total - passed,
            "pass_rate": passed / total if total else 0.0}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add model/src/dayframe_model/eval/compliance_eval.py model/tests/test_compliance_eval.py
git commit -m "feat(model): panel count, prompt length, and character consistency evaluation"
```

---

### Task 18: EvalReport and full eval runner

**Files:**
- Create: `model/src/dayframe_model/eval/report.py`
- Create: `model/src/dayframe_model/eval/run_eval.py`
- Create: `model/scripts/run_eval.py`

- [ ] **Step 1: Implement report.py**

```python
"""EvalReport generation per SPEC.md §10.9."""
import json

def build_eval_report(
    schema_results: dict,
    leakage_results: dict,
    panel_results: dict,
    character_results: dict,
    prompt_length_results: dict,
    dataset_version: str,
    base_model: str,
    adapter_version: str,
    human_review_summary: str = "pending",
) -> dict:
    """Build the canonical EvalReport."""
    # Determine release decision
    schema_ok = schema_results["pass_rate"] >= 0.95
    leakage_ok = leakage_results["pass_rate"] >= 0.98
    panel_ok = panel_results["pass_rate"] >= 0.95
    human_ok = human_review_summary not in ("pending", "reject")

    release = "accept" if (schema_ok and leakage_ok and panel_ok and human_ok) else "reject"

    return {
        "dataset_version": dataset_version,
        "base_model": base_model,
        "adapter_version": adapter_version,
        "schema_pass_rate": schema_results["pass_rate"],
        "leakage_pass_rate": leakage_results["pass_rate"],
        "panel_count_pass_rate": panel_results["pass_rate"],
        "character_consistency_pass_rate": character_results["pass_rate"],
        "visual_prompt_length_pass_rate": prompt_length_results["pass_rate"],
        "human_review_summary": human_review_summary,
        "release_decision": release,
    }

def save_eval_report(report: dict, path: str) -> None:
    with open(path, "w") as f:
        json.dump(report, f, indent=2)

def print_eval_report(report: dict) -> None:
    print("\n=== DayFrame Eval Report ===")
    print(f"  Dataset:    {report['dataset_version']}")
    print(f"  Base model: {report['base_model']}")
    print(f"  Adapter:    {report['adapter_version']}")
    print(f"  Schema:     {report['schema_pass_rate']:.1%}")
    print(f"  Leakage:    {report['leakage_pass_rate']:.1%}")
    print(f"  Panels:     {report['panel_count_pass_rate']:.1%}")
    print(f"  Characters: {report['character_consistency_pass_rate']:.1%}")
    print(f"  Prompts:    {report['visual_prompt_length_pass_rate']:.1%}")
    print(f"  Human:      {report['human_review_summary']}")
    print(f"  Decision:   {report['release_decision']}")
    print("===========================\n")
```

- [ ] **Step 2: Implement run_eval.py (library)**

```python
"""Full evaluation pipeline runner."""
import json

from dayframe_model.eval.schema_eval import evaluate_schema_validity
from dayframe_model.eval.leakage_eval import evaluate_leakage
from dayframe_model.eval.compliance_eval import (
    evaluate_panel_count, evaluate_prompt_length, evaluate_character_consistency,
)
from dayframe_model.eval.report import build_eval_report

def run_full_eval(
    test_path: str,
    dataset_version: str,
    base_model: str,
    adapter_version: str,
    human_review_summary: str = "pending",
) -> dict:
    """Run the full evaluation suite on a test JSONL file."""
    examples = []
    with open(test_path, "r", encoding="utf-8") as f:
        for line in f:
            examples.append(json.loads(line))

    scripts = [ex["target"] for ex in examples]

    schema_results = evaluate_schema_validity(scripts)
    leakage_results = evaluate_leakage(examples)
    panel_results = evaluate_panel_count(scripts)
    character_results = evaluate_character_consistency(examples)
    prompt_results = evaluate_prompt_length(scripts)

    return build_eval_report(
        schema_results=schema_results,
        leakage_results=leakage_results,
        panel_results=panel_results,
        character_results=character_results,
        prompt_length_results=prompt_results,
        dataset_version=dataset_version,
        base_model=base_model,
        adapter_version=adapter_version,
        human_review_summary=human_review_summary,
    )
```

- [ ] **Step 3: Create scripts/run_eval.py CLI**

```python
#!/usr/bin/env python3
"""CLI entry point for DayFrame evaluation."""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from dayframe_model.eval.run_eval import run_full_eval
from dayframe_model.eval.report import save_eval_report, print_eval_report

def main():
    parser = argparse.ArgumentParser(description="Run DayFrame eval suite")
    parser.add_argument("--test-path", default="data/test.jsonl")
    parser.add_argument("--dataset-version", default="v0.1.0")
    parser.add_argument("--base-model", default="Qwen/Qwen3-8B")
    parser.add_argument("--adapter-version", default="v0.1.0")
    parser.add_argument("--human-review", default="pending")
    parser.add_argument("--output", default="artifacts/eval_report.json")
    args = parser.parse_args()

    report = run_full_eval(
        args.test_path, args.dataset_version, args.base_model,
        args.adapter_version, args.human_review,
    )
    print_eval_report(report)

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    save_eval_report(report, args.output)
    print(f"Report saved to {args.output}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Add report tests**

`model/tests/test_report.py`:
```python
from dayframe_model.eval.report import build_eval_report

def _make_results(rate):
    return {"total": 100, "passed": int(rate * 100), "failures": 100 - int(rate * 100), "pass_rate": rate}

def test_all_passing_returns_accept():
    report = build_eval_report(
        schema_results=_make_results(0.98),
        leakage_results=_make_results(1.0),
        panel_results=_make_results(0.99),
        character_results=_make_results(0.95),
        prompt_length_results=_make_results(1.0),
        dataset_version="v0.1", base_model="Qwen/Qwen3-8B",
        adapter_version="v0.1", human_review_summary="acceptable",
    )
    assert report["release_decision"] == "accept"

def test_low_schema_rate_returns_reject():
    report = build_eval_report(
        schema_results=_make_results(0.80),
        leakage_results=_make_results(1.0),
        panel_results=_make_results(0.99),
        character_results=_make_results(0.95),
        prompt_length_results=_make_results(1.0),
        dataset_version="v0.1", base_model="Qwen/Qwen3-8B",
        adapter_version="v0.1", human_review_summary="acceptable",
    )
    assert report["release_decision"] == "reject"

def test_pending_human_review_returns_reject():
    report = build_eval_report(
        schema_results=_make_results(0.99),
        leakage_results=_make_results(1.0),
        panel_results=_make_results(0.99),
        character_results=_make_results(0.95),
        prompt_length_results=_make_results(1.0),
        dataset_version="v0.1", base_model="Qwen/Qwen3-8B",
        adapter_version="v0.1", human_review_summary="pending",
    )
    assert report["release_decision"] == "reject"

def test_low_leakage_rate_returns_reject():
    report = build_eval_report(
        schema_results=_make_results(0.99),
        leakage_results=_make_results(0.90),
        panel_results=_make_results(0.99),
        character_results=_make_results(0.95),
        prompt_length_results=_make_results(1.0),
        dataset_version="v0.1", base_model="Qwen/Qwen3-8B",
        adapter_version="v0.1", human_review_summary="acceptable",
    )
    assert report["release_decision"] == "reject"
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd model && pytest tests/test_report.py -v
```

- [ ] **Step 6: Commit**

```bash
git add model/src/dayframe_model/eval/ model/scripts/run_eval.py model/tests/test_report.py
git commit -m "feat(model): full evaluation pipeline with EvalReport generation"
```

---

### Task 18b: Model inference evaluation (CRITICAL — evaluates actual model outputs)

**Files:**
- Create: `model/src/dayframe_model/eval/run_model_eval.py`
- Create: `model/scripts/run_model_eval.py`

This task evaluates the fine-tuned model's actual outputs, not the gold targets in the dataset. This is the real release gate per SPEC.md §10.10.

- [ ] **Step 1: Implement run_model_eval.py (library)**

```python
"""Model inference evaluation — runs the fine-tuned model on test inputs and evaluates outputs."""
import json
import os
import urllib.request
import urllib.error

from dayframe_model.training.formatting import format_inference_input
from dayframe_model.dataset.targets import parse_comic_script_response
from dayframe_model.eval.schema_eval import evaluate_schema_validity
from dayframe_model.eval.leakage_eval import evaluate_leakage
from dayframe_model.eval.compliance_eval import (
    evaluate_panel_count, evaluate_prompt_length, evaluate_character_consistency,
)
from dayframe_model.eval.report import build_eval_report
from dayframe_model.serving.vllm_config import build_inference_payload

def run_model_inference(
    enriched_context: dict,
    base_url: str,
    api_key: str = "",
    model_name: str = "dayframe-adapter",
) -> tuple[dict | None, str | None]:
    """Run a single inference request against the vLLM endpoint."""
    messages = format_inference_input(enriched_context)
    payload = build_inference_payload(messages, model_name)

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url}/v1/chat/completions",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    if api_key:
        req.add_header("Authorization", f"Bearer {api_key}")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
        raw_text = result["choices"][0]["message"]["content"]
        return parse_comic_script_response(raw_text)
    except Exception as e:
        return None, str(e)

def run_model_eval(
    test_path: str,
    base_url: str,
    api_key: str = "",
    dataset_version: str = "v0.1.0",
    base_model: str = "Qwen/Qwen3-8B",
    adapter_version: str = "v0.1.0",
    human_review_summary: str = "pending",
    model_name: str = "dayframe-adapter",
) -> dict:
    """Run the full model inference eval: generate outputs then evaluate them."""
    examples = []
    with open(test_path, "r", encoding="utf-8") as f:
        for line in f:
            examples.append(json.loads(line))

    model_outputs = []
    eval_examples = []  # pairs of (input, model_output) for leakage/character checks
    parse_failures = 0

    for i, ex in enumerate(examples):
        enriched = ex["input"]
        script, error = run_model_inference(enriched, base_url, api_key, model_name)
        if script is None:
            parse_failures += 1
            # Use empty dict so eval counts it as failure
            model_outputs.append({})
            eval_examples.append({"input": enriched, "target": {}})
        else:
            model_outputs.append(script)
            eval_examples.append({"input": enriched, "target": script})
        print(f"  [{i+1}/{len(examples)}] {'OK' if script else f'FAIL: {error}'}")

    schema_results = evaluate_schema_validity(model_outputs)
    leakage_results = evaluate_leakage(eval_examples)
    panel_results = evaluate_panel_count(model_outputs)
    character_results = evaluate_character_consistency(eval_examples)
    prompt_results = evaluate_prompt_length(model_outputs)

    report = build_eval_report(
        schema_results=schema_results,
        leakage_results=leakage_results,
        panel_results=panel_results,
        character_results=character_results,
        prompt_length_results=prompt_results,
        dataset_version=dataset_version,
        base_model=base_model,
        adapter_version=adapter_version,
        human_review_summary=human_review_summary,
    )
    report["parse_failures"] = parse_failures
    return report
```

- [ ] **Step 2: Create scripts/run_model_eval.py CLI**

```python
#!/usr/bin/env python3
"""CLI: evaluate fine-tuned model via inference against test split."""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from dayframe_model.eval.run_model_eval import run_model_eval
from dayframe_model.eval.report import save_eval_report, print_eval_report

def main():
    parser = argparse.ArgumentParser(description="Run model inference eval")
    parser.add_argument("--test-path", default="data/test.jsonl")
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--api-key", default=os.environ.get("PRIVATE_MODEL_API_KEY", ""))
    parser.add_argument("--dataset-version", default="v0.1.0")
    parser.add_argument("--base-model", default="Qwen/Qwen3-8B")
    parser.add_argument("--adapter-version", default="v0.1.0")
    parser.add_argument("--human-review", default="pending")
    parser.add_argument("--output", default="artifacts/model_eval_report.json")
    args = parser.parse_args()

    print(f"Running model inference eval against {args.base_url}...")
    report = run_model_eval(
        args.test_path, args.base_url, args.api_key,
        args.dataset_version, args.base_model, args.adapter_version,
        args.human_review,
    )
    print_eval_report(report)

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    save_eval_report(report, args.output)
    print(f"Model eval report saved to {args.output}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Commit**

```bash
git add model/src/dayframe_model/eval/run_model_eval.py model/scripts/run_model_eval.py
git commit -m "feat(model): model inference evaluation — runs actual model against test split"
```

---

## Chunk 5: Serving Configuration + Labeling Guidelines

### Task 19: vLLM serving configuration

**Files:**
- Create: `model/src/dayframe_model/serving/__init__.py`
- Create: `model/src/dayframe_model/serving/vllm_config.py`
- Create: `model/src/dayframe_model/serving/health_check.py`
- Create: `model/src/dayframe_model/serving/deploy.sh`

- [ ] **Step 1: Implement vllm_config.py**

```python
"""vLLM serving configuration for DayFrame private model."""

VLLM_SERVE_ARGS = {
    "model": "Qwen/Qwen3-8B",
    "enable_lora": True,
    "lora_modules": "dayframe-adapter=./final_adapter",
    "max_model_len": 4096,
    "dtype": "bfloat16",
    "gpu_memory_utilization": 0.85,
    "host": "0.0.0.0",
    "port": 8000,
    "api_key": "${PRIVATE_MODEL_API_KEY}",
    "enforce_eager": True,
}

def build_vllm_command(adapter_path: str = "./final_adapter", port: int = 8000) -> str:
    """Build the vllm serve CLI command."""
    return (
        f"vllm serve Qwen/Qwen3-8B "
        f"--enable-lora "
        f"--lora-modules dayframe-adapter={adapter_path} "
        f"--max-model-len 4096 "
        f"--dtype bfloat16 "
        f"--gpu-memory-utilization 0.85 "
        f"--host 0.0.0.0 "
        f"--port {port} "
        f"--enforce-eager"
    )

def build_inference_payload(messages: list[dict], model_name: str = "dayframe-adapter") -> dict:
    """Build an OpenAI-compatible inference request for vLLM."""
    return {
        "model": model_name,
        "messages": messages,
        "max_tokens": 4096,
        "temperature": 0.7,
        "top_p": 0.9,
        "extra_body": {
            "chat_template_kwargs": {"enable_thinking": False},
        },
    }
```

- [ ] **Step 2: Implement health_check.py**

```python
"""Health check for the vLLM serving endpoint."""
import json
import urllib.request
import urllib.error

def check_health(base_url: str = "http://localhost:8000", api_key: str = "") -> dict:
    """Probe the vLLM endpoint for health."""
    results = {"models_ok": False, "inference_ok": False, "errors": []}

    # Check /v1/models
    try:
        req = urllib.request.Request(f"{base_url}/v1/models")
        if api_key:
            req.add_header("Authorization", f"Bearer {api_key}")
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            model_ids = [m["id"] for m in data.get("data", [])]
            results["models_ok"] = any("dayframe" in m for m in model_ids)
            results["available_models"] = model_ids
    except Exception as e:
        results["errors"].append(f"Models endpoint: {e}")

    return results

if __name__ == "__main__":
    import sys
    url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
    key = sys.argv[2] if len(sys.argv) > 2 else ""
    result = check_health(url, key)
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["models_ok"] else 1)
```

- [ ] **Step 3: Implement deploy.sh**

```bash
#!/usr/bin/env bash
# Deploy DayFrame model serving to GPU Droplet.
# Usage: ./deploy.sh <droplet-ip> <adapter-path>
set -euo pipefail

DROPLET_IP="${1:?Usage: deploy.sh <droplet-ip> <adapter-path>}"
ADAPTER_PATH="${2:?Provide adapter directory path}"
REMOTE_DIR="/opt/dayframe-model"

echo "==> Uploading adapter to ${DROPLET_IP}..."
ssh "root@${DROPLET_IP}" "mkdir -p ${REMOTE_DIR}/final_adapter"
rsync -avz "${ADAPTER_PATH}/" "root@${DROPLET_IP}:${REMOTE_DIR}/final_adapter/"

echo "==> Installing vLLM (if needed)..."
ssh "root@${DROPLET_IP}" "pip install vllm>=0.6.0 2>/dev/null || true"

echo "==> Detecting VPC-internal IP..."
VPC_IP=$(ssh "root@${DROPLET_IP}" "ip -4 addr show eth1 2>/dev/null | grep -oP 'inet \K[\d.]+' || echo '0.0.0.0'")
echo "    Binding to VPC IP: ${VPC_IP} (SPEC requires VPC-internal only)"

echo "==> Configuring firewall (restrict port 8000 to VPC)..."
ssh "root@${DROPLET_IP}" "ufw allow from 10.0.0.0/8 to any port 8000 2>/dev/null || true"
ssh "root@${DROPLET_IP}" "ufw deny 8000 2>/dev/null || true"

echo "==> Starting vLLM server..."
ssh "root@${DROPLET_IP}" "cd ${REMOTE_DIR} && nohup vllm serve Qwen/Qwen3-8B \
  --enable-lora \
  --lora-modules dayframe-adapter=./final_adapter \
  --max-model-len 4096 \
  --dtype bfloat16 \
  --gpu-memory-utilization 0.85 \
  --host ${VPC_IP} \
  --port 8000 \
  --enforce-eager \
  > vllm.log 2>&1 &"

echo "==> Waiting for server to start..."
sleep 30

echo "==> Health check..."
ssh "root@${DROPLET_IP}" "curl -s http://${VPC_IP}:8000/v1/models | python3 -m json.tool"

echo "==> Done. VPC-internal endpoint: http://${VPC_IP}:8000"
echo "    NOTE: Port 8000 is firewalled to VPC traffic only per SPEC.md §10.3"
```

- [ ] **Step 4: Create scripts/check_serving.py CLI**

```python
#!/usr/bin/env python3
"""CLI: validate serving endpoint health."""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from dayframe_model.serving.health_check import check_health
import json

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:8000")
    parser.add_argument("--api-key", default="")
    args = parser.parse_args()

    result = check_health(args.url, args.api_key)
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["models_ok"] else 1)

if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Commit**

```bash
git add model/src/dayframe_model/serving/ model/scripts/check_serving.py
git commit -m "feat(model): vLLM serving config, health check, and deploy script"
```

---

### Task 20: Labeling guidelines

**Files:**
- Create: `model/labeling_guidelines.md`

- [ ] **Step 1: Write labeling_guidelines.md**

```markdown
# DayFrame Dataset Labeling Guidelines

## Overview

This document describes how the DayFrame v1 synthetic training dataset is generated, validated, and curated.

## Synthetic Day Generation

Each training example starts with a synthetic `DayContext`:
- Generated from one of 6 personas: developer, student, manager, parent, freelancer, creator
- Day types: mundane, stressful, productive, celebratory, sparse_input, recovery_day
- Calendar events drawn from persona-specific patterns
- Todo items drawn from persona-specific task lists
- Reflections sampled from persona reflection templates
- No real user data is used at any stage

## Fictionalization Enforcement

The target `ComicScript` must:
- Use only fictional character names from the story arc
- Never include real email addresses, phone numbers, or street addresses
- Transform real-world events into narrative equivalents (e.g., "team standup" becomes "council gathering")
- Keep visual prompts free of personally identifiable information

## Acceptance Criteria

A target example is acceptable when:
1. It parses as valid JSON matching the `ComicScript` schema
2. It contains 4-6 panels with sequential numbering
3. All `visual_prompt` values are ≤500 characters
4. The protagonist from the input `story_arc_snapshot` appears in the output characters
5. No email, phone, or address patterns appear in any text field
6. No blocked tokens from the input DayContext appear in the output
7. The narrative is coherent and relates to the day's events

## Rejection Reasons

- Malformed JSON
- Schema validation failure
- Panel count outside 4-6 range
- Real names, emails, or locations leaked into output
- Incoherent or nonsensical narrative
- Near-duplicate of existing example
- Visual prompts too long or unusable for image generation

## Curator Workflow

1. Run automated validation (schema + anonymization + compliance)
2. Review flagged examples manually
3. Accept, reject, or mark for regeneration
4. Update eval_curated_subset.jsonl with 20 manually reviewed examples covering:
   - mundane day, stressful day, sparse-input day, continuity day, recovery day
```

- [ ] **Step 2: Commit**

```bash
git add model/labeling_guidelines.md
git commit -m "docs(model): labeling guidelines for synthetic dataset curation"
```

---

## Chunk 6: Integration Testing + Final Validation

### Task 21: Dataset build checks (per SPEC.md §10.11)

**Files:**
- Create: `model/tests/test_dataset_build.py`

- [ ] **Step 1: Write test_dataset_build.py**

This test validates dataset artifacts once they exist. It should be run after `generate_dataset.py`.

```python
"""Dataset build checks per SPEC.md §10.11. Run after dataset generation."""
import json
import os
import pathlib
import pytest

DATA_DIR = pathlib.Path(__file__).parent.parent / "data"

def _skip_if_no_data():
    if not (DATA_DIR / "train.jsonl").exists():
        pytest.skip("Dataset not yet generated")

class TestDatasetBuild:
    def setup_method(self):
        _skip_if_no_data()

    def _load_jsonl(self, name):
        path = DATA_DIR / name
        examples = []
        with open(path) as f:
            for line in f:
                examples.append(json.loads(line))
        return examples

    def test_jsonl_files_parse(self):
        for name in ["train.jsonl", "val.jsonl", "test.jsonl"]:
            examples = self._load_jsonl(name)
            assert len(examples) > 0, f"{name} is empty"

    def test_no_empty_splits(self):
        for name in ["train.jsonl", "val.jsonl", "test.jsonl"]:
            examples = self._load_jsonl(name)
            assert len(examples) > 0

    def test_no_duplicate_ids_across_splits(self):
        all_ids = set()
        for name in ["train.jsonl", "val.jsonl", "test.jsonl"]:
            for ex in self._load_jsonl(name):
                eid = ex["id"]
                assert eid not in all_ids, f"Duplicate ID: {eid}"
                all_ids.add(eid)

    def test_no_content_overlap_between_splits(self):
        train_titles = {ex["target"]["title"] for ex in self._load_jsonl("train.jsonl")}
        val_titles = {ex["target"]["title"] for ex in self._load_jsonl("val.jsonl")}
        test_titles = {ex["target"]["title"] for ex in self._load_jsonl("test.jsonl")}
        assert train_titles.isdisjoint(val_titles), "train/val title overlap"
        assert train_titles.isdisjoint(test_titles), "train/test title overlap"

    def test_manifest_counts_match(self):
        with open(DATA_DIR / "dataset_manifest.json") as f:
            manifest = json.load(f)
        for split in ["train", "val", "test"]:
            actual = len(self._load_jsonl(f"{split}.jsonl"))
            expected = manifest["counts_by_split"][split]
            assert actual == expected, f"{split}: {actual} != {expected}"

    def test_curated_subset_exists(self):
        path = DATA_DIR / "eval_curated_subset.jsonl"
        assert path.exists()
        examples = []
        with open(path) as f:
            for line in f:
                examples.append(json.loads(line))
        assert len(examples) >= 20
```

- [ ] **Step 2: Commit**

```bash
git add model/tests/test_dataset_build.py
git commit -m "test(model): dataset build validation checks per SPEC.md §10.11"
```

---

### Task 22: Schema staleness detection

**Files:**
- Create: `model/tests/test_schema_staleness.py`

- [ ] **Step 1: Write test**

`model/tests/test_schema_staleness.py`:
```python
"""Verify model/schemas/ copies match canonical schemas/ directory."""
import pathlib

MODEL_SCHEMAS = pathlib.Path(__file__).parent.parent / "schemas"
CANONICAL_SCHEMAS = pathlib.Path(__file__).parent.parent.parent / "schemas"

SCHEMA_FILES = [
    "EnrichedDayContext.schema.json",
    "ComicScript.schema.json",
    "DayContext.schema.json",
    "shared.schema.json",
]

def test_schema_copies_match_canonical():
    for name in SCHEMA_FILES:
        model_copy = MODEL_SCHEMAS / name
        canonical = CANONICAL_SCHEMAS / name
        assert model_copy.exists(), f"Missing model schema copy: {name}"
        assert canonical.exists(), f"Missing canonical schema: {name}"
        assert model_copy.read_text() == canonical.read_text(), (
            f"Schema drift detected: model/schemas/{name} differs from schemas/{name}. "
            f"Re-copy from canonical source."
        )
```

- [ ] **Step 2: Run test — expect PASS**

```bash
cd model && pytest tests/test_schema_staleness.py -v
```

- [ ] **Step 3: Commit**

```bash
git add model/tests/test_schema_staleness.py
git commit -m "test(model): schema staleness detection between model/ and canonical schemas/"
```

---

### Task 23: .gitignore for model directory

**Files:**
- Create: `model/.gitignore`

- [ ] **Step 1: Create .gitignore**

```
# Generated data (keep manifest)
data/*.jsonl
!data/.gitkeep

# Training artifacts
artifacts/
!artifacts/.gitkeep

# Python
__pycache__/
*.pyc
*.egg-info/
dist/
build/
.eggs/

# Environment
.env
.venv/
venv/
```

- [ ] **Step 2: Commit**

```bash
git add model/.gitignore
git commit -m "chore(model): add .gitignore for generated data and artifacts"
```

---

## Summary

| Chunk | Tasks | Deliverable |
|-------|-------|-------------|
| 1 | 1-2 | Project scaffold + schema validation |
| 2 | 3-10 | Full synthetic dataset pipeline |
| 3 | 11-14 | Fine-tuning pipeline (formatting, config, training, export) |
| 4 | 15-18b | Evaluation pipeline (schema, leakage, compliance, report, **model inference eval**) |
| 5 | 19-20 | Serving config (VPC-internal) + labeling guidelines |
| 6 | 21-23 | Integration tests + schema staleness detection + gitignore |

**Execution order:** Chunks 1→2→3→4→5→6 (sequential, each depends on prior).

**After code is built:**
1. `scripts/generate_dataset.py` (requires ANTHROPIC_API_KEY) — generates synthetic dataset
2. `scripts/run_eval.py` — validates dataset target quality
3. `scripts/run_training.py` (requires GPU) — fine-tunes Qwen3-8B with QLoRA
4. Deploy adapter to GPU droplet with `model/src/dayframe_model/serving/deploy.sh`
5. `scripts/run_model_eval.py --base-url http://<vpc-ip>:8000` — **evaluates actual model outputs (release gate)**
6. `scripts/check_serving.py` — validates endpoint health
