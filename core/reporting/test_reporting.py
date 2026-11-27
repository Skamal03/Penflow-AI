"""Plain-assert tests for the reporting module. No pytest needed.

Run from core/:
    python reporting/test_reporting.py
or:
    python -m reporting.test_reporting
"""
import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timedelta, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))

WORK_DIR = tempfile.mkdtemp(prefix="penflow-report-test-")
os.environ["PENFLOW_REPORTS_DIR"] = WORK_DIR  # never touch the real reports folder

from reporting import generate_report, load_report, rebuild_report  # noqa: E402
from reporting import ai_writer  # noqa: E402
from reporting.schema import SEVERITY_KEYS  # noqa: E402

ai_writer.CALL_DELAY_SECONDS = 0  # tests must not sleep

SAMPLE_PATH = os.path.join(_HERE, "sample_data", "sample_findings.json")
with open(SAMPLE_PATH, encoding="utf-8") as fh:
    SAMPLE = json.load(fh)

FINDINGS = SAMPLE["findings"]
RUN_STATUS = SAMPLE["run_status"]
TARGET = SAMPLE["target"]
STARTED = datetime(2026, 11, 27, 9, 0, 0, tzinfo=timezone.utc)
FINISHED = STARTED + timedelta(minutes=3, seconds=12)

PASSED = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if not condition:
        raise AssertionError(f"{name} failed{': ' + detail if detail else ''}")
    PASSED.append(name)
    print(f"  ok  {name}")


def _fake_llm_factory():
    """A fake Groq reply: covers every issue id it is asked about."""
    import re

    def fake(messages, **kwargs):
        user = messages[-1]["content"]
        if "issues" not in user:
            return "The scan found a few weaknesses. Fix the most severe ones first."
        ids = re.findall(r'"id":\s*"([0-9a-f]{12})"', user)
        items = [{"id": i, "s": "A test summary for this issue.", "m": "A test fix step.",
                  "t": "Test technical note."} for i in ids]
        return "```json\n" + json.dumps({"items": items}) + "\n```"

    return fake


_ORIGINAL_ASK = ai_writer.ask


def run_ai(use_ai=True, refresh=False, fake=None):
    ai_writer.ask = fake if fake is not None else _ORIGINAL_ASK
    try:
        return generate_report(TARGET, FINDINGS, RUN_STATUS, STARTED, FINISHED,
                               use_ai=use_ai, refresh_ai=refresh)
    finally:
        ai_writer.ask = _ORIGINAL_ASK


def test_structure():
    paths = run_ai(use_ai=False)
    report = load_report(paths["json"])

    for key in ("schema_version", "run_id", "generated_at", "target", "started_at",
                "finished_at", "duration_seconds", "owner", "ai", "overall",
                "severity_scale", "counts", "executive_summary", "tools",
                "coverage_note", "findings"):
        check(f"report.json has '{key}'", key in report)

    check("schema_version is 1.0", report["schema_version"] == "1.0")
    check("owner slots are null", report["owner"] == {"user_id": None, "roe_id": None})
    check("duration is 192s", report["duration_seconds"] == 192, str(report["duration_seconds"]))
    check("severity scale has 5 levels", len(report["severity_scale"]) == 5)
    check("scale keys ordered", [l["key"] for l in report["severity_scale"]] == SEVERITY_KEYS)
    check("every level has meaning + fix",
          all(l["meaning"] and l["fix"] and l["colour"] for l in report["severity_scale"]))
    check("3 files written", all(os.path.exists(paths[k]) for k in ("json", "html", "md")))
    check("run folder named report.json", paths["json"].endswith(os.path.join(report["run_id"], "report.json")))
    return report


def test_counts_and_overall(report):
    counts = report["counts"]
    check("critical count", counts["critical"] == 1, str(counts))
    check("high count", counts["high"] == 3, str(counts))
    check("medium count", counts["medium"] == 3, str(counts))
    check("low count", counts["low"] == 3, str(counts))
    check("informational count", counts["informational"] == 3, str(counts))
    check("total matches findings", counts["total"] == len(FINDINGS) == 13, str(counts["total"]))
    check("overall is Critical", report["overall"]["severity"] == "Critical")
    check("overall rank 0", report["overall"]["rank"] == 0)
    check("ids are stable and unique per url",
          len({f["id"] for f in report["findings"]}) == len(report["findings"]))
    check("same issue on 2 urls shares severity",
          len({f["id"] for f in report["findings"] if f["name"] == "Sensitive path exposed: /ftp"}) == 2)


def test_coverage(report):
    note = report["coverage_note"]
    check("coverage names the 2 missing tools", "nikto" in note and "sqlmap" in note, note)
    check("coverage says not installed", "not installed" in note, note)
    check("coverage says disabled", "disabled" in note, note)
    check("tool table has 9 rows", len(report["tools"]) == 9)


