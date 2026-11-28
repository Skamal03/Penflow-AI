import unittest

from scope_guard.target_check import TargetScope, TargetScopeError


class TargetCheckTests(unittest.TestCase):
    def setUp(self):
        self.target = {
            "url": "http://127.0.0.1:3000",
            "host": "127.0.0.1",
            "port": 3000,
            "resolved_ips": ["127.0.0.1"],
            "lab_mode": True,
        }

    def test_pins_target_to_verified_address_and_port(self):
        scope = TargetScope.from_policy(self.target, lambda _host: {"127.0.0.1"})
        self.assertEqual(scope.destination_ip, "127.0.0.1")
        self.assertEqual(scope.validate_url("/products"), "http://127.0.0.1:3000/products")

    def test_blocks_dns_rebinding(self):
        with self.assertRaisesRegex(TargetScopeError, "DNS changed"):
            TargetScope.from_policy(self.target, lambda _host: {"203.0.113.8"})

    def test_blocks_off_scope_redirect_host_and_port(self):
        scope = TargetScope.from_policy(self.target, lambda _host: {"127.0.0.1"})
        with self.assertRaises(TargetScopeError):
            scope.validate_url("http://example.test:3000/")
        with self.assertRaises(TargetScopeError):
            scope.validate_url("http://127.0.0.1:3001/")

    def test_private_target_requires_lab_mode(self):
        self.target["lab_mode"] = False
        with self.assertRaisesRegex(TargetScopeError, "require admin lab mode"):
            TargetScope.from_policy(self.target, lambda _host: {"127.0.0.1"})


if __name__ == "__main__":
    unittest.main()
