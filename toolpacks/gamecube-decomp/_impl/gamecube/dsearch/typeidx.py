# Source: https://github.com/MarkMcCaskey/decomp-search
# Commit: 586800f
# License: MIT OR Apache-2.0
# Local modifications: removed package data paths and implicit writes; added
# pre-generated dump input, plain-data helpers, deterministic ordering, and cast flags.
"""Structural type-layout indexing and plain-data query helpers."""

from __future__ import annotations

import difflib
import hashlib
import re
import subprocess
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable


_BUILTIN = {
    "char": ("i8", 1), "signed char": ("i8", 1), "unsigned char": ("i8", 1),
    "_Bool": ("i8", 1), "bool": ("i8", 1),
    "short": ("i16", 2), "unsigned short": ("i16", 2),
    "int": ("i32", 4), "unsigned int": ("i32", 4),
    "long": ("i32", 4), "unsigned long": ("i32", 4),
    "long long": ("i64", 8), "unsigned long long": ("i64", 8),
    "float": ("f32", 4), "double": ("f64", 8), "long double": ("f64", 8),
    "void": ("void", 0), "signed": ("i32", 4), "unsigned": ("i32", 4),
    "signed short": ("i16", 2), "signed int": ("i32", 4),
    "signed long": ("i32", 4), "signed long long": ("i64", 8),
    "short int": ("i16", 2), "unsigned short int": ("i16", 2),
    "long int": ("i32", 4), "unsigned long int": ("i32", 4),
    "long long int": ("i64", 8), "unsigned long long int": ("i64", 8),
}
_PAD_NAME = re.compile(r"^_?(pad|filler|unused|unk_?pad|dummy)", re.I)


def parse_typedefs(ctx_text: str) -> dict[str, str]:
    """Map typedef aliases to their underlying type spellings."""
    out: dict[str, str] = {}
    for match in re.finditer(r"typedef\s+([^;{}()]+?)\s*;", ctx_text):
        body = match.group(1)
        declaration = re.search(r"([A-Za-z_]\w*)\s*((?:\[[^\]]*\]\s*)*)$", body)
        if not declaration:
            continue
        name, dims = declaration.group(1), declaration.group(2)
        base = re.sub(r"\bconst\b|\bvolatile\b", "", body[: declaration.start()]).strip()
        if base:
            out[name] = "*" if base.endswith("*") else base + dims.replace(" ", "")
    for match in re.finditer(r"typedef\s+[\w \*]+\(\s*\*\s*(\w+)\s*\)\s*\(", ctx_text):
        out[match.group(1)] = "*"
    for match in re.finditer(r"typedef\s+(struct|union|enum)\s*(\w+)?\s*\{", ctx_text):
        keyword, tag = match.group(1), match.group(2)
        depth, cursor = 1, match.end()
        while depth and cursor < len(ctx_text):
            char = ctx_text[cursor]
            depth += (char == "{") - (char == "}")
            cursor += 1
        semicolon = ctx_text.find(";", cursor)
        if semicolon < 0:
            continue
        tail = ctx_text[cursor:semicolon]
        line = ctx_text.count("\n", 0, match.end()) + 1
        for name in re.findall(r"\*?\s*(\w+)", tail):
            out[name] = f"{keyword} {tag}" if tag else f"@anon:{line}"
    for match in re.finditer(r"typedef\s+(struct|union|enum)\s+(\w+)\s+(\w+)\s*;", ctx_text):
        out[match.group(3)] = f"{match.group(1)} {match.group(2)}"
    return out


@dataclass
class Field:
    bitoff: int
    depth: int
    type: str
    name: str
    is_bf: bool = False


@dataclass
class Record:
    name: str
    size: int = 0
    align: int = 0
    fields: list[Field] = field(default_factory=list)
    leaves: list[tuple[Any, ...]] = field(default_factory=list)


_LINE = re.compile(r"^\s*([0-9]+)(?::([0-9]+)-?[0-9]*)?\s*\|(\s+)(.*)$")
_TAIL = re.compile(r"\[sizeof=(\d+),\s*(?:dsize=\d+,\s*)?align=(\d+)")


