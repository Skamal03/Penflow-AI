from __future__ import annotations

import argparse
import json
import sys

from scope_guard.policy_builder import PolicyBuildError, build_policy


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m scope_guard")
    parser.add_argument("command", choices=["build"])
    parser.add_argument("--input", required=True)
    args = parser.parse_args(argv)
    try:
        with open(args.input, encoding="utf-8") as file:
            data = json.load(file)
        if not isinstance(data, dict):
            raise PolicyBuildError("Policy builder input must be a JSON object.")
        policy = build_policy(
            document_path=data["document_path"],
            asked_tools=data["asked_tools"],
            enabled_tools=data["enabled_tools"],
            target=data["target"],
            time_window=data["time_window"],
        )
        print(json.dumps(policy, ensure_ascii=True, separators=(",", ":")))
        return 0
    except (KeyError, TypeError, json.JSONDecodeError, PolicyBuildError) as error:
        print(f"Scope policy build failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
