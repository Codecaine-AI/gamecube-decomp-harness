#!/usr/bin/env python3
"""Generate an isolated helper that forces .sdata2 float/double ordering.

The reference object already records the desired .sdata2 order. This API reads
float and double OBJECT symbols from build/GALE01/obj/<unit>.o and renders a
conventional unused helper with `(void) <constant>;` statements in that order.

The command is read-only by default. It writes source only with `--apply`, and
it compares the compiled TU back to the reference object only with
`--validate`.
"""

from __future__ import annotations

import argparse
import math
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

sys.path.append(str(Path(__file__).resolve().parents[3] / "_shared"))
from toolpack_runtime import captured_stdio, clip, import_tool_module, print_json, resolve_repo_root


@dataclass(frozen=True)
class Symbol:
    offset: int
    size: int
    typ: str
    bind: str
    vis: str
    ndx: str
    name: str


@dataclass(frozen=True)
class Sdata2Entry:
    offset: int
    size: int
    data: bytes
    name: str

    @property
    def c_type(self) -> str:
        return "f32" if self.size == 4 else "f64"


ORDER_FUNC_RE = re.compile(
    r"(?m)^[ \t]*static\s+(?:inline\s+)?"
    r"[A-Za-z_][A-Za-z0-9_\s\*]*?\b"
    r"(?P<name>sdata2_order(?:ing)?|order_sdata2(?:_\d+)?)"
    r"\s*\([^;{}]*\)\s*\{"
)

NAMED_DOUBLE_LITERALS = {
    0x4330000000000000: "U32_TO_F32",
    0x4330000080000000: "S32_TO_F32",
}


def find_tool(repo_root: Path, name: str) -> str:
    local = repo_root / "build" / "binutils" / name
    if local.is_file():
        return str(local)
    found = shutil.which(name)
    if found is not None:
        return found
    raise RuntimeError(f"could not find {name}")


def section_indices(readelf: str, obj: Path, repo_root: Path) -> dict[int, str]:
    out = subprocess.check_output(
        [readelf, "-S", "--wide", str(obj)],
        cwd=repo_root,
        text=True,
        errors="replace",
    )
    sections: dict[int, str] = {}
    for line in out.splitlines():
        line = line.strip()
        if not line.startswith("["):
            continue
        parts = line.replace("[", " [ ").replace("]", " ] ").split()
        if len(parts) >= 5 and parts[0] == "[" and parts[2] == "]":
            try:
                sections[int(parts[1])] = parts[3]
            except ValueError:
                pass
    return sections


