# Vendored from https://github.com/MarkMcCaskey/decomp-search at commit 586800f.
# License: MIT OR Apache-2.0.
# Local modifications: added provenance, argument validation, and stored-token windowing.
"""Normalize disassembled functions into token streams for embedding.

The token stream preserves instruction skeletons, operand shapes, and branch
direction while discarding register numbers, addresses, symbols, and literals.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class Insn:
    addr: int
    mnemonic: str
    operands: str
    reloc: str | None = None


@dataclass
class Function:
    name: str
    unit: str
    insns: list[Insn] = field(default_factory=list)

    @property
    def size(self) -> int:
        return len(self.insns)


BRANCH_MNEMONICS = re.compile(
    r"^b(l|c|ne|eq|lt|gt|le|ge|so|ns|dnz|dz|ctr|lr)?[+-]?$|^b(ne|eq|lt|gt|le|ge)(lr|ctr)?[+-]?$"
)
_TARGET = re.compile(r"^(0x)?[0-9a-f]+$")


def _operand_shape(op: str) -> str:
    """Collapse one operand to a register, immediate, or symbol shape."""
    op = op.strip()
    if not op:
        return ""
    match = re.fullmatch(r"(-?(?:0x)?[0-9a-fA-F]+)\((r\d{1,2}|sp|rtoc)\)", op)
    if match:
        return "#(r)"
    if re.fullmatch(r"r\d{1,2}|sp|rtoc", op):
        return "r"
    if re.fullmatch(r"f\d{1,2}", op):
        return "f"
    if re.fullmatch(r"cr\d", op):
        return "cr"
    if re.fullmatch(r"qr\d", op):
        return "q"
    if _TARGET.fullmatch(op):
        return "#"
    return "@"


def insn_tokens(insn: Insn, fn_start: int) -> str:
    """Return one normalized token for an instruction."""
    del fn_start
    mnemonic = insn.mnemonic
    operands = insn.operands

    if mnemonic == "b" or (mnemonic.startswith("b") and BRANCH_MNEMONICS.match(mnemonic)):
        if mnemonic in ("bl", "blr", "bctr", "bctrl", "blrl"):
            return mnemonic
        parts = [part.strip() for part in operands.split(",")]
        direction = ""
        for part in parts:
            match = re.match(r"(?:0x)?([0-9a-f]+)\b", part)
            if match and _TARGET.fullmatch(part.split()[0]):
                target = int(match.group(1), 16)
                direction = "back" if target <= insn.addr else "fwd"
                break
        return f"{mnemonic}({direction})" if direction else mnemonic

    if not operands:
        return mnemonic
    shapes = ",".join(
        shape for shape in (_operand_shape(part) for part in operands.split(",")) if shape
    )
    token = f"{mnemonic}({shapes})"
    if insn.reloc:
        token += f"[{insn.reloc}]"
    return token


def function_tokens(fn: Function) -> list[str]:
    if not fn.insns:
        return []
    start = fn.insns[0].addr
    return [insn_tokens(insn, start) for insn in fn.insns]


def token_text(fn: Function) -> str:
    """Return the document string consumed by embedding backends."""
    tokens = function_tokens(fn)
    return f"ppc {len(tokens)}\n" + " ".join(tokens)


def window_texts(
    fn: Function,
    size: int = 32,
    stride: int = 16,
) -> list[tuple[int, str]]:
    """Return sliding instruction windows as ``(start_insn, document)``."""
    return window_token_texts(function_tokens(fn), size=size, stride=stride)


def window_token_texts(
    tokens: list[str],
    size: int = 32,
    stride: int = 16,
) -> list[tuple[int, str]]:
    """Apply upstream window semantics to tokens loaded from an index."""
    if size <= 0:
        raise ValueError("window size must be positive")
    if stride <= 0:
        raise ValueError("window stride must be positive")
    if len(tokens) <= size:
        return [(0, f"ppc {len(tokens)}\n" + " ".join(tokens))] if tokens else []
    windows: list[tuple[int, str]] = []
    last = len(tokens) - size
    for start in range(0, last + 1, stride):
        window = tokens[start : start + size]
        windows.append((start, f"ppc {len(window)}\n" + " ".join(window)))
    if last % stride != 0:
        window = tokens[last:]
        windows.append((last, f"ppc {len(window)}\n" + " ".join(window)))
    return windows
