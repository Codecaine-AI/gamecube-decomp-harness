#!/usr/bin/env python3
"""Probe the local MWCC/Wine compiler path and cache debug metadata."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


TOOL_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_REPO_ROOT = PACKAGE_ROOT.parent


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Smoke the MWCC compiler path and summarize build-rule debug metadata.")
    parser.add_argument("--repo-root", type=Path, default=DEFAULT_REPO_ROOT)
    parser.add_argument("--mw-version", default="GC/1.2.5n")
    return parser.parse_args()


def extract_version(output: str) -> str:
    match = re.search(r"Version\s+([0-9.]+\s+build\s+\d+)", output)
    return match.group(1) if match else ""


def build_rule_snippets(repo_root: Path, mw_version: str) -> list[str]:
    ninja = repo_root / "build.ninja"
    if not ninja.exists():
        return []
    lines = ninja.read_text(encoding="utf-8", errors="replace").splitlines()
    snippets: list[str] = []
    for index, line in enumerate(lines):
        if f"mw_version = {mw_version}" not in line:
            continue
        start = max(0, index - 6)
        end = min(len(lines), index + 8)
        snippets.append("\n".join(lines[start:end]))
        if len(snippets) >= 3:
            break
    return snippets


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True))
            handle.write("\n")


def main() -> int:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    wine = shutil.which("wine")
    compiler = repo_root / "build" / "compilers" / args.mw_version / "mwcceppc.exe"
    command = [wine or "wine", str(compiler), "-version"]
    proc = subprocess.run(command, cwd=repo_root, text=True, capture_output=True, check=False) if wine and compiler.exists() else None
    output = ((proc.stdout if proc else "") + "\n" + (proc.stderr if proc else "")).strip()
    version = extract_version(output)
    output_path = TOOL_ROOT / "cache" / "mwcc_version_probe.txt"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(output, encoding="utf-8")
    snippets = build_rule_snippets(repo_root, args.mw_version)
    snippets_path = TOOL_ROOT / "cache" / "mwcc_build_rule_snippets.json"
    snippets_path.write_text(json.dumps(snippets, indent=2), encoding="utf-8")
    success = bool(proc and proc.returncode == 0 and version)
    rows = [
        {
            "id": f"mwcc_probe:{args.mw_version}",
            "kind": "mwcc_debug_probe_live",
            "title": f"MWCC compiler probe: {args.mw_version}",
            "summary": f"MWCC {args.mw_version} ran under Wine and reported {version}.",
            "text": " ".join([args.mw_version, version, "wine", "mwcceppc", " ".join(snippets)]),
            "evidence_ref": str(output_path),
            "payload": {
                "mw_version": args.mw_version,
                "compiler": str(compiler),
                "wine": wine,
                "exit_code": proc.returncode if proc else None,
                "version": version,
                "build_rule_snippets": snippets,
            },
        }
    ] if success else []
    index_path = TOOL_ROOT / "indexes" / "mwcc_probes.jsonl"
    write_jsonl(index_path, rows)
    manifest = {
        "tool": "mwcc_debug",
        "runner": "probe_mwcc_compiler.py",
        "success": success and bool(rows),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "command": ["python3", "knowledge/tools/mwcc_debug/runners/probe_mwcc_compiler.py", "--repo-root", str(repo_root)],
        "repo_root": str(repo_root),
        "exit_code": proc.returncode if proc else None,
        "record_count": len(rows),
        "generated_artifacts": [str(output_path), str(snippets_path)],
        "generated_indexes": [str(index_path)] if index_path.exists() else [],
        "dependencies": ["wine", f"build/compilers/{args.mw_version}/mwcceppc.exe", "build.ninja"],
        "version": version,
        "stderr_excerpt": (proc.stderr if proc else "")[-2000:] if proc else "",
    }
    status_path = TOOL_ROOT / "cache" / "runner_status.json"
    status_path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(manifest, indent=2, sort_keys=True))
    return 0 if manifest["success"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
