"""Report module for PenflowAI.

One scan -> one structured report.json (source of truth) -> a standalone
print-ready report.html plus a report.md.

    from reporting import generate_report
    paths = generate_report(target, findings, run_status, started, finished)
    # -> {"run_id", "dir", "json", "html", "md"}
"""
import json
import os
import sys
from datetime import datetime, timezone

from reporting import schema
from reporting.builder import build_report
from reporting.render_html import render_html
from reporting.render_md import render_md

__all__ = ["generate_report", "rebuild_report", "load_report", "reports_dir"]


def reports_dir() -> str:
    return os.getenv("PENFLOW_REPORTS_DIR") or schema.REPORTS_DIR


def _say(msg: str) -> None:
    print(f"[report] {msg}", file=sys.stderr, flush=True)


def _write_text(path: str, text: str) -> str:
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    return path


def _write_json(path: str, data: dict) -> str:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    os.replace(tmp, path)  # atomic: a crash never leaves a half-written report
    return path


def _unique_dir(base: str, run_id: str) -> str:
    path = os.path.join(base, run_id)
    if not os.path.exists(path):
        return path
    for n in range(2, 100):
        candidate = os.path.join(base, f"{run_id}-{n}")
        if not os.path.exists(candidate):
            return candidate
    return os.path.join(base, f"{run_id}-{datetime.now(timezone.utc).microsecond}")


def load_report(json_path: str) -> dict:
    with open(json_path, encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict) or "findings" not in data:
        raise ValueError(f"{json_path} is not a PenflowAI report.json")
    return data


def _render_all(report: dict, out_dir: str) -> dict:
    os.makedirs(out_dir, exist_ok=True)
    return {
        "run_id": report.get("run_id"),
        "dir": out_dir,
        "json": _write_json(os.path.join(out_dir, "report.json"), report),
        "html": _write_text(os.path.join(out_dir, "report.html"), render_html(report)),
        "md": _write_text(os.path.join(out_dir, "report.md"), render_md(report)),
    }


def generate_report(target, findings, run_status=None, started=None, finished=None,
                    use_ai=True, owner=None, refresh_ai=False, run_id=None) -> dict:
    """Build report.json first, then (optionally) add AI text, then render."""
    started = started or datetime.now(timezone.utc)
    finished = finished or datetime.now(timezone.utc)

    report = build_report(target, findings, run_status, started, finished, owner=owner)
    if run_id:
        import uuid
        run_id = str(uuid.UUID(run_id))  # defense in depth: must be a valid UUID
        out_dir = os.path.join(reports_dir(), run_id)  # exact name, no suffix
        report["run_id"] = run_id
    else:
        out_dir = _unique_dir(reports_dir(), report["run_id"])
        report["run_id"] = os.path.basename(out_dir)
    os.makedirs(out_dir, exist_ok=True)

    # Facts on disk before any network call: a crash never loses the scan.
    json_path = _write_json(os.path.join(out_dir, "report.json"), report)

    try:
        from reporting import ai_writer
        report = ai_writer.enrich(report, use_ai=use_ai, refresh=refresh_ai)
    except Exception as exc:  # never let the text layer kill a report
        _say(f"AI text failed, using built-in text: {exc!r}")
        try:
            from reporting.ai_writer import exec_fallback
            text = exec_fallback(report)
        except Exception:
            text = "This scan produced a report, but the summary text could not be generated."
        report["ai"] = {"used": False, "model": None, "calls": 0, "fallback_used": True}
        if not report.get("executive_summary"):
            report["executive_summary"] = text
    if not use_ai:
        _say("AI text disabled (--no-ai): using built-in text")

    paths = _render_all(report, out_dir)
    _say(f"saved {json_path}")
    return paths


def rebuild_report(json_path: str, out_dir: str | None = None) -> dict:
    """Re-render HTML/MD from an existing report.json without re-scanning."""
    report = load_report(json_path)
    directory = out_dir or os.path.dirname(os.path.abspath(json_path))
    return _render_all(report, directory)
