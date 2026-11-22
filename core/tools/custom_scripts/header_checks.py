import requests
from tools.tool_registry import register
from tools.shell import finding, ToolError


@register("header_checks", phase="vulnerability_assessment", description="Missing security headers and cookie flags")
def run(target_url: str) -> list[dict]:
    try:
        resp = requests.get(target_url, timeout=10)
    except requests.RequestException as e:
        raise ToolError(f"request failed: {e}")

    findings = []
    checks = {
        "X-Frame-Options": "Missing X-Frame-Options (clickjacking risk)",
        "Content-Security-Policy": "Missing Content-Security-Policy",
        "Strict-Transport-Security": "Missing Strict-Transport-Security (HSTS)",
        "X-Content-Type-Options": "Missing X-Content-Type-Options",
    }
    for header, message in checks.items():
        if header not in resp.headers:
            findings.append(finding("header_checks", message, "Medium", target_url, "Header absent from response"))

    for cookie in resp.cookies:
        if not cookie.has_nonstandard_attr("HttpOnly") and "HttpOnly" not in str(cookie):
            findings.append(finding("header_checks", f"Cookie '{cookie.name}' missing HttpOnly flag", "Medium",
                                    target_url, str(cookie)))
    return findings
