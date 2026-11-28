import unittest
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from scope_guard.policy_client import PolicyLoadError
from scope_guard.tool_wrapper import ScopeGuard, ScopeGuardError, ToolBlocked
from tools.big_tools import nmap_wrapper, zap_wrapper


def build_payload():
    now = datetime.now(timezone.utc)
    policy_id = str(uuid4())
    target_url = "http://127.0.0.1:3000"
    return {
        "run_id": str(uuid4()),
        "run_status": "running",
        "policy_id": policy_id,
        "target_id": str(uuid4()),
        "target_url": target_url,
        "target_status": "verified",
        "lab_mode": True,
        "enabled_tools": ["nmap"],
        "expires_at": (now + timedelta(minutes=10)).isoformat(),
        "policy_json": {
            "selected_tools": ["nmap"],
            "tool_limits": {
                "nmap": {
                    "allowed_flags": ["-sV", "-Pn", "--script"],
                    "max_rate": 100,
                    "max_duration": 500,
                    "max_requests": 1000,
                },
            },
            "blocked_actions": ["shell_execution"],
            "time_window": {
                "start": (now - timedelta(minutes=1)).isoformat(),
                "end": (now + timedelta(minutes=10)).isoformat(),
            },
            "max_intrusion_level": "low",
            "notes": [],
            "target": {
                "url": target_url,
                "host": "127.0.0.1",
                "port": 3000,
                "resolved_ips": ["127.0.0.1"],
                "lab_mode": True,
            },
        },
    }


class FakeClient:
    def __init__(self, payload=None):
        self.payload = payload or build_payload()
        self.audits = []

    def load(self, _run_id):
        if isinstance(self.payload, Exception):
            raise self.payload
        return self.payload

    def audit(self, *args):
        self.audits.append(args)


class ScopeGuardTests(unittest.TestCase):
    def setUp(self):
        self.client = FakeClient()
        self.invocations = []

        def run_tool(name, **kwargs):
            self.invocations.append((name, kwargs))
            return [{
                "tool": name,
                "name": "sample finding",
                "risk": "Low",
                "url": kwargs["target_url"],
                "evidence": "",
            }]

        self.guard = ScopeGuard(
            self.client.payload["run_id"],
            client=self.client,
            resolver=lambda _host: {"127.0.0.1"},
            tool_runner=run_tool,
            clock=lambda: 1.0,
            sleeper=lambda _delay: None,
        )

    def test_rebuilds_nmap_arguments_from_policy_not_caller_strings(self):
        self.guard.run("nmap", {
            "target_url": self.client.payload["target_url"],
            "flags": ["--script", "unsafe"],
            "target_ip": "203.0.113.1",
        })
        name, kwargs = self.invocations[0]
        self.assertEqual(name, "nmap")
        self.assertEqual(kwargs["target_scope"].destination_ip, "127.0.0.1")
        self.assertEqual(kwargs["target_scope"].port, 3000)
        self.assertEqual(kwargs["allowed_flags"], ["-sV", "-Pn"])
        self.assertNotIn("flags", kwargs)
        self.assertEqual(self.client.audits[0][4], "allowed")

    def test_unselected_tool_is_blocked_and_audited(self):
        with self.assertRaises(ToolBlocked):
            self.guard.run("zap", {"target_url": self.client.payload["target_url"]})
        self.assertEqual(self.invocations, [])
        self.assertEqual(self.client.audits[-1][4], "blocked")

    def test_off_scope_tool_output_stops_run(self):
        self.guard.tool_runner = lambda _name, **_kwargs: [{
            "url": "http://outside.example:3000/",
        }]
        with self.assertRaisesRegex(ScopeGuardError, "off-scope"):
            self.guard.run("nmap", {"target_url": self.client.payload["target_url"]})
        self.assertEqual(self.client.audits[-1][4], "blocked")
        self.assertTrue(self.client.audits[-1][-1])

    def test_missing_policy_stops_before_execution(self):
        self.client.payload = PolicyLoadError("policy expired")
        with self.assertRaises(ScopeGuardError):
            self.guard.run("nmap", {"target_url": "http://127.0.0.1:3000"})
        self.assertEqual(self.invocations, [])
        self.assertTrue(self.client.audits[-1][-1])

    def test_run_target_must_match_policy_target(self):
        with self.assertRaisesRegex(ScopeGuardError, "does not match"):
            self.guard.run("nmap", {"target_url": "http://127.0.0.1:3001"})
        self.assertEqual(self.invocations, [])
        self.assertEqual(self.client.audits[-1][4], "blocked")
        self.assertTrue(self.client.audits[-1][-1])

    def test_zap_is_always_passive_and_single_request(self):
        policy = self.client.payload["policy_json"]
        policy["selected_tools"] = ["zap"]
        policy["tool_limits"]["zap"] = {
            "allowed_flags": ["active_scan"],
            "max_rate": 10,
            "max_duration": 60,
            "max_requests": 100,
        }
        self.client.payload["enabled_tools"] = ["zap"]
        self.guard.run("zap", {"target_url": self.client.payload["target_url"], "active_scan": True})
        name, kwargs = self.invocations[0]
        self.assertEqual(name, "zap")
        self.assertEqual(kwargs["target_scope"].url, self.client.payload["target_url"])
        self.assertFalse(kwargs["active_scan"])
        self.assertEqual(kwargs["max_requests"], 1)

    def test_public_addresses_are_blocked_even_in_lab_mode(self):
        payload = self.client.payload
        payload["target_url"] = "http://8.8.8.8:3000"
        payload["policy_json"]["target"] = {
            "url": payload["target_url"],
            "host": "8.8.8.8",
            "port": 3000,
            "resolved_ips": ["8.8.8.8"],
            "lab_mode": True,
        }
        self.guard.resolver = lambda _host: {"8.8.8.8"}
        with self.assertRaisesRegex(ScopeGuardError, "local lab"):
            self.guard.authorize_run(payload["target_url"])
        self.assertEqual(self.client.audits[-1][4], "blocked")
        self.assertTrue(self.client.audits[-1][-1])


if __name__ == "__main__":
    unittest.main()
