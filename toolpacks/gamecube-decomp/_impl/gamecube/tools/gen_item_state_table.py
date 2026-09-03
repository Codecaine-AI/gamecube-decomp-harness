#!/usr/bin/env python3
"""
Convert an ItemStateTable from asm to C and insert it into the appropriate .c file.

Usage: python tools/gen_item_state_table.py <label>
Example: python tools/gen_item_state_table.py it_803F93A8
"""

import os
import re
import sys
from pathlib import Path

# Project checkout root: explicit override, then Claude Code's project dir,
# then assume this script lives at <melee>/tools/.
from project_root import build_id, resolve_root

ROOT = resolve_root()


def find_source_file(label: str) -> Path:
    """Find the .c file that owns this data label via splits.txt."""
    splits = ROOT / "config" / build_id() / "splits.txt"
    addr = label.replace("it_", "")  # e.g. "803F93A8"
    target = f"start:0x{addr.upper()}"

    current_file = None
    for line in splits.read_text().splitlines():
        stripped = line.strip()
        if stripped.endswith(".c:"):
            current_file = stripped.rstrip(":")
        elif target in stripped and current_file:
            return ROOT / "src" / current_file
    raise SystemExit(f"Could not find {label} in splits.txt")


def find_asm_file(source_file: Path) -> Path:
    """Derive the asm file path from the source file path."""
    rel = source_file.relative_to(ROOT / "src")
    return ROOT / "build" / build_id() / "asm" / rel.with_suffix(".s")


def parse_asm_table(asm_file: Path, label: str) -> list[dict]:
    """Parse the .obj block for the given label from the asm file."""
    text = asm_file.read_text()
    pattern = rf"^\.obj {re.escape(label)}, global\n(.*?)^\.endobj {re.escape(label)}"
    m = re.search(pattern, text, re.MULTILINE | re.DOTALL)
    if not m:
        raise SystemExit(f"Could not find .obj {label} in {asm_file}")

    lines = m.group(1).strip().splitlines()
    words = []
    for line in lines:
        line = line.strip()
        if line.startswith(".4byte"):
            val = line.split(".4byte")[1].strip()
            words.append(val)

    if len(words) % 4 != 0:
        raise SystemExit(
            f"Table {label} has {len(words)} words, not a multiple of 4"
        )

    entries = []
    for i in range(0, len(words), 4):
        anim_id = words[i]
        anim_fn = words[i + 1]
        phys_fn = words[i + 2]
        coll_fn = words[i + 3]
        entries.append(
            {
                "anim_id": int(anim_id, 16) if anim_id.startswith("0x") else anim_id,
                "anim": anim_fn,
                "phys": phys_fn,
                "coll": coll_fn,
            }
        )
    return entries


def format_field(val: str) -> str:
    """Format a .4byte value as a C expression."""
    if val == "0x00000000":
        return "NULL"
    # It's a symbol name
    return val


def format_table(label: str, entries: list[dict]) -> str:
    """Format the table as a C definition."""
    lines = [f"ItemStateTable {label}[] = {{"]
    for entry in entries:
        anim_id = entry["anim_id"]
        if isinstance(anim_id, int):
            # Signed: check for negative via two's complement
            if anim_id >= 0x80000000:
                anim_id = anim_id - 0x100000000
            anim_id_str = str(anim_id)
        else:
            anim_id_str = entry["anim_id"]

        anim = format_field(entry["anim"])
        phys = format_field(entry["phys"])
        coll = format_field(entry["coll"])
        lines.append(f"    {{ {anim_id_str}, {anim}, {phys}, {coll} }},")
    lines.append("};")
    return "\n".join(lines)


def find_insert_position(source: str, label: str) -> int | None:
    """Find where to insert the table: before the first function definition.

    Scans for the first opening brace '{' on its own line (indicating a
    function body), then walks back to find the start of that function's
    signature.
    """
    lines = source.split("\n")

    TYPE_KEYWORDS = {
        "void", "bool", "s32", "u32", "f32", "f64", "int", "char",
        "HSD_GObj*", "Item_GObj*",
    }

    for i, line in enumerate(lines):
        stripped = line.strip()
        # Look for a line that starts with a type keyword at column 0 and
        # is NOT a forward declaration (i.e., the signature is followed by
        # '{' rather than ';')
        if not stripped or stripped[0] in "#/*" or stripped.startswith("extern"):
            continue
        if stripped.startswith("typedef"):
            continue

        first_word = stripped.split("(")[0].split()[0] if "(" in stripped else ""
        if first_word not in TYPE_KEYWORDS:
            continue

        # Found a line starting with a type keyword and containing '('
        # Check if this is a function definition (has '{' before next ';')
        combined = stripped
        for j in range(i + 1, min(i + 5, len(lines))):
            combined += " " + lines[j].strip()
        if "{" in combined:
            brace_pos = combined.index("{")
            semi_pos = combined.index(";") if ";" in combined else len(combined)
            if brace_pos < semi_pos:
                # This is a function definition. Insert before it.
                offset = sum(len(lines[j]) + 1 for j in range(i))
                return offset

    return None


def main():
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <label>")
        print(f"Example: {sys.argv[0]} it_803F93A8")
        sys.exit(1)

    label = sys.argv[1]

    # Find the source file
    source_file = find_source_file(label)
    print(f"Source file: {source_file.relative_to(ROOT)}")

    # Find and parse the asm
    asm_file = find_asm_file(source_file)
    if not asm_file.exists():
        raise SystemExit(f"Asm file not found: {asm_file}")
    print(f"Asm file: {asm_file.relative_to(ROOT)}")

    entries = parse_asm_table(asm_file, label)
    print(f"Found {len(entries)} entries")

    # Format the C definition
    c_code = format_table(label, entries)
    print(f"\nGenerated:\n{c_code}\n")

    # Read source and insert
    source = source_file.read_text()

    # Check if already defined
    if re.search(rf"ItemStateTable\s+{re.escape(label)}\s*\[\s*\]\s*=", source):
        print(f"{label} is already defined in {source_file.name}, skipping.")
        return

    pos = find_insert_position(source, label)
    if pos is None:
        raise SystemExit("Could not find a suitable insertion point")

    new_source = source[:pos] + c_code + "\n\n" + source[pos:]
    source_file.write_text(new_source)
    print(f"Inserted into {source_file.relative_to(ROOT)} (before first function)")


if __name__ == "__main__":
    main()
