import json
import os
from tools.tool_registry import register
from tools.shell import run_cmd, finding, origin_of, is_dry_run, ToolError

WORDLIST = os.getenv("PENFLOW_WORDLIST", "/usr/share/wordlists/dirb/common.txt")
SENSITIVE = ("admin", "backup", ".git", ".env", "ftp", "config", "dump", "phpinfo", "debug", "private", "secret")


@register("ffuf", phase="enumeration", binary="ffuf", active=True,
          description="Directory and file discovery with a wordlist (auto-calibrated for single-page apps)")
def run(target_url: str, timeout: int = 300) -> list[dict]:
    if is_dry_run():
        return [finding("ffuf", "Potentially sensitive path exposed: /ftp (HTTP 200)", "Medium", target_url + "/ftp", "fake dry-run data")]

    base = origin_of(target_url)
    if run_cmd(["test", "-f", WORDLIST], timeout=15).returncode != 0:
        raise ToolError(f"wordlist not found: {WORDLIST} (install 'dirb' / 'wordlists' or set PENFLOW_WORDLIST)")

    proc = run_cmd(["ffuf", "-u", f"{base}/FUZZ", "-w", WORDLIST, "-ac", "-t", "20", "-rate", "50",
                    "-timeout", "10", "-mc", "200,204,301,302,307,401,403", "-json", "-s"], timeout=timeout)
    results = []
    for line in (proc.stdout or "").splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            results.append(json.loads(line))
        except ValueError:
            continue
    if proc.returncode not in (0, None) and not results:
        raise ToolError(f"ffuf failed: {(proc.stderr or '')[-200:]}")

    findings = []
    for r in results[:40]:
        url, status = r.get("url", base), r.get("status")
        sensitive = any(k in url.lower() for k in SENSITIVE)
        name = ("Potentially sensitive path exposed" if sensitive else "Path discovered") + f": {url.replace(base, '') or '/'} (HTTP {status})"
        findings.append(finding("ffuf", name, "Medium" if sensitive else "Informational", url))
    return findings
