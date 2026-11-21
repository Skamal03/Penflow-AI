import os
import time
import requests
from tools.tool_registry import register

ZAP_API = "http://127.0.0.1:8080"  # ZAP must be running in daemon mode with API enabled

@register("zap")
def run(target_url: str) -> list[dict]:
    if os.environ.get("DRY_RUN") == "true":
        return [
            {"tool": "zap", "name": "Reflected XSS in search field", "risk": "High", "url": target_url, "evidence": "fake dry-run data"},
            {"tool": "zap", "name": "Missing anti-CSRF token", "risk": "Medium", "url": target_url, "evidence": "fake dry-run data"},
        ]
    try:
        requests.get(f"{ZAP_API}/JSON/spider/action/scan/", params={"url": target_url})
        time.sleep(15)
        requests.get(f"{ZAP_API}/JSON/ascan/action/scan/", params={"url": target_url})
        while True:
            status = requests.get(f"{ZAP_API}/JSON/ascan/view/status/").json()
            if status.get("status") == "100":
                break
            time.sleep(5)
        alerts = requests.get(f"{ZAP_API}/JSON/core/view/alerts/", params={"baseurl": target_url}).json()
        findings = []
        for alert in alerts.get("alerts", []):
            findings.append({"tool": "zap", "name": alert.get("alert", "Unknown"), "risk": alert.get("risk", "Low"), "url": alert.get("url", target_url), "evidence": alert.get("evidence", "")})
        return findings
    except Exception as e:
        return [{"tool": "zap", "name": f"Scan failed: {e}", "risk": "Low", "url": target_url, "evidence": ""}]