from __future__ import annotations

import ipaddress
import socket
from dataclasses import dataclass
from typing import Any, Callable
from urllib.parse import urljoin, urlsplit


class TargetScopeError(PermissionError):
    """A URL or resolved address is outside the bound target."""


def _normalize_ip(value: str) -> str:
    if "%" in value:
        raise TargetScopeError("Scoped IPv6 addresses are not permitted.")
    try:
        return str(ipaddress.ip_address(value))
    except ValueError as error:
        raise TargetScopeError("The target policy contains an invalid IP address.") from error


def _resolve_host(host: str) -> set[str]:
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        try:
            results = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
        except socket.gaierror as error:
            raise TargetScopeError("The approved target could not be resolved.") from error
        addresses = {_normalize_ip(result[4][0]) for result in results}
    else:
        addresses = {str(literal)}
    if not addresses:
        raise TargetScopeError("The approved target resolved to no addresses.")
    return addresses


@dataclass(frozen=True)
class TargetScope:
    url: str
    scheme: str
    host: str
    port: int
    approved_ips: frozenset[str]
    current_ips: frozenset[str]
    lab_mode: bool

    @classmethod
    def from_policy(
        cls,
        target: dict[str, Any],
        resolver: Callable[[str], set[str]] = _resolve_host,
    ) -> "TargetScope":
        if not isinstance(target, dict):
            raise TargetScopeError("The scope policy has no valid target.")
        url = target.get("url")
        try:
            parsed = urlsplit(url)
            host = parsed.hostname
            port = parsed.port or (443 if parsed.scheme == "https" else 80)
        except (TypeError, ValueError) as error:
            raise TargetScopeError("The scope policy target URL is invalid.") from error
        if parsed.scheme not in {"http", "https"} or not host or parsed.username or parsed.password or parsed.fragment:
            raise TargetScopeError("The scope policy target must be an HTTP(S) URL without credentials or fragments.")
        host = host.casefold().rstrip(".")
        if target.get("host") != host or target.get("port") != port or not isinstance(target.get("lab_mode"), bool):
            raise TargetScopeError("The scope policy target host or port does not match its URL.")
        raw_ips = target.get("resolved_ips")
        if not isinstance(raw_ips, list) or not raw_ips:
            raise TargetScopeError("The scope policy has no pinned target addresses.")
        approved = {_normalize_ip(value) for value in raw_ips if isinstance(value, str)}
        if len(approved) != len(raw_ips):
            raise TargetScopeError("The scope policy contains an invalid target address.")
        current = {_normalize_ip(value) for value in resolver(host)}
        if not current or not current.issubset(approved):
            raise TargetScopeError("Target DNS changed beyond the addresses approved by the policy.")
        lab_mode = target["lab_mode"]
        if not lab_mode and any(not ipaddress.ip_address(value).is_global for value in approved | current):
            raise TargetScopeError("Private, loopback, link-local, or reserved addresses require admin lab mode.")
        try:
            literal_host = _normalize_ip(host)
        except TargetScopeError:
            literal_host = ""
        if literal_host and literal_host not in approved:
            raise TargetScopeError("The target IP is not in the policy's pinned address set.")
        return cls(
            url=url,
            scheme=parsed.scheme,
            host=host,
            port=port,
            approved_ips=frozenset(approved),
            current_ips=frozenset(current),
            lab_mode=lab_mode,
        )

    @property
    def destination_ip(self) -> str:
        return min(
            self.current_ips,
            key=lambda value: (ipaddress.ip_address(value).version, int(ipaddress.ip_address(value))),
        )

    def validate_url(self, url: str, base_url: str | None = None) -> str:
        if not isinstance(url, str) or not url.strip():
            raise TargetScopeError("Tool output contained an invalid URL.")
        candidate = urljoin(base_url or self.url, url)
        try:
            parsed = urlsplit(candidate)
            host = parsed.hostname
            port = parsed.port or (443 if parsed.scheme == "https" else 80)
        except ValueError as error:
            raise TargetScopeError("Tool output contained an invalid URL.") from error
        if parsed.scheme != self.scheme or not host or parsed.username or parsed.password or port != self.port:
            raise TargetScopeError("Tool output referenced an off-scope scheme, host, or port.")
        host = host.casefold().rstrip(".")
        if host != self.host:
            try:
                address = _normalize_ip(host)
            except TargetScopeError as error:
                raise TargetScopeError("Tool output referenced an off-scope host.") from error
            if address not in self.approved_ips:
                raise TargetScopeError("Tool output referenced an off-scope IP address.")
        return candidate

    def validate_address(self, address: str) -> str:
        normalized = _normalize_ip(address)
        if normalized not in self.approved_ips:
            raise TargetScopeError("Tool output contained an off-scope host address.")
        return normalized