def parse_dump(text: str) -> dict[str, Record]:
    records: dict[str, Record] = {}
    current: Record | None = None
    for line in text.splitlines():
        if "Dumping AST Record Layout" in line:
            current = None
            continue
        tail = _TAIL.search(line)
        if tail and current is not None:
            current.size, current.align = int(tail.group(1)), int(tail.group(2))
            records.setdefault(current.name, current)
            current = None
            continue
        match = _LINE.match(line)
        if not match:
            continue
        offset, bit, indent, rest = match.groups()
        depth = (len(indent) - 1) // 2
        if depth == 0:
            current = Record(name=rest.strip())
            continue
        if current is None:
            continue
        parts = rest.rstrip().rsplit(" ", 1)
        if len(parts) == 2 and re.fullmatch(r"[A-Za-z_]\w*", parts[1]):
            field_type, field_name = parts
        else:
            field_type, field_name = rest.strip(), ""
        bitoff = int(offset) * 8 + (int(bit) if bit else 0)
        current.fields.append(Field(bitoff, depth, field_type.strip(), field_name, bit is not None))
    return records


def resolve(type_str: str, typedefs: dict[str, str], depth: int = 0) -> tuple[str, int, int]:
    type_name = re.sub(r"\s+", " ", type_str.replace("const ", "")).strip()
    if depth > 20:
        return ("unk", 0, 1)
    if "(*)" in type_name:
        return ("ptr", 4, 1)
    count = 1
    for dimension in re.findall(r"\[(\d+)\]", type_name):
        count *= int(dimension)
    type_name = re.sub(r"(\[\d*\])+$", "", type_name).strip()
    if type_name.endswith("*"):
        return ("ptr", 4, count)
    if type_name.startswith("enum "):
        return ("i32", 4, count)
    if type_name in _BUILTIN:
        kind, size = _BUILTIN[type_name]
        return (kind, size, count)
    if type_name.startswith(("struct ", "union ")):
        return (f"rec:{type_name}", 0, count)
    if type_name in typedefs:
        kind, size, nested_count = resolve(typedefs[type_name], typedefs, depth + 1)
        return (kind, size, nested_count * count)
    return ("unk", 0, count)


def build_leaves(rec: Record, records: dict[str, Record], typedefs: dict[str, str]) -> list[tuple[Any, ...]]:
    leaves: list[tuple[Any, ...]] = []
    for index, field_value in enumerate(rec.fields):
        has_children = index + 1 < len(rec.fields) and rec.fields[index + 1].depth > field_value.depth
        if has_children:
            continue
        if field_value.is_bf:
            leaves.append((field_value.bitoff, "bf", 1))
            continue
        kind, _, count = resolve(field_value.type, typedefs)
        if kind.startswith("rec:"):
            subrecord = records.get(kind[4:])
            if subrecord is not None and count <= 256:
                for array_index in range(count):
                    base = field_value.bitoff + array_index * subrecord.size * 8
                    leaves.extend((base + off, subkind, subcount) for off, subkind, subcount in build_leaves(subrecord, records, typedefs))
                continue
        leaves.append((field_value.bitoff, kind, count))
    return sorted(leaves)


def sig_of(leaves: list[tuple[Any, ...]]) -> str:
    return hashlib.md5(repr(leaves).encode()).hexdigest()[:16]


def pad_fraction(rec: Record, typedefs: dict[str, str]) -> float:
    if not rec.size:
        return 0.0
    padding = 0
    for field_value in rec.fields:
        if field_value.depth == 1 and _PAD_NAME.match(field_value.name or ""):
            _, size, count = resolve(field_value.type, typedefs)
            padding += size * count
    return padding / rec.size


def make_dump(ctx: Path, clang: str = "clang") -> str:
    result = subprocess.run(
        [clang, "-target", "powerpc-unknown-eabi", "-std=gnu99", "-fsyntax-only",
         "-Wno-everything", "-Xclang", "-fdump-record-layouts-complete", str(ctx)],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"clang failed with exit code {result.returncode}: {result.stderr[:500]}")
    if not result.stdout.strip():
        raise RuntimeError(f"clang produced no layouts: {result.stderr[:500]}")
    return result.stdout


def resolve_anon_aliases(records: dict[str, Record], typedefs: dict[str, str]) -> dict[str, str]:
    by_line = {target[6:]: alias for alias, target in typedefs.items() if target.startswith("@anon:")}
    aliases: dict[str, str] = {}
    for name in records:
        match = re.search(r"\(unnamed at [^)]*:(\d+):\d+\)", name)
        if match and match.group(1) in by_line:
            aliases[name] = by_line[match.group(1)]
    return aliases


