"""Deprecated shim. The report module lives in core/reporting/.

Kept only so existing callers of save_report() keep working: same signature,
same (markdown_path, json_path) return value.
"""
import os

from reporting import generate_report

_TRUTHY = {"1", "true", "yes", "on"}


def save_report(target: str, findings: list[dict], status: dict, started, finished) -> tuple[str, str]:
    use_ai = os.getenv("PENFLOW_NO_AI", "").lower() not in _TRUTHY
    paths = generate_report(target, findings, status, started, finished, use_ai=use_ai)
    return paths["md"], paths["json"]
