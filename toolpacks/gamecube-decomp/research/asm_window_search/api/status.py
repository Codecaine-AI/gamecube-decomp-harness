#!/usr/bin/env python3
"""Report assembly-window index presence and row counts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any


TOOL_ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(TOOL_ROOT.parents[1] / "_shared"))

from search_index import env_path, tool_storage_root, tool_storage_roots  # type: ignore


def count_jsonl(path: Path) -> int:
    if not path.exists():
        return 0
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        return sum(1 for line in handle if line.strip())


def build_payload() -> dict[str, Any]:
    roots: list[dict[str, Any]] = []
    selected_manifest: dict[str, Any] | None = None
    selected_counts = {"functions": 0, "windows": 0}
    selected_root: str | None = None
    for root in tool_storage_roots(TOOL_ROOT):
        indexes = root / "indexes"
        functions = count_jsonl(indexes / "functions.jsonl")
        windows = count_jsonl(indexes / "windows.meta.jsonl")
        vector_path = indexes / "windows.vec.bin"
        manifest_path = indexes / "manifest.json"
        manifest: dict[str, Any] | None = None
        if manifest_path.exists():
            try:
                value = json.loads(manifest_path.read_text(encoding="utf-8"))
                manifest = value if isinstance(value, dict) else None
            except json.JSONDecodeError:
                manifest = None
        ready = bool(functions and windows and vector_path.exists() and manifest)
        if selected_root is None and ready:
            selected_manifest = manifest
            selected_counts = {"functions": functions, "windows": windows}
            selected_root = str(root)
        roots.append(
            {
                "root": str(root),
                "functions": functions,
                "windows": windows,
                "vectors_present": vector_path.exists(),
                "manifest_present": manifest_path.exists(),
                "ready": ready,
            }
        )
    available = selected_root is not None
    return {
        "tool": "asm_window_search",
        "status": "ready" if available else "index_not_built",
        "available": available,
        "counts": selected_counts,
        "manifest": selected_manifest,
        "selected_root": selected_root,
        "storage_root": str(tool_storage_root(TOOL_ROOT)),
        "storage_roots": [str(root) for root in tool_storage_roots(TOOL_ROOT)],
        "shared_data_root": str(env_path("ORCH_TOOL_SHARED_DATA_ROOT")) if env_path("ORCH_TOOL_SHARED_DATA_ROOT") else None,
        "root_details": roots,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Report assembly-window index status.")
    parser.add_argument("--json", action="store_true")
    parser.parse_args(argv)
    print(json.dumps(build_payload(), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
