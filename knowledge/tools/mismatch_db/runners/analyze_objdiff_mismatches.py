#!/usr/bin/env python3
"""Run a narrow objdiff analysis and cache mismatch evidence."""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


TOOL_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_REPO_ROOT = PACKAGE_ROOT.parent


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run objdiff-cli for an imperfect function and summarize mismatch evidence.")
    parser.add_argument("--repo-root", type=Path, default=DEFAULT_REPO_ROOT)
    parser.add_argument("--unit", default="", help="Objdiff unit name. Defaults to the first imperfect function in report.json.")
    parser.add_argument("--symbol", default="", help="Function symbol. Defaults to the first imperfect function in report.json.")
    return parser.parse_args()


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def choose_target(repo_root: Path, unit: str, symbol: str) -> dict[str, Any]:
    if unit and symbol:
        return {"unit": unit, "symbol": symbol, "source_path": "", "fuzzy_match_percent": None}
    report = read_json(repo_root / "build" / "GALE01" / "report.json", {})
    for unit_row in report.get("units") or []:
        if not isinstance(unit_row, dict):
            continue
        unit_name = str(unit_row.get("name") or "")
        unit_meta = unit_row.get("metadata") if isinstance(unit_row.get("metadata"), dict) else {}
        for fn in unit_row.get("functions") or []:
            if not isinstance(fn, dict):
                continue
            try:
                fuzzy = float(fn.get("fuzzy_match_percent") or 100)
            except (TypeError, ValueError):
                fuzzy = 100.0
            if fuzzy < 100:
                return {
                    "unit": unit_name,
                    "symbol": str(fn.get("name") or ""),
                    "source_path": str(unit_meta.get("source_path") or ""),
                    "fuzzy_match_percent": fuzzy,
                }
    raise RuntimeError("No imperfect function found in build/GALE01/report.json; pass --unit and --symbol explicitly.")


def run_objdiff(repo_root: Path, target: dict[str, Any], output_path: Path) -> subprocess.CompletedProcess[str]:
    objdiff = repo_root / "build" / "tools" / "objdiff-cli"
    command = [
        str(objdiff),
        "diff",
        "-p",
        str(repo_root),
        "-u",
        str(target["unit"]),
        str(target["symbol"]),
        "--format",
        "json-pretty",
        "-o",
        str(output_path),
    ]
    return subprocess.run(command, cwd=repo_root, text=True, capture_output=True, check=False)


def symbol_summary(side: dict[str, Any], symbol: str) -> dict[str, Any]:
    for row in side.get("symbols") or []:
        if isinstance(row, dict) and row.get("name") == symbol:
            instructions = row.get("instructions") if isinstance(row.get("instructions"), list) else []
            first_instruction = ""
            for instruction_row in instructions:
                formatted = (((instruction_row or {}).get("instruction") or {}).get("formatted") if isinstance(instruction_row, dict) else "")
                if formatted:
                    first_instruction = str(formatted)
                    break
            return {
                "name": row.get("name"),
                "match_percent": row.get("match_percent"),
                "size": row.get("size"),
                "instruction_count": len(instructions),
                "first_instruction": first_instruction,
            }
    return {}


def low_match_sections(side: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for section in side.get("sections") or []:
        if not isinstance(section, dict):
            continue
        match = section.get("match_percent")
        if match is None:
            continue
        rows.append(
            {
                "name": section.get("name"),
                "kind": section.get("kind"),
                "match_percent": match,
                "size": section.get("size"),
                "data_diff_count": len(section.get("data_diff") or []),
                "reloc_diff_count": len(section.get("reloc_diff") or []),
            }
        )
    rows.sort(key=lambda row: float(row.get("match_percent") or 100))
    return rows[:8]


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True))
            handle.write("\n")


def main() -> int:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    target = choose_target(repo_root, args.unit, args.symbol)
    safe_symbol = str(target["symbol"]).replace("/", "_")
    diff_path = TOOL_ROOT / "cache" / f"objdiff_{safe_symbol}.json"
    proc = run_objdiff(repo_root, target, diff_path)
    success = proc.returncode == 0 and diff_path.exists()
    rows: list[dict[str, Any]] = []
    if success:
        diff = read_json(diff_path, {})
        left = diff.get("left") if isinstance(diff.get("left"), dict) else {}
        right = diff.get("right") if isinstance(diff.get("right"), dict) else {}
        left_symbol = symbol_summary(left, str(target["symbol"]))
        right_symbol = symbol_summary(right, str(target["symbol"]))
        rows.append(
            {
                "id": f"objdiff_mismatch:{target['unit']}:{target['symbol']}",
                "kind": "objdiff_mismatch_live",
                "title": f"Objdiff mismatch: {target['symbol']}",
                "symbol": target["symbol"],
                "unit": target["unit"],
                "source_path": target.get("source_path") or "",
                "summary": (
                    f"{target['symbol']} in {target['unit']} diffed with objdiff-cli; "
                    f"left match {left_symbol.get('match_percent')} right match {right_symbol.get('match_percent')}."
                ),
                "text": " ".join(
                    [
                        str(target["symbol"]),
                        str(target["unit"]),
                        str(target.get("source_path") or ""),
                        json.dumps(left_symbol, sort_keys=True),
                        json.dumps(right_symbol, sort_keys=True),
                        json.dumps(low_match_sections(left), sort_keys=True),
                    ]
                ),
                "evidence_ref": str(diff_path),
                "payload": {
                    "target": target,
                    "left_symbol": left_symbol,
                    "right_symbol": right_symbol,
                    "left_low_match_sections": low_match_sections(left),
                    "right_low_match_sections": low_match_sections(right),
                    "command_stdout": proc.stdout.strip(),
                    "command_stderr": proc.stderr.strip(),
                },
            }
        )
    index_path = TOOL_ROOT / "indexes" / "objdiff_mismatches.jsonl"
    write_jsonl(index_path, rows)
    manifest = {
        "tool": "mismatch_db",
        "runner": "analyze_objdiff_mismatches.py",
        "success": success and bool(rows),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "command": ["python3", "knowledge/tools/mismatch_db/runners/analyze_objdiff_mismatches.py", "--repo-root", str(repo_root)],
        "repo_root": str(repo_root),
        "target": target,
        "exit_code": proc.returncode,
        "stdout": proc.stdout.strip(),
        "stderr": proc.stderr.strip(),
        "record_count": len(rows),
        "generated_artifacts": [str(diff_path)] if diff_path.exists() else [],
        "generated_indexes": [str(index_path)] if index_path.exists() else [],
        "dependencies": ["build/tools/objdiff-cli", "objdiff.json", "build/GALE01/report.json"],
    }
    status_path = TOOL_ROOT / "cache" / "runner_status.json"
    status_path.parent.mkdir(parents=True, exist_ok=True)
    status_path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(manifest, indent=2, sort_keys=True))
    return 0 if manifest["success"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
