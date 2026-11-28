"""Unit tests for ROE validation and ownership checks; all network access is mocked."""

import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import Mock, patch

from roe_validator.cli import main
from roe_validator.ownership import check_ownership
from roe_validator.rules import validate_roe


def sample_roe(target: str = "example.test", start: datetime | None = None,
               end: datetime | None = None) -> dict:
    now = datetime.now(timezone.utc)
    start = start or now - timedelta(days=1)
    end = end or now + timedelta(days=1)
    return {
        "targets": [target],
        "allowed_tools": ["header_checks"],
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "owner_name": "Test Owner",
        "owner_contact": "owner@example.test",
    }


def run_validate_cli(roe: dict, lab_mode: bool = False) -> dict:
    with tempfile.TemporaryDirectory() as directory:
        roe_file = Path(directory) / "roe.json"
        roe_file.write_text(json.dumps(roe), encoding="utf-8")
        arguments = ["validate", "--file", str(roe_file)]
        if lab_mode:
            arguments.append("--lab-mode")
        output = io.StringIO()
        with redirect_stdout(output):
            exit_code = main(arguments)
        if exit_code != 0:
            raise AssertionError(f"Validator CLI exited with status {exit_code}.")
        return json.loads(output.getvalue())


class ValidateRoeTests(unittest.TestCase):
    @patch("roe_validator.network.resolve_host", new=Mock(return_value=["8.8.8.8"]))
    def test_wildcard_target_is_rejected(self):
        result = validate_roe(sample_roe("*.example.test"))
        self.assertEqual(result["status"], "invalid")
        self.assertTrue(any("Wildcard" in reason for reason in result["reasons"]))

    def test_private_ip_is_rejected(self):
        result = validate_roe(sample_roe("10.1.2.3"))
        self.assertEqual(result["status"], "invalid")
        self.assertTrue(any("blocked" in reason for reason in result["reasons"]))

    @patch("roe_validator.network.resolve_host", new=Mock(return_value=["8.8.8.8"]))
    def test_expired_window_is_rejected(self):
        now = datetime.now(timezone.utc)
        result = validate_roe(sample_roe("example.test", now - timedelta(days=2), now - timedelta(days=1)))
        self.assertEqual(result["status"], "invalid")
        self.assertTrue(any("expired" in reason for reason in result["reasons"]))

    @patch("roe_validator.network.resolve_host", new=Mock(return_value=["8.8.8.8"]))
    def test_window_longer_than_30_days_is_rejected(self):
        now = datetime.now(timezone.utc)
        result = validate_roe(sample_roe("example.test", now, now + timedelta(days=31)))
        self.assertEqual(result["status"], "invalid")
        self.assertTrue(any("30 days" in reason for reason in result["reasons"]))

    def test_blocked_tld_is_rejected(self):
        result = validate_roe(sample_roe("example.gov"))
        self.assertEqual(result["status"], "invalid")
        self.assertTrue(any("blocked" in reason for reason in result["reasons"]))

    @patch("roe_validator.network.resolve_host", new=Mock(return_value=["127.0.0.1"]))
    def test_lab_mode_allows_localhost(self):
        self.assertEqual(validate_roe(sample_roe("localhost"))["status"], "invalid")
        result = validate_roe(sample_roe("localhost"), lab_mode=True)
        self.assertEqual(result["status"], "valid")
        self.assertEqual(result["targets"], ["localhost"])

    def test_cli_rejects_loopback_ip_without_lab_mode_flag(self):
        result = run_validate_cli(sample_roe("127.0.0.1"))
        self.assertEqual(result["status"], "invalid")

    def test_cli_allows_loopback_ip_with_lab_mode_flag(self):
        result = run_validate_cli(sample_roe("127.0.0.1"), lab_mode=True)
        self.assertEqual(result["status"], "valid")

    def test_cli_ignores_lab_mode_field_without_flag(self):
        roe = sample_roe("127.0.0.1")
        roe["lab_mode"] = True
        result = run_validate_cli(roe)
        self.assertEqual(result["status"], "invalid")

    @patch("roe_validator.network.resolve_host", new=Mock(return_value=["10.2.3.4"]))
    def test_private_dns_answer_is_rejected(self):
        result = validate_roe(sample_roe("private.example"))
        self.assertEqual(result["status"], "invalid")
        self.assertTrue(any("resolves to a private" in reason for reason in result["reasons"]))


class OwnershipTests(unittest.TestCase):
    @patch("roe_validator.network.resolve_host", new=Mock(return_value=["8.8.8.8"]))
    @patch("roe_validator.network.resolve_txt", new=Mock(return_value=[]))
    @patch("roe_validator.ownership._request_text", new=Mock(return_value=(404, "")))
    def test_wrong_token_is_not_verified(self):
        result = check_ownership("https://example.test", "wrong-token")
        self.assertEqual(result, {
            "verified": False,
            "method": None,
            "detail": "Ownership token was not found.",
        })

    @patch("roe_validator.network.resolve_host", new=Mock(return_value=["8.8.8.8"]))
    @patch("roe_validator.network.resolve_txt", new=Mock(return_value=["correct-token"]))
    @patch("roe_validator.ownership._request_text")
    def test_token_found_via_dns(self, request):
        result = check_ownership("https://example.test", "correct-token")
        self.assertTrue(result["verified"])
        self.assertEqual(result["method"], "dns")
        request.assert_not_called()

    @patch("roe_validator.network.resolve_host", new=Mock(return_value=["8.8.8.8"]))
    @patch("roe_validator.network.resolve_txt", new=Mock(return_value=[]))
    @patch("roe_validator.ownership._request_text", new=Mock(return_value=(200, "correct-token\n")))
    def test_token_found_in_well_known_file(self):
        result = check_ownership("https://example.test", "correct-token")
        self.assertTrue(result["verified"])
        self.assertEqual(result["method"], "file")

    @patch("roe_validator.network.resolve_host", new=Mock(return_value=["8.8.8.8"]))
    @patch("roe_validator.network.resolve_txt", new=Mock(return_value=[]))
    @patch("roe_validator.ownership._request_text")
    def test_token_found_in_homepage_meta(self, request):
        request.side_effect = [
            (404, ""),
            (200, '<html><meta name="penflow-verify" content="correct-token"></html>'),
        ]
        result = check_ownership("https://example.test", "correct-token")
        self.assertTrue(result["verified"])
        self.assertEqual(result["method"], "meta")

    @patch("roe_validator.network.resolve_host", new=Mock(return_value=["8.8.8.8"]))
    @patch("roe_validator.network.resolve_txt", new=Mock(return_value=[]))
    @patch("roe_validator.ownership._PinnedHTTPConnection")
    def test_redirect_to_another_host_is_rejected(self, connection):
        response = connection.return_value.getresponse.return_value
        response.status = 302
        response.getheader.return_value = "https://other.example/verify"
        result = check_ownership("http://example.test", "token")
        self.assertFalse(result["verified"])
        self.assertIn("another host", result["detail"])
        connection.assert_called_once()

    @patch("roe_validator.network.resolve_host", return_value=["127.0.0.1"])
    def test_ownership_check_rejects_private_dns_before_http(self, request_host):
        result = check_ownership("http://public-looking.example", "token")
        self.assertFalse(result["verified"])
        self.assertIn("private or internal", result["detail"])
        request_host.assert_called_once()


if __name__ == "__main__":
    unittest.main()
