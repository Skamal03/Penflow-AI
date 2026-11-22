import json
from tools.tool_registry import register
from tools.shell import run_cmd, finding, is_dry_run, ToolError


@register("whatweb", phase="reconnaissance", binary="whatweb",
          description="Fingerprint web technologies, frameworks and server software")
def run(target_url: str, timeout: int = 120) -> list[dict]:
    if is_dry_run():
        return [finding("whatweb", "Technology detected: Express", "Informational", target_url, "fake dry-run data")]

    proc = run_cmd(["whatweb", "-q", "--color=never", "--no-errors", "-a", "1",
                    "--log-json=/dev/stdout", target_url], timeout=timeout)
    findings = []
    parsed_any = False
    for line in (proc.stdout or "").splitlines():
        line = line.strip().rstrip(",")
        if not line.startswith("{"):
            continue
        try:
            obj = json.loads(line)
        except ValueError:
            continue
        parsed_any = True
        for plugin, data in obj.get("plugins", {}).items():
            versions = data.get("version") or []
            ver = f" {', '.join(map(str, versions))}" if versions else ""
            findings.append(finding("whatweb", f"Technology detected: {plugin}{ver}", "Informational",
                                    obj.get("target", target_url)))
    if not parsed_any:
        raise ToolError(f"whatweb produced no readable output: {(proc.stderr or '')[-200:]}")
    return findings[:20]
