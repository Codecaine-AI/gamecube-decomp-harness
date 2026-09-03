#!/usr/bin/env python3
"""Report readiness for the tool-local m2c decompilation implementation."""

from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path
import shutil
import sys

sys.path.append(str(Path(__file__).resolve().parents[3] / "_shared"))
from toolpack_runtime import build_id, print_json, resolve_repo_root, tool_impl_root, tool_impl_status


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", help="Target project checkout root.")
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    args = parser.parse_args()

    repo_root = resolve_repo_root(args.repo_root)
    bid = build_id()
    payload = tool_impl_status(
        tool="m2c_decomp",
        scripts=("decomp.py",),
        repo_root=repo_root,
        required_paths=(f"build/{bid}/obj", f"build/{bid}/asm", "tools/m2ctx/m2ctx.py"),
        optional_paths=("build/ctx.c",),
        message="m2c is ready when tool-local m2c files, generated objects/asm, and m2ctx.py are present.",
    )
    payload["m2c_root"] = str(tool_impl_root() / "m2c")
    payload["m2c_license"] = "GPL-3.0"
    imports = {
        "elftools": importlib.util.find_spec("elftools") is not None,
        "pcpp": importlib.util.find_spec("pcpp") is not None,
    }
    uv = shutil.which("uv")
    payload["python_dependencies"] = {
        "imports": imports,
        "uv": uv,
        "status": "ok" if all(imports.values()) or uv else "missing",
        "message": "decomp.py declares pyelftools and pcpp in a PEP 723 block; uv can provision them when they are not installed in the current Python.",
    }
    if payload["python_dependencies"]["status"] != "ok":
        payload["status"] = "missing_prerequisite"
        payload["missing_python_modules"] = [name for name, ok in imports.items() if not ok]
    print_json(payload)


if __name__ == "__main__":
    main()
