#!/usr/bin/env python3
"""Infer struct layout by tracing a pointer register through a function's asm.

Watches every load/store that uses the tracked register (or an alias derived
from it via `mr` / `addi`) and records the (offset, size, kind) tuples. The
instruction mnemonic gives the field type: lfs->f32, lfd->f64, lwz/stw->u32,
lhz/sth->u16, lha->s16, lbz/stb->u8, psq_l/st->f32[2]. Detects stride hints
from `addi <reg>, <reg>, imm`, which suggests the element size when the
register is a loop iterator.

Usage:
    tools/infer_struct.py <fn> <ptr_reg> [--asm DIR] [--name STRUCT]

Example:
    tools/infer_struct.py lbBones_8000A1B0 r29
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

# Project checkout root: explicit override, then Claude Code's project dir,
# then assume this script lives at <melee>/tools/.
from project_root import build_id, resolve_root

ROOT = resolve_root()
DEFAULT_ASM = ROOT / "build" / build_id() / "asm"

INSN_RE = re.compile(r"^/\*[^*]*\*/\s+(\S+)\s*(.*?)\s*$")
MEMOP_RE = re.compile(r"^(-?(?:0x)?[0-9A-Fa-f]+)\(r(\d+)\)$")
REG_RE = re.compile(r"^r(\d+)$")

# opcode -> (size_bytes, kind, is_load, updates_base)
MEM_OPS: dict[str, tuple[int, str, bool, bool]] = {
    "lwz":   (4, "u32", True,  False),
    "lwzu":  (4, "u32", True,  True),
    "lhz":   (2, "u16", True,  False),
    "lhzu":  (2, "u16", True,  True),
    "lha":   (2, "s16", True,  False),
    "lhau":  (2, "s16", True,  True),
    "lbz":   (1, "u8",  True,  False),
    "lbzu":  (1, "u8",  True,  True),
    "lfs":   (4, "f32", True,  False),
    "lfsu":  (4, "f32", True,  True),
    "lfd":   (8, "f64", True,  False),
    "lfdu":  (8, "f64", True,  True),
    "stw":   (4, "u32", False, False),
    "stwu":  (4, "u32", False, True),
    "sth":   (2, "u16", False, False),
    "sthu":  (2, "u16", False, True),
    "stb":   (1, "u8",  False, False),
    "stbu":  (1, "u8",  False, True),
    "stfs":  (4, "f32", False, False),
    "stfsu": (4, "f32", False, True),
    "stfd":  (8, "f64", False, False),
    "stfdu": (8, "f64", False, True),
    # Paired-single: 8 bytes, two f32 lanes (or quantized; treat as 2xf32)
    "psq_l":  (8, "f32x2", True,  False),
    "psq_lu": (8, "f32x2", True,  True),
    "psq_st": (8, "f32x2", False, False),
    "psq_stu":(8, "f32x2", False, True),
}

# Registers clobbered by a `bl` (PPC ABI: r0, r3-r12, f0-f13, ctr, lr, cr0/1/5/6/7)
VOLATILE_GPR = {0} | set(range(3, 13))


def parse_imm(s: str) -> int:
    s = s.strip().rstrip(",")
    neg = s.startswith("-")
    if neg:
        s = s[1:]
    v = int(s, 16) if s.lower().startswith("0x") else int(s)
    return -v if neg else v


def split_operands(rest: str) -> list[str]:
    # Split by commas, but keep `imm(rA)` together (no comma inside).
    return [p.strip() for p in rest.split(",")] if rest else []


@dataclass
class Access:
    offset: int
    size: int
    kind: str
    is_load: bool
    addr: str  # source line address for traceability

    @property
    def end(self) -> int:
        return self.offset + self.size


@dataclass
class Trace:
    accesses: list[Access] = field(default_factory=list)
    strides: list[tuple[int, str]] = field(default_factory=list)  # (imm, addr)
    aliases: dict[int, int] = field(default_factory=dict)  # reg -> offset from base
    seed_reg: int = 0


def find_function_lines(name: str, asm_root: Path) -> tuple[Path, list[tuple[str, str]]]:
    """Return (path, [(addr, raw_line)]) for the requested function body."""
    # grep is much faster than scanning every file in Python.
    try:
        out = subprocess.run(
            ["grep", "-rln", f"^.fn {name},", str(asm_root)],
            capture_output=True, text=True, check=False,
        ).stdout.strip().splitlines()
    except FileNotFoundError:
        out = []
    candidates = [Path(p) for p in out]
    if not candidates:
        # Slow fallback: glob.
        needle = f".fn {name},"
        for p in asm_root.rglob("*.s"):
            with p.open() as f:
                if any(needle in line for line in f):
                    candidates.append(p)
                    break
    if not candidates:
        raise SystemExit(f"function {name!r} not found under {asm_root}")
    path = candidates[0]
    body: list[tuple[str, str]] = []
    in_fn = False
    addr = ""
    with path.open() as f:
        for line in f:
            stripped = line.strip()
            if not in_fn:
                if stripped.startswith(f".fn {name},"):
                    in_fn = True
                continue
            if stripped.startswith(f".endfn {name}"):
                break
            # Skip labels and blank lines.
            if not stripped or stripped.startswith(".") or stripped.startswith("#") or stripped.endswith(":"):
                continue
            # Pull leading address if present.
            m = re.match(r"^/\*\s*([0-9A-Fa-f]+)\s", stripped)
            if m:
                addr = m.group(1)
            body.append((addr, stripped))
    return path, body


def trace(body: list[tuple[str, str]], seed_reg: int, sticky: bool = True) -> Trace:
    t = Trace(seed_reg=seed_reg)
    t.aliases[seed_reg] = 0

    def kill(reg: int):
        # In sticky mode, the named seed register is never killed: any
        # reassignment is treated as a fresh base pointer (offset 0). This
        # handles the common pattern where the seed gets initialized inside
        # the function (e.g. from a return value) instead of being a function arg.
        if sticky and reg == seed_reg:
            t.aliases[reg] = 0
        else:
            t.aliases.pop(reg, None)

    for addr, raw in body:
        m = INSN_RE.match(raw)
        if not m:
            continue
        op, rest = m.group(1), m.group(2)
        operands = split_operands(rest)

        # Memory access?
        if op in MEM_OPS:
            size, kind, is_load, updates = MEM_OPS[op]
            if len(operands) < 2:
                continue
            mem = MEMOP_RE.match(operands[1])
            if not mem:
                continue  # e.g. lfs f0, sym@sda21(r0) — symbol-relative, not us
            imm = parse_imm(mem.group(1))
            base = int(mem.group(2))
            if base in t.aliases:
                eff = t.aliases[base] + imm
                t.accesses.append(Access(eff, size, kind, is_load, addr))
                if updates:
                    t.aliases[base] = eff  # rA <- effective addr
            # If load wrote to a tracked GPR, kill it (now holds memory contents).
            if is_load:
                rd = REG_RE.match(operands[0])
                if rd and not kind.startswith("f"):
                    kill(int(rd.group(1)))
            continue

        # Indexed mem ops: lwzx rD, rA, rB / stwx etc. We can't easily resolve
        # the offset without tracking rB, so just kill the dest if it was an alias.
        if op.endswith("x") and op[:-1] in {
            "lwz","lhz","lha","lbz","lfs","lfd","stw","sth","stb","stfs","stfd",
        }:
            if op.startswith("l"):
                rd = REG_RE.match(operands[0]) if operands else None
                if rd:
                    kill(int(rd.group(1)))
            continue

        # Aliasing: mr rD, rA  =>  rD = rA
        if op == "mr" and len(operands) == 2:
            rd = REG_RE.match(operands[0])
            ra = REG_RE.match(operands[1])
            if rd and ra:
                if int(ra.group(1)) in t.aliases:
                    t.aliases[int(rd.group(1))] = t.aliases[int(ra.group(1))]
                else:
                    kill(int(rd.group(1)))
            continue

        # addi rD, rA, imm  =>  rD = rA + imm
        if op in ("addi", "addic", "addic.", "subi") and len(operands) == 3:
            rd = REG_RE.match(operands[0])
            ra = REG_RE.match(operands[1])
            if not (rd and ra):
                continue
            rd_n, ra_n = int(rd.group(1)), int(ra.group(1))
            try:
                imm = parse_imm(operands[2])
            except ValueError:
                kill(rd_n); continue
            if op == "subi":
                imm = -imm
            if ra_n in t.aliases:
                new_off = t.aliases[ra_n] + imm
                # Self-update on a tracked register: stride hint. Reset the
                # tracked offset to 0 so subsequent accesses (next iteration
                # of the loop) are recorded relative to the new element base.
                if rd_n == ra_n and imm != 0:
                    t.strides.append((imm, addr))
                    new_off = 0
                t.aliases[rd_n] = new_off
            else:
                kill(rd_n)
            continue

        # `bl` clobbers volatile regs.
        if op == "bl":
            for r in list(t.aliases):
                if r in VOLATILE_GPR:
                    kill(r)
            continue

        # Any other instruction that writes a register: kill aliases of its dest.
        # We approximate by killing the first register operand if it's an rN.
        if operands:
            rd = REG_RE.match(operands[0])
            # Skip stores already handled above; comparison ops (cmp/cmpi/cmpw) write CR not GPR.
            if rd and not op.startswith(("cmp", "fcmp", "b", "twi", "tw", "mtspr", "mtcrf", "mfcr", "isync", "sync")):
                # Be conservative: most ALU ops write rD as their first operand.
                if op in {"li", "lis", "neg", "not", "extsb", "extsh", "extsw",
                          "add", "addc", "adde", "addis", "addme", "addze",
                          "sub", "subf", "subfc", "subfe", "subfic",
                          "and", "andc", "andi.", "andis.",
                          "or", "orc", "ori", "oris",
                          "xor", "xori", "xoris", "nand", "nor", "eqv",
                          "mullw", "mulhw", "mulhwu", "mulli",
                          "divw", "divwu",
                          "slw", "srw", "sraw", "srawi",
                          "rlwimi", "rlwinm", "rlwnm",
                          "cntlzw", "mfspr", "mflr", "mfctr"}:
                    kill(int(rd.group(1)))
    return t


@dataclass
class Field:
    offset: int
    size: int
    kinds: set[str]

    def c_type(self) -> str:
        # Prefer the most specific kind seen.
        priority = ["f64", "f32x2", "f32", "s16", "u32", "u16", "u8"]
        for k in priority:
            if k in self.kinds:
                return {
                    "f64": "f64", "f32": "f32", "f32x2": "f32 /*[2]*/",
                    "u32": "u32", "u16": "u16", "s16": "s16", "u8": "u8",
                }[k]
        return "u8"


def coalesce(accesses: list[Access]) -> list[Field]:
    by_off: dict[int, Field] = {}
    for a in accesses:
        f = by_off.get(a.offset)
        if f is None:
            by_off[a.offset] = Field(a.offset, a.size, {a.kind})
        else:
            f.size = max(f.size, a.size)
            f.kinds.add(a.kind)
    return sorted(by_off.values(), key=lambda f: f.offset)


def render_struct(name: str, fields: list[Field], stride: int | None) -> str:
    if not fields:
        return f"struct {name} {{\n    /* no accesses observed */\n}};\n"
    lines = [f"struct {name} {{"]
    cur = min(f.offset for f in fields)
    if cur < 0:
        lines.append(f"    /* WARNING: negative offsets observed (min={cur:#x}) */")
        cur = 0
    pad_idx = 0
    for f in fields:
        if f.offset > cur:
            gap = f.offset - cur
            lines.append(f"    char pad_{pad_idx:02x}[{gap:#x}]; /* +{cur:#x} */")
            pad_idx += 1
        elif f.offset < cur:
            lines.append(f"    /* OVERLAP at +{f.offset:#x} (prev field ended at +{cur:#x}) */")
        type_str = f.c_type()
        lines.append(f"    /* +{f.offset:#04x} */ {type_str:<14} x{f.offset:X};")
        cur = f.offset + f.size
    if stride is not None and stride > cur:
        gap = stride - cur
        lines.append(f"    char pad_end[{gap:#x}]; /* +{cur:#x}, pads to stride {stride:#x} */")
        cur = stride
    elif stride is not None and stride < cur:
        lines.append(f"    /* WARNING: observed accesses extend past stride {stride:#x} (last end +{cur:#x}) */")
    lines.append(f"}}; /* size {cur:#x} ({cur} bytes) */")
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("fn", help="Function name (matches `.fn <fn>,` in asm)")
    ap.add_argument("ptr_reg", help="Pointer register to track, e.g. r3, r29")
    ap.add_argument("--asm", type=Path, default=DEFAULT_ASM, help=f"asm root (default: {DEFAULT_ASM})")
    ap.add_argument("--name", default=None, help="Struct name for output (default: <fn>_arg)")
    ap.add_argument("-v", "--verbose", action="store_true", help="Print every observed access")
    args = ap.parse_args()

    m = REG_RE.match(args.ptr_reg)
    if not m:
        print(f"bad register: {args.ptr_reg!r} (expected r0..r31)", file=sys.stderr)
        return 2
    seed = int(m.group(1))

    path, body = find_function_lines(args.fn, args.asm)
    print(f"# {args.fn} in {path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}", file=sys.stderr)

    t = trace(body, seed)

    if args.verbose:
        print(f"# tracking r{seed} (and aliases)", file=sys.stderr)
        for a in t.accesses:
            tag = "L" if a.is_load else "S"
            print(f"#   {a.addr}  {tag} +{a.offset:#06x}  {a.kind}  ({a.size}B)", file=sys.stderr)
        if t.strides:
            print("# stride hints:", file=sys.stderr)
            for imm, addr in t.strides:
                print(f"#   {addr}  addi r{seed}, r{seed}, {imm:#x}", file=sys.stderr)

    fields = coalesce(t.accesses)
    stride = None
    if t.strides:
        # If multiple distinct strides, pick the most common positive one.
        counts: dict[int, int] = defaultdict(int)
        for imm, _ in t.strides:
            if imm > 0:
                counts[imm] += 1
        if counts:
            stride = max(counts.items(), key=lambda kv: (kv[1], kv[0]))[0]

    name = args.name or f"{args.fn}_arg"
    print(render_struct(name, fields, stride))
    if not t.accesses:
        print(f"# no loads/stores via r{seed} observed", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
