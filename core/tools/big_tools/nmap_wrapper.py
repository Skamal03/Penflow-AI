from socket import timeout
import xml.etree.ElementTree as ET
from urllib.parse import urlparse
from tools.tool_registry import register
from tools.shell import run_cmd, finding, host_of, is_dry_run, ToolError


@register("nmap", phase="reconnaissance", binary="nmap",
          description="Port scan + service/version detection on the target host")
def run(target_url: str, timeout: int = 300) -> list[dict]:
    if is_dry_run():
        return [finding("nmap", "Open port 3000/tcp: Node.js Express", "Informational", target_url, "fake dry-run data")]

    host = host_of(target_url)
    p = urlparse(target_url)
    ports = {p.port or (443 if p.scheme == "https" else 80)}
    if urlparse(target_url).port:
        ports.add(urlparse(target_url).port)
    port_arg = ",".join(str(p) for p in sorted(ports))

    proc = run_cmd(["nmap", "-sV", "-T4", "-Pn", "--max-retries", "1", "--host-timeout", "120s", "-p", port_arg, "-oX", "-", host], timeout=timeout)
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
                                "Informational", f"{host}:{pid}", f"scanned host={host}"))
    return findings
