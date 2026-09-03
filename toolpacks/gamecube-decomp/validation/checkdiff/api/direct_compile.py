#!/usr/bin/env python3
"""Directly compile one function's translation unit with the exact MWCC rule."""

from __future__ import annotations

import argparse
from pathlib import Path
import shutil
import sys
from typing import Any
from uuid import uuid4

sys.path.append(str(Path(__file__).resolve().parents[3] / "_shared"))
from toolpack_runtime import build_id, captured_stdio, import_tool_module, print_json, resolve_repo_root


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", help="Target project checkout root.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--function", help="Function symbol whose owning translation unit should compile.")
    group.add_argument("--unit", help="Unit path without src/ prefix or .c suffix, for example melee/it/items/itkinoko.")
    parser.add_argument("--keep-object", action="store_true", help="Keep the temporary object alive after the API exits.")
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    args = parser.parse_args()

    repo_root = resolve_repo_root(args.repo_root)
    payload: dict[str, Any] = {
        "operation": "checkdiff:direct_compile",
        "repo_root": str(repo_root),
        "function": args.function,
        "unit": args.unit,
        "keep_object": bool(args.keep_object),
    }
    try:
        ninja_compile = import_tool_module("ninja_compile", repo_root)
        unit = args.unit or ninja_compile.find_unit_for_function(args.function)
        if not unit:
            payload.update({"status": "function_not_found", "message": f"Function was not found in build/{build_id()}/report.json."})
            print_json(payload)
            return
        with captured_stdio() as (stdout, stderr):
            compiled = ninja_compile.direct_compile(unit)
        payload.update({"unit": unit, "stdout": stdout.getvalue(), "stderr": stderr.getvalue()})
        if compiled is None:
            payload.update({"status": "compile_failed", "object_path": None})
        else:
            object_path = compiled.obj
            if args.keep_object:
                keep_dir = repo_root / "build" / "orchestrator-direct-compile"
                keep_dir.mkdir(parents=True, exist_ok=True)
                unit_label = unit.replace("/", "_").replace("\\", "_")
                object_path = keep_dir / f"{unit_label}-{uuid4().hex[:8]}.o"
                shutil.copy2(compiled.obj, object_path)
            payload.update({"status": "ok", "object_path": str(object_path), "object_exists": object_path.exists()})
            compiled.tmpdir.cleanup()
            payload["object_exists_after_cleanup"] = object_path.exists()
    except Exception as error:  # noqa: BLE001 - API boundary should report every bridge failure.
        payload.update({"status": "tool_impl_error", "error": str(error)})
    print_json(payload)


if __name__ == "__main__":
    main()
