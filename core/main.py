import argparse
import os
import json

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.dry_run:
        os.environ["DRY_RUN"] = "true"

    from agent.react_loop import run  # import AFTER setting DRY_RUN
    findings = run(args.target)
    print(json.dumps(findings, indent=2))

if __name__ == "__main__":
    main()