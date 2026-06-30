#!/usr/bin/env python3
"""Build searchable indexes for mirrored external decomp resources."""

from __future__ import annotations

import csv
import hashlib
import re
from html.parser import HTMLParser
from pathlib import Path


SCRIPT = Path(__file__).resolve()
for parent in SCRIPT.parents:
    if (parent / "configure.py").exists() and (parent / "config" / "GALE01").exists():
        ROOT = parent
        break
else:
    raise RuntimeError("Could not find repo root from external indexer path")

for parent in SCRIPT.parents:
    if parent.name == "decomp_resources":
        RESOURCE_DIR = parent
        break
else:
    raise RuntimeError("Could not find decomp_resources root from external indexer path")

EXTERNAL_DIR = RESOURCE_DIR / "external"


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_csv(path: Path, rows: list[dict[str, str]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def build_training_mode_map_index() -> None:
    map_path = EXTERNAL_DIR / "training_mode" / "GTME01.map"
    out_path = EXTERNAL_DIR / "training_mode" / "indexes" / "gtme01_map_symbols.csv"
    rows: list[dict[str, str]] = []
    section = ""
    line_re = re.compile(
        r"^([0-9A-Fa-f]{8})\s+([0-9A-Fa-f]{8})\s+([0-9A-Fa-f]{8})\s+(\S+)\s+(.+?)\s*$"
    )
    with map_path.open(encoding="utf-8", errors="replace") as handle:
        for line_num, raw_line in enumerate(handle, start=1):
            line = raw_line.strip()
            if not line:
                continue
            if line.endswith("section layout"):
                section = line.split()[0]
                continue
            match = line_re.match(line)
            if match is None:
                continue
            address, size, virtual_address, flags, name = match.groups()
            rows.append(
                {
                    "source_file": rel(map_path),
                    "line": str(line_num),
                    "section": section,
                    "address": f"0x{address.lower()}",
                    "size": f"0x{size.lower()}",
                    "virtual_address": f"0x{virtual_address.lower()}",
                    "flags": flags,
                    "name": name,
                    "is_placeholder": "true" if name.startswith("zz_") else "false",
                }
            )
    write_csv(
        out_path,
        rows,
        [
            "source_file",
            "line",
            "section",
            "address",
            "size",
            "virtual_address",
            "flags",
            "name",
            "is_placeholder",
        ],
    )
    print(f"Wrote {len(rows)} Training Mode map symbols")


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.skip_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript"}:
            self.skip_depth += 1
        if tag in {"p", "br", "li", "tr", "h1", "h2", "h3", "h4", "pre"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self.skip_depth:
            self.skip_depth -= 1
        if tag in {"p", "li", "tr", "h1", "h2", "h3", "h4", "pre"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self.skip_depth:
            return
        text = data.strip()
        if text:
            self.parts.append(text)

    def text(self) -> str:
        text = " ".join(self.parts)
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\s*\n\s*", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()


def build_tockdom_index() -> None:
    html_path = EXTERNAL_DIR / "tockdom" / "compiler.html"
    text_path = EXTERNAL_DIR / "tockdom" / "compiler.txt"
    out_path = EXTERNAL_DIR / "tockdom" / "indexes" / "compiler_page.csv"
    parser = TextExtractor()
    parser.feed(html_path.read_text(encoding="utf-8", errors="replace"))
    text = parser.text()
    text_path.write_text(text + "\n", encoding="utf-8")
    rows = [
        {
            "source_file": rel(html_path),
            "text_file": rel(text_path),
            "title": "Tockdom Compiler",
            "url": "https://wiki.tockdom.com/wiki/Compiler",
            "sha256": sha256(html_path),
            "word_count": str(len(text.split())),
            "text": text,
        }
    ]
    write_csv(
        out_path,
        rows,
        ["source_file", "text_file", "title", "url", "sha256", "word_count", "text"],
    )
    print("Wrote Tockdom compiler text index")


def scan_c_symbols(path: Path) -> tuple[list[dict[str, str]], dict[str, str]]:
    symbols: list[dict[str, str]] = []
    counts = {
        "defines": 0,
        "includes": 0,
        "typedefs": 0,
        "structs": 0,
        "enums": 0,
        "functions": 0,
    }
    define_re = re.compile(r"^\s*#\s*define\s+([A-Za-z_]\w*)")
    include_re = re.compile(r"^\s*#\s*include\s+[<\"]([^>\"]+)[>\"]")
    typedef_re = re.compile(r"\btypedef\b.*\b([A-Za-z_]\w*)\s*;")
    struct_re = re.compile(r"\bstruct\s+([A-Za-z_]\w*)")
    enum_re = re.compile(r"\benum\s+([A-Za-z_]\w*)")
    function_re = re.compile(r"^\s*(?:[A-Za-z_]\w*[\w\s\*\(\)]*?)\s+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*;")

    rel_header = rel(path)
    with path.open(encoding="utf-8", errors="replace") as handle:
        for line_num, line in enumerate(handle, start=1):
            stripped = line.strip()
            if not stripped or stripped.startswith("//") or stripped.startswith("*"):
                continue
            candidates: list[tuple[str, str]] = []
            if match := define_re.match(line):
                counts["defines"] += 1
                candidates.append(("define", match.group(1)))
            if match := include_re.match(line):
                counts["includes"] += 1
                candidates.append(("include", match.group(1)))
            if "typedef" in line and (match := typedef_re.search(line)):
                counts["typedefs"] += 1
                candidates.append(("typedef", match.group(1)))
            if match := struct_re.search(line):
                counts["structs"] += 1
                candidates.append(("struct", match.group(1)))
            if match := enum_re.search(line):
                counts["enums"] += 1
                candidates.append(("enum", match.group(1)))
            if (
                ";" in line
                and "(" in line
                and ")" in line
                and not stripped.startswith("#")
                and not stripped.startswith("typedef")
                and (match := function_re.match(line))
            ):
                name = match.group(1)
                if name not in {"if", "for", "while", "switch", "return"}:
                    counts["functions"] += 1
                    candidates.append(("function", name))
            for kind, name in candidates:
                symbols.append(
                    {
                        "header_path": rel_header,
                        "line": str(line_num),
                        "kind": kind,
                        "name": name,
                        "context": stripped,
                    }
                )
    return symbols, {key: str(value) for key, value in counts.items()}


def build_m_ex_indexes() -> None:
    include_dir = EXTERNAL_DIR / "m_ex" / "include"
    files_out = EXTERNAL_DIR / "m_ex" / "indexes" / "header_files.csv"
    symbols_out = EXTERNAL_DIR / "m_ex" / "indexes" / "header_symbols.csv"
    file_rows: list[dict[str, str]] = []
    symbol_rows: list[dict[str, str]] = []
    for path in sorted(include_dir.rglob("*")):
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        symbols, counts = scan_c_symbols(path)
        symbol_rows.extend(symbols)
        file_rows.append(
            {
                "path": rel(path),
                "extension": path.suffix,
                "size_bytes": str(path.stat().st_size),
                "line_count": str(text.count("\n") + (0 if text.endswith("\n") else 1)),
                "sha256": sha256(path),
                **counts,
            }
        )
    write_csv(
        files_out,
        file_rows,
        [
            "path",
            "extension",
            "size_bytes",
            "line_count",
            "sha256",
            "defines",
            "includes",
            "typedefs",
            "structs",
            "enums",
            "functions",
        ],
    )
    write_csv(
        symbols_out,
        symbol_rows,
        ["header_path", "line", "kind", "name", "context"],
    )
    print(f"Wrote {len(file_rows)} m-ex file records and {len(symbol_rows)} symbol records")


def build_ppc2cpp_index() -> None:
    source_dir = EXTERNAL_DIR / "ppc2cpp" / "mips_to_c_ppc2cpp_branch"
    out_path = EXTERNAL_DIR / "ppc2cpp" / "indexes" / "source_files.csv"
    rows: list[dict[str, str]] = []
    for path in sorted(source_dir.rglob("*")):
        if not path.is_file():
            continue
        if path.name == ".DS_Store":
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        rows.append(
            {
                "path": rel(path),
                "extension": path.suffix,
                "size_bytes": str(path.stat().st_size),
                "line_count": str(text.count("\n") + (0 if text.endswith("\n") else 1)),
                "sha256": sha256(path),
            }
        )
    write_csv(out_path, rows, ["path", "extension", "size_bytes", "line_count", "sha256"])
    print(f"Wrote {len(rows)} ppc2cpp source file records")


def main() -> None:
    build_training_mode_map_index()
    build_tockdom_index()
    build_m_ex_indexes()
    build_ppc2cpp_index()


if __name__ == "__main__":
    main()
