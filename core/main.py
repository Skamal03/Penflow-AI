import argparse
import json
import os
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.dry_run:
        os.environ["DRY_RUN"] = "true"

    from agent.react_loop import run  # import AFTER setting DRY_RUN
    from tools.tool_registry import ScopeError
    try:
        findings = run(args.target)
    except ScopeError as e:
        print(f"SCOPE BLOCKED: {e}", file=sys.stderr)
        sys.exit(2)
    print(json.dumps(findings, indent=2))


if __name__ == "__main__":
    main()
