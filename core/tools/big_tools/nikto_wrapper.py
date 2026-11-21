import os
import subprocess
import json
from tools.tool_registry import register

@register("nikto")
def run(target_url: str) -> list[dict]:
    if os.environ.get("DRY_RUN") == "true":
        return [
            {"tool": "nikto", "name": "Server leaks Apache version via header", "risk": "Low", "url": target_url, "evidence": "fake dry-run data"},
            {"tool": "nikto", "name": "Outdated jQuery version detected", "risk": "Medium", "url": target_url, "evidence": "fake dry-run data"},
        ]
    try:
        # Requires nikto installed and on PATH. -Format json requires a -output file.
        result = subprocess.run(
            ["nikto", "-h", target_url, "-Format", "json", "-output", "nikto_result.json"],
            capture_output=True, text=True, timeout=300
        )
        with open("nikto_result.json") as f:
            data = json.load(f)
        findings = []
        for vuln in data.get("vulnerabilities", []):
            findings.append({"tool": "nikto", "name": vuln.get("msg", "Unknown finding"), "risk": "Medium", "url": target_url, "evidence": vuln.get("url", "")})
        return findings
    except Exception as e:
        return [{"tool": "nikto", "name": f"Scan failed: {e}", "risk": "Low", "url": target_url, "evidence": ""}]
    