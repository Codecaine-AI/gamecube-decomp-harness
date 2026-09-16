#!/usr/bin/env python3
"""Report readiness for the tool-local struct inference helper."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[3] / "_shared"))
from toolpack_runtime import print_json, project_layout, repo_path_label, resolve_repo_root, tool_impl_status


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", help="Target project checkout root.")
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    args = parser.parse_args()

    repo_root = resolve_repo_root(args.repo_root)
    layout = project_layout(repo_root)
    print_json(
        tool_impl_status(
            tool="struct_infer",
            scripts=("infer_struct.py",),
            repo_root=repo_root,
            required_paths=(repo_path_label(repo_root, layout.asm_root),),
            optional_paths=(repo_path_label(repo_root, layout.report_path),),
            message="Struct inference is ready when generated assembly is present.",
        )
    )


if __name__ == "__main__":
    main()
