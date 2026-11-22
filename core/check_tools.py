"""Run from core/:  python check_tools.py [--llm]
Shows which tools are installed in your WSL Kali, whether ZAP is reachable,
and (with --llm) whether the AI model answers."""
import sys
import requests
from agent import react_loop  # noqa: F401 (registers every tool)
from tools.tool_registry import list_tools
from tools.shell import on_linux, WSL_DISTRO
from tools.big_tools.zap_wrapper import ZAP_API, ZAP_KEY

print(f"Mode: {'Linux/WSL (direct)' if on_linux() else f'Windows -> wsl -d {WSL_DISTRO}'}\n")
print(f"{'TOOL':<14}{'PHASE':<26}{'BINARY':<10}{'INSTALLED':<11}ENABLED")
for t in list_tools():
    installed = "n/a" if t["binary"] is None else ("yes" if t["available"] else "NO")
    print(f"{t['name']:<14}{t['phase']:<26}{(t['binary'] or '-'):<10}{installed:<11}{'yes' if t['enabled'] else 'no'}")

try:
    params = {"apikey": ZAP_KEY} if ZAP_KEY else {}
    v = requests.get(f"{ZAP_API}/JSON/core/view/version/", params=params, timeout=5).json()
    print(f"\nZAP API: reachable (version {v.get('version')})")
except Exception as e:
    print(f"\nZAP API: NOT reachable at {ZAP_API} -> run scripts/start_zap.sh ({e.__class__.__name__})")

if "--llm" in sys.argv:
    from agent.llm_client import ask, LLMError, MODEL
    try:
        print(f"LLM ({MODEL}): OK -> {ask([{'role': 'user', 'content': 'Reply with the single word OK'}]).strip()[:40]}")
    except LLMError as e:
        print(f"LLM ({MODEL}): FAILED -> {e}")
