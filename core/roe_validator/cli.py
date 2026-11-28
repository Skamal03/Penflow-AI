"""Command-line interface for ROE validation and ownership checks."""

import argparse
import json
import logging
import sys

from .ownership import check_ownership
from .rules import validate_roe


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m roe_validator")
    commands = parser.add_subparsers(dest="command", required=True)

    validate = commands.add_parser("validate", help="validate an ROE JSON file")
    validate.add_argument("--file", required=True)
    validate.add_argument("--lab-mode", action="store_true")

    ownership = commands.add_parser("ownership", help="check a target ownership token")
    ownership.add_argument("--target", required=True)
    ownership.add_argument("--token", required=True)

    args = parser.parse_args(argv)
    logging.basicConfig(stream=sys.stderr, level=logging.INFO, format="%(levelname)s: %(message)s")

    try:
        if args.command == "validate":
            with open(args.file, encoding="utf-8") as file:
                result = validate_roe(json.load(file), lab_mode=args.lab_mode)
        else:
            result = check_ownership(args.target, args.token)
        logging.info("ROE %s", result["status"] if "status" in result else ("verified" if result["verified"] else "not verified"))
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception:
        logging.exception("ROE validator crashed")
        return 1