def extract_section(objcopy: str, obj: Path, section: str, repo_root: Path) -> bytes:
    with tempfile.NamedTemporaryFile() as tmp:
        result = subprocess.run(
            [
                objcopy,
                "-O",
                "binary",
                f"--only-section={section}",
                str(obj),
                tmp.name,
            ],
            cwd=repo_root,
            capture_output=True,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(
                result.stderr.decode(errors="replace").strip()
                or f"could not extract {section} from {obj}"
            )
        return Path(tmp.name).read_bytes()


def read_symbols(readelf: str, obj: Path, repo_root: Path) -> list[Symbol]:
    out = subprocess.check_output(
        [readelf, "-s", "--wide", str(obj)],
        cwd=repo_root,
        text=True,
        errors="replace",
    )
    syms: list[Symbol] = []
    for line in out.splitlines():
        parts = line.split()
        if len(parts) < 8 or not parts[0].endswith(":"):
            continue
        try:
            offset = int(parts[1], 16)
            size = int(parts[2], 10)
        except ValueError:
            continue
        syms.append(
            Symbol(
                offset=offset,
                size=size,
                typ=parts[3],
                bind=parts[4],
                vis=parts[5],
                ndx=parts[6],
                name=parts[7],
            )
        )
    return syms


def is_gap_symbol(sym: Symbol) -> bool:
    return sym.name.startswith("gap_") or sym.typ == "SECTION"


def literal_symbols(
    symbols: list[Symbol],
    section_idx: int,
    *,
    prefer_local: bool,
) -> list[Symbol]:
    base = [
        sym
        for sym in symbols
        if sym.ndx == str(section_idx)
        and sym.typ == "OBJECT"
        and sym.size in (4, 8)
        and not is_gap_symbol(sym)
    ]
    if prefer_local:
        local_literals = [
            sym for sym in base if sym.bind == "LOCAL" and sym.name.startswith("@")
        ]
        if local_literals:
            return local_literals
    return base


def sdata2_entries(
    obj: Path,
    repo_root: Path,
    *,
    prefer_local: bool = True,
) -> tuple[bytes, list[Sdata2Entry]]:
    readelf = find_tool(repo_root, "powerpc-eabi-readelf")
    objcopy = find_tool(repo_root, "powerpc-eabi-objcopy")
    sections = section_indices(readelf, obj, repo_root)
    by_name = {name: idx for idx, name in sections.items()}
    section_idx = by_name.get(".sdata2")
    if section_idx is None:
        return b"", []

    data = extract_section(objcopy, obj, ".sdata2", repo_root)
    entries: list[Sdata2Entry] = []
    seen: set[tuple[int, int]] = set()
    for sym in sorted(
        literal_symbols(
            read_symbols(readelf, obj, repo_root),
            section_idx,
            prefer_local=prefer_local,
        ),
        key=lambda s: (s.offset, s.size, s.name),
    ):
        key = (sym.offset, sym.size)
        if key in seen:
            continue
        seen.add(key)
        if sym.offset < 0 or sym.offset + sym.size > len(data):
            continue
        entries.append(
            Sdata2Entry(
                offset=sym.offset,
                size=sym.size,
                data=data[sym.offset : sym.offset + sym.size],
                name=sym.name,
            )
        )
    return data, entries


def entry_signature(entries: list[Sdata2Entry]) -> list[tuple[int, bytes]]:
    return [(entry.size, entry.data) for entry in entries]


def used_size(entries: list[Sdata2Entry]) -> int:
    return max((entry.offset + entry.size for entry in entries), default=0)


def sdata2_matches(
    target_data: bytes,
    target_entries: list[Sdata2Entry],
    current_data: bytes,
    current_entries: list[Sdata2Entry],
) -> bool:
    target_used = used_size(target_entries)
    current_used = used_size(current_entries)
    return (
        entry_signature(target_entries) == entry_signature(current_entries)
        and target_used == current_used
        and target_data[:target_used] == current_data[:current_used]
    )


def filter_entries_for_symbols(
    helper_entries: list[Sdata2Entry],
    target_entries: list[Sdata2Entry],
    symbols: list[str],
) -> tuple[list[Sdata2Entry], list[str]]:
    """Filter helper entries by requested reference symbols.

    When the reference object exposes local `@` literal symbols, helper_entries
    can use those names instead of address-style globals. In that case, match
    requested globals by their target offset/size so `--symbol lbl_804D....`
    still selects the corresponding local literal slot.
    """

    requested = {symbol for symbol in symbols if symbol}
    if not requested:
        return helper_entries, []
    target_keys = {
        (entry.offset, entry.size)
        for entry in target_entries
        if entry.name in requested
    }
    found = {
        entry.name
        for entry in target_entries
        if entry.name in requested
    }
    filtered = [
        entry
        for entry in helper_entries
        if entry.name in requested or (entry.offset, entry.size) in target_keys
    ]
    found.update(entry.name for entry in helper_entries if entry.name in requested)
    return filtered, sorted(requested - found)


def normalize_float_literal(value: str) -> str:
    if "e" not in value.lower() and "." not in value:
        value += ".0"
    return value


def entry_literal(entry: Sdata2Entry, *, prefer_named_macros: bool = False) -> str:
    if entry.size == 4:
        bits = int.from_bytes(entry.data, "big")
        if bits == 0x80000000:
            return "-0.0f"
        val = struct.unpack(">f", entry.data)[0]
        if not math.isfinite(val):
            raise ValueError(f"cannot emit non-finite f32 literal for {entry.name}")
        return normalize_float_literal(format(val, ".9g")) + "f"
    if entry.size == 8:
        bits = int.from_bytes(entry.data, "big")
        if prefer_named_macros and bits in NAMED_DOUBLE_LITERALS:
            return NAMED_DOUBLE_LITERALS[bits]
        if bits == 0x8000000000000000:
            return "-0.0"
        val = struct.unpack(">d", entry.data)[0]
        if not math.isfinite(val):
            raise ValueError(f"cannot emit non-finite f64 literal for {entry.name}")
        return normalize_float_literal(format(val, ".17g"))
    raise ValueError(f"unsupported .sdata2 entry size {entry.size}")


def render_helper(
    entries: list[Sdata2Entry],
    name: str,
    *,
    prefer_named_macros: bool = False,
) -> str:
    lines = [f"static void {name}(void)", "{"]
    for entry in entries:
        lines.append(f"    (void) {entry_literal(entry, prefer_named_macros=prefer_named_macros)};")
    lines.append("}")
    return "\n".join(lines) + "\n"


def find_matching_brace(text: str, open_brace: int) -> int | None:
    depth = 0
    state = "code"
    quote = ""
    escaped = False
    idx = open_brace
    while idx < len(text):
        ch = text[idx]
        nxt = text[idx + 1] if idx + 1 < len(text) else ""

        if state == "line_comment":
            if ch == "\n":
                state = "code"
        elif state == "block_comment":
            if ch == "*" and nxt == "/":
                state = "code"
                idx += 1
        elif state == "string":
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                state = "code"
        else:
            if ch == "/" and nxt == "/":
                state = "line_comment"
                idx += 1
            elif ch == "/" and nxt == "*":
                state = "block_comment"
                idx += 1
            elif ch in ("'", '"'):
                state = "string"
                quote = ch
                escaped = False
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return idx
        idx += 1
    return None


def expand_removal_end(text: str, end: int) -> int:
    while end < len(text) and text[end] in " \t":
        end += 1
    if end < len(text) and text[end] == "\n":
        end += 1
    while end < len(text):
        line_end = text.find("\n", end)
        if line_end < 0:
            line_end = len(text)
        if text[end:line_end].strip():
            break
        end = line_end + (1 if line_end < len(text) else 0)
    return end


def order_function_spans(text: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    for match in ORDER_FUNC_RE.finditer(text):
        open_brace = match.end() - 1
        close_brace = find_matching_brace(text, open_brace)
        if close_brace is None:
            continue
        spans.append((match.start(), expand_removal_end(text, close_brace + 1)))
    return spans


def insertion_point(text: str) -> int:
    includes = list(re.finditer(r"(?m)^#include[^\n]*(?:\n|$)", text))
    if includes:
        pos = includes[-1].end()
        while pos < len(text) and text[pos] == "\n":
            pos += 1
        return pos
    return 0


def install_helper(text: str, helper: str) -> tuple[str, bool]:
    block = helper + "\n"
    spans = order_function_spans(text)
    if not spans:
        pos = insertion_point(text)
        return text[:pos] + block + text[pos:], False

    out = text
    for idx, (start, end) in enumerate(reversed(spans)):
        if idx == len(spans) - 1:
            out = out[:start] + block + out[end:]
        else:
            out = out[:start] + out[end:]
    return out, True


def normalize_unit(value: str, repo_root: Path) -> str:
    unit = value.replace("\\", "/").strip()
    for prefix in ("build/GALE01/obj/", "obj/"):
        if unit.startswith(prefix):
            unit = unit[len(prefix) :]
    if unit.endswith(".o"):
        unit = unit[:-2]
    if unit.startswith("src/"):
        unit = unit[4:]
    if unit.endswith(".c"):
        unit = unit[:-2]
    if unit.startswith("main/") and not (repo_root / "build" / "GALE01" / "obj" / f"{unit}.o").is_file():
        unit = unit[5:]
    return unit.strip("/")


def resolve_source_arg(arg: str, repo_root: Path) -> Path:
    path = Path(arg).expanduser()
    candidates: list[Path] = []
    if path.is_absolute():
        candidates.append(path)
    else:
        candidates.extend([Path.cwd() / path, repo_root / path])
        if not str(path).replace("\\", "/").startswith("src/"):
            candidates.append(repo_root / "src" / path)
    if path.suffix != ".c":
        candidates.extend(
            [
                repo_root / "src" / f"{arg}.c",
                repo_root / f"{arg}.c",
                Path.cwd() / f"{arg}.c",
            ]
        )
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    raise FileNotFoundError(f"could not find source file for {arg}")


def source_for_unit(unit: str, repo_root: Path) -> Path:
    source = repo_root / "src" / f"{unit}.c"
    if source.is_file():
        return source.resolve()
    raise FileNotFoundError(f"could not find source file for unit {unit}: {source}")


def unit_for_source(source: Path, repo_root: Path) -> str:
    src_root = (repo_root / "src").resolve()
    try:
        return source.resolve().relative_to(src_root).with_suffix("").as_posix()
    except ValueError as error:
        raise ValueError(f"{source} is not under {src_root}") from error


def entry_payload(entry: Sdata2Entry, *, prefer_named_macros: bool = False) -> dict[str, Any]:
    return {
        "offset": entry.offset,
        "size": entry.size,
        "type": entry.c_type,
        "name": entry.name,
        "literal": entry_literal(entry, prefer_named_macros=prefer_named_macros),
        "hex": entry.data.hex(),
    }


def describe_entry(entry: Sdata2Entry) -> str:
    return f"{entry.c_type} {entry_literal(entry)}"


def first_mismatch(
    target_data: bytes,
    target: list[Sdata2Entry],
    current_data: bytes,
    current: list[Sdata2Entry],
) -> str:
    limit = min(len(target), len(current))
    for idx in range(limit):
        if target[idx].size != current[idx].size or target[idx].data != current[idx].data:
            return (
                f"constant {idx}: target {describe_entry(target[idx])}, "
                f"current {describe_entry(current[idx])}"
            )
    if len(target) != len(current):
        return f"constant count: target {len(target)}, current {len(current)}"
    target_used = used_size(target)
    current_used = used_size(current)
    if target_used != current_used:
        return f"used .sdata2 size: target 0x{target_used:x}, current 0x{current_used:x}"
    for idx in range(min(target_used, current_used)):
        if target_data[idx] != current_data[idx]:
            return f"byte 0x{idx:x}: target 0x{target_data[idx]:02x}, current 0x{current_data[idx]:02x}"
    return "unknown mismatch"


def resolve_target(args: argparse.Namespace, repo_root: Path) -> tuple[Path, str]:
    if args.source:
        source = resolve_source_arg(args.source, repo_root)
        return source, unit_for_source(source, repo_root)
    unit = normalize_unit(args.unit, repo_root)
    return source_for_unit(unit, repo_root), unit


def validate_applied_helper(
    repo_root: Path,
    unit: str,
    target_data: bytes,
    target_entries: list[Sdata2Entry],
) -> dict[str, Any]:
    payload: dict[str, Any] = {"requested": True}
    ninja_compile = import_tool_module("ninja_compile", repo_root)
    with captured_stdio() as (stdout, stderr):
        compiled = ninja_compile.direct_compile(unit)
    payload["stdout"] = clip(stdout.getvalue(), 20_000)
    payload["stderr"] = clip(stderr.getvalue(), 20_000)
    if compiled is None:
        payload.update({"status": "compile_failed", "object_path": None, "matches": False})
        return payload
    try:
        current_data, current_entries = sdata2_entries(compiled.obj, repo_root, prefer_local=False)
        matches = sdata2_matches(target_data, target_entries, current_data, current_entries)
        payload.update(
            {
                "status": "matched" if matches else "mismatch",
                "object_path": str(compiled.obj),
                "matches": matches,
                "current_entry_count": len(current_entries),
                "current_used_size": used_size(current_entries),
            }
        )
        if not matches:
            payload["first_mismatch"] = first_mismatch(
                target_data,
                target_entries,
                current_data,
                current_entries,
            )
        return payload
    finally:
        compiled.tmpdir.cleanup()


def build_payload(args: argparse.Namespace) -> dict[str, Any]:
    repo_root = resolve_repo_root(args.repo_root)
    source, unit = resolve_target(args, repo_root)
    target_object = repo_root / "build" / "GALE01" / "obj" / f"{unit}.o"
    payload: dict[str, Any] = {
        "tool": "review_lint",
        "operation": "review_lint:sdata2_order_helper",
        "repo_root": str(repo_root),
        "source": str(source),
        "source_relative": source.relative_to(repo_root).as_posix()
        if source.is_relative_to(repo_root)
        else str(source),
        "unit": unit,
        "target_object": str(target_object),
        "helper_name": args.name,
        "applied": False,
        "replaced_existing_helper": False,
        "validation": {"requested": bool(args.validate), "status": "not_run"},
    }
    if not target_object.is_file():
        payload.update({"status": "target_object_not_found"})
        return payload

    target_data, target_entries = sdata2_entries(target_object, repo_root, prefer_local=False)
    _, helper_entries = sdata2_entries(target_object, repo_root, prefer_local=True)
    requested_symbols = [symbol for symbol in args.symbol if symbol]
    missing_symbols: list[str] = []
    if requested_symbols:
        helper_entries, missing_symbols = filter_entries_for_symbols(
            helper_entries,
            target_entries,
            requested_symbols,
        )
    payload.update(
        {
            "target_entry_count": len(target_entries),
            "target_used_size": used_size(target_entries),
            "requested_symbols": requested_symbols,
            "missing_symbols": missing_symbols,
            "helper_entry_count": len(helper_entries),
            "helper_entries": [
                entry_payload(entry, prefer_named_macros=args.prefer_named_macros)
                for entry in helper_entries
            ],
        }
    )
    if not helper_entries:
        payload.update(
            {
                "status": "symbol_not_in_sdata2" if requested_symbols else "no_sdata2_entries",
                "helper_text": "",
            }
        )
        return payload

    helper = render_helper(
        helper_entries,
        args.name,
        prefer_named_macros=args.prefer_named_macros,
    )
    payload["helper_text"] = helper
    if not args.apply:
        payload.update({"status": "preview"})
        return payload

    text = source.read_text(encoding="utf-8", errors="surrogateescape")
    updated, replaced = install_helper(text, helper)
    source.write_text(updated, encoding="utf-8", errors="surrogateescape")
    payload.update(
        {
            "applied": True,
            "replaced_existing_helper": replaced,
            "status": "applied",
        }
    )

    if args.validate:
        validation = validate_applied_helper(repo_root, unit, target_data, target_entries)
        payload["validation"] = validation
        if validation.get("status") == "matched":
            payload["status"] = "fixed"
        elif validation.get("status") == "compile_failed":
            payload["status"] = "compile_failed"
        else:
            payload["status"] = "sdata2_mismatch"
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", help="Target project checkout root.")
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--source", help="Source file path or src-relative unit path.")
    target.add_argument("--unit", help="Unit path without src/ prefix or .c suffix.")
    parser.add_argument(
        "--name",
        default="sdata2_order",
        help="Generated helper function name.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write or replace the helper in the source file. Omit for preview.",
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="After --apply, direct-compile the TU and compare .sdata2 order.",
    )
    parser.add_argument(
        "--symbol",
        action="append",
        default=[],
        help="Reference .sdata2 symbol to include in the helper (repeatable). Defaults to all entries.",
    )
    parser.add_argument(
        "--prefer-named-macros",
        action="store_true",
        help="Emit known project macros such as S32_TO_F32 instead of raw double literals.",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    args = parser.parse_args()

    try:
        if args.validate and not args.apply:
            payload = {
                "tool": "review_lint",
                "operation": "review_lint:sdata2_order_helper",
                "status": "validation_requires_apply",
                "message": "--validate compares the compiled real source and therefore requires --apply.",
            }
        else:
            payload = build_payload(args)
    except Exception as error:  # noqa: BLE001 - API boundary reports failures as JSON.
        payload = {
            "tool": "review_lint",
            "operation": "review_lint:sdata2_order_helper",
            "status": "tool_impl_error",
            "error": str(error),
        }

    if args.json:
        print_json(payload)
    elif payload.get("status") == "preview":
        print(payload.get("helper_text", ""), end="")
    else:
        print_json(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
