import os
import re
import time
import uuid
import requests
from scope_guard.target_check import TargetScope
from tools.tool_registry import register
from tools.shell import finding, origin_of, is_dry_run, ToolError

ZAP_API = os.getenv("ZAP_API_URL", "http://127.0.0.1:8080")
ZAP_KEY = os.getenv("ZAP_API_KEY", "")
HTTP_TIMEOUT = 30


def _get(path: str, timeout: float = HTTP_TIMEOUT, **params):
    if ZAP_KEY:
        params["apikey"] = ZAP_KEY
    try:
        r = requests.get(f"{ZAP_API}{path}", params=params, timeout=max(0.1, min(HTTP_TIMEOUT, timeout)))
        r.raise_for_status()
        return r.json()
    except requests.RequestException as e:
        raise ToolError(f"ZAP API error on {path}: {e} (is ZAP running? use scripts/start_zap.sh)")
    except ValueError:
        raise ToolError(f"ZAP returned invalid JSON on {path}")


def _remaining(deadline: float) -> float:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise ToolError("ZAP exceeded the policy duration limit.")
    return max(0.1, remaining)


def _wait(status_path: str, scan_id: str, stop_path: str, deadline: float) -> None:
    try:
        while True:
            remaining = _remaining(deadline)
            if str(_get(status_path, timeout=remaining, scanId=scan_id).get("status")) == "100":
                return
            time.sleep(min(5, remaining))
    except ToolError:
        _get(stop_path, timeout=1, scanId=scan_id)
        raise


def _wait_passive(deadline: float) -> None:
    while True:
        remaining = _remaining(deadline)
        if str(_get("/JSON/pscan/view/recordsToScan/", timeout=remaining).get("recordsToScan")) == "0":
            return
        time.sleep(min(3, remaining))


@register("zap", phase="vulnerability_assessment", description="OWASP ZAP in-scope spider + passive scan",
          active=False)
def run(
    target_url: str,
    target_scope: TargetScope,
    active_scan: bool,
    max_wait: int,
    max_requests: int,
) -> list[dict]:
    if not isinstance(target_scope, TargetScope) or target_scope.url != target_url:
        raise ToolError("ZAP requires a policy-bound target scope.")
    if active_scan:
        raise ToolError("Active scanning is not permitted by the runtime scope guard.")
    if not 1 <= max_wait <= 900 or max_requests != 1:
        raise ToolError("ZAP limits exceed the supported policy caps.")
    if is_dry_run():
        return [
            finding("zap", "Reflected XSS in search field", "High", target_url, "fake dry-run data"),
            finding("zap", "Missing anti-CSRF token", "Medium", target_url, "fake dry-run data"),
        ]

    deadline = time.monotonic() + max_wait
    _get("/JSON/core/view/version/", timeout=_remaining(deadline))

    # Keep ZAP inside the target: a context that only includes the target origin.
    ctx_name = f"penflow_{uuid.uuid4().hex[:8]}"
    _get("/JSON/context/action/newContext/", timeout=_remaining(deadline), contextName=ctx_name)
    _get("/JSON/context/action/includeInContext/", timeout=_remaining(deadline), contextName=ctx_name,
         regex=f"^{re.escape(origin_of(target_url))}.*")

    spider_id = _get(
        "/JSON/spider/action/scan/",
        timeout=_remaining(deadline),
        url=target_url,
        contextName=ctx_name,
        recurse="false",
        threadCount="1",
        maxDurationInMins=str(max(1, max_wait // 60)),
    ).get("scan")
    if spider_id is None:
        raise ToolError("ZAP did not start the spider")
    _wait("/JSON/spider/view/status/", spider_id, "/JSON/spider/action/stop/", deadline)
    _wait_passive(deadline)
    alerts = _get("/JSON/core/view/alerts/", timeout=_remaining(deadline), baseurl=target_url).get("alerts", [])
    urls = _get("/JSON/core/view/urls/", timeout=_remaining(deadline), baseurl=target_url).get("urls", [])
    for discovered_url in urls:
        target_scope.validate_url(discovered_url)
    for alert in alerts:
        if isinstance(alert.get("url"), str):
            target_scope.validate_url(alert["url"])
    if not alerts and len(urls) <= 2:
        raise ToolError(f"ZAP only saw {len(urls)} URL(s) and found no alerts: the classic spider can't crawl "
                        "single-page apps like Juice Shop (AJAX spider needed)")

    # Group identical alerts (same name + risk) so the report isn't flooded with duplicates.
    grouped: dict[tuple, dict] = {}
    for a in alerts:
        key = (a.get("alert", "Unknown"), a.get("risk", "Low"))
        g = grouped.setdefault(key, {"url": a.get("url", target_url), "evidence": a.get("evidence", ""), "count": 0})
        g["count"] += 1
    return [
        finding("zap", name, risk, g["url"], f"{g['count']} instance(s). {g['evidence']}")
        for (name, risk), g in grouped.items()
    ]
