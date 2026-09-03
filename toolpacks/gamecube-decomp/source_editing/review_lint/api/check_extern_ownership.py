#!/usr/bin/env python3
"""Evaluate whether a TU owns the data behind an address-style extern.

Parses ``config/GALE01/splits.txt`` from the melee repo into per-TU section
address ranges and answers "does TU X own address Y?". A newly added extern
whose encoded address falls inside the declaring TU's own data section
ranges is the extern-to-dodge-data-ordering cheat by definition; an address
owned by another TU is a legitimate cross-TU reference.

The parsed splits table is cached as JSON under ``review_lint/cache/`` keyed
by the splits.txt mtime+size.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

sys.path.append(str(Path(__file__).resolve().parents[3] / "_shared"))
from toolpack_runtime import build_id, print_json
from search_index import tool_storage_root  # type: ignore

TOOL_ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = tool_storage_root(TOOL_ROOT) / "cache"
SPLITS_REL_PATH = Path("config") / build_id() / "splits.txt"

# Sections that hold a TU's own data (the targets of literal-anchoring externs).
DATA_SECTIONS = {".data", ".sdata", ".sdata2", ".rodata", ".bss", ".sbss"}

TU_LINE_RE = re.compile(r"^(\S.*?):\s*$")
SECTION_LINE_RE = re.compile(
    r"^\s+(?P<section>\.\w+)\s+.*?start:0x(?P<start>[0-9A-Fa-f]+)\s+end:0x(?P<end>[0-9A-Fa-f]+)"
)


def _splits_path(repo_root: Path) -> Path:
    return repo_root / SPLITS_REL_PATH


def _cache_path() -> Path:
    return CACHE_DIR / "splits_ranges.json"


def parse_splits(splits_path: Path) -> dict[str, dict[str, list[list[int]]]]:
    """Parse splits.txt into {tu_path -> {section -> [[start, end], ...]}}."""

    tus: dict[str, dict[str, list[list[int]]]] = {}
    current: str | None = None
    for line in splits_path.read_text(encoding="utf-8", errors="replace").splitlines():
        tu_match = TU_LINE_RE.match(line)
        if tu_match:
            name = tu_match.group(1)
            # The "Sections:" header block carries no start/end addresses and
            # is filtered naturally, but skip it for clarity.
            current = None if name == "Sections" else name
            if current is not None:
                tus.setdefault(current, {})
            continue
        if current is None:
            continue
        section_match = SECTION_LINE_RE.match(line)
        if section_match:
            section = section_match.group("section")
            start = int(section_match.group("start"), 16)
            end = int(section_match.group("end"), 16)
            tus[current].setdefault(section, []).append([start, end])
    return tus


def load_splits_ranges(repo_root: Path) -> dict[str, dict[str, list[list[int]]]]:
    """Load (and cache) per-TU section ranges for the given melee repo."""

    splits_path = _splits_path(repo_root)
    if not splits_path.is_file():
        return {}
    stat = splits_path.stat()
    cache_key = f"{splits_path}:{stat.st_mtime_ns}:{stat.st_size}"
    cache_path = _cache_path()
    if cache_path.is_file():
        try:
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
            if cached.get("key") == cache_key:
                return cached["tus"]
        except (json.JSONDecodeError, KeyError, OSError):
            pass
    tus = parse_splits(splits_path)
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(
            json.dumps({"key": cache_key, "tus": tus}), encoding="utf-8"
        )
    except OSError:
        pass
    return tus


def normalize_tu_path(path: str) -> str:
    """Map a diff path (src/melee/gm/gm_1832.c) to a splits.txt TU path."""

    normalized = path.replace("\\", "/").lstrip("./")
    if normalized.startswith("src/"):
        normalized = normalized[len("src/"):]
    return normalized


def tu_section_ranges(
    repo_root: Path | str, tu_rel_path: str
) -> dict[str, list[list[int]]]:
    """Return the data-section ranges owned by a TU (empty if unknown)."""

    tus = load_splits_ranges(Path(repo_root))
    return tus.get(normalize_tu_path(tu_rel_path), {})


def tu_owns_address(repo_root: Path | str, tu_rel_path: str, address: int) -> bool:
    """Return True when address falls in the TU's own data section ranges."""

    sections = tu_section_ranges(repo_root, tu_rel_path)
    for section, ranges in sections.items():
        if section not in DATA_SECTIONS:
            continue
        for start, end in ranges:
            if start <= address < end:
                return True
    return False


def tu_address_relation(
    repo_root: Path | str,
    tu_rel_path: str,
    address: int,
    section: str,
    size: int | None = None,
) -> dict[str, Any] | None:
    """Return proof that data lies inside or exactly adjacent to a TU range.

    Splits use half-open ranges. ``address == end`` is therefore the first
    symbol just past the TU; when size is known, ``address + size == start``
    proves exact adjacency on the other side. No fuzzy distance is used.
    """

    if section not in DATA_SECTIONS:
        return None
    ranges = tu_section_ranges(repo_root, tu_rel_path).get(section, [])
    for start, end in ranges:
        relation: str | None = None
        boundary: str | None = None
        if start <= address < end:
            relation = "inside"
        elif address == end:
            relation = "adjacent"
            boundary = "after_end"
        elif size is not None and address + size == start:
            relation = "adjacent"
            boundary = "before_start"
        if relation is not None:
            return {
                "relation": relation,
                "boundary": boundary,
                "section": section,
                "range": [start, end],
            }
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, help="Melee repo root.")
    parser.add_argument(
        "--file", required=True, help="Repo-relative TU path (src/... or melee/...)."
    )
    parser.add_argument(
        "--address", required=True, help="Address to check (e.g. 0x804DA60C)."
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    args = parser.parse_args()

    repo_root = Path(args.repo).expanduser().resolve()
    address = int(args.address, 16)
    sections = tu_section_ranges(repo_root, args.file)
    owns = tu_owns_address(repo_root, args.file, address)
    payload: dict[str, Any] = {
        "tool": "review_lint",
        "operation": "review_lint:check_extern_ownership",
        "repo": str(repo_root),
        "file": args.file,
        "tu": normalize_tu_path(args.file),
        "address": f"0x{address:08X}",
        "owns": owns,
        "sections": {
            section: [[f"0x{start:08X}", f"0x{end:08X}"] for start, end in ranges]
            for section, ranges in sections.items()
        },
    }
    print_json(payload)


if __name__ == "__main__":
    main()
