import json
from tools.tool_registry import register
from tools.shell import run_with_output_file, finding, is_dry_run, ToolError


@register("nikto", phase="vulnerability_assessment", binary="nikto", active=True,
          description="Web server misconfiguration and outdated component checks")
def run(target_url: str, tuning: str = "x6", timeout: int = 300) -> list[dict]:
    if is_dry_run():
        return [
            finding("nikto", "Server leaks Apache version via header", "Low", target_url, "fake dry-run data"),
            finding("nikto", "Outdated jQuery version detected", "Medium", target_url, "fake dry-run data"),
        ]

    raw = run_with_output_file(
        lambda path: ["nikto", "-h", target_url, "-Tuning", tuning, "-Format", "json",
                      "-output", path, "-timeout", "10", "-ask", "no"],
        suffix=".json", timeout=timeout)
    try:
        data = json.loads(raw)
    except ValueError as e:
        raise ToolError(f"could not parse nikto output: {e}")

    entries = data if isinstance(data, list) else [data]
    vulns = [v for e in entries for v in e.get("vulnerabilities", [])]
    return [finding("nikto", v.get("msg", "Unknown finding"), "Medium", target_url, v.get("url", "")) for v in vulns]
