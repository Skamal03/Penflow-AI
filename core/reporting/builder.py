"""Turns raw tool findings + run status into the report dict (report.json).

Everything factual - counts, durations, tool table, overall rating, coverage -
is computed here in code. The AI writer may later fill summary/mitigation text,
but it never touches a number or a table.
"""
from datetime import datetime, timezone

from reporting.schema import (
    NO_FINDINGS,
    SCHEMA_VERSION,
    SEVERITY_BY_KEY,
    SEVERITY_SCALE,
    collapse_ws,
    finding_id,
    iso,
    normalise_severity,
    severity_label,
    severity_rank,
    trim_chars,
    utc_stamp,
)

EVIDENCE_LIMIT = 600

_NOT_RUN = {"skipped", "not installed", "error", "crash"}

_REASON = {
    "not installed": "not installed",
    "error": "failed",
    "crash": "crashed",
}


def _reason(tool: str, status: str, detail: str) -> str:
    if status == "not installed":
        return "not installed"
    if status == "skipped":
        low = (detail or "").lower()
        if "disabled" in low or "enabled_tools" in low:
            return "disabled"
        if "not registered" in low:
            return "not registered"
        return "skipped"
    return _REASON.get(status, "did not run")


def build_tools(run_status: dict | None) -> list[dict]:
    tools = []
    for name, state in (run_status or {}).items():
        tools.append({
            "name": name,
            "status": state.get("status", "unknown"),
            "count": int(state.get("count", 0) or 0),
            "detail": collapse_ws(state.get("detail", ""))[:200],
        })
    return tools


def build_counts(findings: list[dict]) -> dict:
    counts = {key: 0 for key in SEVERITY_BY_KEY}
    for f in findings:
        counts[normalise_severity(f.get("severity_key") or f.get("risk"))] += 1
    counts["total"] = len(findings)
    return counts


def overall_rating(counts: dict) -> dict:
    for level in SEVERITY_SCALE:
        if counts.get(level["key"], 0) > 0:
            return {
                "severity": level["label"],
                "label": f"{level['label']} risk",
                "key": level["key"],
                "rank": level["rank"],
                "colour": level["colour"],
                "icon": level["icon"],
                "meaning": level["meaning"],
                "fix": level["fix"],
            }
    return dict(NO_FINDINGS)


def coverage_note(tools: list[dict]) -> str:
    total = len(tools)
    if total == 0:
        return "No tool status was recorded for this run, so coverage cannot be confirmed."
    missing = [t for t in tools if t["status"] in _NOT_RUN]
    if not missing:
        return f"All {total} tools ran. Coverage looks complete for this scan."

    named = ", ".join(f"{t['name']} ({_reason(t['name'], t['status'], t['detail'])})" for t in missing)
    plural = "tool" if len(missing) == 1 else "tools"
    return (
        f"{len(missing)} of {total} {plural} did not run: {named}. "
        "Results may be incomplete, and some issue types were not tested."
    )


def build_findings(raw_findings: list[dict]) -> list[dict]:
    findings = []
    for raw in raw_findings:
        tool = str(raw.get("tool", "unknown"))
        name = collapse_ws(raw.get("name") or "Unnamed finding")
        url = str(raw.get("url", ""))
        key = normalise_severity(raw.get("severity_key") or raw.get("risk"))
        findings.append({
            "id": raw.get("id") or finding_id(tool, name, url),
            "name": name,
            "tool": tool,
            "url": url,
            "severity": severity_label(key),
            "severity_key": key,
            "severity_rank": severity_rank(key),
            "evidence": trim_chars(raw.get("evidence", ""), EVIDENCE_LIMIT),
            "summary": collapse_ws(raw.get("summary") or name),
            "mitigation": "",
            "technical_note": "",
            "text_source": "fallback",
            # Filled in later by the Risk Scorer - never invented here.
            "risk_score": None,
            "cve": [],
            "kev": None,
            "owasp": None,
        })
    return findings


def build_report(target: str, findings: list[dict], run_status: dict | None = None,
                 started: datetime | None = None, finished: datetime | None = None,
                 owner: dict | None = None, model: str | None = None) -> dict:
    started = started or datetime.now(timezone.utc)
    finished = finished or datetime.now(timezone.utc)
    if finished < started:
        finished = started

    built = build_findings(findings)
    counts = build_counts(built)
    tools = build_tools(run_status)

    return {
        "schema_version": SCHEMA_VERSION,
        "run_id": utc_stamp(started),
        "generated_at": iso(finished),
        "target": target,
        "started_at": iso(started),
        "finished_at": iso(finished),
        "duration_seconds": int((finished - started).total_seconds()),
        "owner": {"user_id": (owner or {}).get("user_id"), "roe_id": (owner or {}).get("roe_id")},
        "ai": {"used": False, "model": model, "calls": 0, "fallback_used": True},
        "overall": overall_rating(counts),
        "severity_scale": [dict(level) for level in SEVERITY_SCALE],
        "counts": counts,
        "executive_summary": "",
        "tools": tools,
        "coverage_note": coverage_note(tools),
        "findings": built,
    }


def sort_findings(findings: list[dict]) -> list[dict]:
    return sorted(findings, key=lambda f: (f.get("severity_rank", 99), f.get("name", "").lower()))
