#!/usr/bin/env python3
"""Report readiness for the tool-local source permutation helpers."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[3] / "_shared"))
from toolpack_runtime import compiler_runner_status, print_json, resolve_repo_root, tool_impl_status


def max_jobs() -> int:
    try:
        parsed = int(os.environ.get("ORCH_SOURCE_PERMUTER_MAX_JOBS", "1"))
    except ValueError:
        parsed = 1
    return max(1, min(16, parsed))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", help="Target project checkout root.")
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    args = parser.parse_args()

    repo_root = resolve_repo_root(args.repo_root)
    runner = compiler_runner_status(repo_root)
    payload = tool_impl_status(
        tool="source_permuter",
        scripts=("permute.py", "src_mutate.py", "type_oracle.py", "ninja_compile.py", "objdiff_path.py"),
        repo_root=repo_root,
        required_paths=(
            "build/GALE01/report.json",
            "build.ninja",
            "build/GALE01/obj",
            "build/tools/objdiff-cli",
            "build/tools/sjiswrap.exe",
            "build/tools/dtk",
        ),
        optional_paths=("compile_commands.json", "build/tools/wibo"),
        message=(
            "Source permutation is ready when tool-local helper scripts, build metadata, "
            "objdiff-cli, sjiswrap, dtk, and an MWCC runner are present. The runner "
            "prefers MWCC_WIBO or project-state wibo, then repo-local/PATH wibo, "
            "with Wine as fallback."
        ),
    )
    payload["compiler_runner"] = runner
    payload["queue_policy"] = {
        "run_replay_default_slots": 1,
        "run_replay_when_slots_full": "queue_busy",
        "run_default_jobs": 1,
        "run_max_jobs": max_jobs(),
        "run_max_jobs_env": "ORCH_SOURCE_PERMUTER_MAX_JOBS",
    }
    if runner["status"] != "ok":
        payload["status"] = "missing_prerequisite"
        payload["missing_required_paths"] = [*payload.get("missing_required_paths", []), runner["missing_label"]]
    print_json(payload)


if __name__ == "__main__":
    main()
