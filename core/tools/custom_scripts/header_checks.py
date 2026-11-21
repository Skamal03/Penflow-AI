import requests
from tools.tool_registry import register

@register("header_checks")
def run(target_url: str) -> list[dict]:
    findings = []
    try:
        resp = requests.get(target_url, timeout=10)
    except Exception as e:
        return [{"tool": "header_checks", "name": f"Request failed: {e}", "risk": "Low", "url": target_url, "evidence": ""}]

    headers = resp.headers
    checks = {
        "X-Frame-Options": "Missing X-Frame-Options (clickjacking risk)",
        "Content-Security-Policy": "Missing Content-Security-Policy",
        "Strict-Transport-Security": "Missing Strict-Transport-Security (HSTS)",
        "X-Content-Type-Options": "Missing X-Content-Type-Options",
    }
    for header, message in checks.items():
        if header not in headers:
            findings.append({"tool": "header_checks", "name": message, "risk": "Medium", "url": target_url, "evidence": "Header absent from response"})

    for cookie in resp.cookies:
        if not cookie.has_nonstandard_attr("HttpOnly") and "HttpOnly" not in str(cookie):
            findings.append({"tool": "header_checks", "name": f"Cookie '{cookie.name}' missing HttpOnly flag", "risk": "Medium", "url": target_url, "evidence": str(cookie)})

    if not findings:
        findings.append({"tool": "header_checks", "name": "No missing security headers found", "risk": "Low", "url": target_url, "evidence": ""})
    return findings