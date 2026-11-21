from agent.llm_client import ask
from tools.tool_registry import run_tool
from logging_system.action_logger import log_action
from tools.custom_scripts import header_checks  # noqa: F401 (registers the tool)
from tools.big_tools import zap_wrapper, nikto_wrapper, sqlmap_wrapper  # noqa: F401

TOOL_ORDER = ["header_checks", "zap", "nikto", "sqlmap"]

def run(target_url: str) -> list[dict]:
    all_findings = []
    for tool_name in TOOL_ORDER:
        findings = run_tool(tool_name, target_url=target_url)
        log_action("tool_run", tool_name, findings)
        for finding in findings:
            prompt = [{"role": "user", "content": f"Summarize this security finding in one plain-language sentence for a non-technical reader: {finding}"}]
            finding["summary"] = ask(prompt)
            log_action("ai_summary", tool_name, finding["summary"])
        all_findings.extend(findings)
    return all_findings