"""Network and target-address helpers shared by ROE validation."""

import ipaddress
import re
import shutil
import socket
import subprocess
from urllib.parse import urlsplit

_BLOCKED_DOMAINS = (
    "amazon.com",
    "apple.com",
    "cloudflare.com",
    "facebook.com",
    "google.com",
    "microsoft.com",
)
_METADATA_HOSTS = {
    "metadata",
    "metadata.azure.internal",
    "metadata.google.internal",
    "metadata.google",
    "instance-data.ec2.internal",
}
_METADATA_IPS = {"100.100.100.200", "168.63.129.16", "169.254.169.254"}


def target_host(target: str) -> str:
    """Extract a normalized host from a URL or a bare hostname/IP."""
    if not isinstance(target, str) or not target.strip():
        raise ValueError("Target must be a non-empty URL or hostname.")

    raw = target.strip()
    try:
        ip = ipaddress.ip_address(raw)
        return str(ip).lower()
    except ValueError:
        pass

    parsed = urlsplit(raw if "://" in raw else f"//{raw}")
    if parsed.scheme and parsed.scheme.lower() not in {"http", "https"}:
        raise ValueError("Target URL must use HTTP or HTTPS.")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("Target URLs must not include credentials.")
    try:
        parsed.port
    except ValueError as exc:
        raise ValueError("Target URL has an invalid port.") from exc

    host = parsed.hostname
    if not host:
        raise ValueError("Target must include a hostname.")
    try:
        return host.rstrip(".").encode("idna").decode("ascii").lower()
    except UnicodeError as exc:
        raise ValueError("Target hostname is invalid.") from exc


def is_private_ip(value: str) -> bool:
    """Return whether an IP is private, non-global, or a known metadata address."""
    try:
        address = ipaddress.ip_address(value.split("%", 1)[0])
    except (AttributeError, ValueError):
        return False
    return value.split("%", 1)[0] in _METADATA_IPS or not address.is_global


def resolve_host(host: str) -> list[str]:
    """Resolve a host to unique IP addresses, preserving resolver order."""
    try:
        address = ipaddress.ip_address(host)
        return [str(address)]
    except ValueError:
        pass

    results = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    addresses = []
    for result in results:
        address = result[4][0].split("%", 1)[0]
        if address not in addresses:
            addresses.append(address)
    if not addresses:
        raise socket.gaierror(f"No addresses found for {host}.")
    return addresses


def resolve_txt(name: str, timeout: float = 5.0) -> list[str]:
    """Resolve TXT records using the system nslookup utility."""
    executable = shutil.which("nslookup")
    if not executable:
        raise OSError("The nslookup utility is unavailable.")

    result = subprocess.run(
        [executable, "-type=TXT", f"-timeout={int(timeout)}", "-retry=1", name],
        capture_output=True,
        text=True,
        timeout=timeout + 1,
        check=False,
    )
    output = result.stdout
    records = []
    lines = output.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        if not re.search(r"\btext\s*=", line, re.IGNORECASE):
            index += 1
            continue

        value = line.split("=", 1)[1].strip()
        index += 1
        while index < len(lines) and lines[index].lstrip().startswith('"'):
            value += " " + lines[index].strip()
            index += 1
        chunks = re.findall(r'"([^"]*)"', value)
        record = "".join(chunks) if chunks else value.strip().strip('"')
        if record:
            records.append(record)

    if result.returncode and not output.strip():
        raise OSError(result.stderr.strip() or f"TXT lookup failed for {name}.")
    return records


def is_blocked_target(target: str, lab_mode: bool = False) -> bool:
    """Apply static host blocks and reject private IP literals outside lab mode."""
    try:
        host = target_host(target)
    except ValueError:
        return True

    if host in _METADATA_HOSTS or host in _METADATA_IPS:
        return True
    if host in {"gov", "mil"} or host.endswith((".gov", ".mil")):
        return True
    if any(host == domain or host.endswith(f".{domain}") for domain in _BLOCKED_DOMAINS):
        return True

    internal_name = (
        host == "localhost"
        or host.endswith((".localhost", ".local", ".internal"))
    )
    if internal_name:
        return not lab_mode

    try:
        ipaddress.ip_address(host)
    except ValueError:
        return False
    return is_private_ip(host) and not lab_mode
