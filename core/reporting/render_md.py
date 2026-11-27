"""Markdown version of the same report data (replaces the old report.py output)."""
from reporting.builder import sort_findings


def _cell(text) -> str:
    return str(text or "").replace("|", "/").replace("\n", " ").strip()


def _duration(seconds) -> str:
    seconds = int(seconds or 0)
    return f"{seconds // 60}m {seconds % 60}s"


def render_md(report: dict) -> str:
    overall = report.get("overall") or {}
    counts = report.get("counts") or {}
    tools = report.get("tools") or []
    findings = sort_findings(report.get("findings") or [])
    scale = {level["key"]: level for level in report.get("severity_scale") or []}

    lines = [
        "# PenflowAI Security Assessment Report", "",
        f"- **Target:** {report.get('target')}",
        f"- **Generated (UTC):** {report.get('generated_at')}",
        f"- **Duration:** {_duration(report.get('duration_seconds'))}",
        f"- **Overall rating:** {overall.get('severity', 'none')} "
        f"({scale.get(overall.get('key'), {}).get('fix', '')})",
        f"- **Findings:** {counts.get('total', 0)}",
        f"- **Run id:** `{report.get('run_id')}`", "",
        "## Executive summary", "",
        report.get("executive_summary") or "_No summary available._", "",
        "## Severity scale", "",
        "| Severity | Count | Meaning | Fix timeline |", "|---|---|---|---|",
    ]
    for level in report.get("severity_scale") or []:
        lines.append(
            f"| {level['label']} | {counts.get(level['key'], 0)} | {_cell(level['meaning'])} "
            f"| {_cell(level['fix'])} |"
        )

    lines += ["", "## Tool coverage", "", report.get("coverage_note") or "", "",
              "| Tool | Status | Findings | Detail |", "|---|---|---|---|"]
    for t in tools:
        lines.append(
            f"| {_cell(t.get('name'))} | {_cell(t.get('status'))} | {t.get('count', 0)} "
            f"| {_cell(t.get('detail'))[:150]} |"
        )

    lines += ["", "## Findings", ""]
    if not findings:
        lines.append("_No findings were produced. Check the tool coverage table above._")

    for f in findings:
        lines.append(f"### [{f.get('severity')}] {f.get('name')}")
        lines.append("")
        lines.append(f"- **Tool:** `{f.get('tool')}`")
        lines.append(f"- **URL:** {f.get('url')}")
        if f.get("summary"):
            lines.append(f"- **What it means:** {f['summary']}")
        if f.get("mitigation"):
            lines.append(f"- **What to do:** {f['mitigation']}")
        if f.get("technical_note"):
            lines.append(f"- **Technical note:** {f['technical_note']}")
        if f.get("evidence"):
            lines += ["- **Evidence:**", "", "```",
                      str(f["evidence"]).replace("```", "'''"), "```"]
        if f.get("text_source") == "fallback":
            lines.append("- _Text generated automatically from a template._")
        lines.append("")

    lines += ["---", "",
              "AI-assisted text, verify before acting. "
              f"Schema {report.get('schema_version')}.", ""]
    return "\n".join(lines)