def ingest(project: str, ctx: Path, clang: str = "clang", dump_text: str | None = None) -> dict[str, Any]:
    """Build an in-memory index. The caller chooses if and where to persist it."""
    ctx_text = ctx.read_text(encoding="utf-8", errors="replace")
    typedefs = parse_typedefs(ctx_text)
    records = parse_dump(dump_text if dump_text is not None else make_dump(ctx, clang))
    aliases = resolve_anon_aliases(records, typedefs)
    output: dict[str, Any] = {
        "project": project,
        "ctx": str(ctx),
        "typedefs": typedefs,
        "aliases": aliases,
        "records": {},
    }
    for name, record in records.items():
        leaves = build_leaves(record, records, typedefs)
        output["records"][name] = {
            "size": record.size,
            "align": record.align,
            "n_fields": sum(1 for item in record.fields if item.depth == 1),
            "sig": sig_of(leaves),
            "leaves": leaves,
            "pad_frac": round(pad_fraction(record, typedefs), 3),
            "fields": [[item.bitoff, item.depth, item.type, item.name] for item in record.fields],
        }
    return output


def display_name(index: dict[str, Any], name: str) -> str:
    alias = index.get("aliases", {}).get(name)
    return f"{alias} ({name.split('(')[0].strip()} anon)" if alias else name


def dup_groups(index: dict[str, Any], min_leaves: int = 3) -> list[list[str]]:
    by_signature: dict[str, list[str]] = {}
    for name, record in index["records"].items():
        if len(record["leaves"]) >= min_leaves and record["size"] > 0:
            by_signature.setdefault(f'{record["size"]}:{record["sig"]}', []).append(name)
    groups = [sorted(group) for group in by_signature.values() if len(group) > 1]
    return sorted(groups, key=lambda group: (-index["records"][group[0]]["size"], group))


def prefix_pairs(index: dict[str, Any], min_leaves: int = 4) -> list[tuple[str, str]]:
    records = [(name, tuple(map(tuple, value["leaves"])), value["size"])
               for name, value in index["records"].items() if len(value["leaves"]) >= min_leaves]
    by_head: dict[tuple[Any, ...], list[int]] = {}
    for position, (_, leaves, _) in enumerate(records):
        by_head.setdefault(leaves[:min_leaves], []).append(position)
    pairs: list[tuple[str, str]] = []
    for position, (short_name, short_leaves, short_size) in enumerate(records):
        for candidate in by_head.get(short_leaves[:min_leaves], []):
            long_name, long_leaves, long_size = records[candidate]
            if position != candidate and len(long_leaves) > len(short_leaves) and long_leaves[:len(short_leaves)] == short_leaves and long_size > short_size:
                pairs.append((short_name, long_name))
    return sorted(pairs, key=lambda pair: (-index["records"][pair[0]]["size"], pair))


def find_record(index: dict[str, Any], name: str) -> str:
    records = index["records"]
    for candidate in (name, f"struct {name}", f"union {name}"):
        if candidate in records:
            return candidate
    typedef = index.get("typedefs", {}).get(name)
    if typedef and typedef in records:
        return typedef
    if typedef and typedef.startswith("@anon:"):
        for anonymous, alias in index.get("aliases", {}).items():
            if alias == name:
                return anonymous
    hits = sorted(record for record in records if name in record)
    if len(hits) == 1:
        return hits[0]
    raise KeyError(name)


def near(index: dict[str, Any], name: str, k: int = 15) -> list[tuple[float, str]]:
    target = find_record(index, name)
    target_leaves = [f"{off}:{kind}x{count}" for off, kind, count in index["records"][target]["leaves"]]
    scored: list[tuple[float, str]] = []
    for record_name, record in index["records"].items():
        if record_name == target or not record["leaves"]:
            continue
        leaves = [f"{off}:{kind}x{count}" for off, kind, count in record["leaves"]]
        ratio = difflib.SequenceMatcher(None, target_leaves, leaves, autojunk=False).ratio()
        scored.append((ratio, record_name))
    return sorted(scored, key=lambda item: (-item[0], item[1]))[:k]


def union_views(index: dict[str, Any], name: str) -> list[list[str]]:
    record = index["records"][find_record(index, name)]
    groups: dict[str, list[str]] = {}
    for position, (offset, depth, field_type, field_name) in enumerate(record["fields"]):
        if depth != 1:
            continue
        subtree = [(leaf_offset - offset, kind, count) for leaf_offset, _, kind, count in _subtree_leaves(index, record, position)]
        groups.setdefault(sig_of(sorted(subtree)), []).append(field_name or field_type)
    return sorted((sorted(group) for group in groups.values() if len(group) > 1), key=lambda group: group)


