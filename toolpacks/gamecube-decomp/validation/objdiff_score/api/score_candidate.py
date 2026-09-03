#!/usr/bin/env python3
"""Score a candidate object with objdiff-cli for one function."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys
from typing import Any

sys.path.append(str(Path(__file__).resolve().parents[3] / "_shared"))
from toolpack_runtime import build_id, clamp_int, clip, tool_env, import_tool_module, print_json, resolve_repo_root


def parse_score_line(line: str) -> dict[str, Any]:
    """Parse the objdiff score-server response line."""

    parts = line.split()
    if not parts:
        return {"status": "empty_score_line", "raw_line": line}
    if parts[0] == "ERR":
        return {"status": "score_error", "raw_line": line}
    payload: dict[str, Any] = {"status": "ok", "raw_score": int(parts[0]), "code_hash": parts[1] if len(parts) > 1 else None}
    if len(parts) >= 5:
        payload.update({"hard": int(parts[2]), "regswap": int(parts[3]), "stack": int(parts[4])})
    return payload


def resolve_candidate_object(value: str, repo_root: Path) -> Path:
    """Resolve candidate paths passed as absolute, cwd-relative, or repo-relative."""

    candidate = Path(value).expanduser()
    if candidate.is_absolute():
        return candidate.resolve()
    if candidate.exists():
        return candidate.resolve()
    return (repo_root / candidate).resolve()


def symbol_match_percent(diff_json: str, function: str) -> float | None:
    """Extract one symbol's match percent from objdiff-cli JSON output."""

    try:
        payload = json.loads(diff_json)
    except json.JSONDecodeError:
        return None
    for side_name in ("left", "right"):
        side = payload.get(side_name)
        if not isinstance(side, dict):
            continue
        symbols = side.get("symbols")
        if not isinstance(symbols, list):
            continue
        for symbol in symbols:
            if not isinstance(symbol, dict) or symbol.get("name") != function:
                continue
            percent = symbol.get("match_percent")
            if isinstance(percent, (int, float)):
                return float(percent)
    return None


def percent_diff(objdiff_cli: str, target: Path, candidate: Path, function: str, repo_root: Path, timeout: int, strict: bool = False) -> dict[str, Any]:
    """Run objdiff JSON output as supplemental match-percent evidence.

    Strict mode scores like the official runner/report pipeline. The relaxed
    mode ignores data-relocation symbol diffs and can report 100% while the
    official score is still below exact, so the canonical score must come from
    the strict run.
    """

    command = [
        objdiff_cli,
        "diff",
        "--format",
        "json",
        "--output",
        "-",
    ]
    if not strict:
        command += ["-c", "functionRelocDiffs=data_value"]
    command += [
        "-1",
        str(target),
        "-2",
        str(candidate),
        function,
    ]
    result = subprocess.run(command, cwd=repo_root, env=tool_env(repo_root), capture_output=True, text=True, timeout=timeout, check=False)
    return {
        "command": command,
        "exit_code": result.returncode,
        "match_percent": symbol_match_percent(result.stdout, function) if result.returncode == 0 else None,
        "stdout": clip(result.stdout, 12_000),
        "stderr": clip(result.stderr, 12_000),
    }


def score_from_percent(match_percent: float | None, relaxed_percent: float | None = None) -> dict[str, Any]:
    if match_percent is None:
        return {"status": "missing_match_percent"}
    payload: dict[str, Any] = {
        "status": "ok",
        "match_percent": match_percent,
        "raw_score": max(0, int(round((100.0 - match_percent) * 1_000_000))),
        "breakdown": "derived_from_strict_objdiff_json_match_percent",
    }
    if relaxed_percent is not None and relaxed_percent >= 99.99999 > match_percent:
        payload["note"] = (
            "Instructions match under relaxed data-reloc scoring, but relocation/data "
            "references still differ; the official score is the strict match_percent."
        )
        payload["relaxed_match_percent"] = relaxed_percent
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", help="Target project checkout root.")
    parser.add_argument("--function", required=True, help="Function symbol to score.")
    parser.add_argument("--candidate-object", required=True, help="Candidate object path.")
    parser.add_argument("--unit", help="Unit path without main/ prefix or .o suffix.")
    parser.add_argument("--timeout-seconds", type=int, default=60, help="Maximum runtime for score/diff commands.")
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    args = parser.parse_args()

    repo_root = resolve_repo_root(args.repo_root)
    timeout = clamp_int(args.timeout_seconds, default=60, minimum=5, maximum=300)
    candidate = resolve_candidate_object(args.candidate_object, repo_root)

    payload: dict[str, Any] = {
        "operation": "objdiff_score:score_candidate",
        "repo_root": str(repo_root),
        "function": args.function,
        "candidate_object_input": args.candidate_object,
        "candidate_object": str(candidate),
    }
    if not candidate.exists():
        payload.update({"status": "candidate_object_not_found"})
        print_json(payload)
        return

    try:
        ninja_compile = import_tool_module("ninja_compile", repo_root)
        objdiff_path = import_tool_module("objdiff_path", repo_root)
        unit = args.unit or ninja_compile.find_unit_for_function(args.function)
        if not unit:
            payload.update({"status": "function_not_found", "message": f"Function was not found in build/{build_id()}/report.json."})
            print_json(payload)
            return
        target = repo_root / "build" / build_id() / "obj" / f"{unit}.o"
        if not target.exists():
            payload.update({"status": "target_object_not_found", "unit": unit, "target_object": str(target)})
            print_json(payload)
            return
        cli = objdiff_path.objdiff_cli()
        strict_diff = percent_diff(cli, target, candidate, args.function, repo_root, timeout, strict=True)
        diff = percent_diff(cli, target, candidate, args.function, repo_root, timeout)
        score = score_from_percent(strict_diff.get("match_percent"), diff.get("match_percent"))
        payload.update(
            {
                "status": "ok" if strict_diff["exit_code"] == 0 and score["status"] == "ok" else "diff_failed",
                "unit": unit,
                "target_object": str(target),
                "command": strict_diff["command"],
                "score": score,
                "percent_diff": diff,
                "strict_percent_diff": {key: strict_diff[key] for key in ("command", "exit_code", "match_percent")},
            }
        )
    except subprocess.TimeoutExpired as error:
        payload.update({"status": "timed_out", "error": str(error), "timeout_seconds": timeout})
    except Exception as error:  # noqa: BLE001 - API boundary should report every scoring failure.
        payload.update({"status": "tool_impl_error", "error": str(error)})
    print_json(payload)


if __name__ == "__main__":
    main()
