#!/usr/bin/env python3
"""Run a real Ghidra headless probe when analyzeHeadless is available."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


TOOL_ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(TOOL_ROOT.parents[1] / "_shared"))
sys.path.append(str(TOOL_ROOT.parents[1] / "_impl" / "gamecube" / "tools"))
from search_index import package_root_for_tool, tool_storage_root  # type: ignore
from project_layout import get_project_layout  # type: ignore

PACKAGE_ROOT = package_root_for_tool(TOOL_ROOT)
TOOL_STORAGE_ROOT = tool_storage_root(TOOL_ROOT)
DEFAULT_REPO_ROOT = PACKAGE_ROOT.parent / "melee"


def resolve_input_elf(
    repo_root: Path, version: str, explicit: Path | None
) -> tuple[Path, Path]:
    if explicit is not None:
        return (repo_root / explicit).resolve(), explicit

    default = Path("build") / version / "main.elf"
    default_path = repo_root / default
    if default_path.is_file():
        return default_path, default

    candidates = sorted((repo_root / "build" / version).glob("*.elf"))
    if candidates:
        selected = candidates[0]
        return selected, selected.relative_to(repo_root)
    return default_path, default


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run analyzeHeadless against the selected project's ELF and cache Ghidra output.")
    parser.add_argument("--repo-root", type=Path, default=DEFAULT_REPO_ROOT)
    parser.add_argument("--input-elf", type=Path, help="Executable path, relative to the selected checkout unless absolute.")
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
    layout = get_project_layout(repo_root)
    input_elf, input_elf_arg = resolve_input_elf(
        repo_root, layout.version, args.input_elf
    )
    analyze = find_analyze_headless(args.analyze_headless)
    java = java_home()
    project_dir = TOOL_STORAGE_ROOT / "cache" / "ghidra_project"
    log_path = TOOL_STORAGE_ROOT / "cache" / "ghidra_headless_probe.log"
    index_path = TOOL_STORAGE_ROOT / "indexes" / "ghidra_headless_probe.jsonl"
    rows: list[dict[str, Any]] = []
    proc: subprocess.CompletedProcess[str] | None = None
    success = False
    skipped = False
    skip_reason = ""
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
                    "id": f"ghidra_headless_probe:{input_elf.name}",
                    "kind": "ghidra_headless_probe_live",
                    "title": f"Ghidra headless import smoke: {input_elf.name}",
                    "summary": f"analyzeHeadless imported {input_elf_arg.as_posix()} successfully for a bounded local smoke.",
                    "text": f"ghidra analyzeHeadless {input_elf.name} {input_elf} {args.project_name}",
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
        skipped = True
        skip_reason = "missing_dependency:" + ",".join(missing)
    write_jsonl(index_path, rows)
    command = [
        "python3",
        "toolpacks/gamecube-decomp/research/ghidra/runners/run_headless_probe.py",
        "--repo-root",
        str(repo_root),
    ]
    if args.input_elf is not None:
        command.extend(("--input-elf", str(args.input_elf)))
    command.extend(("--analyze-headless", analyze))
    manifest = {
        "tool": "ghidra",
        "runner": "run_headless_probe.py",
        "success": success and bool(rows),
        "skipped": skipped,
        "skip_reason": skip_reason,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "command": command,
        "repo_root": str(repo_root),
        "exit_code": proc.returncode if proc else None,
        "record_count": len(rows),
        "generated_artifacts": [str(log_path)] if log_path.exists() else [],
        "generated_indexes": [str(index_path)] if index_path.exists() else [],
        "dependencies": [
            analyze or "analyzeHeadless",
            java or "openjdk@21",
            input_elf_arg.as_posix(),
        ],
        "analyze_headless": analyze,
        "java_home": java,
        "stderr_excerpt": (proc.stderr if proc else "")[-2000:] if proc else "",
    }
    status_path = TOOL_STORAGE_ROOT / "cache" / "runner_status.json"
    status_path.parent.mkdir(parents=True, exist_ok=True)
    status_path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(manifest, indent=2, sort_keys=True))
    return 0 if manifest["success"] or skipped else 1


if __name__ == "__main__":
    raise SystemExit(main())