def _field_size(index: dict[str, Any], field_row: list[Any]) -> int:
    kind, element_size, count = resolve(field_row[2], index["typedefs"])
    if kind.startswith("rec:") and kind[4:] in index["records"]:
        element_size = index["records"][kind[4:]]["size"]
    return element_size * count


def _subtree_leaves(index: dict[str, Any], record: dict[str, Any], position: int) -> Iterable[tuple[int, int, str, int]]:
    fields = record["fields"]
    offset, depth, field_type, _ = fields[position]
    cursor = position + 1
    children = []
    while cursor < len(fields) and fields[cursor][1] > depth:
        children.append(fields[cursor])
        cursor += 1
    if children:
        rows = []
        for child_position, child in enumerate(children):
            deeper = child_position + 1 < len(children) and children[child_position + 1][1] > child[1]
            if not deeper:
                kind, _, count = resolve(child[2], index["typedefs"])
                rows.append((child[0], child[1], kind, count))
        return rows
    kind, _, count = resolve(field_type, index["typedefs"])
    return [(offset, depth, kind, count)]


def members_at(index: dict[str, Any], name: str, byte_offset: int) -> list[tuple[str, int]]:
    record = index["records"][find_record(index, name)]
    fields = record["fields"]
    stack: list[tuple[int, str]] = []
    hits: list[tuple[str, int]] = []
    for position, (offset, depth, field_type, field_name) in enumerate(fields):
        while stack and stack[-1][0] >= depth:
            stack.pop()
        stack.append((depth, field_name or f"<{field_type}>"))
        size = _field_size(index, fields[position])
        has_children = position + 1 < len(fields) and fields[position + 1][1] > depth
        start = offset // 8
        if not has_children and size and start <= byte_offset < start + size:
            hits.append((f'{".".join(label for _, label in stack)}  [{field_type}]', start))
    return hits


_CAST = re.compile(r"\(\s*(?:const\s+)?(?:struct\s+|union\s+)?([A-Za-z_]\w*)\s*(?:const\s+)?\*+\s*\)\s*[&\w(]")


def scan_casts(index: dict[str, Any], src_root: Path, view_uses: int = 2) -> list[dict[str, Any]]:
    records = index["records"]
    known: dict[str, str] = {}
    for record_name in records:
        match = re.match(r"(?:struct|union) (\w+)$", record_name)
        if match:
            known[match.group(1)] = record_name
    for alias, target in index["typedefs"].items():
        if target in records:
            known.setdefault(alias, target)
    for anonymous, alias in index["aliases"].items():
        known.setdefault(alias, anonymous)
    sites: dict[str, list[str]] = {}
    cast_counts: Counter[str] = Counter()
    word_counts: Counter[str] = Counter()
    identifier = re.compile(r"[A-Za-z_]\w*")
    for path in sorted(item for item in src_root.rglob("*") if item.suffix in (".c", ".h")):
        text = path.read_text(encoding="utf-8", errors="replace")
        word_counts.update(word for word in identifier.findall(text) if word in known)
        for match in _CAST.finditer(text):
            type_name = match.group(1)
            if type_name in known:
                line = text.count("\n", 0, match.start()) + 1
                sites.setdefault(type_name, []).append(f"{path.relative_to(src_root)}:{line}")
                cast_counts[type_name] += 1
    signature_groups: dict[str, list[str]] = {}
    for record_name, record in records.items():
        signature_groups.setdefault(f'{record["size"]}:{record["sig"]}', []).append(record_name)
    rows: list[dict[str, Any]] = []
    for type_name, locations in sorted(sites.items(), key=lambda item: (-len(item[1]), item[0])):
        record_name = known[type_name]
        record = records[record_name]
        duplicate_records = ([item for item in signature_groups.get(f'{record["size"]}:{record["sig"]}', []) if item != record_name]
                             if record["size"] >= 8 and len(record["leaves"]) >= 4 else [])
        non_cast_uses = word_counts[type_name] - cast_counts[type_name]
        flags = {
            "cast_only": non_cast_uses <= view_uses,
            "mostly_padding": record["pad_frac"] >= 0.5,
            "layout_duplicate": bool(duplicate_records),
        }
        flags["overlay_view"] = flags["cast_only"] and (flags["mostly_padding"] or flags["layout_duplicate"])
        rows.append({
            "type": type_name,
            "record": record_name,
            "sites": locations,
            "non_cast_uses": non_cast_uses,
            "pad_frac": record["pad_frac"],
            "size": record["size"],
            "layout_dups": sorted(duplicate_records),
            "flags": flags,
        })
    return rows
