"""Pure validation of a Rules of Engagement document."""

import ipaddress
from datetime import datetime, timedelta, timezone

from . import network

MAX_WINDOW = timedelta(days=30)


def _parse_time(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        return None
    return parsed.astimezone(timezone.utc)


def validate_roe(roe: dict, lab_mode: bool = False) -> dict:
    """Validate required ROE fields, dates, target policy, and target DNS."""
    reasons = []
    if not isinstance(roe, dict):
        return {"status": "invalid", "reasons": ["ROE must be a JSON object."], "targets": []}

    targets = roe.get("targets")
    if not isinstance(targets, list) or not targets:
        reasons.append("At least one target is required.")
        clean_targets = []
    else:
        clean_targets = [item.strip() for item in targets if isinstance(item, str) and item.strip()]
        if len(clean_targets) != len(targets):
            reasons.append("Every target must be a non-empty string.")
        if not clean_targets:
            reasons.append("At least one target is required.")

    allowed_tools = roe.get("allowed_tools")
    if not isinstance(allowed_tools, list) or not allowed_tools:
        reasons.append("At least one allowed tool is required.")
    elif any(not isinstance(tool, str) or not tool.strip() for tool in allowed_tools):
        reasons.append("Every allowed tool must be a non-empty string.")
    elif any("*" in tool for tool in allowed_tools):
        reasons.append("Wildcard allowed_tools entries are not allowed.")

    for field in ("owner_name", "owner_contact"):
        if not isinstance(roe.get(field), str) or not roe[field].strip():
            reasons.append(f"{field} is required.")

    start_time = _parse_time(roe.get("start_time"))
    end_time = _parse_time(roe.get("end_time"))
    if start_time is None:
        reasons.append("start_time must be an ISO timestamp with a timezone.")
    if end_time is None:
        reasons.append("end_time must be an ISO timestamp with a timezone.")
    if start_time is not None and end_time is not None:
        if end_time <= start_time:
            reasons.append("end_time must be later than start_time.")
        elif end_time - start_time > MAX_WINDOW:
            reasons.append("The authorization window must not exceed 30 days.")
        if end_time <= datetime.now(timezone.utc):
            reasons.append("The authorization window has expired.")

    for target in clean_targets:
        if "*" in target:
            reasons.append(f"Wildcard targets are not allowed: {target}.")
            continue
        try:
            host = network.target_host(target)
        except ValueError as exc:
            reasons.append(f"Invalid target {target}: {exc}")
            continue

        if network.is_blocked_target(target, lab_mode=lab_mode):
            reasons.append(f"Target is blocked by policy: {target}.")
            continue

        try:
            ipaddress.ip_address(host)
        except ValueError:
            try:
                addresses = network.resolve_host(host)
            except (OSError, TimeoutError) as exc:
                reasons.append(f"Target DNS lookup failed for {target}: {exc}")
                continue
            if not lab_mode and any(network.is_private_ip(address) for address in addresses):
                reasons.append(f"Target resolves to a private or internal IP: {target}.")

    return {
        "status": "valid" if not reasons else "invalid",
        "reasons": reasons,
        "targets": clean_targets,
    }
