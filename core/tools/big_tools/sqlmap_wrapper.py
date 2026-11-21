import os
import subprocess
from tools.tool_registry import register

@register("sqlmap")
def run(target_url: str) -> list[dict]:
    if os.environ.get("DRY_RUN") == "true":
        return [
            {"tool": "sqlmap", "name": "SQL injection confirmed in 'search' parameter", "risk": "High", "url": target_url, "evidence": "fake dry-run data"},
        ]
    try:
        # Requires sqlmap installed. --batch runs non-interactively.
        result = subprocess.run(
            ["sqlmap", "-u", target_url, "--batch", "--level=1", "--risk=1"],
            capture_output=True, text=True, timeout=300
        )
        output = result.stdout
        findings = []
        if "is vulnerable" in output.lower():
            findings.append({"tool": "sqlmap", "name": "SQL injection point detected", "risk": "High", "url": target_url, "evidence": output[-500:]})
        else:
            findings.append({"tool": "sqlmap", "name": "No SQL injection detected", "risk": "Low", "url": target_url, "evidence": ""})
        return findings
    except Exception as e:
        return [{"tool": "sqlmap", "name": f"Scan failed: {e}", "risk": "Low", "url": target_url, "evidence": ""}]