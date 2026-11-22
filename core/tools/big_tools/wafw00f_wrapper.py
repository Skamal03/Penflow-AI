from tools.tool_registry import register
from tools.shell import run_cmd, finding, is_dry_run, ToolError


@register("wafw00f", phase="reconnaissance", binary="wafw00f",
          description="Detect whether a Web Application Firewall protects the target")
def run(target_url: str, timeout: int = 120) -> list[dict]:
    if is_dry_run():
        return [finding("wafw00f", "No WAF detected in front of the target", "Informational", target_url, "fake dry-run data")]

    proc = run_cmd(["wafw00f", target_url], timeout=timeout)
    out = (proc.stdout or "") + (proc.stderr or "")
    lowered = out.lower()
    if "is behind" in lowered:
        line = next((l.strip() for l in out.splitlines() if "is behind" in l.lower()), "WAF detected")
        return [finding("wafw00f", "Web Application Firewall detected", "Informational", target_url, line)]
    if "no waf detected" in lowered:
        return [finding("wafw00f", "No WAF detected in front of the target", "Informational", target_url)]
    raise ToolError(f"wafw00f gave no clear result: {out[-200:]}")
