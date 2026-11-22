import sys
from agent.llm_client import ask, LLMError
from tools.tool_registry import run_tool, TOOLS, ScopeError
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

SUMMARISE_RISKS = {"medium", "high", "critical"}


def _say(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)  # progress -> stderr, so stdout stays clean JSON


def run(target_url: str) -> list[dict]:
    all_findings: list[dict] = []
    llm_ok = True

    for tool_name in TOOL_ORDER:
        if tool_name not in TOOLS:
            log_action("tool_skipped", tool_name, "not registered")
            continue
        _say(f"[*] {tool_name} ...")
        try:
            findings = run_tool(tool_name, target_url=target_url)
        except ScopeError as e:
            log_action("scope_blocked", tool_name, str(e))
            raise  # wrong target: stop the whole run
        except PermissionError as e:
            log_action("tool_skipped", tool_name, str(e))
            _say(f"    skipped: {e}")
            continue
        except ToolSkipped as e:
            log_action("tool_skipped", tool_name, str(e))
            _say(f"    skipped: {e}")
            continue
        except ToolError as e:
            log_action("tool_error", tool_name, str(e))
            _say(f"    ERROR: {e}")
            continue
        except Exception as e:  # unexpected bug in a wrapper: don't kill the other tools
            log_action("tool_crash", tool_name, repr(e))
            _say(f"    CRASH: {e!r}")
            continue

        log_action("tool_run", tool_name, findings)
        _say(f"    {len(findings)} finding(s)")

        for f in findings:
            f["summary"] = f["name"]
            if llm_ok and f["risk"].lower() in SUMMARISE_RISKS:
                prompt = [{"role": "user", "content":
                           f"Summarize this security finding in one plain-language sentence for a non-technical reader: {f}"}]
                try:
                    f["summary"] = ask(prompt)
                    log_action("ai_summary", tool_name, f["summary"])
                except LLMError as e:
                    llm_ok = False  # don't hammer a broken LLM for every finding
                    log_action("ai_summary_failed", tool_name, str(e))
                    _say(f"    LLM unavailable, using plain names as summaries: {e}")
        all_findings.extend(findings)
    return all_findings
