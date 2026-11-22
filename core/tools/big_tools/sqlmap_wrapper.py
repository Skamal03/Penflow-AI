from urllib.parse import urlparse
from tools.tool_registry import register
from tools.shell import run_cmd, finding, is_dry_run, ToolSkipped


# Disabled by default. Enable with: PENFLOW_ENABLED_TOOLS=sqlmap
@register("sqlmap", phase="validation", binary="sqlmap", active=True, default_enabled=False,
          description="SQL injection verification on a URL that has query parameters")
def run(target_url: str, timeout: int = 300) -> list[dict]:
    if is_dry_run():
        return [finding("sqlmap", "SQL injection confirmed in 'search' parameter", "High", target_url, "fake dry-run data")]

    if not urlparse(target_url).query:
        raise ToolSkipped("sqlmap needs a URL with parameters, e.g. http://127.0.0.1:3000/rest/products/search?q=test")

    proc = run_cmd(["sqlmap", "-u", target_url, "--batch", "--level=1", "--risk=1", "--timeout=10"], timeout=timeout)
    out = proc.stdout or ""
    if "is vulnerable" in out.lower() or "type:" in out.lower():
        return [finding("sqlmap", "SQL injection point detected", "High", target_url, out[-500:])]
    return []
