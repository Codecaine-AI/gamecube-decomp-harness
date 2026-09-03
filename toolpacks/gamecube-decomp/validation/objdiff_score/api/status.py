#!/usr/bin/env python3
"""Report readiness for objdiff candidate scoring."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[3] / "_shared"))
from toolpack_runtime import build_id, print_json, resolve_repo_root, tool_impl_status


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", help="Target project checkout root.")
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    args = parser.parse_args()

    repo_root = resolve_repo_root(args.repo_root)
    bid = build_id()
    print_json(
        tool_impl_status(
            tool="objdiff_score",
            scripts=("objdiff_path.py", "ninja_compile.py"),
            repo_root=repo_root,
            required_paths=(f"build/{bid}/report.json", f"build/{bid}/obj", "build/tools/objdiff-cli"),
            optional_paths=("objdiff.json",),
            message="objdiff scoring is ready when target objects and objdiff-cli are available.",
        )
    )


if __name__ == "__main__":
    main()
