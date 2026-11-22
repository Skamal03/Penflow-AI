import os
import re
import time
import uuid
import requests
from tools.tool_registry import register
from tools.shell import finding, origin_of, is_dry_run, ToolError

ZAP_API = os.getenv("ZAP_API_URL", "http://127.0.0.1:8080")
ZAP_KEY = os.getenv("ZAP_API_KEY", "")
HTTP_TIMEOUT = 30


def _get(path: str, **params):
    if ZAP_KEY:
        params["apikey"] = ZAP_KEY
    try:
        r = requests.get(f"{ZAP_API}{path}", params=params, timeout=HTTP_TIMEOUT)
        r.raise_for_status()
        return r.json()
    except requests.RequestException as e:
        raise ToolError(f"ZAP API error on {path}: {e} (is ZAP running? use scripts/start_zap.sh)")
    except ValueError:
        raise ToolError(f"ZAP returned invalid JSON on {path}")


def _wait(status_path: str, scan_id: str, stop_path: str, max_wait: int) -> None:
    waited = 0
    while waited < max_wait:
        if str(_get(status_path, scanId=scan_id).get("status")) == "100":
            return
        time.sleep(5)
        waited += 5
    _get(stop_path, scanId=scan_id)  # timed out: stop and keep partial results


@register("zap", phase="vulnerability_assessment", description="OWASP ZAP spider + passive + active scan",
          active=True)
def run(target_url: str, active_scan: bool = True, max_wait: int = 300) -> list[dict]:
    if is_dry_run():
        return [
            finding("zap", "Reflected XSS in search field", "High", target_url, "fake dry-run data"),
            finding("zap", "Missing anti-CSRF token", "Medium", target_url, "fake dry-run data"),
        ]

    _get("/JSON/core/view/version/")  # fails fast if ZAP is not running

    # Keep ZAP inside the target: a context that only includes the target origin.
    ctx_name = f"penflow_{uuid.uuid4().hex[:8]}"
    ctx_id = _get("/JSON/context/action/newContext/", contextName=ctx_name).get("contextId")
    _get("/JSON/context/action/includeInContext/", contextName=ctx_name,
         regex=f"^{re.escape(origin_of(target_url))}.*")

    spider_id = _get("/JSON/spider/action/scan/", url=target_url, contextName=ctx_name, recurse="true").get("scan")
    if spider_id is None:
        raise ToolError("ZAP did not start the spider")
    _wait("/JSON/spider/view/status/", spider_id, "/JSON/spider/action/stop/", max_wait)

    if active_scan:
        ascan_id = _get("/JSON/ascan/action/scan/", url=target_url, contextId=ctx_id, recurse="true").get("scan")
        if ascan_id is None:
            raise ToolError("ZAP did not start the active scan")
        _wait("/JSON/ascan/view/status/", ascan_id, "/JSON/ascan/action/stop/", max_wait)

    alerts = _get("/JSON/core/view/alerts/", baseurl=target_url).get("alerts", [])

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
