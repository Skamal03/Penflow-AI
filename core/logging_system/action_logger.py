import os
import json
from datetime import datetime, timezone

_RUN_ID = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
_LOG_DIR = os.path.join(os.path.dirname(__file__), "logs")
_LOG_FILE = os.path.join(_LOG_DIR, f"run_{_RUN_ID}.log")

def log_action(step: str, tool: str, result) -> None:
    os.makedirs(_LOG_DIR, exist_ok=True)
    timestamp = datetime.now(timezone.utc).isoformat()
    line = f"[{timestamp}] step={step} tool={tool} result={json.dumps(result, default=str)[:300]}\n"
    with open(_LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line)