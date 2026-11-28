import hashlib
import json
import unittest
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from scope_guard.policy_client import PolicyClient, PolicyLoadError


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code

    def json(self):
        return self.payload


class FakeSession:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code
        self.get_calls = []
        self.post_calls = []

    def get(self, url, **kwargs):
        self.get_calls.append((url, kwargs))
        return FakeResponse(self.payload, self.status_code)

    def post(self, url, **kwargs):
        self.post_calls.append((url, kwargs))
        return FakeResponse({"recorded": True})


def valid_payload():
    now = datetime.now(timezone.utc)
    policy = {
        "selected_tools": ["nmap"],
        "tool_limits": {
            "nmap": {
                "allowed_flags": ["-sV", "-Pn"],
                "max_rate": 10,
                "max_duration": 60,
                "max_requests": 5,
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
            "url": "http://127.0.0.1:3000",
            "host": "127.0.0.1",
            "port": 3000,
            "resolved_ips": ["127.0.0.1"],
            "lab_mode": True,
        },
    }
    policy["policy_hash"] = hashlib.sha256(
        json.dumps(policy, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    ).hexdigest()
    run_id = str(uuid4())
    return {
        "run_id": run_id,
        "run_status": "running",
        "policy_id": str(uuid4()),
        "target_id": str(uuid4()),
        "target_url": policy["target"]["url"],
        "target_status": "verified",
        "lab_mode": True,
        "policy_json": policy,
        "policy_hash": policy["policy_hash"],
        "expires_at": policy["time_window"]["end"],
        "enabled_tools": ["nmap"],
    }


class PolicyClientTests(unittest.TestCase):
    def setUp(self):
        self.payload = valid_payload()
        self.session = FakeSession(self.payload)
        self.client = PolicyClient(
            "http://127.0.0.1:4000/api",
            "s" * 40,
            self.session,
        )

    def test_load_fetches_exact_run_and_validates_binding(self):
        loaded = self.client.load(self.payload["run_id"])
        self.assertEqual(loaded, self.payload)
        self.assertIn(self.payload["run_id"], self.session.get_calls[0][0])

    def test_rejects_hash_tampering_and_cross_run_response(self):
        self.payload["policy_json"]["notes"] = ["tampered"]
        with self.assertRaisesRegex(PolicyLoadError, "hash"):
            self.client.load(self.payload["run_id"])

        self.setUp()
        with self.assertRaisesRegex(PolicyLoadError, "bound"):
            self.client._validate_payload(self.payload, str(uuid4()))

    def test_rejects_admin_disabled_tool(self):
        self.payload["enabled_tools"] = []
        with self.assertRaisesRegex(PolicyLoadError, "disabled"):
            self.client.load(self.payload["run_id"])

    def test_requires_limits_for_every_selected_tool(self):
        policy = self.payload["policy_json"]
        del policy["tool_limits"]["nmap"]
        unhashed = dict(policy)
        unhashed.pop("policy_hash")
        policy["policy_hash"] = hashlib.sha256(
            json.dumps(unhashed, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
        ).hexdigest()
        self.payload["policy_hash"] = policy["policy_hash"]
        with self.assertRaisesRegex(PolicyLoadError, "missing limits"):
            self.client.load(self.payload["run_id"])

    def test_expired_or_revoked_policy_is_rejected(self):
        policy = self.payload["policy_json"]
        expired = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
        policy["time_window"]["end"] = expired
        policy["policy_hash"] = hashlib.sha256(
            json.dumps(
                {key: value for key, value in policy.items() if key != "policy_hash"},
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=True,
            ).encode("utf-8")
        ).hexdigest()
        self.payload["policy_hash"] = policy["policy_hash"]
        self.payload["expires_at"] = expired
        with self.assertRaisesRegex(PolicyLoadError, "outside"):
            self.client.load(self.payload["run_id"])

        self.session.status_code = 409
        with self.assertRaisesRegex(PolicyLoadError, "HTTP 409"):
            self.client.load(self.payload["run_id"])


if __name__ == "__main__":
    unittest.main()
