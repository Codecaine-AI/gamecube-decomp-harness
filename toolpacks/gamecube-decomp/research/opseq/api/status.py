#!/usr/bin/env python3
"""Report opcode-sequence suite readiness and generated evidence status."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any


TOOL_ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(TOOL_ROOT.parents[1] / "_shared"))

from search_index import load_runner_manifest, normalized_path, status_payload, tool_storage_roots  # type: ignore


INDEX_FILES = {
    "function_shapes": Path("indexes") / "function_shapes.jsonl",
    "opcode_sequences": Path("indexes") / "opcode_sequences.jsonl",
    "fingerprints": Path("indexes") / "opcode_fingerprints.jsonl",
    "neighbors": Path("indexes") / "opcode_neighbors.jsonl",
}
CACHE_FILES = {
    "fingerprints": Path("cache") / "opcode_fingerprints.jsonl",
}


def read_jsonl_count(path: Path) -> int:
    if not path.exists():
        return 0
    count = 0
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if line.strip():
                count += 1
    return count


def file_summary(relative_path: Path) -> dict[str, Any]:
    total = 0
    files: list[dict[str, Any]] = []
    for storage_root in tool_storage_roots(TOOL_ROOT):
        path = storage_root / relative_path
        count = read_jsonl_count(path)
        total += count
        files.append(
            {
                "path": str(path),
                "exists": path.exists(),
                "records": count,
            }
        )
    return {"records": total, "files": files}


def runner_summary(expected_repo_root: str | None, base_payload: dict[str, Any]) -> dict[str, Any]:
    manifest = load_runner_manifest(TOOL_ROOT)
    runner_success = bool(manifest.get("success"))
    runner_repo_root = manifest.get("repo_root")
    expected = normalized_path(expected_repo_root) if expected_repo_root else None
    repo_root_matches = None
    if expected:
        repo_root_matches = bool(runner_repo_root) and normalized_path(runner_repo_root) == expected
    fresh = runner_success and repo_root_matches is not False
    return {
        "success": runner_success,
        "fresh": fresh,
        "status": base_payload.get("runner_status"),
        "smoke_status": base_payload.get("runner_smoke_status"),
        "last_success_at": manifest.get("generated_at") if runner_success else None,
        "repo_root": runner_repo_root,
        "expected_repo_root": expected,
        "repo_root_matches": repo_root_matches,
        "manifest_path": manifest.get("manifest_path"),
        "record_count": manifest.get("record_count"),
        "artifact_counts": manifest.get("artifact_counts") or {},
        "generated_artifacts": manifest.get("generated_artifacts") or [],
        "generated_indexes": manifest.get("generated_indexes") or [],
        "command": manifest.get("command"),
        "error": manifest.get("error"),
    }


def build_payload(repo_root: str | None) -> dict[str, Any]:
    payload = status_payload("opseq", TOOL_ROOT, "No opcode sequence index has been generated yet.", repo_root)
    index_summaries = {name: file_summary(path) for name, path in INDEX_FILES.items()}
    cache_summaries = {name: file_summary(path) for name, path in CACHE_FILES.items()}
    payload["index_counts"] = {name: summary["records"] for name, summary in index_summaries.items()}
    payload["index_files"] = index_summaries
    payload["cache_counts"] = {name: summary["records"] for name, summary in cache_summaries.items()}
    payload["cache_files"] = cache_summaries
    payload["runner"] = runner_summary(repo_root, payload)
    payload["available"] = bool(payload["index_counts"].get("opcode_sequences"))
    payload["message"] = (
        "Opcode sequence similarity evidence is ready."
        if payload["available"]
        else "No opcode sequence index has been generated yet."
    )
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Report opseq tool status.")
    parser.add_argument("--repo-root", help="Target project checkout root used to check cache freshness.")
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    args = parser.parse_args()
    print(json.dumps(build_payload(args.repo_root), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
