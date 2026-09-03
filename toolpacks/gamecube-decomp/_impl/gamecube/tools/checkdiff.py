#!/usr/bin/env python3
"""
Helper script for LLM-driven decompiling. Fixes any missing imports, rebuilds,
and runs objdiff-cli on the specified function.

Usage:
  tools/checkdiff.py <function_name>                   # focused diff
  tools/checkdiff.py --full-diff <function_name>       # don't hide matching lines
  tools/checkdiff.py --summary <function_name> [...]   # PASS/FAIL per function

Without --summary, exactly one function must be given and the diff is printed.
By default, runs of 5+ matching lines are collapsed into a placeholder, with
1 line of context kept adjacent to diff lines. Pass --full-diff to disable.

With --summary, one or more functions may be given, and each gets a one-line
result:
  function_name: PASS
  function_name: FAIL (87.45%)
"""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Optional

from objdiff_path import objdiff_cli
from ninja_compile import (
    CompiledObject,
    direct_compile,
    find_unit_for_function,
)

# Project checkout root: explicit override, then Claude Code's project dir,
# then assume this script lives at <melee>/tools/.
from project_root import build_id, resolve_root

ROOT = resolve_root()
BUILD_ID = build_id()
SRC_ROOT = ROOT / "src"
# Sibling implementation scripts live next to this one, not in the melee tree.
TOOLS = Path(__file__).resolve().parent


# Observed MWCC 1.2.5n diagnostics for missing declarations. The third form is
# also present in the compiler's diagnostic string table and covers constants
# whose declarations are missing from the current include set.
MWCC_MISSING_SYMBOL_PATTERNS = (
    re.compile(r"\bfunction has no prototype\b", re.IGNORECASE),
    re.compile(r"\bundefined identifier\b", re.IGNORECASE),
    re.compile(r"\bundefined symbol\b", re.IGNORECASE),
)
EXACT_MATCH_PERCENT = 99.99999


def needs_include_diagnosis(compiler_output: str) -> bool:
    """Whether MWCC failed in a way fix_includes.py can potentially repair."""
    return any(pattern.search(compiler_output) for pattern in MWCC_MISSING_SYMBOL_PATTERNS)


def _emit_compile_output(stdout: str, stderr: str) -> None:
    """Replay direct_compile output on the streams where callers expect it."""
    sys.stdout.write(stdout)
    sys.stderr.write(stderr)


def build_unit(obj_path: str) -> Optional[CompiledObject]:
    """Compile a TU, diagnosing includes only for MWCC missing-symbol errors."""
    c_file = SRC_ROOT / f"{obj_path}.c"

    compile_stdout = io.StringIO()
    compile_stderr = io.StringIO()
    with contextlib.redirect_stdout(compile_stdout), contextlib.redirect_stderr(compile_stderr):
        compiled = direct_compile(obj_path)
    if compiled is not None:
        _emit_compile_output(compile_stdout.getvalue(), compile_stderr.getvalue())
        return compiled

    compiler_output = compile_stdout.getvalue() + compile_stderr.getvalue()
    if not needs_include_diagnosis(compiler_output):
        _emit_compile_output(compile_stdout.getvalue(), compile_stderr.getvalue())
        return None

    fix_includes = TOOLS / "fix_includes.py"
    result = subprocess.run(
        [sys.executable, str(fix_includes), str(c_file)],
        cwd=ROOT,
        capture_output=True,
    )
    if result.returncode != 0:
        print(f"fix_includes.py failed:", file=sys.stderr)
        print(result.stderr.decode(), file=sys.stderr)
        return None

    # The first failure is superseded by the include diagnosis. If the fixer
    # found nothing, this retry emits the same compile diagnostics as before.
    return direct_compile(obj_path)


def run_diff(
    obj_path: str,
    candidate_obj: Path,
    func_name: str,
    capture: bool = False,
    strict: bool = True,
):
    """Run objdiff-cli. Returns CompletedProcess.

    Strict mode (the default) scores exactly like the official runner/report
    pipeline. Callers that specifically need the instruction-focused view can
    pass strict=False to ignore data-relocation symbol diffs.
    """
    ref_obj = f"./build/{BUILD_ID}/obj/{obj_path}.o"
    command = [
        objdiff_cli(), "diff",
        "--format", "json",
        "--output", "-",
    ]
    if not strict:
        command += ["-c", "functionRelocDiffs=data_value"]
    command += [
        "-1", ref_obj,
        "-2", str(candidate_obj),
        func_name,
    ]
    return subprocess.run(
        command,
        cwd=ROOT,
        capture_output=capture,
        text=capture,
    )


