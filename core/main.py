import argparse
import json
import os
import sys
import uuid 
from datetime import datetime, timezone


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", help="e.g. http://127.0.0.1:3000")
    parser.add_argument("--run-id", help="DB run UUID; names the report folder")
    parser.add_argument("--dry-run", action="store_true", help="fake tool data, but a real report")
    parser.add_argument("--only", help="comma-separated tools to run, e.g. whatweb,nmap")
    parser.add_argument("--no-ai", action="store_true", help="zero LLM tokens: built-in text only")
    parser.add_argument("--refresh-ai", action="store_true", help="ignore the cached AI text")
    parser.add_argument("--report-from", help="rebuild HTML/MD from an existing report.json")
    args = parser.parse_args()

    from reporting import generate_report, load_report, rebuild_report

    if args.run_id:
        try:
            args.run_id = str(uuid.UUID(args.run_id))
        except ValueError:
            parser.error("--run-id must be a valid UUID")

    if args.report_from:
        paths = rebuild_report(args.report_from)
        print(f"[*] report rebuilt: {paths['html']}", file=sys.stderr)
        print(json.dumps(load_report(args.report_from)["findings"], indent=2))
        return

    if not args.target:
        parser.error("--target is required unless --report-from is used")

    if args.dry_run:
        os.environ["DRY_RUN"] = "true"

    from agent.react_loop import run, RUN_STATUS  # import AFTER setting DRY_RUN
    from tools.tool_registry import ScopeError

    only = [t.strip() for t in args.only.split(",")] if args.only else None
    started = datetime.now(timezone.utc)
    try:
        findings = run(args.target, only=only)
    except ScopeError as e:
        print(f"SCOPE BLOCKED: {e}", file=sys.stderr)
        sys.exit(2)

    paths = generate_report(
        args.target, findings, RUN_STATUS, started, datetime.now(timezone.utc),
        use_ai=not args.no_ai, refresh_ai=args.refresh_ai,
    )
    print(f"[*] report saved: {paths['html']}", file=sys.stderr)
    print(f"[*] report data: {paths['json']}", file=sys.stderr)
    print(json.dumps(findings, indent=2))  # stdout contract: findings JSON only


if __name__ == "__main__":
    main()
