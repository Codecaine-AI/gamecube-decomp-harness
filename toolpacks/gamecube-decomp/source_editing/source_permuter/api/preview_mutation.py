#!/usr/bin/env python3
"""Preview source-level mutation passes as a unified diff."""

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
    parser.add_argument("--source-path", required=True, help="Project-relative C source path to mutate.")
    parser.add_argument("--function", required=True, help="Function symbol to mutate.")
    parser.add_argument("--pass-name", help="Specific src_mutate pass name; omit for weighted random choice.")
    parser.add_argument("--seed", type=int, default=1, help="Random seed.")
    parser.add_argument("--steps", type=int, default=1, help="Number of stacked mutation steps.")
    parser.add_argument("--no-types", action="store_true", help="Skip clang type oracle for the preview.")
    parser.add_argument("--timeout-seconds", type=int, default=60, help="Maximum runtime for preview.")
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    args = parser.parse_args()

    repo_root = resolve_repo_root(args.repo_root)
    source = repo_root / args.source_path
    command_args = [str(source), args.function, "--seed", str(args.seed), "-n", str(clamp_int(args.steps, default=1, minimum=1, maximum=20))]
    if args.pass_name:
        command_args.extend(["--pass", args.pass_name])
    if args.no_types:
        command_args.append("--no-types")

    payload = run_tool_script(
        "src_mutate.py",
        command_args,
        repo_root=repo_root,
        operation="source_permuter:preview_mutation",
        timeout_seconds=clamp_int(args.timeout_seconds, default=60, minimum=5, maximum=300),
    )
    if payload.get("status") != "ok" and "ModuleNotFoundError" in str(payload.get("stderr", "")):
        payload["status"] = "missing_python_deps"
        payload["hint"] = MISSING_PYTHON_DEPS_HINT
    payload.update(
        {
            "source_path": args.source_path,
            "function": args.function,
            "pass_name": args.pass_name,
            "steps": clamp_int(args.steps, default=1, minimum=1, maximum=20),
            "no_types": bool(args.no_types),
        }
    )
    print_json(payload)


if __name__ == "__main__":
    main()