def verdict_line(func_name: str, strict_percent: Optional[float], relaxed_percent: Optional[float]) -> tuple[str, bool]:
    """One-line PASS/FAIL verdict driven by the strict (official) score."""
    if strict_percent is None:
        return f"{func_name}: ERROR (objdiff JSON did not include match_percent)", False
    passed = strict_percent >= EXACT_MATCH_PERCENT
    if passed:
        return f"{func_name}: PASS ({strict_percent:.5f}%)", True
    if relaxed_percent is not None and relaxed_percent >= EXACT_MATCH_PERCENT:
        return (
            f"{func_name}: FAIL ({strict_percent:.5f}% official; instructions match but "
            "relocation/data references still differ, so the official score is below exact)",
            False,
        )
    return f"{func_name}: FAIL ({strict_percent:.5f}%)", False


def symbol_match_percent(diff_json: str, func_name: str) -> Optional[float]:
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
            if not isinstance(symbol, dict) or symbol.get("name") != func_name:
                continue
            percent = symbol.get("match_percent")
            if isinstance(percent, (int, float)):
                return float(percent)
    return None


def first_diff_lines(diff_json: str, func_name: str, limit: int = 24) -> list[str]:
    """Return compact instruction/data-diff context for one symbol."""
    try:
        payload = json.loads(diff_json)
    except json.JSONDecodeError:
        return []
    lines: list[str] = []
    for side_name in ("left", "right"):
        side = payload.get(side_name)
        if not isinstance(side, dict):
            continue
        symbols = side.get("symbols")
        if not isinstance(symbols, list):
            continue
        for symbol in symbols:
            if not isinstance(symbol, dict) or symbol.get("name") != func_name:
                continue
            instructions = symbol.get("instructions")
            if isinstance(instructions, list):
                for entry in instructions:
                    if not isinstance(entry, dict):
                        continue
                    diff_kind = entry.get("diff_kind")
                    arg_diff = entry.get("arg_diff")
                    if not diff_kind and not arg_diff:
                        continue
                    instruction = entry.get("instruction")
                    formatted = instruction.get("formatted") if isinstance(instruction, dict) else None
                    address = instruction.get("address") if isinstance(instruction, dict) else None
                    label = f"{address}: " if address is not None else ""
                    lines.append(f"{side_name} {label}{diff_kind or 'ARG_DIFF'} {formatted or ''}".rstrip())
                    if len(lines) >= limit:
                        return lines
            data_diff = symbol.get("data_diff")
            if isinstance(data_diff, list):
                for entry in data_diff[:limit]:
                    if not isinstance(entry, dict):
                        continue
                    lines.append(f"{side_name} data {entry.get('kind', 'DIFF')} size={entry.get('size', '?')}")
                    if len(lines) >= limit:
                        return lines
    return lines


def resolve_functions(func_names: list[str]) -> dict[str, list[str]]:
    """Map function names to their translation units. Prints errors for unknown functions."""
    func_units: dict[str, list[str]] = {}
    for func_name in func_names:
        obj_path = find_unit_for_function(func_name)
        if obj_path is None:
            print(f"error: could not find function '{func_name}' in report.json", file=sys.stderr)
            continue
        func_units.setdefault(obj_path, []).append(func_name)
    return func_units


def build_units(func_units: dict[str, list[str]]) -> dict[str, CompiledObject]:
    """Compile each translation unit once. Returns compiled objects by path."""
    built: dict[str, CompiledObject] = {}
    for obj_path in func_units:
        compiled = build_unit(obj_path)
        if compiled is not None:
            built[obj_path] = compiled
    return built


MATCH_SKIP_THRESHOLD = 5
CONTEXT_LINES = 1


def is_matching_line(line: str) -> bool:
    """A two-column diff line that the diff tool considers matching (no marker
    char in column 0)."""
    if "|" not in line:
        return False
    return not line or line[0].isspace()


