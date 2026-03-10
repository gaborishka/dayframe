"""Anonymization leakage detection for ComicScript outputs."""
import re
from typing import Any

# Regex patterns for PII detection
_EMAIL_PATTERN = re.compile(
    r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
)

_ADDRESS_PATTERN = re.compile(
    r"\d{1,5}\s+[A-Z][a-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln)",
    re.IGNORECASE,
)

_PHONE_PATTERN = re.compile(
    r"\+?\d[\d\s\-()]{7,}\d"
)


def _extract_text_fields(script: dict) -> list[str]:
    """Extract all text strings from a ComicScript dict."""
    texts = []

    # Top-level title
    if script.get("title"):
        texts.append(script["title"])

    # Panels
    for panel in script.get("panels", []):
        if panel.get("scene_description"):
            texts.append(panel["scene_description"])
        if panel.get("visual_prompt"):
            texts.append(panel["visual_prompt"])
        if panel.get("mood"):
            texts.append(panel["mood"])
        if panel.get("narrative_caption"):
            texts.append(panel["narrative_caption"])
        for line in panel.get("dialogue", []):
            if line.get("speaker"):
                texts.append(line["speaker"])
            if line.get("text"):
                texts.append(line["text"])

    # Characters
    for char in script.get("characters", []):
        if char.get("name"):
            texts.append(char["name"])
        if char.get("visual_description"):
            texts.append(char["visual_description"])

    # Arc hooks
    arc_hooks = script.get("arc_hooks")
    if arc_hooks:
        if arc_hooks.get("callback_to"):
            texts.append(arc_hooks["callback_to"])
        if arc_hooks.get("setup_for"):
            texts.append(arc_hooks["setup_for"])
        for elem in arc_hooks.get("recurring_elements", []):
            texts.append(elem)

    return texts


def check_leakage(comic_script: dict, blocked_tokens: list[str]) -> list[str]:
    """
    Check all text fields in a ComicScript for PII leakage.

    Returns a list of issue strings. Empty list means no leakage detected.
    """
    issues = []
    texts = _extract_text_fields(comic_script)

    for text in texts:
        if not text:
            continue

        # Check email pattern
        if _EMAIL_PATTERN.search(text):
            issues.append(f"Detected email address in comic script text: {text!r}")

        # Check address pattern
        if _ADDRESS_PATTERN.search(text):
            issues.append(f"Detected address/location pattern in comic script text: {text!r}")

        # Check phone pattern
        if _PHONE_PATTERN.search(text):
            issues.append(f"Detected phone number pattern in comic script text: {text!r}")

        # Check blocked tokens (case-insensitive)
        for token in blocked_tokens:
            if token.lower() in text.lower():
                issues.append(
                    f"Detected blocked token {token!r} in comic script text: {text!r}"
                )

    return issues


def extract_blocked_tokens(day_context: dict) -> list[str]:
    """
    Extract real-world tokens from a DayContext that should be blocked from comic output.

    Extracts: attendee emails, name parts from emails, non-generic locations.
    """
    blocked: list[str] = []

    _GENERIC_LOCATIONS = {
        "office", "home", "conference room", "library", "cafe",
        "meeting room", "school", "hospital", "restaurant", "park",
    }

    for event in day_context.get("calendar_events", []):
        # Extract attendee emails and name parts
        for attendee in event.get("attendees", []):
            if attendee and "@" in attendee:
                blocked.append(attendee)
                # Extract local part name portions
                local_part = attendee.split("@")[0]
                # Split on common separators and add multi-char parts
                name_parts = re.split(r"[._\-+]", local_part)
                for part in name_parts:
                    if len(part) > 2:
                        blocked.append(part)

        # Extract non-generic locations
        location = event.get("location")
        if location and location.lower() not in _GENERIC_LOCATIONS:
            blocked.append(location)

    return list(dict.fromkeys(blocked))  # deduplicate preserving order
