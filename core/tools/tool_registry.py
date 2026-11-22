import os
from dataclasses import dataclass
from typing import Callable, Optional
from urllib.parse import urlparse

from tools.shell import ToolError, tool_available, is_dry_run


class ScopeError(PermissionError):
    """Target is outside the allowed scope."""


def _csv(var: str) -> set[str]:
    return {x.strip().lower() for x in os.getenv(var, "").split(",") if x.strip()}


_AVAIL_CACHE: dict[str, bool] = {}


@dataclass
class ToolDefinition:
    name: str
    func: Callable
    phase: str                    # reconnaissance | enumeration | vulnerability_assessment | validation
    description: str
    binary: Optional[str] = None  # executable that must exist (None = no binary needed)
    active: bool = False          # True = sends attack-like traffic
    default_enabled: bool = True  # False = must be switched on explicitly

    @property
    def enabled(self) -> bool:
        if self.name in _csv("PENFLOW_DISABLED_TOOLS"):
            return False
        if not self.default_enabled:
            return self.name in _csv("PENFLOW_ENABLED_TOOLS")
        return True

    @property
    def available(self) -> bool:
        if self.binary is None or is_dry_run():
            return True
        if self.binary not in _AVAIL_CACHE:
            _AVAIL_CACHE[self.binary] = tool_available(self.binary)
        return _AVAIL_CACHE[self.binary]


TOOLS: dict[str, ToolDefinition] = {}


def register(name: str, phase: str, description: str = "", binary: Optional[str] = None,
             active: bool = False, default_enabled: bool = True):
    def decorator(func):
        TOOLS[name] = ToolDefinition(name, func, phase, description, binary, active, default_enabled)
        return func
    return decorator


def check_scope(target_url: str) -> None:
    """Temporary guard until the ROE-based scope object exists.
    Only hosts in PENFLOW_ALLOWED_HOSTS (default: localhost lab) may be tested."""
    allowed = _csv("PENFLOW_ALLOWED_HOSTS") or {"127.0.0.1", "localhost"}
    p = urlparse(target_url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise ScopeError(f"Invalid target URL: {target_url}")
    if p.hostname.lower() not in allowed:
        raise ScopeError(f"Target host '{p.hostname}' is not in the allowed scope {sorted(allowed)}")


def run_tool(name: str, **kwargs):
    tool = TOOLS.get(name)
    if tool is None:
        raise ValueError(f"Tool '{name}' is not registered. Available: {list(TOOLS)}")
    if not tool.enabled:
        raise PermissionError(f"Tool '{name}' is disabled (enable it with PENFLOW_ENABLED_TOOLS={name})")
    if "target_url" in kwargs:
        check_scope(kwargs["target_url"])
    if not tool.available:
        raise ToolError(f"'{tool.binary}' is not installed (run scripts/setup_kali_tools.sh)")
    return tool.func(**kwargs)


def list_tools(phase: Optional[str] = None) -> list[dict]:
    return [
        {"name": t.name, "phase": t.phase, "binary": t.binary, "active": t.active,
         "enabled": t.enabled, "available": t.available, "description": t.description}
        for t in TOOLS.values() if phase is None or t.phase == phase
    ]
