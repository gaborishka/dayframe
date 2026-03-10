"""Persona definitions for synthetic DayContext generation."""
from __future__ import annotations

PERSONAS: list[dict] = [
    {
        "name": "developer",
        "calendar_patterns": [
            ("Team standup", 15),
            ("Sprint planning", 60),
            ("Code review", 45),
            ("1:1 with manager", 30),
            ("Lunch break", 60),
            ("Deep work: feature implementation", 120),
        ],
        "todo_patterns": [
            "Fix login bug reported by QA",
            "Review PR #342 from Alice",
            "Update API documentation",
            "Deploy hotfix to staging",
            "Write unit tests for auth module",
            "Refactor database layer",
        ],
        "reflection_patterns": [
            "Crushed three bugs before lunch — the neon logs don't lie.",
            "PR reviews piled up like unmerged branches. Tomorrow: merge day.",
            "Deep work session was pure flow. The code forge hummed.",
            "Standup ran long. Sprint planning even longer. Still shipped something.",
            "Refactor complete. The codebase breathes easier now.",
        ],
        "world_setting": "neon-lit cyberpunk code forge",
        "protagonist_template": {
            "name": "Hex",
            "role": "protagonist",
            "visual_description": (
                "A sharp-eyed hacker in a hooded jacket, fingers flying over a "
                "holographic keyboard in the neon glow"
            ),
        },
    },
    {
        "name": "student",
        "calendar_patterns": [
            ("Calculus lecture", 90),
            ("Study group: thermodynamics", 60),
            ("Physics lab", 120),
            ("Office hours with Prof. Chen", 30),
            ("Academic club meeting", 45),
        ],
        "todo_patterns": [
            "Complete problem set 7",
            "Read chapters 4-5 of organic chemistry text",
            "Write essay draft on Keynesian economics",
            "Compile lab report from Tuesday's experiment",
            "Submit scholarship application",
            "Review lecture notes before midterm",
        ],
        "reflection_patterns": [
            "Calculus finally clicked today — the knowledge glowed brighter.",
            "Study group was chaotic but the magic of collaboration worked.",
            "Lab results were unexpected. Science is humbling.",
            "Office hours saved me from a failing grade. Prof. Chen is a wizard.",
            "Essay draft done. The words flowed like enchanted ink.",
        ],
        "world_setting": "magical academy where knowledge glows",
        "protagonist_template": {
            "name": "Lumen",
            "role": "protagonist",
            "visual_description": (
                "A bright-eyed student in academy robes, surrounded by floating "
                "glowing tomes and shimmering equations"
            ),
        },
    },
    {
        "name": "manager",
        "calendar_patterns": [
            ("All-hands meeting", 60),
            ("1:1 with direct reports", 30),
            ("Q3 strategy session", 90),
            ("Budget review", 60),
            ("Cross-team sync", 45),
            ("Hiring panel interview", 60),
        ],
        "todo_patterns": [
            "Approve Q3 budget proposal",
            "Complete performance reviews for team",
            "Plan team offsite agenda",
            "Finalize hiring decision for senior engineer role",
            "Draft OKRs for next quarter",
            "Respond to escalated customer complaint",
        ],
        "reflection_patterns": [
            "The clockwork castle ran smoothly today — every gear in place.",
            "Three 1:1s, one fire drill, and a budget battle. All survived.",
            "Strategy session yielded real alignment. The gears finally meshed.",
            "Hiring panel went long but we found our candidate.",
            "Performance reviews always remind me what the team truly builds.",
        ],
        "world_setting": "grand clockwork castle",
        "protagonist_template": {
            "name": "Captain Gears",
            "role": "protagonist",
            "visual_description": (
                "A commanding figure in a brass-buttoned coat, orchestrating spinning "
                "gears and mechanical minions across a vast clockwork hall"
            ),
        },
    },
    {
        "name": "parent",
        "calendar_patterns": [
            ("School drop-off", 30),
            ("Doctor appointment", 60),
            ("Grocery run", 45),
            ("Soccer practice pickup", 30),
            ("PTA meeting", 60),
            ("Family dinner prep", 45),
        ],
        "todo_patterns": [
            "Pack school lunches for the week",
            "Schedule dentist appointment for kids",
            "Buy birthday gift for neighbor's party",
            "Fix leaking kitchen faucet",
            "Sign permission slip for field trip",
            "Call school about library book",
        ],
        "reflection_patterns": [
            "The treehouse village was lively today — every branch full of life.",
            "School drop-off, doctor, groceries: the three quests of Tuesday.",
            "PTA meeting was long but worth it. The village grows together.",
            "Soccer pickup in the rain — Oak stood tall as always.",
            "Dinner was chaotic. The family laughed anyway. Mission accomplished.",
        ],
        "world_setting": "whimsical treehouse village",
        "protagonist_template": {
            "name": "Oak",
            "role": "protagonist",
            "visual_description": (
                "A sturdy and warm caretaker in practical clothes, balancing armfuls "
                "of lunchboxes and schedules amid colorful treehouse platforms"
            ),
        },
    },
    {
        "name": "freelancer",
        "calendar_patterns": [
            ("Client call: project kickoff", 60),
            ("Design review with stakeholders", 45),
            ("Invoice and admin block", 30),
            ("Networking coffee chat", 30),
            ("Coworking session", 120),
        ],
        "todo_patterns": [
            "Send invoice #47 to Acme Corp",
            "Finish homepage mockups for startup client",
            "Update portfolio with recent case studies",
            "Follow up on three pending leads",
            "File quarterly taxes",
            "Respond to collaboration inquiry",
        ],
        "reflection_patterns": [
            "The sky-island market was open and the trades were good.",
            "Two client calls, one invoice, zero regrets. Drift floats on.",
            "Mockups approved on first pass — rare sky magic.",
            "Networking paid off: a warm lead from an old contact.",
            "Admin day felt heavy but the books are balanced now.",
        ],
        "world_setting": "floating market of sky-islands",
        "protagonist_template": {
            "name": "Drift",
            "role": "protagonist",
            "visual_description": (
                "A nimble and resourceful freelancer on a wind-sailed platform, "
                "juggling glowing project orbs across sky-island trade routes"
            ),
        },
    },
    {
        "name": "creator",
        "calendar_patterns": [
            ("Brainstorm session", 60),
            ("Video recording block", 120),
            ("Editing marathon", 90),
            ("Sponsor call", 30),
            ("Community livestream", 60),
        ],
        "todo_patterns": [
            "Edit and publish Tuesday's video",
            "Write and send weekly newsletter",
            "Plan content series for April",
            "Reply to top comments from last week",
            "Post across social channels",
            "Outline script for next episode",
        ],
        "reflection_patterns": [
            "The canvas-world burst with color today — a good creation day.",
            "Recording ran three hours. Pixel was in the zone.",
            "Editing is where the magic really happens. Frame by frame.",
            "Sponsor call went well. The brand fits the story.",
            "Livestream community energy was electric. Worth every minute.",
        ],
        "world_setting": "vibrant canvas-world",
        "protagonist_template": {
            "name": "Pixel",
            "role": "protagonist",
            "visual_description": (
                "A vivid and expressive creator with paint-splashed clothes, sculpting "
                "glowing content frames in a world made entirely of living art"
            ),
        },
    },
]

# Index for fast lookup
_PERSONA_INDEX: dict[str, dict] = {p["name"]: p for p in PERSONAS}

TONES: list[str] = ["humorous", "adventurous", "reflective", "chaotic"]

DAY_TYPES: list[str] = [
    "mundane",
    "stressful",
    "productive",
    "celebratory",
    "sparse_input",
    "recovery_day",
]


def get_persona(name: str) -> dict:
    """Return persona dict by name. Raises KeyError if not found."""
    if name not in _PERSONA_INDEX:
        raise KeyError(f"Unknown persona: {name!r}. Available: {list(_PERSONA_INDEX)}")
    return _PERSONA_INDEX[name]
