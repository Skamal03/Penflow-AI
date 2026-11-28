"""Low-impact DNS and HTTP ownership challenge checks."""

import http.client
import ipaddress
import socket
import ssl
import subprocess
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

from . import network

HTTP_TIMEOUT_SECONDS = 5
MAX_RESPONSE_BYTES = 64 * 1024
_USER_AGENT = "PenflowAI-ROE-Validator/1.0"


class _PinnedHTTPConnection(http.client.HTTPConnection):
    def __init__(self, host: str, address: str, port: int, timeout: int):
        super().__init__(host=host, port=port, timeout=timeout)
        self._address = address

    def connect(self) -> None:
        self.sock = socket.create_connection((self._address, self.port), self.timeout)


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host: str, address: str, port: int, timeout: int):
        self._address = address
        self._tls_context = ssl.create_default_context()
        super().__init__(host=host, port=port, timeout=timeout, context=self._tls_context)

    def connect(self) -> None:
        sock = socket.create_connection((self._address, self.port), self.timeout)
        self.sock = self._tls_context.wrap_socket(sock, server_hostname=self.host)


class _RedirectRejected(Exception):
    pass


class _VerificationMetaParser(HTMLParser):
    def __init__(self, token: str):
        super().__init__(convert_charrefs=True)
        self._token = token
        self.verified = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "meta":
            return
        values = {key.lower(): value for key, value in attrs}
        name = values.get("name")
        if isinstance(name, str) and name.lower() == "penflow-verify" and values.get("content") == self._token:
            self.verified = True


def make_token() -> str:
    """Create a URL-safe token with 32 bytes of cryptographic randomness."""
    import secrets

    return secrets.token_urlsafe(32)


def _target_parts(target: str) -> tuple[str, str, int, str]:
    raw = target.strip()
    if "://" not in raw:
        raw = f"https://{raw}"
    parsed = urlsplit(raw)
    scheme = parsed.scheme.lower()
    if scheme not in {"http", "https"}:
        raise ValueError("Target must use HTTP or HTTPS.")
    host = network.target_host(raw)
    port = parsed.port or (443 if scheme == "https" else 80)
    host_header = f"[{host}]" if ":" in host else host
    if port != (443 if scheme == "https" else 80):
        host_header = f"{host_header}:{port}"
    origin = f"{scheme}://{host_header}"
    return scheme, host, port, origin


def _request_text(host: str, address: str, port: int, scheme: str,
                  origin: str, path: str) -> tuple[int, str]:
    connection_type = _PinnedHTTPSConnection if scheme == "https" else _PinnedHTTPConnection
    connection = connection_type(host, address, port, HTTP_TIMEOUT_SECONDS)
    try:
        parsed_origin = urlsplit(origin)
        host_header = parsed_origin.netloc
        connection.putrequest("GET", path, skip_host=True)
        connection.putheader("Host", host_header)
        connection.putheader("User-Agent", _USER_AGENT)
        connection.putheader("Accept", "text/plain, text/html")
        connection.putheader("Accept-Encoding", "identity")
        connection.putheader("Connection", "close")
        connection.endheaders()
        response = connection.getresponse()

        if 300 <= response.status < 400:
            location = response.getheader("Location")
            if location:
                destination = urlsplit(urljoin(origin, location)).hostname
                if destination and destination.rstrip(".").lower() != host.lower():
                    raise _RedirectRejected("Redirect to another host is not allowed.")
            raise _RedirectRejected("HTTP redirects are not followed.")

        body = response.read(MAX_RESPONSE_BYTES + 1)
        if len(body) > MAX_RESPONSE_BYTES:
            raise ValueError("HTTP response exceeded the size limit.")
        return response.status, body.decode("utf-8", errors="replace")
    finally:
        connection.close()


def _get_text(parts: tuple[str, str, int, str], addresses: list[str], path: str) -> tuple[int, str]:
    scheme, host, port, origin = parts
    failures = []
    for address in addresses:
        try:
            return _request_text(host, address, port, scheme, origin, path)
        except _RedirectRejected:
            raise
        except (OSError, http.client.HTTPException, ssl.SSLError, TimeoutError, ValueError) as exc:
            failures.append(str(exc))
    raise OSError("; ".join(failures) or "No usable target address.")


def check_ownership(target: str, token: str) -> dict:
    """Check a token in DNS TXT, a well-known file, then the homepage meta tag."""
    if not isinstance(token, str) or not token:
        return {"verified": False, "method": None, "detail": "A non-empty token is required."}
    try:
        parts = _target_parts(target)
    except (AttributeError, ValueError) as exc:
        return {"verified": False, "method": None, "detail": f"Invalid target: {exc}"}

    _, host, _, _ = parts
    if network.is_blocked_target(target):
        return {"verified": False, "method": None, "detail": "Target is blocked by network policy."}
    try:
        addresses = network.resolve_host(host)
    except (OSError, TimeoutError) as exc:
        return {"verified": False, "method": None, "detail": f"Target DNS lookup failed: {exc}"}
    if not addresses:
        return {"verified": False, "method": None, "detail": "Target DNS returned no addresses."}
    if any(network.is_private_ip(address) for address in addresses):
        return {"verified": False, "method": None, "detail": "Target resolves to a private or internal IP."}

    try:
        ipaddress.ip_address(host)
    except ValueError:
        try:
            records = network.resolve_txt(f"_penflow-verify.{host}")
        except (OSError, subprocess.SubprocessError, TimeoutError):
            records = []
        if any(record.strip().strip('"') == token for record in records):
            return {"verified": True, "method": "dns", "detail": "Ownership token matched a DNS TXT record."}

    try:
        status, content = _get_text(parts, addresses, "/.well-known/penflow-verify.txt")
    except _RedirectRejected as exc:
        return {"verified": False, "method": None, "detail": str(exc)}
    except (OSError, http.client.HTTPException, ssl.SSLError, TimeoutError, ValueError) as exc:
        return {"verified": False, "method": None, "detail": f"Ownership file check failed: {exc}"}
    if status == 200 and content.strip() == token:
        return {"verified": True, "method": "file", "detail": "Ownership token matched the well-known file."}

    try:
        status, content = _get_text(parts, addresses, "/")
    except _RedirectRejected as exc:
        return {"verified": False, "method": None, "detail": str(exc)}
    except (OSError, http.client.HTTPException, ssl.SSLError, TimeoutError, ValueError) as exc:
        return {"verified": False, "method": None, "detail": f"Homepage check failed: {exc}"}
    if status == 200:
        parser = _VerificationMetaParser(token)
        parser.feed(content)
        if parser.verified:
            return {"verified": True, "method": "meta", "detail": "Ownership token matched the homepage meta tag."}

    return {"verified": False, "method": None, "detail": "Ownership token was not found."}
