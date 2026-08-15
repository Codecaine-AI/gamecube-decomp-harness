#!/usr/bin/env python3
"""Export Ghidra cross-references to the shared tool index."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


TOOL_ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(TOOL_ROOT.parents[1] / "_shared"))
from search_index import package_root_for_tool, tool_storage_root  # type: ignore

PACKAGE_ROOT = package_root_for_tool(TOOL_ROOT)
TOOL_STORAGE_ROOT = tool_storage_root(TOOL_ROOT)
DEFAULT_REPO_ROOT = PACKAGE_ROOT.parent / "melee"
SUMMARY_PATTERN = re.compile(r"EXPORT_XREFS_SUMMARY count=(\d+) output=(.+)")


def nonnegative_int(value: str) -> int:
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("must be zero or greater")
    return parsed


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return parsed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export Ghidra xrefs from build/GALE01/main.elf to JSONL.")
    parser.add_argument("--repo-root", type=Path, default=DEFAULT_REPO_ROOT)
    parser.add_argument("--analyze-headless", default=os.environ.get("GHIDRA_ANALYZE_HEADLESS", ""))
    parser.add_argument("--script-flavor", choices=("java", "python"), default="java")
    parser.add_argument("--project-name", default="melee-ghidra-xrefs")
    parser.add_argument("--analysis-timeout", type=positive_int, default=900)
    parser.add_argument("--limit", type=nonnegative_int, default=0, help="Maximum rows to retain; zero keeps all rows.")
    return parser.parse_args()


def executable_path(value: str) -> str:
    if not value:
        return ""
    expanded = Path(value).expanduser()
    if expanded.is_absolute() or os.sep in value:
        return str(expanded.resolve()) if expanded.is_file() and os.access(expanded, os.X_OK) else ""
    return shutil.which(value) or ""


def find_analyze_headless(explicit: str) -> str:
    if explicit:
        return executable_path(explicit)
    path = shutil.which("analyzeHeadless")
    if path:
        return path
    for candidate in (
        "/usr/local/opt/ghidra/libexec/support/analyzeHeadless",
        "/opt/homebrew/opt/ghidra/libexec/support/analyzeHeadless",
    ):
        if Path(candidate).is_file() and os.access(candidate, os.X_OK):
            return candidate
    return ""


def java_home() -> str:
    if os.environ.get("JAVA_HOME"):
        return os.environ["JAVA_HOME"]
    for candidate in (
        "/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home",
        "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home",
    ):
        if Path(candidate).is_dir():
            return candidate
    return ""


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True))
            handle.write("\n")


def read_jsonl(path: Path, limit: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            row = json.loads(line)
            if not isinstance(row, dict):
                raise ValueError(f"{path}:{line_number}: expected a JSON object")
            rows.append(row)
            if limit and len(rows) >= limit:
                break
    return rows


def summary_count(stdout: str) -> int | None:
    matches = SUMMARY_PATTERN.findall(stdout)
    return int(matches[-1][0]) if matches else None


def main() -> int:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    analyze = find_analyze_headless(args.analyze_headless)
    java = java_home()
    input_elf = repo_root / "build" / "GALE01" / "main.elf"
    project_dir = TOOL_STORAGE_ROOT / "cache" / "ghidra_xrefs_project"
    log_path = TOOL_STORAGE_ROOT / "cache" / "ghidra_export_xrefs.log"
    status_path = TOOL_STORAGE_ROOT / "cache" / "export_xrefs_status.json"
    index_path = TOOL_STORAGE_ROOT / "indexes" / "xrefs.jsonl"
    script_suffix = ".java" if args.script_flavor == "java" else ".py"
    script_path = Path(__file__).resolve().parent / "ghidra_scripts" / ("ExportXrefs" + script_suffix)

    rows: list[dict[str, Any]] = []
    proc: subprocess.CompletedProcess[str] | None = None
    success = False
    skipped = False
    skip_reason = ""
    runner_error = ""

    missing: list[str] = []
    if not analyze:
        missing.append("analyzeHeadless")
    if not java or not Path(java).is_dir():
        missing.append("JAVA_HOME/openjdk@21")
    if not input_elf.is_file():
        missing.append(str(input_elf))
    if not script_path.is_file():
        missing.append(str(script_path))

    log_path.parent.mkdir(parents=True, exist_ok=True)
    if missing:
        skipped = True
        skip_reason = "missing_dependency:" + ",".join(missing)
        log_path.write_text("Missing required Ghidra xrefs dependency: " + ", ".join(missing), encoding="utf-8")
    else:
        write_jsonl(index_path, rows)
        project_dir.mkdir(parents=True, exist_ok=True)
        analysis_command = [
            analyze,
            str(project_dir),
            args.project_name,
            "-import",
            str(input_elf),
            "-overwrite",
            "-analysisTimeoutPerFile",
            str(args.analysis_timeout),
            "-scriptPath",
            str(script_path.parent),
            "-postScript",
            script_path.name,
            str(index_path),
            "-deleteProject",
        ]
        env = os.environ.copy()
        env["JAVA_HOME"] = java
        proc = subprocess.run(
            analysis_command,
            cwd=repo_root,
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )
        log_text = (proc.stdout or "") + "\n" + (proc.stderr or "")
        log_path.write_text(log_text, encoding="utf-8")
        if proc.returncode == 0:
            try:
                exported_count = summary_count(proc.stdout or "")
                if exported_count is None:
                    raise ValueError("Ghidra output did not contain an EXPORT_XREFS_SUMMARY line")
                rows = read_jsonl(index_path, args.limit)
                write_jsonl(index_path, rows)
                success = True
            except (OSError, ValueError, json.JSONDecodeError) as exc:
                runner_error = str(exc)
                with log_path.open("a", encoding="utf-8") as handle:
                    handle.write("\nRunner readback error: " + runner_error + "\n")

    command = [
        "python3",
        "toolpacks/gamecube-decomp/research/ghidra/runners/export_xrefs.py",
        "--repo-root",
        str(repo_root),
        "--analyze-headless",
        analyze or args.analyze_headless,
        "--script-flavor",
        args.script_flavor,
        "--project-name",
        args.project_name,
        "--analysis-timeout",
        str(args.analysis_timeout),
        "--limit",
        str(args.limit),
    ]
    stderr_excerpt = (proc.stderr or "") if proc else ""
    if runner_error:
        stderr_excerpt = (stderr_excerpt + "\n" + runner_error).strip()
    manifest = {
        "tool": "ghidra",
        "runner": "export_xrefs.py",
        "success": success,
        "skipped": skipped,
        "skip_reason": skip_reason,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "command": command,
        "repo_root": str(repo_root),
        "exit_code": proc.returncode if proc else None,
        "record_count": len(rows),
        "generated_artifacts": [str(log_path)] if log_path.exists() else [],
        "generated_indexes": [str(index_path)] if success and index_path.exists() else [],
        "dependencies": [
            analyze or args.analyze_headless or "analyzeHeadless",
            java or "openjdk@21",
            "build/GALE01/main.elf",
            str(script_path),
        ],
        "analyze_headless": analyze,
        "java_home": java,
        "stderr_excerpt": stderr_excerpt[-2000:],
        "log": str(log_path),
    }
    status_path.parent.mkdir(parents=True, exist_ok=True)
    status_path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(manifest, indent=2, sort_keys=True))
    return 0 if success or skipped else 1


if __name__ == "__main__":
    raise SystemExit(main())