def collapse_matching(output: str) -> str:
    """Replace runs of `MATCH_SKIP_THRESHOLD`+ matching lines with a placeholder,
    keeping `CONTEXT_LINES` of context adjacent to diff lines."""
    lines = output.splitlines()
    result: list[str] = []
    buf: list[str] = []
    prev_diff = False

    def flush(next_diff: bool):
        nonlocal buf
        if len(buf) < MATCH_SKIP_THRESHOLD:
            result.extend(buf)
            buf = []
            return
        head = CONTEXT_LINES if prev_diff else 0
        tail = CONTEXT_LINES if next_diff else 0
        skipped = len(buf) - head - tail
        if skipped <= 0:
            result.extend(buf)
            buf = []
            return
        result.extend(buf[:head])
        result.append(f"... {skipped} matching lines skipped ...")
        if tail:
            result.extend(buf[-tail:])
        buf = []

    for line in lines:
        if is_matching_line(line):
            buf.append(line)
        else:
            is_diff = "|" in line
            flush(next_diff=is_diff)
            result.append(line)
            prev_diff = is_diff
    flush(next_diff=False)

    out = "\n".join(result)
    if output.endswith("\n"):
        out += "\n"
    return out


def check_single(func_name: str, full_diff: bool) -> int:
    """Check a single function, printing the full diff."""
    obj_path = find_unit_for_function(func_name)
    if obj_path is None:
        print(f"error: could not find function '{func_name}' in report.json", file=sys.stderr)
        return 1

    compiled = build_unit(obj_path)
    if compiled is None:
        return 1

    result = run_diff(obj_path, compiled.obj, func_name, capture=True)
    if result.stderr:
        print(result.stderr, file=sys.stderr, end="")
    if result.returncode != 0:
        print(result.stdout, end="")
        return result.returncode
    strict_percent = symbol_match_percent(result.stdout, func_name)
    relaxed_percent = None
    if strict_percent is not None and strict_percent < EXACT_MATCH_PERCENT:
        relaxed_result = run_diff(obj_path, compiled.obj, func_name, capture=True, strict=False)
        if relaxed_result.returncode == 0:
            relaxed_percent = symbol_match_percent(relaxed_result.stdout, func_name)
    line, passed = verdict_line(func_name, strict_percent, relaxed_percent)
    print(line)
    if strict_percent is None:
        return 1
    if full_diff:
        for diff_line in first_diff_lines(result.stdout, func_name):
            print(diff_line)
    return 0 if passed else 1


def check_multiple(func_names: list[str]) -> int:
    """Check multiple functions, printing OK/FAIL summary for each."""
    func_units = resolve_functions(func_names)
    if not func_units:
        return 1

    built = build_units(func_units)
    rc = 0

    for obj_path, funcs in func_units.items():
        compiled = built.get(obj_path)
        if compiled is None:
            for func_name in funcs:
                print(f"{func_name}: ERROR (compile failed)")
            rc = 1
            continue

        for func_name in funcs:
            result = run_diff(obj_path, compiled.obj, func_name, capture=True)
            strict_percent = symbol_match_percent(result.stdout, func_name) if result.returncode == 0 else None
            if strict_percent is None:
                relaxed_result = run_diff(obj_path, compiled.obj, func_name, capture=True, strict=False)
                label = "objdiff error" if relaxed_result.returncode != 0 else "unknown"
                print(f"{func_name}: ERROR ({label})")
                rc = 1
                continue
            relaxed_percent = None
            if strict_percent < EXACT_MATCH_PERCENT:
                relaxed_result = run_diff(obj_path, compiled.obj, func_name, capture=True, strict=False)
                if relaxed_result.returncode == 0:
                    relaxed_percent = symbol_match_percent(relaxed_result.stdout, func_name)
            line, passed = verdict_line(func_name, strict_percent, relaxed_percent)
            print(line if not passed else f"{func_name}: PASS")
            if not passed:
                rc = 1

    return rc


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-s", "--summary", action="store_true",
                    help="Print PASS/FAIL summary line per function instead of full diff")
    ap.add_argument("--full-diff", action="store_true",
                    help="Show every diff line, including matching ones (default: collapse runs of 5+)")
    ap.add_argument("functions", nargs="+", metavar="function", help="Function name(s)")
    args = ap.parse_args()

    if args.summary:
        return check_multiple(args.functions)

    if len(args.functions) != 1:
        ap.error("pass exactly one function without --summary, "
                 "or use --summary to get PASS/FAIL lines for multiple functions")
    return check_single(args.functions[0], full_diff=args.full_diff)


if __name__ == "__main__":
    raise SystemExit(main())
