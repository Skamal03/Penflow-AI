import json
from tools.tool_registry import register
from tools.shell import run_cmd, finding, is_dry_run, ToolError

SEVERITY = {"info": "Informational", "low": "Low", "medium": "Medium", "high": "High", "critical": "Critical"}


@register("nuclei", phase="vulnerability_assessment", binary="nuclei", active=True,
          description="Template-based detection of exposures and misconfigurations (safe tags only)")
def run(target_url: str, timeout: int = 600) -> list[dict]:
    if is_dry_run():
        return [finding("nuclei", "Exposed configuration file detected", "Medium", target_url, "fake dry-run data")]

    # -ni: no interactsh (no outside traffic). Intrusive/DoS/fuzz templates excluded.
    proc = run_cmd(["nuclei", "-u", target_url, "-silent", "-jsonl", "-duc", "-ni",
                    "-tags", "exposure,misconfig,tech", "-etags", "dos,fuzz,intrusive",
                    "-severity", "info,low,medium,high,critical",
                    "-rl", "50", "-c", "10", "-timeout", "10", "-retries", "1"], timeout=timeout)
    findings = []
    for line in (proc.stdout or "").splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            r = json.loads(line)
        except ValueError:
            continue
        info = r.get("info", {})
        extra = ", ".join(map(str, r.get("extracted-results", []) or []))
        findings.append(finding("nuclei", info.get("name", r.get("template-id", "Unknown")),
                                SEVERITY.get(str(info.get("severity", "info")).lower(), "Informational"),
                                r.get("matched-at", target_url),
                                f"template={r.get('template-id', '')} {extra}".strip()))
    if proc.returncode != 0 and not findings:
        raise ToolError(f"nuclei failed: {(proc.stderr or '')[-200:]}")
    return findings
