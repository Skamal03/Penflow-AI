import sys
from tools.tool_registry import run_tool, check_scope, TOOLS, ScopeError
from tools.shell import ToolError, ToolSkipped
from logging_system.action_logger import log_action
from tools.custom_scripts import header_checks  # noqa: F401 (registers the tool)
from tools.big_tools import (  # noqa: F401 (each import registers its tool)
    nmap_wrapper, whatweb_wrapper, wafw00f_wrapper, ffuf_wrapper,
    nuclei_wrapper, zap_wrapper, nikto_wrapper, sqlmap_wrapper,
)

# Recon -> enumeration -> vulnerability assessment -> validation.
# Tools that are missing, disabled or not installed are skipped, not fatal.
TOOL_ORDER = [
    "whatweb", "wafw00f", "nmap",            # reconnaissance
    "ffuf",                                  # enumeration
    "header_checks", "nuclei", "zap", "nikto",  # vulnerability assessment
    "sqlmap",                                # validation (disabled by default)
]

# What happened to each tool in the last run: used by the report.
# {tool: {"status": "ok|skipped|not installed|error|crash", "count": n, "detail": "..."}}
RUN_STATUS: dict[str, dict] = {}


def _say(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)  # progress -> stderr, so stdout stays clean JSON


def _set(tool: str, status: str, count: int = 0, detail: str = "") -> None:
    RUN_STATUS[tool] = {"status": status, "count": count, "detail": detail}


def run(target_url: str, only: list[str] | None = None) -> list[dict]:
    """only: optional list of tool names to run (handy for testing one tool at a time)."""
    check_scope(target_url)  # wrong target -> ScopeError before anything runs
    RUN_STATUS.clear()
    all_findings: list[dict] = []

    for tool_name in [t for t in TOOL_ORDER if only is None or t in only]:
        if tool_name not in TOOLS:
            _set(tool_name, "skipped", detail="not registered")
            continue
        tool = TOOLS[tool_name]
        if tool.enabled and not tool.available:
            _set(tool_name, "not installed", detail=f"'{tool.binary}' not found (run scripts/setup_kali_tools.sh)")
            log_action("tool_skipped", tool_name, "not installed")
            _say(f"[-] {tool_name}: not installed")
            continue

        _say(f"[*] {tool_name} ...")
        try:
            findings = run_tool(tool_name, target_url=target_url)
        except ScopeError as e:
            log_action("scope_blocked", tool_name, str(e))
            raise
        except (PermissionError, ToolSkipped) as e:
            _set(tool_name, "skipped", detail=str(e))
            log_action("tool_skipped", tool_name, str(e))
            _say(f"    skipped: {e}")
            continue
        except ToolError as e:
            _set(tool_name, "error", detail=str(e))
            log_action("tool_error", tool_name, str(e))
            _say(f"    ERROR: {e}")
            continue
        except Exception as e:  # unexpected bug in a wrapper: don't kill the other tools
            _set(tool_name, "crash", detail=repr(e))
            log_action("tool_crash", tool_name, repr(e))
            _say(f"    CRASH: {e!r}")
            continue

        _set(tool_name, "ok", count=len(findings), detail="" if findings else "ran fine, nothing found")
        log_action("tool_run", tool_name, findings)
        _say(f"    {len(findings)} finding(s)")

        for f in findings:
            # Plain names only: the reporting module owns all AI-written text,
            # so a scan never spends tokens per finding.
            f["summary"] = f["name"]
        all_findings.extend(findings)
    return all_findings
