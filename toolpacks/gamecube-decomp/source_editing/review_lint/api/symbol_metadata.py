#!/usr/bin/env python3
"""Look up symbol and declaration metadata in a Melee checkout.

Parses ``config/GALE01/symbols.txt`` into a symbol metadata table, including
addresses and sizes used by ownership-aware lint rules. It can also locate
canonical function/type declarations in the project's header trees. Parsed
symbols are cached as JSON under ``review_lint/cache/`` keyed by the
symbols.txt mtime+size. Missing metadata fails open: callers receive ``None``.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

sys.path.append(str(Path(__file__).resolve().parents[3] / "_shared"))
from toolpack_runtime import print_json
from search_index import tool_storage_root  # type: ignore

TOOL_ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = tool_storage_root(TOOL_ROOT) / "cache"
SYMBOLS_REL_PATH = Path("config") / "GALE01" / "symbols.txt"
CACHE_SCHEMA_VERSION = 2
DATA_SECTIONS = {".data", ".rodata", ".sdata", ".sdata2", ".bss", ".sbss"}
HEADER_ROOTS = ("src", "include")

SYMBOL_LINE_RE = re.compile(
    r"^\s*(?P<name>[^=\s]+)\s*=\s*"
    r"(?P<section>[A-Za-z0-9_.]+)\s*:\s*0[xX](?P<address>[0-9A-Fa-f]+)\s*;?"
)
TYPE_ATTR_RE = re.compile(r"(?:^|\s)type:(?P<type>[^\s;,]+)")
SIZE_ATTR_RE = re.compile(r"(?:^|\s)size:0[xX](?P<size>[0-9A-Fa-f]+)")

BUILTIN_TYPE_NAMES = {
    "bool", "char", "double", "float", "int", "long", "short", "signed",
    "unsigned", "void", "_Bool",
}
TYPE_QUALIFIERS = {
    "const", "volatile", "restrict", "signed", "unsigned", "long", "short",
    "struct", "union", "enum",
}


def _symbols_path(repo_root: Path) -> Path:
    return repo_root / SYMBOLS_REL_PATH


def _cache_path() -> Path:
    return CACHE_DIR / "symbols_metadata.json"


def parse_symbols(symbols_path: Path) -> dict[str, dict[str, Any]]:
    """Parse symbols.txt into ``{name: {section, type, address, size}}``."""

    symbols: dict[str, dict[str, Any]] = {}
    for line in symbols_path.read_text(encoding="utf-8", errors="replace").splitlines():
        match = SYMBOL_LINE_RE.match(line)
        if not match:
            continue
        comment = line.split("//", 1)[1] if "//" in line else ""
        type_match = TYPE_ATTR_RE.search(comment)
        size_match = SIZE_ATTR_RE.search(comment)
        symbols[match.group("name")] = {
            "section": match.group("section"),
            "type": type_match.group("type") if type_match else None,
            "address": int(match.group("address"), 16),
            "size": int(size_match.group("size"), 16) if size_match else None,
        }
    return symbols


def load_symbol_metadata(
    repo_root: Path | str,
) -> dict[str, dict[str, Any]]:
    """Load and cache the symbols.txt metadata for a Melee checkout."""

    symbols_path = _symbols_path(Path(repo_root))
    if not symbols_path.is_file():
        return {}
    stat = symbols_path.stat()
    cache_key = (
        f"v{CACHE_SCHEMA_VERSION}:{symbols_path}:{stat.st_mtime_ns}:{stat.st_size}"
    )
    cache_path = _cache_path()
    if cache_path.is_file():
        try:
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
            if cached.get("key") == cache_key:
                return cached["symbols"]
        except (json.JSONDecodeError, KeyError, OSError):
            pass
    symbols = parse_symbols(symbols_path)
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(
            json.dumps({"key": cache_key, "symbols": symbols}), encoding="utf-8"
        )
    except OSError:
        pass
    return symbols


def symbol_info(
    repo_root: Path | str, name: str
) -> dict[str, Any] | None:
    """Return a symbol's section/type metadata, or ``None`` when unknown."""

    return load_symbol_metadata(repo_root).get(name)


def symbol_info_at_address(
    repo_root: Path | str, address: int
) -> tuple[str, dict[str, Any]] | None:
    """Return the first symbol at ``address`` in symbols.txt order."""

    for name, info in load_symbol_metadata(repo_root).items():
        if info.get("address") == address:
            return name, info
    return None


def symbol_is_function(info: dict[str, Any] | None) -> bool:
    """Return whether metadata proves a symbol is a function."""

    return bool(
        info
        and (
            info.get("type") == "function"
            or (info.get("type") is None and info.get("section") in {".text", ".init"})
        )
    )


def symbol_is_data(info: dict[str, Any] | None) -> bool:
    """Return whether section/type metadata proves a symbol is data."""

    return bool(
        info
        and info.get("type") != "function"
        and info.get("section") in DATA_SECTIONS
    )


def _header_paths(repo_root: Path) -> list[Path]:
    paths: list[Path] = []
    for root_name in HEADER_ROOTS:
        root = repo_root / root_name
        if root.is_dir():
            paths.extend(root.rglob("*.h"))
    return sorted(set(paths), key=lambda path: path.as_posix())


