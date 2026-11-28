from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import os
from datetime import datetime
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID

import requests
from jsonschema import Draft202012Validator

from scope_guard.policy_schema import POLICY_SCHEMA

DEFAULT_API_URL = "http://127.0.0.1:4000/api"
HTTP_TIMEOUT = 8


class PolicyLoadError(RuntimeError):
    """The current run does not have a usable, authenticated policy."""


class PolicyClient:
    def __init__(
        self,
        api_url: str | None = None,
        service_token: str | None = None,
        session: requests.Session | None = None,
    ) -> None:
        self.api_url = (api_url or os.environ.get("PENFLOW_API_URL") or DEFAULT_API_URL).rstrip("/")
        self.service_token = service_token if service_token is not None else os.environ.get("PENFLOW_SERVICE_TOKEN", "")
        self.session = session or requests.Session()
        self._validate_configuration()

    def _validate_configuration(self) -> None:
        parsed = urlsplit(self.api_url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
            raise PolicyLoadError("PENFLOW_API_URL must be an HTTP(S) URL without credentials.")
        if parsed.query or parsed.fragment:
            raise PolicyLoadError("PENFLOW_API_URL cannot include a query or fragment.")
        if parsed.scheme != "https":
            try:
                loopback = ipaddress.ip_address(parsed.hostname).is_loopback
            except ValueError:
                loopback = parsed.hostname.casefold() == "localhost"
            if not loopback:
                raise PolicyLoadError("The engine service token may only use HTTPS outside loopback.")
        if len(self.service_token.encode("utf-8")) < 32:
            raise PolicyLoadError("PENFLOW_SERVICE_TOKEN must be configured with at least 32 bytes.")

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.service_token}",
            "x-requested-with": "fetch",
            "Accept": "application/json",
        }

    def load(self, run_id: str) -> dict[str, Any]:
        try:
            normalized_run_id = str(UUID(run_id))
        except (ValueError, TypeError, AttributeError) as error:
            raise PolicyLoadError("A valid database run UUID is required.") from error
        url = f"{self.api_url}/internal/runs/{normalized_run_id}/scope-policy"
        try:
            response = self.session.get(url, headers=self._headers(), timeout=HTTP_TIMEOUT)
            if response.status_code != 200:
                raise PolicyLoadError(f"The backend refused the run policy (HTTP {response.status_code}).")
            payload = response.json()
        except requests.RequestException as error:
            raise PolicyLoadError("The backend policy service is unavailable.") from error
        except ValueError as error:
            raise PolicyLoadError("The backend returned invalid policy JSON.") from error
        return self._validate_payload(payload, normalized_run_id)

    def _validate_payload(self, payload: Any, run_id: str) -> dict[str, Any]:
        if not isinstance(payload, dict) or payload.get("run_id") != run_id or payload.get("run_status") != "running":
            raise PolicyLoadError("The backend response is not bound to the current running job.")
        policy_id = payload.get("policy_id")
        target_id = payload.get("target_id")
        target_url = payload.get("target_url")
        if not isinstance(policy_id, str) or not isinstance(target_id, str) or not isinstance(target_url, str):
            raise PolicyLoadError("The backend response has no exact policy and target binding.")
        try:
            UUID(policy_id)
            UUID(target_id)
        except (ValueError, TypeError, AttributeError) as error:
            raise PolicyLoadError("The backend returned invalid policy or target identifiers.") from error
        policy = payload.get("policy_json")
        if not isinstance(policy, dict):
            raise PolicyLoadError("The backend returned no policy object.")
        errors = list(Draft202012Validator(
            POLICY_SCHEMA,
            format_checker=Draft202012Validator.FORMAT_CHECKER,
        ).iter_errors(policy))
        if errors:
            raise PolicyLoadError("The stored policy does not match the policy schema.")
        if any(name not in policy["tool_limits"] for name in policy["selected_tools"]):
            raise PolicyLoadError("The stored policy is missing limits for a selected tool.")
        if policy["target"]["url"] != target_url or policy["target"]["lab_mode"] is not payload.get("lab_mode"):
            raise PolicyLoadError("The stored policy target no longer matches the verified target record.")
        if not policy["selected_tools"]:
            raise PolicyLoadError("The stored policy does not permit any tools.")
        enabled_tools = payload.get("enabled_tools")
        if not isinstance(enabled_tools, list) or not all(isinstance(name, str) for name in enabled_tools):
            raise PolicyLoadError("The backend did not return current administrator tool settings.")
        if not set(policy["selected_tools"]).issubset(enabled_tools):
            raise PolicyLoadError("A policy tool has since been disabled by an administrator.")
        policy_hash = payload.get("policy_hash")
        if not isinstance(policy_hash, str) or policy_hash != policy.get("policy_hash"):
            raise PolicyLoadError("The stored policy hash is missing or inconsistent.")
        unhashed = dict(policy)
        unhashed.pop("policy_hash")
        canonical = json.dumps(unhashed, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
        expected_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        if not hmac.compare_digest(policy_hash, expected_hash):
            raise PolicyLoadError("The stored policy hash does not match its contents.")
        expires_at = payload.get("expires_at")
        if not isinstance(expires_at, str):
            raise PolicyLoadError("The stored policy expiry is invalid.")
        try:
            expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            start = datetime.fromisoformat(policy["time_window"]["start"].replace("Z", "+00:00"))
            end = datetime.fromisoformat(policy["time_window"]["end"].replace("Z", "+00:00"))
        except (TypeError, ValueError) as error:
            raise PolicyLoadError("The stored policy window is invalid.") from error
        if expiry.tzinfo is None or start.tzinfo is None or end.tzinfo is None:
            raise PolicyLoadError("The stored policy window must include timezone information.")
        now = datetime.now(expiry.tzinfo)
        if expiry <= now or start > now or end <= now or end > expiry:
            raise PolicyLoadError("The current run is outside the policy authorization window.")
        if payload.get("target_status") != "verified":
            raise PolicyLoadError("The bound target is no longer verified.")
        return payload

    def audit(
        self,
        run_id: str,
        policy_id: str | None,
        tool: str,
        args: dict[str, Any],
        decision: str,
        reason: str,
        stop_run: bool = False,
    ) -> None:
        url = f"{self.api_url}/internal/runs/{run_id}/scope-audit"
        body = {
            "policyId": policy_id,
            "tool": tool,
            "args": args,
            "decision": decision,
            "reason": reason[:500],
            "stopRun": stop_run,
        }
        try:
            response = self.session.post(url, headers=self._headers(), json=body, timeout=HTTP_TIMEOUT)
        except requests.RequestException as error:
            raise PolicyLoadError("The backend scope audit service is unavailable.") from error
        if response.status_code != 201:
            raise PolicyLoadError(f"The backend refused the scope audit record (HTTP {response.status_code}).")

    def submit_results(self, run_id: str, status: str, report: dict, report_html: str | None = None) -> None:
        url = f"{self.api_url}/internal/runs/{run_id}/results"
        body = {"status": status, "report": report, "reportHtml": report_html}
        try:
            response = self.session.post(url, headers=self._headers(), json=body, timeout=30)
        except requests.RequestException as error:
            raise PolicyLoadError("The backend results service is unavailable.") from error
        if response.status_code != 201:
            raise PolicyLoadError(f"The backend refused the run results (HTTP {response.status_code}).")
