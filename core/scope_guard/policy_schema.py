from __future__ import annotations

POLICY_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "additionalProperties": False,
    "required": [
        "selected_tools",
        "tool_limits",
        "blocked_actions",
        "time_window",
        "max_intrusion_level",
        "notes",
        "target",
        "policy_hash",
    ],
    "properties": {
        "selected_tools": {
            "type": "array",
            "uniqueItems": True,
            "items": {"type": "string", "enum": ["nmap", "zap"]},
        },
        "tool_limits": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                name: {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["allowed_flags", "max_rate", "max_duration", "max_requests"],
                    "properties": {
                        "allowed_flags": {
                            "type": "array",
                            "uniqueItems": True,
                            "items": {"type": "string"},
                        },
                        "max_rate": {"type": "integer", "minimum": 1},
                        "max_duration": {"type": "integer", "minimum": 1},
                        "max_requests": {"type": "integer", "minimum": 1},
                    },
                }
                for name in ("nmap", "zap")
            },
        },
        "blocked_actions": {
            "type": "array",
            "uniqueItems": True,
            "items": {"type": "string", "minLength": 1, "maxLength": 200},
        },
        "time_window": {
            "type": "object",
            "additionalProperties": False,
            "required": ["start", "end"],
            "properties": {
                "start": {"type": "string", "format": "date-time"},
                "end": {"type": "string", "format": "date-time"},
            },
        },
        "max_intrusion_level": {"type": "string", "enum": ["none", "low", "moderate"]},
        "notes": {
            "type": "array",
            "items": {"type": "string", "maxLength": 500},
            "maxItems": 20,
        },
        "target": {
            "type": "object",
            "additionalProperties": False,
            "required": ["url", "host", "port", "resolved_ips", "lab_mode"],
            "properties": {
                "url": {"type": "string", "format": "uri"},
                "host": {"type": "string", "minLength": 1},
                "port": {"type": "integer", "minimum": 1, "maximum": 65535},
                "resolved_ips": {
                    "type": "array",
                    "uniqueItems": True,
                    "items": {"type": "string"},
                },
                "lab_mode": {"type": "boolean"},
            },
        },
        "policy_hash": {"type": "string", "pattern": "^[0-9a-f]{64}$"},
    },
}

EXTRACTION_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "additionalProperties": False,
    "required": [
        "selected_tools",
        "tool_limits",
        "blocked_actions",
        "time_window",
        "max_intrusion_level",
        "notes",
    ],
    "properties": {
        key: value
        for key, value in POLICY_SCHEMA["properties"].items()
        if key in {
            "selected_tools",
            "tool_limits",
            "blocked_actions",
            "max_intrusion_level",
            "notes",
        }
    },
}
EXTRACTION_SCHEMA["properties"]["time_window"] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["start", "end"],
    "properties": {
        "start": {"type": ["string", "null"], "format": "date-time"},
        "end": {"type": ["string", "null"], "format": "date-time"},
    },
}
