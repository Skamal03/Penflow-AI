from __future__ import annotations

import ipaddress
import time
from typing import Any, Callable

from scope_guard.policy_client import PolicyClient, PolicyLoadError
from scope_guard.target_check import TargetScope, TargetScopeError
from tools.tool_registry import TOOLS, ScopeError, check_scope, run_tool

HARD_LIMITS = {
    "nmap": {"max_rate": 20, "max_duration": 300, "max_requests": 1000},
    "zap": {"max_rate": 10, "max_duration": 900, "max_requests": 1},
}
ALLOWED_FLAGS = {"nmap": {"-sV", "-Pn"}, "zap": set()}


class ScopeGuardError(ScopeError):
    """A tool call was rejected by the active run policy."""


class ToolBlocked(PermissionError):
    """A tool was denied without requiring the whole run to stop."""


class ScopeGuard:
    def __init__(
        self,
        run_id: str,
        client: PolicyClient | None = None,
        resolver: Callable[[str], set[str]] | None = None,
        tool_runner: Callable[..., list[dict[str, Any]]] = run_tool,
        clock: Callable[[], float] = time.monotonic,
        sleeper: Callable[[float], None] = time.sleep,
    ) -> None:
        self.run_id = run_id
        self.client = client or PolicyClient()
        self.resolver = resolver
        self.tool_runner = tool_runner
        self.clock = clock
        self.sleeper = sleeper
        self._last_run: dict[str, float] = {}
        self._request_counts: dict[str, int] = {}

    def _audit_block(
        self,
        policy_id: str | None,
        tool: str,
        args: dict[str, Any],
        reason: str,
        stop_run: bool,
    ) -> None:
        self.client.audit(self.run_id, policy_id, tool, args, "blocked", reason, stop_run)
        if stop_run:
            raise ScopeGuardError(reason)
        raise ToolBlocked(reason)

    def _target_scope(self, policy: dict[str, Any]) -> TargetScope:
        target_scope = TargetScope.from_policy(
            policy["target"],
            self.resolver if self.resolver is not None else _default_resolver,
        )
        parsed_ips = [ipaddress.ip_address(address) for address in target_scope.approved_ips]
        if any(address.is_global or address.is_unspecified or address.is_multicast for address in parsed_ips):
            raise TargetScopeError("The engine is restricted to local lab targets.")
        return target_scope

    def load_policy(self) -> dict[str, Any]:
        try:
            return self.client.load(self.run_id)
        except PolicyLoadError as error:
            self._audit_block(None, "engine", {}, str(error), True)
            raise

    def authorize_run(self, target_url: str) -> dict[str, Any]:
        payload = self.load_policy()
        policy_id = payload["policy_id"]
        if target_url != payload["target_url"]:
            self._audit_block(policy_id, "engine", {}, "The requested target does not match the run-bound target.", True)
        try:
            self._target_scope(payload["policy_json"])
            check_scope(payload["target_url"])
        except TargetScopeError as error:
            self._audit_block(policy_id, "engine", {}, str(error), True)
        except ScopeError as error:
            self._audit_block(policy_id, "engine", {}, str(error), True)
        return payload

    def run(self, tool: str, args: dict[str, Any]) -> list[dict[str, Any]]:
        try:
            payload = self.client.load(self.run_id)
        except PolicyLoadError as error:
            self._audit_block(None, tool, {}, str(error), True)
            raise

        policy_id = payload["policy_id"]
        policy = payload["policy_json"]
        supplied_target = args.get("target_url") if isinstance(args, dict) else None
        if supplied_target != payload["target_url"]:
            self._audit_block(policy_id, tool, {}, "The requested target does not match the run-bound target.", True)
        if tool not in policy["selected_tools"]:
            self._audit_block(policy_id, tool, {}, "The tool is not selected by this run's active scope policy.", False)
        if tool not in HARD_LIMITS or tool not in payload["enabled_tools"]:
            self._audit_block(policy_id, tool, {}, "The tool is not supported or currently enabled by an administrator.", False)
        definition = TOOLS.get(tool)
        if definition is None or not definition.enabled:
            self._audit_block(policy_id, tool, {}, "The tool is unavailable or disabled in this engine environment.", False)

        try:
            target_scope = self._target_scope(policy)
            check_scope(target_scope.url)
        except TargetScopeError as error:
            self._audit_block(policy_id, tool, {}, str(error), True)
            raise
        except ScopeError as error:
            self._audit_block(policy_id, tool, {}, str(error), True)
            raise
        limits = policy["tool_limits"][tool]
        hard_limits = HARD_LIMITS[tool]
        max_rate = min(limits["max_rate"], hard_limits["max_rate"])
        max_duration = min(limits["max_duration"], hard_limits["max_duration"])
        max_requests = min(limits["max_requests"], hard_limits["max_requests"])
        count = self._request_counts.get(tool, 0)
        if count >= max_requests:
            self._audit_block(policy_id, tool, {}, "The policy request limit for this tool has been reached.", False)
        if tool == "zap" and target_scope.host != "localhost":
            try:
                ipaddress.ip_address(target_scope.host)
            except ValueError:
                self._audit_block(policy_id, tool, {}, "ZAP requires a pinned IP or localhost target.", True)

        previous = self._last_run.get(tool)
        if previous is not None:
            wait = (1 / max_rate) - (self.clock() - previous)
            if wait > 0:
                self.sleeper(wait)

        if tool == "nmap":
            effective_flags = [flag for flag in limits["allowed_flags"] if flag in ALLOWED_FLAGS[tool]]
            safe_args: dict[str, Any] = {
                "target_url": target_scope.url,
                "target_scope": target_scope,
                "allowed_flags": effective_flags,
                "max_rate": max_rate,
                "timeout": max_duration,
            }
        else:
            safe_args = {
                "target_url": target_scope.url,
                "target_scope": target_scope,
                "active_scan": False,
                "max_wait": max_duration,
                "max_requests": 1,
            }

        audit_args = {key: value for key, value in safe_args.items() if key != "target_scope"}
        audit_args["target_ip"] = target_scope.destination_ip
        audit_args["target_port"] = target_scope.port
        self.client.audit(self.run_id, policy_id, tool, audit_args, "allowed", "Tool and arguments passed scope policy checks.")
        self._last_run[tool] = self.clock()
        self._request_counts[tool] = count + 1
        try:
            findings = self.tool_runner(tool, **safe_args)
            if not isinstance(findings, list):
                raise TargetScopeError("The tool returned an invalid findings result.")
            for finding in findings:
                if not isinstance(finding, dict) or not isinstance(finding.get("url"), str):
                    raise TargetScopeError("The tool returned a finding without a valid URL.")
                target_scope.validate_url(finding["url"])
            return findings
        except TargetScopeError as error:
            self._audit_block(policy_id, tool, audit_args, str(error), True)
        except ScopeError as error:
            self._audit_block(policy_id, tool, audit_args, str(error), True)
        except Exception as error:
            self.client.audit(
                self.run_id,
                policy_id,
                tool,
                audit_args,
                "blocked",
                f"Tool execution failed: {error}"[:500],
                False,
            )
            raise


def _default_resolver(host: str) -> set[str]:
    from scope_guard.target_check import _resolve_host

    return _resolve_host(host)
