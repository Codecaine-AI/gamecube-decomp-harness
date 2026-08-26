#!/usr/bin/env python3
"""Replay a saved tool-local source-permutation recipe without applying it by default."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[3] / "_shared"))
from toolpack_runtime import clamp_int, print_json, resolve_repo_root, run_tool_script


MISSING_PYTHON_DEPS_HINT = "Rebake the sandbox image with tree-sitter, tree-sitter-c, and libclang."


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", help="Target project checkout root.")
    parser.add_argument("--function", help="Optional function guard; replay fails if the recipe is for a different function.")
    parser.add_argument("--replay", required=True, help="Path to a permute.py replay recipe.")
    parser.add_argument("--apply", choices=("never", "match", "always"), default="never", help="Whether replay may write the candidate.")
    parser.add_argument("--timeout-seconds", type=int, default=120, help="Maximum runtime for replay and scoring.")
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    args = parser.parse_args()

    command_args: list[str] = []
    if args.function:
        command_args.append(args.function)
    command_args.extend(["--replay", args.replay, "--apply", args.apply])

    repo_root = resolve_repo_root(args.repo_root)
    payload = run_tool_script(
        "permute.py",
        command_args,
        repo_root=repo_root,
        operation="source_permuter:replay",
        timeout_seconds=clamp_int(args.timeout_seconds, default=120, minimum=10, maximum=900),
    )
    if payload.get("status") != "ok" and "ModuleNotFoundError" in str(payload.get("stderr", "")):
        payload["status"] = "missing_python_deps"
        payload["hint"] = MISSING_PYTHON_DEPS_HINT
    payload.update({"function": args.function, "replay": args.replay, "apply": args.apply})
    print_json(payload)


if __name__ == "__main__":
    main()
