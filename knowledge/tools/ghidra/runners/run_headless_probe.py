#!/usr/bin/env python3
"""Run a real Ghidra headless probe when analyzeHeadless is available."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


TOOL_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_REPO_ROOT = PACKAGE_ROOT.parent


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run analyzeHeadless against build/GALE01/main.elf and cache Ghidra output.")
    parser.add_argument("--repo-root", type=Path, default=DEFAULT_REPO_ROOT)
    parser.add_argument("--analyze-headless", default=os.environ.get("GHIDRA_ANALYZE_HEADLESS", ""))
    parser.add_argument("--project-name", default="melee-ghidra-smoke")
    return parser.parse_args()


def find_analyze_headless(explicit: str) -> str:
    if explicit:
        return explicit
    path = shutil.which("analyzeHeadless")
    if path:
        return path
    for candidate in (
        "/usr/local/opt/ghidra/libexec/support/analyzeHeadless",
        "/opt/homebrew/opt/ghidra/libexec/support/analyzeHeadless",
    ):
        if Path(candidate).exists():
            return candidate
    return ""


def java_home() -> str:
    if os.environ.get("JAVA_HOME"):
        return os.environ["JAVA_HOME"]
    for candidate in (
        "/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home",
        "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home",
    ):
        if Path(candidate).exists():
            return candidate
    return ""


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True))
            handle.write("\n")


def main() -> int:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    analyze = find_analyze_headless(args.analyze_headless)
    java = java_home()
    input_elf = repo_root / "build" / "GALE01" / "main.elf"
    project_dir = TOOL_ROOT / "cache" / "ghidra_project"
    log_path = TOOL_ROOT / "cache" / "ghidra_headless_probe.log"
    index_path = TOOL_ROOT / "indexes" / "ghidra_headless_probe.jsonl"
    rows: list[dict[str, Any]] = []
    proc: subprocess.CompletedProcess[str] | None = None
    success = False
    if analyze and input_elf.exists():
        project_dir.mkdir(parents=True, exist_ok=True)
        command = [
            analyze,
            str(project_dir),
            args.project_name,
            "-import",
            str(input_elf),
            "-overwrite",
            "-analysisTimeoutPerFile",
            "30",
            "-deleteProject",
        ]
        env = os.environ.copy()
        if java:
            env["JAVA_HOME"] = java
        proc = subprocess.run(command, cwd=repo_root, env=env, text=True, capture_output=True, check=False)
        log_path.write_text((proc.stdout or "") + "\n" + (proc.stderr or ""), encoding="utf-8")
        success = proc.returncode == 0
        if success:
            rows.append(
                {
                    "id": "ghidra_headless_probe:main.elf",
                    "kind": "ghidra_headless_probe_live",
                    "title": "Ghidra headless import smoke: main.elf",
                    "summary": "analyzeHeadless imported build/GALE01/main.elf successfully for a bounded local smoke.",
                    "text": f"ghidra analyzeHeadless main.elf {input_elf} {args.project_name}",
                    "evidence_ref": str(log_path),
                    "payload": {
                        "analyze_headless": analyze,
                        "input": str(input_elf),
                        "project_dir": str(project_dir),
                        "project_name": args.project_name,
                        "exit_code": proc.returncode,
                    },
                }
            )
    else:
        missing = []
        if not analyze:
            missing.append("analyzeHeadless")
        if not input_elf.exists():
            missing.append(str(input_elf))
        if analyze and not java:
            missing.append("JAVA_HOME/openjdk@21")
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text("Missing required Ghidra probe dependency: " + ", ".join(missing), encoding="utf-8")
    write_jsonl(index_path, rows)
    manifest = {
        "tool": "ghidra",
        "runner": "run_headless_probe.py",
        "success": success and bool(rows),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "command": [
            "python3",
            "knowledge/tools/ghidra/runners/run_headless_probe.py",
            "--repo-root",
            str(repo_root),
            "--analyze-headless",
            analyze,
        ],
        "repo_root": str(repo_root),
        "exit_code": proc.returncode if proc else None,
        "record_count": len(rows),
        "generated_artifacts": [str(log_path)] if log_path.exists() else [],
        "generated_indexes": [str(index_path)] if index_path.exists() else [],
        "dependencies": [analyze or "analyzeHeadless", java or "openjdk@21", "build/GALE01/main.elf"],
        "analyze_headless": analyze,
        "java_home": java,
        "stderr_excerpt": (proc.stderr if proc else "")[-2000:] if proc else "",
    }
    status_path = TOOL_ROOT / "cache" / "runner_status.json"
    status_path.parent.mkdir(parents=True, exist_ok=True)
    status_path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(manifest, indent=2, sort_keys=True))
    return 0 if manifest["success"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
