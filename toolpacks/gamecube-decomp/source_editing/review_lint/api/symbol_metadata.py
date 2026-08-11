#!/usr/bin/env python3
"""Look up section/type metadata for symbols in a Melee checkout.

Parses ``config/GALE01/symbols.txt`` into a symbol metadata table. The parsed
table is cached as JSON under ``review_lint/cache/`` keyed by the symbols.txt
mtime+size. Missing metadata fails open: callers receive ``None``.
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

SYMBOL_LINE_RE = re.compile(
    r"^\s*(?P<name>[^=\s]+)\s*=\s*"
    r"(?P<section>[A-Za-z0-9_.]+)\s*:\s*0[xX][0-9A-Fa-f]+\s*;?"
)
TYPE_ATTR_RE = re.compile(r"(?:^|\s)type:(?P<type>[^\s;,]+)")


def _symbols_path(repo_root: Path) -> Path:
    return repo_root / SYMBOLS_REL_PATH


def _cache_path() -> Path:
    return CACHE_DIR / "symbols_metadata.json"


def parse_symbols(symbols_path: Path) -> dict[str, dict[str, str | None]]:
    """Parse symbols.txt into ``{name: {section, type}}`` metadata."""

    symbols: dict[str, dict[str, str | None]] = {}
    for line in symbols_path.read_text(encoding="utf-8", errors="replace").splitlines():
        match = SYMBOL_LINE_RE.match(line)
        if not match:
            continue
        comment = line.split("//", 1)[1] if "//" in line else ""
        type_match = TYPE_ATTR_RE.search(comment)
        symbols[match.group("name")] = {
            "section": match.group("section"),
            "type": type_match.group("type") if type_match else None,
        }
    return symbols


def load_symbol_metadata(
    repo_root: Path | str,
) -> dict[str, dict[str, str | None]]:
    """Load and cache the symbols.txt metadata for a Melee checkout."""

    symbols_path = _symbols_path(Path(repo_root))
    if not symbols_path.is_file():
        return {}
    stat = symbols_path.stat()
    cache_key = f"{symbols_path}:{stat.st_mtime_ns}:{stat.st_size}"
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
) -> dict[str, str | None] | None:
    """Return a symbol's section/type metadata, or ``None`` when unknown."""

    return load_symbol_metadata(repo_root).get(name)


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