def test_finding_fields(report):
    required = ("id", "name", "tool", "url", "severity", "severity_rank", "evidence",
                "summary", "mitigation", "technical_note", "text_source",
                "risk_score", "cve", "kev", "owasp")
    for key in required:
        check(f"finding field '{key}'", all(key in f for f in report["findings"]))
    check("risk_score is never invented", all(f["risk_score"] is None for f in report["findings"]))
    check("future slots empty", all(f["cve"] == [] and f["kev"] is None for f in report["findings"]))
    longest = max(len(f["evidence"]) for f in report["findings"])
    check("evidence trimmed to 600 chars", longest <= 600, str(longest))


def test_html_and_markdown(report, paths):
    html = open(paths["html"], encoding="utf-8").read()
    md = open(paths["md"], encoding="utf-8").read()
    check("html is self contained", "<style>" in html and "http://cdn" not in html)
    check("html escapes <script> in evidence", "<script>alert" not in html and "&lt;script&gt;" in html)
    check("html shows severity labels", "Critical" in html and "Informational" in html)
    check("html has print css", "@media print" in html and "@page" in html)
    check("html has filter chips", 'class="chip"' in html)
    check("html has technical toggle", 'id="tech"' in html)
    check("html has the AI disclaimer", "AI-assisted text, verify before acting." in html)
    check("html has exec summary", report["executive_summary"][:20] in html)
    check("markdown has severity table", "| Severity | Count |" in md)
    check("markdown has every finding", all(f["name"] in md for f in report["findings"]))


def test_no_ai_zero_tokens():
    def explode(*args, **kwargs):
        raise AssertionError("the LLM must not be called with use_ai=False")

    paths = run_ai(use_ai=False, refresh=True, fake=explode)
    report = load_report(paths["json"])
    check("--no-ai uses zero AI calls", report["ai"]["calls"] == 0)
    check("--no-ai marks fallback", report["ai"]["used"] is False and report["ai"]["fallback_used"] is True)
    check("--no-ai still writes summaries", all(f["summary"] for f in report["findings"]))
    check("--no-ai still writes mitigations", all(f["mitigation"] for f in report["findings"]))
    check("fallback text matches the issue type",
          any("script" in f["summary"].lower() for f in report["findings"]
              if "scripting" in f["name"].lower()))
    check("--no-ai writes an executive summary", len(report["executive_summary"]) > 40)


def test_llm_failure_falls_back():
    def broken(*args, **kwargs):
        raise RuntimeError("LLM is down")

    paths = run_ai(use_ai=True, refresh=True, fake=broken)
    report = load_report(paths["json"])
    check("fallback report still produced", os.path.exists(paths["html"]))
    check("all text is fallback", all(f["text_source"] == "fallback" for f in report["findings"]))
    check("fallback text is non-empty",
          all(f["summary"] and f["mitigation"] for f in report["findings"]))
    check("ai.used false on failure", report["ai"]["used"] is False)
    check("fallback_used flagged", report["ai"]["fallback_used"] is True)


def test_ai_then_cache():
    fake = _fake_llm_factory()
    paths = run_ai(use_ai=True, refresh=True, fake=fake)
    first = load_report(paths["json"])
    check("AI text used", any(f["text_source"] == "ai" for f in first["findings"]))
    check("AI calls are batched (<=5)", 0 < first["ai"]["calls"] <= 5, str(first["ai"]["calls"]))
    check("informational never hits the AI",
          all(f["text_source"] == "fallback" for f in first["findings"]
              if f["severity_key"] == "informational"))

    def explode(*args, **kwargs):
        raise AssertionError("cache hit must not call the LLM")

    paths2 = run_ai(use_ai=True, refresh=False, fake=explode)
    second = load_report(paths2["json"])
    check("cache hit makes zero LLM calls", second["ai"]["calls"] == 0, str(second["ai"]["calls"]))
    check("cached text is reused", any(f["text_source"] == "cache" for f in second["findings"]))
    check("cached summary identical", second["executive_summary"] == first["executive_summary"])


def test_rebuild():
    paths = run_ai(use_ai=False)
    os.remove(paths["html"])
    rebuilt = rebuild_report(paths["json"])
    check("rebuild recreates the html", os.path.exists(rebuilt["html"]))
    check("rebuild keeps the same folder", os.path.dirname(rebuilt["html"]) == paths["dir"])


def main():
    print(f"reporting tests -> {WORK_DIR}")
    report = test_structure()
    test_counts_and_overall(report)
    test_coverage(report)
    test_finding_fields(report)
    test_html_and_markdown(report, {"html": os.path.join(report_dirs(report), "report.html"),
                                    "md": os.path.join(report_dirs(report), "report.md")})
    test_no_ai_zero_tokens()
    test_llm_failure_falls_back()
    test_ai_then_cache()
    test_rebuild()
    print(f"\nAll {len(PASSED)} checks passed.")
    return 0


def report_dirs(report):
    return os.path.join(WORK_DIR, report["run_id"])


if __name__ == "__main__":
    try:
        sys.exit(main())
    finally:
        shutil.rmtree(WORK_DIR, ignore_errors=True)
