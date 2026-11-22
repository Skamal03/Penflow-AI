"""Helpers for running Kali tools from Python.

Two modes, picked automatically:
  * Linux / WSL  -> tools are run directly (recommended: run the whole engine inside WSL Kali).
  * Windows      -> every command is prefixed with `wsl -d <distro> --`.
"""
import os
import platform
import shutil
import subprocess
import uuid
from urllib.parse import urlparse

WSL_DISTRO = os.getenv("PENFLOW_WSL_DISTRO", "kali-linux")


class ToolError(Exception):
    """The tool could not run, crashed, or timed out. This is NOT 'no findings'."""


class ToolSkipped(Exception):
    """The tool was intentionally not run (nothing suitable to test)."""


def on_linux() -> bool:
    return platform.system() == "Linux"


def is_dry_run() -> bool:
    return os.environ.get("DRY_RUN") == "true"


def _wrap(cmd: list[str]) -> list[str]:
    return list(cmd) if on_linux() else ["wsl", "-d", WSL_DISTRO, "--"] + list(cmd)


def tool_available(binary: str) -> bool:
    if on_linux():
        return shutil.which(binary) is not None
    try:
        p = subprocess.run(_wrap(["which", binary]), capture_output=True, text=True, timeout=20)
        return p.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def run_cmd(cmd: list[str], timeout: int = 300) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(_wrap(cmd), capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        raise ToolError(f"Could not start '{cmd[0]}' (is it installed? on Windows, is WSL '{WSL_DISTRO}' set up?)")
    except subprocess.TimeoutExpired:
        raise ToolError(f"'{cmd[0]}' timed out after {timeout}s")


def run_with_output_file(build_cmd, suffix: str = ".json", timeout: int = 300) -> str:
    """For tools that only write results to a file. Uses a unique file per run
    (inside Linux), reads it back, then deletes it."""
    path = f"/tmp/penflow_{uuid.uuid4().hex}{suffix}"
    try:
        proc = run_cmd(build_cmd(path), timeout=timeout)
        read = run_cmd(["cat", path], timeout=30)
        if read.returncode != 0 or not read.stdout.strip():
            tail = (proc.stderr or proc.stdout or "")[-200:]
            raise ToolError(f"no output file produced. {tail}")
        return read.stdout
    finally:
        try:
            run_cmd(["rm", "-f", path], timeout=15)
        except ToolError:
            pass


def finding(tool: str, name: str, risk: str, url: str, evidence: str = "") -> dict:
    return {"tool": tool, "name": name, "risk": risk, "url": url, "evidence": (evidence or "")[:500]}


def host_of(url: str) -> str:
    host = urlparse(url).hostname
    if not host:
        raise ToolError(f"Invalid target URL: {url}")
    return host


def origin_of(url: str) -> str:
    p = urlparse(url)
    return f"{p.scheme}://{p.netloc}"
