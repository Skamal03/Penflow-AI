"""Single source of truth for the report format.

Defines the severity scale ONCE, the schema version, stable finding ids and a
few small text helpers shared by the builder, the AI writer and the renderers.
No network, no LLM, no file I/O beyond path constants.
"""
import hashlib
import os
import re
from datetime import datetime, timezone

SCHEMA_VERSION = "1.0"
PROMPT_VERSION = "v1"

CORE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# PENFLOW_REPORTS_DIR lets tests (and CI) write somewhere disposable.
REPORTS_DIR = os.getenv("PENFLOW_REPORTS_DIR") or os.path.join(CORE_DIR, "reports")

# Severity scale, highest first. Every renderer and the frontend read this.
SEVERITY_SCALE = [
    {
        "key": "critical",
        "label": "Critical",
        "rank": 0,
        "colour": "#b3261e",
        "icon": "\u2716",
        "meaning": "An attacker could likely take over the system or steal data now.",
        "fix": "Fix immediately.",
    },
    {
        "key": "high",
        "label": "High",
        "rank": 1,
        "colour": "#c2410c",
        "icon": "\u25b2",
        "meaning": "A serious weakness that is easy to abuse.",
        "fix": "Fix within 7 days.",
    },
    {
        "key": "medium",
        "label": "Medium",
        "rank": 2,
        "colour": "#a16207",
        "icon": "\u25c6",
        "meaning": "A real issue that needs some conditions to be abused.",
        "fix": "Fix within 30 days.",
    },
    {
        "key": "low",
        "label": "Low",
        "rank": 3,
        "colour": "#15803d",
        "icon": "\u25cf",
        "meaning": "A minor weakness with limited impact.",
        "fix": "Fix in the next maintenance cycle.",
    },
    {
        "key": "informational",
        "label": "Informational",
        "rank": 4,
        "colour": "#1d4ed8",
        "icon": "\u2139",
        "meaning": "No direct risk, but useful to know.",
        "fix": "No fix needed.",
    },
]

SEVERITY_BY_KEY = {level["key"]: level for level in SEVERITY_SCALE}
SEVERITY_KEYS = [level["key"] for level in SEVERITY_SCALE]

# Whatever a tool wrapper happens to call it, land on one of the five keys.
_ALIASES = {
    "critical": "critical", "crit": "critical", "severe": "critical", "high risk": "critical",
    "high": "high", "important": "high",
    "medium": "medium", "med": "medium", "moderate": "medium", "warning": "medium", "warn": "medium",
    "low": "low", "minor": "low", "info": "informational", "informational": "informational",
    "information": "informational", "note": "informational", "none": "informational",
}

NO_FINDINGS = {
    "key": "none",
    "severity": "none",
    "label": "No findings",
    "rank": None,
    "colour": "#15803d",
    "icon": "\u2713",
}


def normalise_severity(value) -> str:
    """Return one of SEVERITY_KEYS. Unknown values are treated as informational."""
    raw = str(value or "").strip().lower()
    if raw in _ALIASES:
        return _ALIASES[raw]
    for key in SEVERITY_KEYS:  # e.g. "Critical (CVSS 9.8)"
        if raw.startswith(key[:4]):
            return key
    return "informational"


def severity_label(key: str) -> str:
    return SEVERITY_BY_KEY.get(key, SEVERITY_BY_KEY["informational"])["label"]


def severity_rank(key: str) -> int:
    return SEVERITY_BY_KEY.get(key, SEVERITY_BY_KEY["informational"])["rank"]


def finding_id(tool: str, name: str, url: str) -> str:
    """Stable id: the same issue on the same URL always gets the same id."""
    raw = f"{tool}|{name}|{url}".lower().encode("utf-8", "replace")
    return hashlib.sha256(raw).hexdigest()[:12]


def text_hash(*parts: str) -> str:
    return hashlib.sha256("|".join(parts).encode("utf-8", "replace")).hexdigest()[:24]


def utc_stamp(dt: datetime) -> str:
    """UTC timestamp used for run ids and the JSON contract."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def trim_chars(text, limit: int) -> str:
    s = str(text or "").strip()
    if len(s) <= limit:
        return s
    return s[: limit - 1].rstrip() + "\u2026"


def trim_words(text, limit: int) -> str:
    words = str(text or "").split()
    if len(words) <= limit:
        return " ".join(words)
    return " ".join(words[:limit]).rstrip(".,;:") + "\u2026"


def collapse_ws(text) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()