def _strip_comments_and_strings(src: str) -> str:
    """Blank comments and literals while preserving offsets and line breaks."""

    out = list(src)
    index = 0
    while index < len(src):
        char = src[index]
        following = src[index + 1] if index + 1 < len(src) else ""
        if char == "/" and following == "/":
            end = src.find("\n", index)
            end = len(src) if end < 0 else end
            for offset in range(index, end):
                out[offset] = " "
            index = end
        elif char == "/" and following == "*":
            end = src.find("*/", index + 2)
            end = len(src) if end < 0 else end + 2
            for offset in range(index, end):
                if src[offset] != "\n":
                    out[offset] = " "
            index = end
        elif char in {'"', "'"}:
            quote = char
            out[index] = " "
            index += 1
            while index < len(src):
                if src[index] == "\\" and index + 1 < len(src):
                    if src[index] != "\n":
                        out[index] = " "
                    if src[index + 1] != "\n":
                        out[index + 1] = " "
                    index += 2
                    continue
                if src[index] == quote:
                    out[index] = " "
                    index += 1
                    break
                if src[index] != "\n":
                    out[index] = " "
                index += 1
        else:
            index += 1
    return "".join(out)


def _repo_relative(repo_root: Path, path: Path) -> str:
    try:
        return path.relative_to(repo_root).as_posix()
    except ValueError:
        return path.as_posix()


def find_function_declaration_headers(
    repo_root: Path | str, names: set[str]
) -> dict[str, str]:
    """Return one deterministic canonical header for each declared function."""

    root = Path(repo_root)
    remaining = set(names)
    found: dict[str, str] = {}
    if not remaining:
        return found
    for path in _header_paths(root):
        try:
            clean = _strip_comments_and_strings(
                path.read_text(encoding="utf-8", errors="replace")
            )
        except OSError:
            continue
        for name in sorted(remaining):
            # Header prototypes may span lines. Requiring a terminating
            # semicolon and excluding braces/typedef function pointers keeps
            # this from treating calls, definitions, and callbacks as owners.
            pattern = re.compile(
                rf"(?m)^[ \t]*(?!#)(?!typedef\b)[^;{{}}\n]*"
                rf"\b{re.escape(name)}\s*\([^;{{}}]*\)\s*;"
            )
            if pattern.search(clean):
                found[name] = _repo_relative(root, path)
        remaining.difference_update(found)
        if not remaining:
            break
    return found


def find_object_declaration_headers(
    repo_root: Path | str, names: set[str]
) -> dict[str, str]:
    """Return one deterministic header declaring each non-function symbol."""

    root = Path(repo_root)
    remaining = set(names)
    found: dict[str, str] = {}
    if not remaining:
        return found
    for path in _header_paths(root):
        try:
            clean = _strip_comments_and_strings(
                path.read_text(encoding="utf-8", errors="replace")
            )
        except OSError:
            continue
        for name in sorted(remaining):
            # Require a semicolon-terminated declaration with no call-shaped
            # suffix. This accepts arrays and ordinary extern objects while
            # excluding prototypes, macros, and definitions.
            pattern = re.compile(
                rf"(?m)^[ \t]*(?!#)(?!typedef\b)[^;{{}}\n]*"
                rf"\b{re.escape(name)}\b(?!\s*\()[^;{{}}]*;"
            )
            if pattern.search(clean):
                found[name] = _repo_relative(root, path)
        remaining.difference_update(found)
        if not remaining:
            break
    return found


def _canonical_type_name(type_text: str) -> str | None:
    tokens = re.findall(r"[A-Za-z_]\w*", type_text)
    candidates = [token for token in tokens if token not in TYPE_QUALIFIERS]
    return candidates[-1] if candidates else None


def find_type_declaration_headers(
    repo_root: Path | str, type_texts: set[str]
) -> dict[str, str]:
    """Return proof sources for simple typedef-alias target types."""

    root = Path(repo_root)
    canonical = {
        type_text: _canonical_type_name(type_text) for type_text in type_texts
    }
    found: dict[str, str] = {
        type_text: "C built-in type"
        for type_text, name in canonical.items()
        if name in BUILTIN_TYPE_NAMES
    }
    remaining_names = {
        name for type_text, name in canonical.items()
        if type_text not in found and name is not None
    }
    if not remaining_names:
        return found
    name_sources: dict[str, str] = {}
    for path in _header_paths(root):
        try:
            clean = _strip_comments_and_strings(
                path.read_text(encoding="utf-8", errors="replace")
            )
        except OSError:
            continue
        for name in sorted(remaining_names - set(name_sources)):
            declared = re.search(
                rf"\b(?:struct|union|enum)\s+{re.escape(name)}\b", clean
            ) or re.search(
                rf"\btypedef\b[^;{{}}]*\b{re.escape(name)}\s*;", clean
            )
            if declared:
                name_sources[name] = _repo_relative(root, path)
        if remaining_names.issubset(name_sources):
            break
    for type_text, name in canonical.items():
        if name in name_sources:
            found[type_text] = name_sources[name]
    return found


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, help="Melee repo root.")
    parser.add_argument("--symbol", required=True, help="Symbol name to look up.")
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    args = parser.parse_args()

    repo_root = Path(args.repo).expanduser().resolve()
    info = symbol_info(repo_root, args.symbol)
    payload: dict[str, Any] = {
        "tool": "review_lint",
        "operation": "review_lint:symbol_metadata",
        "repo": str(repo_root),
        "symbol": args.symbol,
        "found": info is not None,
        "info": info,
    }
    print_json(payload)


if __name__ == "__main__":
    main()
