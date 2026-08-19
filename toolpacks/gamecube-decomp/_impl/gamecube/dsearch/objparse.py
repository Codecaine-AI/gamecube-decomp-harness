# Vendored from https://github.com/MarkMcCaskey/decomp-search at commit 586800f.
# License: MIT OR Apache-2.0.
# Local modifications: removed sibling lookup; added parse helper and obj-prefix source mapping.
"""Parse dtk target objects and progress metadata using only the stdlib."""

from __future__ import annotations

import json
import os
import re
import subprocess
import urllib.request
from pathlib import Path
from typing import Iterator

from .normalize import Function, Insn


_SYM = re.compile(r"^([0-9a-f]+) <(.+)>:")
_INSN = re.compile(
    r"^\s*([0-9a-f]+):\s+(?:[0-9a-f]{2} ){4}\s*([a-z0-9_.+-]+)\s*(.*?)\s*$"
)
_RELOC = re.compile(r"^\s*[0-9a-f]+:\s+(R_PPC_\S+)\s+(\S+)")


def find_objdump(project_root: Path) -> str:
    override = os.environ.get("DSEARCH_OBJDUMP")
    if override:
        return override
    candidate = project_root / "build" / "binutils" / "powerpc-eabi-objdump"
    if candidate.exists():
        return str(candidate)
    return "powerpc-eabi-objdump"


def load_report(source: str) -> dict[str, tuple[float, str]]:
    """Return ``{function_name: (fuzzy_match_percent, unit_name)}``."""
    if source.startswith(("http://", "https://")):
        with urllib.request.urlopen(source) as response:
            report = json.load(response)
    else:
        with Path(source).open("r", encoding="utf-8") as handle:
            report = json.load(handle)
    output: dict[str, tuple[float, str]] = {}
    for unit in report.get("units", []):
        if not isinstance(unit, dict):
            continue
        for function in unit.get("functions", []):
            if not isinstance(function, dict) or not function.get("name"):
                continue
            output[str(function["name"])] = (
                float(function.get("fuzzy_match_percent", 0.0)),
                str(unit.get("name") or "?"),
            )
    return output


def _parse_output(output: str, unit: str) -> Iterator[Function]:
    function: Function | None = None
    for line in output.splitlines():
        symbol_match = _SYM.match(line)
        if symbol_match:
            if function is not None and function.insns:
                yield function
            function = Function(name=symbol_match.group(2), unit=unit)
            continue
        if function is None:
            continue
        reloc_match = _RELOC.match(line)
        if reloc_match and function.insns:
            function.insns[-1].reloc = reloc_match.group(1).removeprefix("R_PPC_")
            continue
        insn_match = _INSN.match(line)
        if insn_match:
            function.insns.append(
                Insn(
                    addr=int(insn_match.group(1), 16),
                    mnemonic=insn_match.group(2),
                    operands=insn_match.group(3),
                )
            )
    if function is not None and function.insns:
        yield function


def parse_object(objdump: str, obj_path: Path, unit: str) -> Iterator[Function]:
    try:
        output = subprocess.run(
            [objdump, "-dr", str(obj_path)],
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    except subprocess.CalledProcessError:
        return
    yield from _parse_output(output, unit)


def iter_units(project_root: Path, version: str) -> Iterator[tuple[Path, str]]:
    """Yield only target objects whose build-relative path contains ``obj``."""
    build_root = project_root / "build" / version
    if not build_root.is_dir():
        raise FileNotFoundError(f"no build dir at {build_root}")
    found = False
    for obj_path in sorted(build_root.rglob("*.o")):
        relative = obj_path.relative_to(build_root)
        if "obj" not in relative.parts:
            continue
        found = True
        yield obj_path, str(relative)
    if not found:
        raise FileNotFoundError(f"no target objects under {build_root}")


def find_source_file(project_root: Path, unit: str) -> str | None:
    """Best-effort map from an object unit name to a C or C++ source path."""
    stem = unit.removesuffix(".o")
    parts = Path(stem).parts
    if "obj" in parts:
        stem = str(Path(*parts[parts.index("obj") + 1 :]))
    for base in ("src", "source", ""):
        for extension in (".c", ".cpp"):
            path = project_root / base / f"{stem}{extension}"
            if path.exists():
                return str(path.relative_to(project_root))
    return None
