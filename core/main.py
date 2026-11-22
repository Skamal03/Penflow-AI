import argparse
import json
import os
import sys
from datetime import datetime, timezone


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True, help="e.g. http://127.0.0.1:3000")
    parser.add_argument("--dry-run", action="store_true", help="fake tool data, but real LLM + report")
    parser.add_argument("--only", help="comma-separated tools to run, e.g. whatweb,nmap")
    args = parser.parse_args()

    if args.dry_run:
        os.environ["DRY_RUN"] = "true"

    from agent.react_loop import run, RUN_STATUS  # import AFTER setting DRY_RUN
    from tools.tool_registry import ScopeError
    from report import save_report

    only = [t.strip() for t in args.only.split(",")] if args.only else None
    started = datetime.now(timezone.utc)
    try:
        findings = run(args.target, only=only)
    except ScopeError as e:
        print(f"SCOPE BLOCKED: {e}", file=sys.stderr)
        sys.exit(2)

    md_path, _ = save_report(args.target, findings, RUN_STATUS, started, datetime.now(timezone.utc))
    print(f"[*] report saved: {md_path}", file=sys.stderr)
    print(json.dumps(findings, indent=2))


if __name__ == "__main__":
    main()
