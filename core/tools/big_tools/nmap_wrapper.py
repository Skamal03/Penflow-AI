import ipaddress
import xml.etree.ElementTree as ET
from urllib.parse import urlparse
from scope_guard.target_check import TargetScope
from tools.tool_registry import register
from tools.shell import run_cmd, finding, is_dry_run, ToolError


@register("nmap", phase="reconnaissance", binary="nmap",
          description="Port scan + service/version detection on the target host")
def run(
    target_url: str,
    target_scope: TargetScope,
    allowed_flags: list[str],
    max_rate: int,
    timeout: int,
) -> list[dict]:
    try:
        if not isinstance(target_scope, TargetScope) or target_scope.url != target_url:
            raise ValueError("nmap requires a policy-bound target scope")
        target_ip = str(ipaddress.ip_address(target_scope.destination_ip))
        target = urlparse(target_url)
        target_port = target_scope.port
        expected_port = target.port or (443 if target.scheme == "https" else 80)
    except (ValueError, TypeError) as error:
        raise ToolError("nmap requires a valid policy-bound target address.") from error
    if target.scheme not in ("http", "https") or target_port != expected_port:
        raise ToolError("nmap target port does not match the policy-bound target URL.")
    if not 1 <= max_rate <= 20 or not 1 <= timeout <= 300:
        raise ToolError("nmap limits exceed the supported policy caps.")
    flags = [flag for flag in allowed_flags if flag in {"-sV", "-Pn"}]
    if is_dry_run():
        return [finding("nmap", f"Open port {target_port}/tcp: test service", "Informational", target_url, "fake dry-run data")]

    command = [
        "nmap", *flags, "--max-rate", str(max_rate), "--max-retries", "1",
        "--host-timeout", f"{timeout}s", "-p", str(target_port), "-oX", "-", target_ip,
    ]
    proc = run_cmd(command, timeout=timeout)
    if proc.returncode != 0 or not proc.stdout.strip():
        raise ToolError(f"nmap failed: {(proc.stderr or '')[-200:]}")
    try:
        root = ET.fromstring(proc.stdout)
    except ET.ParseError as e:
        raise ToolError(f"could not parse nmap XML: {e}")

    findings = []
    for port in root.findall("host/ports/port"):
        state = port.find("state")
        if state is None or state.get("state") != "open":
            continue
        svc = port.find("service")
        svc_text = ""
        if svc is not None:
            svc_text = " ".join(x for x in [svc.get("name"), svc.get("product"), svc.get("version")] if x)
            if svc.get("method") == "table":  # nmap only guessed from the port number
                svc_text = f"unconfirmed (nmap guess: {svc.get('name')})"
        pid, proto = port.get("portid"), port.get("protocol")
        findings.append(finding("nmap", f"Open port {pid}/{proto}: {svc_text or 'unknown service'}",
                                "Informational", target_url, f"scanned host={target_ip}"))
    return findings
