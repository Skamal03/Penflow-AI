import json
from tools.tool_registry import register
from tools.shell import run_with_output_file, finding, is_dry_run, ToolError


@register("whatweb", phase="reconnaissance", binary="whatweb",
          description="Fingerprint web technologies, frameworks and server software")
def run(target_url: str, timeout: int = 120) -> list[dict]:
    if is_dry_run():
        return [finding("whatweb", "Technology detected: Express", "Informational", target_url, "fake dry-run data")]

    # Write JSON to a temp file (more reliable than /dev/stdout through WSL), then read it back.
    raw = run_with_output_file(
        lambda path: ["whatweb", "--color=never", "--no-errors", "-a", "1", f"--log-json={path}", target_url],
        suffix=".json", timeout=timeout)

    objs = []
    try:
        data = json.loads(raw)
        objs = data if isinstance(data, list) else [data]
    except ValueError:
        for line in raw.splitlines():  # fallback: one JSON object per line
            line = line.strip().lstrip("[").rstrip(",]").strip()
            if line.startswith("{"):
                try:
                    objs.append(json.loads(line))
                except ValueError:
                    pass
    if not objs:
        raise ToolError(f"whatweb output could not be parsed: {raw[:200]}")

    NOISE = {"Country", "IP", "HTML5", "Script", "Title", "HTTPServer", "PasswordField", "Email"}
    findings = []
    for obj in objs:
        for plugin, d in obj.get("plugins", {}).items():
            if plugin in NOISE:
                continue
            versions = d.get("version") or []
            ver = f" {', '.join(map(str, versions))}" if versions else ""
            extra = ", ".join(map(str, d.get("string") or []))[:200]
            findings.append(finding("whatweb", f"Technology detected: {plugin}{ver}", "Informational",
                                    obj.get("target", target_url), extra))
    return findings[:20]
