"""Simple scan report: a readable Markdown file + the raw JSON, saved in core/reports/."""
import json
import os
from datetime import datetime

REPORT_DIR = os.path.join(os.path.dirname(__file__), "reports")
RISK_ORDER = ["Critical", "High", "Medium", "Low", "Informational"]


def _rank(risk: str) -> int:
    for i, r in enumerate(RISK_ORDER):
        if r.lower() == str(risk).lower():
            return i
    return len(RISK_ORDER)


def _cell(text) -> str:
    return str(text).replace("|", "/").replace("\n", " ")


def build_markdown(target: str, findings: list[dict], status: dict, started: datetime, finished: datetime) -> str:
    seconds = int((finished - started).total_seconds())
    lines = [
        "# PenflowAI Scan Report", "",
        f"- **Target:** {target}",
        f"- **Started (UTC):** {started.strftime('%Y-%m-%d %H:%M:%S')}",
        f"- **Duration:** {seconds // 60}m {seconds % 60}s",
        f"- **Total findings:** {len(findings)}", "",
        "## Tool status", "",
        "| Tool | Result | Findings | Detail |", "|---|---|---|---|",
    ]
    for tool, s in status.items():
        lines.append(f"| {tool} | {s['status']} | {s.get('count', 0)} | {_cell(s.get('detail', ''))[:150]} |")

    lines += ["", "## Findings by severity", "", "| Severity | Count |", "|---|---|"]
    counts: dict[str, int] = {}
    for f in findings:
        counts[f["risk"]] = counts.get(f["risk"], 0) + 1
    for risk in sorted(counts, key=_rank):
        lines.append(f"| {risk} | {counts[risk]} |")

    lines += ["", "## Findings", ""]
    for f in sorted(findings, key=lambda x: _rank(x["risk"])):
        lines.append(f"### [{f['risk']}] {f['name']}")
        lines.append(f"- Tool: `{f['tool']}`  |  URL: {f['url']}")
        if f.get("summary") and f["summary"] != f["name"]:
            lines.append(f"- AI summary: {f['summary']}")
        if f.get("evidence"):
            lines += ["- Evidence:", "```", f["evidence"].replace("```", "'''"), "```"]
        lines.append("")
    if not findings:
        lines.append("_No findings were produced. Check the tool status table above._")
    return "\n".join(lines)


def save_report(target: str, findings: list[dict], status: dict, started: datetime, finished: datetime) -> tuple[str, str]:
    os.makedirs(REPORT_DIR, exist_ok=True)
    stamp = started.strftime("%Y%m%dT%H%M%SZ")
    md_path = os.path.join(REPORT_DIR, f"report_{stamp}.md")
    json_path = os.path.join(REPORT_DIR, f"report_{stamp}.json")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(build_markdown(target, findings, status, started, finished))
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump({"target": target, "tool_status": status, "findings": findings}, f, indent=2)
    return md_path, json_path
