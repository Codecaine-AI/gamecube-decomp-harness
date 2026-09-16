#!/usr/bin/env python3
"""Report readiness for tool-local checkdiff and direct-compile helpers."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[3] / "_shared"))
from toolpack_runtime import compiler_runner_status, import_tool_module, print_json, project_layout, repo_path_label, resolve_repo_root, tool_impl_status


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", help="Target project checkout root.")
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    args = parser.parse_args()

    repo_root = resolve_repo_root(args.repo_root)
    layout = project_layout(repo_root)
    reference_root = import_tool_module("project_root", repo_root).reference_object_root(repo_root)
    runner = compiler_runner_status(repo_root)
    payload = tool_impl_status(
        tool="checkdiff",
        scripts=("checkdiff.py", "ninja_compile.py", "fix_includes.py", "objdiff_path.py"),
        repo_root=repo_root,
        required_paths=(
            repo_path_label(repo_root, layout.report_path),
            "build.ninja",
            repo_path_label(repo_root, reference_root),
            "build/tools/objdiff-cli",
            "build/tools/sjiswrap.exe",
            "build/tools/dtk",
        ),
        optional_paths=("build/tools/wibo",),
        message=(
            "Checkdiff is ready when tool-local helper scripts, project build metadata, "
            "objdiff-cli, sjiswrap, dtk, and an MWCC runner are present. The runner "
            "prefers MWCC_WIBO or project-state wibo, then repo-local/PATH wibo, "
            "with Wine as fallback."
        ),
    )
    payload["compiler_runner"] = runner
    if runner["status"] != "ok":
        payload["status"] = "missing_prerequisite"
        payload["missing_required_paths"] = [*payload.get("missing_required_paths", []), runner["missing_label"]]
    print_json(payload)


if __name__ == "__main__":
    main()
