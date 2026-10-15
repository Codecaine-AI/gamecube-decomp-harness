"""Tests for stack_check.py / stack_compare.py.

Unit tests use synthetic instruction words, synthetic objdump/objdiff text and
a tiny in-test ELF writer. Integration tests run the CLI against an SMS build
sandbox and skip when none exists (set STACK_CHECK_SMS_SANDBOX to choose one).
"""

from __future__ import annotations

import json
import os
import shutil
import struct
import subprocess
import sys
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import stack_check  # noqa: E402
import stack_compare as sc  # noqa: E402

# --------------------------------------------------------------------------
# PowerPC encoders
# --------------------------------------------------------------------------


def d_form(op: int, rt: int, ra: int, d: int) -> int:
    return (op << 26) | (rt << 21) | (ra << 16) | (d & 0xFFFF)


def stwu(frame: int) -> int:
    return d_form(37, 1, 1, -frame)


def stw(rs: int, d: int, ra: int = 1) -> int:
    return d_form(36, rs, ra, d)


def lwz(rt: int, d: int, ra: int = 1) -> int:
    return d_form(32, rt, ra, d)


def addi(rt: int, ra: int, imm: int) -> int:
    return d_form(14, rt, ra, imm)


def psq_l(frt: int, d: int, ra: int = 1, w: int = 0, i: int = 0) -> int:
    return (56 << 26) | (frt << 21) | (ra << 16) | (w << 15) | (i << 12) | (d & 0xFFF)


def addic(rt: int, ra: int, imm: int, record: bool = False) -> int:
    return d_form(13 if record else 12, rt, ra, imm)


def mr(ra: int, rs: int) -> int:  # or ra,rs,rs
    return (31 << 26) | (rs << 21) | (ra << 16) | (rs << 11) | (444 << 1)


def b(disp: int, link: bool = False) -> int:
    return (18 << 26) | (disp & 0x03FFFFFC) | int(link)


BLR = 0x4E800020
MFLR_R0 = 0x7C0802A6


# --------------------------------------------------------------------------
# Word-level normalizer
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "a, bword, expected",
    [
        (stwu(64), stwu(72), True),
        (addi(1, 1, 64), addi(1, 1, 72), True),
        (stw(31, 60), stw(31, 28), True),
        (lwz(0, 76), lwz(0, 68), True),
        (addi(3, 1, 8), addi(3, 1, 12), True),
        (addi(11, 1, 72), addi(11, 1, 64), True),  # before _savegpr_*
        (d_form(46, 27, 1, 20), d_form(46, 27, 1, 28), True),  # lmw
        (d_form(47, 27, 1, 20), d_form(47, 27, 1, 28), True),  # stmw
        (d_form(50, 31, 1, 72), d_form(50, 31, 1, 64), True),  # lfd
        (d_form(54, 31, 1, 72), d_form(54, 31, 1, 64), True),  # stfd
        (psq_l(31, 72), psq_l(31, 56), True),
        (psq_l(31, 72, i=0), psq_l(31, 56, i=1), False),  # GQR differs
        (stw(31, 60), stw(30, 28), False),  # register differs
        (addi(3, 1, 8), addi(4, 1, 8), False),
        (lwz(3, 8, ra=4), lwz(3, 12, ra=4), False),  # not r1 based
        (addi(3, 0, 8), addi(3, 0, 12), False),  # li
        (stw(31, 60), lwz(31, 60), False),  # opcode differs
        (stwu(64), stwu(64), False),  # equal words are not a difference
    ],
)
def test_stack_word_pair(a: int, bword: int, expected: bool) -> None:
    assert sc.stack_word_pair(a, bword) is expected


def test_frame_size_of_word() -> None:
    assert sc.frame_size_of_word(stwu(104)) == 104
    assert sc.frame_size_of_word(stw(1, -8)) is None
    assert sc.frame_size([MFLR_R0, stw(0, 4), stwu(72), BLR]) == 72
    assert sc.frame_size([BLR]) is None


# --------------------------------------------------------------------------
# Text-level normalizer (objdump and objdiff formatting)
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "a, bt, expected",
    [
        ("stwu    r1,-56(r1)", "stwu r1, -0x40(r1)", True),  # objdump vs objdiff
        ("stw r31, 0x3c(r1)", "stw r31, 0x1c(r1)", True),
        ("lfd     f31,72(r1)", "lfd f31,64(r1)", True),
        ("addi r11, r1, 0x48", "addi r11, r1, 0x40", True),
        ("addi    r1,r1,72", "addi r1, r1, 0x40", True),
        ("psq_l f31, 0x48(r1), 0, qr0", "psq_l f31, 0x38(r1), 0, qr0", True),
        ("stmw    r27,20(r1)", "stmw r27, 0x1c(r1)", True),
        # classify-frame-only.py's flaw: `(r1)` in a row is not enough.
        ("stw r31, 0x3c(r1)", "stw r30, 0x1c(r1)", False),
        ("addi r3, r1, 0x8", "addi r4, r1, 0x8", False),
        ("lwz r3, 0x8(r4)", "lwz r3, 0xc(r4)", False),
        ("li r3, 0x8", "li r3, 0xc", False),
        ("bl foo", "bl bar", False),
        ("stw r31, 0x3c(r1)", "stw r31, 0x3c(r1)", False),
        ("psq_l f31, 0x48(r1), 0, qr0", "psq_l f31, 0x38(r1), 1, qr0", False),
    ],
)
def test_stack_text_pair(a: str, bt: str, expected: bool) -> None:
    assert sc.stack_text_pair(a, bt) is expected


def test_frame_size_of_text() -> None:
    assert sc.frame_size_of_text("stwu r1, -0x40(r1)") == 64
    assert sc.frame_size_of_text("stwu    r1,-56(r1)") == 56
    assert sc.frame_size_of_text("stw r31, 0x3c(r1)") is None


def test_classify_text_rows() -> None:
    rows = [("mflr r0", "mflr r0", False), ("stwu r1, -0x48(r1)", "stwu r1, -0x40(r1)", True)]
    assert sc.classify_text_rows(rows)[0] == "stack_only"
    rows.append(("mr r31, r3", "mr r30, r3", True))
    status, first = sc.classify_text_rows(rows)
    assert status == "mismatch" and first["row"] == 2
    assert sc.classify_text_rows([("blr", "blr", False)]) == ("exact", None)
    # Flagged but textually identical: a hidden relocation difference.
    assert sc.classify_text_rows([("lwz r3, foo@sda21(r13)", "lwz r3, foo@sda21(r13)", True)])[0] == "mismatch"
    # A gap row (insertion) is never stack only.
    assert sc.classify_text_rows([(None, "nop", True)])[0] == "mismatch"


def _objdiff_sym(name: str, rows: list[tuple[str, bool]], target: int | None, percent: float | None) -> dict:
    sym = {
        "name": name,
        "kind": "SYMBOL_FUNCTION",
        "instructions": [
            ({"diff_kind": "DIFF_ARG_MISMATCH"} if flag else {}) | {"instruction": {"formatted": text}}
            for text, flag in rows
        ],
    }
    if target is not None:
        sym["target_symbol"] = target
    if percent is not None:
        sym["match_percent"] = percent
    return sym


def test_classify_objdiff_statuses() -> None:
    left = [
        _objdiff_sym("exact", [("stwu r1, -0x20(r1)", False), ("blr", False)], 0, 100.0),
        _objdiff_sym("frame", [("stwu r1, -0x48(r1)", True), ("stw r31, 0x44(r1)", True)], 1, 90.0),
        _objdiff_sym("regs", [("stwu r1, -0x48(r1)", True), ("mr r31, r3", True)], 2, 80.0),
        _objdiff_sym("gone", [("blr", False)], None, None),
    ]
    right = [
        _objdiff_sym("exact", [("stwu r1, -0x20(r1)", False), ("blr", False)], 0, 100.0),
        _objdiff_sym("frame", [("stwu r1, -0x40(r1)", True), ("stw r31, 0x3c(r1)", True)], 1, 90.0),
        _objdiff_sym("regs", [("stwu r1, -0x40(r1)", True), ("mr r30, r3", True)], 2, 80.0),
    ]
    payload = {
        "left": {"symbols": left, "sections": [{"name": ".data", "kind": "SECTION_DATA", "match_percent": 50.0}]},
        "right": {"symbols": right},
    }
    out = {f["name"]: f for f in sc.classify_objdiff(payload)["functions"]}
    assert out["exact"]["status"] == "exact"
    assert out["frame"]["status"] == "stack_only"
    assert (out["frame"]["frame_target"], out["frame"]["frame_compiled"]) == (72, 64)
    assert out["regs"]["status"] == "mismatch"
    assert out["gone"]["status"] == "missing"
    assert sc.classify_objdiff(payload)["sections"][0]["match_percent"] == 50.0


def test_status_rank_order() -> None:
    ranks = [
        sc.status_rank({"status": s, "match_percent": p})
        for s, p in (("missing", 0), ("mismatch", 50), ("mismatch", 99), ("stack_only", 98), ("exact", 100))
    ]
    assert ranks == sorted(ranks)
    assert sc.status_rank(None) == (0, 0.0)


# --------------------------------------------------------------------------
# Synthetic ELF objects
# --------------------------------------------------------------------------

R_PPC_ADDR32 = 1
R_PPC_REL24 = 10
R_PPC_REL14 = 11


def build_elf(
    functions: list[tuple[str, list[int]]],
    relocs: list[tuple[int, int, str, int]] = (),
    data: bytes = b"\0" * 8,
    data_relocs: list[tuple[int, int, str, int]] = (),
    externs: tuple[str, ...] = ("callee",),
) -> bytes:
    """ELF32 BE relocatable: .text (functions back to back), .data, symbols.

    relocs/data_relocs: (offset, type, symbol name, addend).
    """
    text = b"".join(struct.pack(">I", w) for _, words in functions for w in words)
    shstr = b"\0.text\0.data\0.rela.text\0.rela.data\0.symtab\0.strtab\0.shstrtab\0"

    def off(name: str) -> int:
        return shstr.index(name.encode() + b"\0")

    strtab = b"\0"
    syms = [struct.pack(">IIIBBH", 0, 0, 0, 0, 0, 0)]
    index: dict[str, int] = {}

    def add_sym(name: str, value: int, size: int, info: int, shndx: int) -> None:
        nonlocal strtab
        name_off = len(strtab)
        strtab += name.encode() + b"\0"
        index[name] = len(syms)
        syms.append(struct.pack(">IIIBBH", name_off, value, size, info, 0, shndx))

    add_sym(".data", 0, 0, sc.STT_SECTION, 2)
    index[".data"] = len(syms) - 1
    pos = 0
    for name, words in functions:
        add_sym(name, pos, 4 * len(words), (1 << 4) | sc.STT_FUNC, 1)
        pos += 4 * len(words)
    for name in externs:
        add_sym(name, 0, 0, (1 << 4), 0)
    symtab = b"".join(syms)

    def rela(entries) -> bytes:
        return b"".join(struct.pack(">IIi", o, (index[s] << 8) | t, a) for o, t, s, a in entries)

    rela_text, rela_data = rela(relocs), rela(data_relocs)
    blobs = [text, data, rela_text, rela_data, symtab, strtab, shstr]
    offsets = []
    cursor = 52
    body = b""
    for blob in blobs:
        offsets.append(cursor + len(body))
        body += blob + b"\0" * (-len(blob) % 4)
    shoff = 52 + len(body)
    sh = [b"\0" * 40]
    specs = [
        (".text", 1, 0x6, 0, 0, 4, 0),
        (".data", 1, 0x3, 0, 0, 8, 0),
        (".rela.text", 4, 0, 5, 1, 4, 12),
        (".rela.data", 4, 0, 5, 2, 4, 12),
        (".symtab", 2, 0, 6, 2, 4, 16),
        (".strtab", 3, 0, 0, 0, 1, 0),
        (".shstrtab", 3, 0, 0, 0, 1, 0),
    ]
    for (name, typ, flags, link, info, align, ent), blob, o in zip(specs, blobs, offsets):
        sh.append(struct.pack(">10I", off(name), typ, flags, 0, o, len(blob), link, info, align, ent))
    ident = b"\x7fELF\x01\x02\x01" + b"\0" * 9
    ehdr = ident + struct.pack(">HHIIIIIHHHHHH", 1, 20, 1, 0, 0, shoff, 0, 52, 0, 0, 40, len(sh), 7)
    return ehdr + body + b"".join(sh)


def objects(a: bytes, bb: bytes) -> sc.ObjectsDiff:
    return sc.compare_objects(sc.ElfObject(a, "a.o"), sc.ElfObject(bb, "b.o"))


PROLOGUE = [MFLR_R0, stw(0, 4)]


def frame_fn(frame: int, save_reg: int = 31) -> list[int]:
    return PROLOGUE + [stwu(frame), stw(save_reg, frame - 4), mr(save_reg, 3),
                       lwz(save_reg, frame - 4), lwz(0, frame + 4), addi(1, 1, frame), BLR]


def test_objects_identical_stack_only_and_code() -> None:
    base = build_elf([("leaf", [BLR]), ("f", frame_fn(64))])
    assert objects(base, base).effect == "none"

    bigger = build_elf([("leaf", [BLR]), ("f", frame_fn(72))])
    diff = objects(base, bigger)
    f = {fn.name: fn for fn in diff.functions}["f"]
    assert f.cls == "stack_only" and (f.frame_a, f.frame_b) == (64, 72)
    assert diff.data == "identical" and diff.effect == "stack_only"
    assert f.first_diff["offset"] == 8  # the stwu

    regs = build_elf([("leaf", [BLR]), ("f", frame_fn(72, save_reg=30))])
    f = {fn.name: fn for fn in objects(base, regs).functions}["f"]
    assert f.cls == "code" and f.first_diff["offset"] == 12


def test_objects_function_relative_offsets_and_relocs() -> None:
    call = [MFLR_R0, b(0, link=True), b(-4), BLR]  # bl callee (reloc), b back one word
    a = build_elf([("f", call), ("g", [BLR])], relocs=[(4, R_PPC_REL24, "callee", 0)])
    # Same function moved behind a new one: the relocation and local branch
    # sit at other section offsets but match function-relative.
    moved = build_elf([("pad", [BLR, BLR]), ("f", call), ("g", [BLR])], relocs=[(12, R_PPC_REL24, "callee", 0)])
    diff = {fn.name: fn.cls for fn in objects(a, moved).functions}
    assert diff == {"f": "identical", "g": "identical", "pad": "only_b"}

    other_target = build_elf(
        [("f", call), ("g", [BLR])], relocs=[(4, R_PPC_REL24, "g", 0)]
    )
    assert {fn.name: fn.cls for fn in objects(a, other_target).functions}["f"] == "code"


def test_objects_data_bytes_and_relocations() -> None:
    fns = [("f", [BLR])]
    a = build_elf(fns, data=b"\1\2\3\4\0\0\0\0", data_relocs=[(4, R_PPC_ADDR32, "callee", 0)])
    same = build_elf(fns, data=b"\1\2\3\4\0\0\0\0", data_relocs=[(4, R_PPC_ADDR32, "callee", 0)])
    assert objects(a, same).data == "identical"
    bytes_differ = build_elf(fns, data=b"\1\2\3\5\0\0\0\0", data_relocs=[(4, R_PPC_ADDR32, "callee", 0)])
    assert objects(a, bytes_differ).data == "differs"
    addend_differs = build_elf(fns, data=b"\1\2\3\4\0\0\0\0", data_relocs=[(4, R_PPC_ADDR32, "callee", 4)])
    diff = objects(a, addend_differs)
    assert diff.data == "differs" and diff.effect == "code"


def test_anonymous_relocation_targets_compare_by_position() -> None:
    # `@123` vs `@456` for the same .data slot is the same target.
    fns = [("f", [BLR])]
    a = build_elf(fns, data_relocs=[(0, R_PPC_ADDR32, ".data", 4)], externs=())
    bb = build_elf(fns, data_relocs=[(0, R_PPC_ADDR32, ".data", 4)], externs=())
    assert objects(a, bb).data == "identical"
    shifted = build_elf(fns, data_relocs=[(0, R_PPC_ADDR32, ".data", 0)], externs=())
    assert objects(a, shifted).data == "differs"


# --------------------------------------------------------------------------
# Hunks, regions, decisions
# --------------------------------------------------------------------------


needs_git = pytest.mark.skipif(shutil.which("git") is None, reason="git not installed")


@needs_git
def test_file_hunks_and_revert(tmp_path: Path) -> None:
    base = b"a\nb\nc\nd\ne\n"
    head = b"a\nB\nc\nd\nX\ne\nY\n"
    hunks = stack_check.file_hunks("f.cpp", base, head, tmp_path)
    assert [(h.base_start, h.base_count, h.head_start, h.head_count) for h in hunks] == [
        (2, 1, 2, 1),
        (4, 0, 5, 1),
        (5, 0, 7, 1),
    ]
    assert stack_check.revert_hunks(head, hunks[:1]) == b"a\nb\nc\nd\nX\ne\nY\n"
    assert stack_check.revert_hunks(head, hunks[1:2]) == b"a\nB\nc\nd\ne\nY\n"
    assert stack_check.revert_hunks(head, hunks) == base
    deleted = stack_check.file_hunks("g.cpp", b"x\ny\n", b"y\n", tmp_path)
    assert stack_check.revert_hunks(b"y\n", deleted) == b"x\ny\n"


@needs_git
def test_revert_new_file_deletes_it(tmp_path: Path) -> None:
    hunks = stack_check.file_hunks("new.hpp", None, b"int x;\n", tmp_path)
    assert len(hunks) == 1
    assert stack_check.revert_hunks(b"int x;\n", hunks) is None


SOURCE = """#include "a.h"
// comment { not a block
static int s;
namespace N {
void f(int x)
{
    if (x) { g("}"); }
}
}

template <typename T>
struct S {
    int a;
};
int tail;
"""


def test_top_level_blocks() -> None:
    # namespace is transparent; the function's span starts at its signature.
    assert stack_check.top_level_blocks(SOURCE) == [(5, 8), (11, 14)]


def _hunk(index: int, start: int, count: int = 1) -> stack_check.Hunk:
    return stack_check.Hunk("f.cpp", index, start, count, start, count, [], [])


def test_hunk_group_block_and_loose_runs() -> None:
    hunks = [_hunk(0, 1), _hunk(1, 3), _hunk(2, 6), _hunk(3, 7), _hunk(4, 13), _hunk(5, 16)]
    assert [h.index for h in stack_check.hunk_group(hunks, hunks[2], SOURCE)] == [2, 3]
    assert [h.index for h in stack_check.hunk_group(hunks, hunks[4], SOURCE)] == [4]
    # Out-of-block hunks two lines apart form one run; line 16 is far away.
    assert [h.index for h in stack_check.hunk_group(hunks, hunks[0], SOURCE)] == [0, 1]
    assert [h.index for h in stack_check.hunk_group(hunks, hunks[5], SOURCE)] == [5]


def _outcome(effect: str, functions=(), data=()) -> stack_check.VariantOutcome:
    return stack_check.VariantOutcome(effect, list(functions), list(data), "", ["U"])


def _fn(cls: str, with_: tuple, without: tuple) -> dict:
    def st(t):
        return None if t is None else {"status": t[0], "match_percent": t[1]}

    return {"name": "f", "class": cls, "target_with": st(with_), "target_without": st(without)}


def test_decide() -> None:
    decide = stack_check.Auditor.decide
    assert decide(_outcome("none"))[0] == "drop_no_effect"
    assert decide(_outcome("stack_only"))[0] == "drop_stack_only"
    assert decide(_outcome("build_break"))[0] == "review"
    gain = _fn("code", ("exact", 100), ("mismatch", 98))
    loss = _fn("code", ("mismatch", 90), ("mismatch", 95))
    flat = _fn("code", ("mismatch", 90), ("mismatch", 90))
    assert decide(_outcome("code", [gain]))[0] == "keep"
    assert decide(_outcome("code", [flat]))[0] == "drop_no_gain"
    assert decide(_outcome("code", [loss]))[0] == "drop_no_gain"
    assert decide(_outcome("code", [gain, loss]))[0] == "review"
    # A gain that comes only through a stack-only function is not a gain.
    frame_gain = _fn("stack_only", ("exact", 100), ("stack_only", 99))
    assert decide(_outcome("code", [frame_gain, flat]))[0] == "drop_no_gain"
    # Data sections count.
    data_gain = {"section": ".rodata", "target_with": 100.0, "target_without": 80.0}
    assert decide(_outcome("code", [], [data_gain]))[0] == "keep"


def test_joint_guard_regression_rule() -> None:
    regressed = stack_check.Applier.regressed
    # target_with = before the round, target_without = after it.
    frame_only = _fn("stack_only", ("exact", 100), ("stack_only", 99))
    code_worse = _fn("code", ("stack_only", 99.9), ("mismatch", 97))
    code_better = _fn("code", ("mismatch", 97), ("exact", 100))
    assert not regressed(_outcome("stack_only", [frame_only]))
    assert regressed(_outcome("code", [code_worse]))
    assert not regressed(_outcome("code", [code_better, frame_only]))
    assert regressed(_outcome("build_break"))
    assert regressed(_outcome("code", [], [{"section": ".data", "target_with": 100.0, "target_without": 90.0}]))


def test_select_drops_reverts_whole_groups() -> None:
    group = {"id": "a.cpp@1,2", "members": ["a.cpp#1", "a.cpp#2"], "decision": "drop_stack_only"}
    audit = {
        "hunks": [
            {"id": "a.cpp#0", "file": "a.cpp", "index": 0, "decision": "keep", "group": None},
            {"id": "a.cpp#1", "file": "a.cpp", "index": 1, "decision": "keep", "group": None},
            {"id": "a.cpp#2", "file": "a.cpp", "index": 2, "decision": "drop_stack_only", "group": group},
            {"id": "b.cpp#0", "file": "b.cpp", "index": 0, "decision": "drop_no_effect", "group": None},
            {"id": "b.cpp#1", "file": "b.cpp", "index": 1, "decision": "review", "group": None},
        ]
    }
    assert stack_check.select_drops(audit, {"drop_stack_only", "drop_no_effect"}) == {"a.cpp": [1, 2], "b.cpp": [0]}
    assert stack_check.select_drops(audit, {"drop_no_gain"}) == {}


# --------------------------------------------------------------------------
# Agent comment stripping
# --------------------------------------------------------------------------


def test_strip_agent_comments_delete_cut_and_keep() -> None:
    src = (
        b"int a; // TODO: nonmatching regalloc\n"
        b"\t// frame-only mismatch\n"
        b"int b; /* 0x10 */\n"
        b'const char* s = "// TODO";\n'
        b"// TODO old comment not added\n"
        b"/* stack padding\n"
        b"   still agent */\n"
        b"int c;\n"
    )
    added = {1, 2, 3, 4, 6, 7, 8}
    out, changes = stack_check.strip_agent_comments(src, added, keep_blank=False)
    assert out == (
        b"int a;\n"
        b"int b; /* 0x10 */\n"
        b'const char* s = "// TODO";\n'
        b"// TODO old comment not added\n"
        b"int c;\n"
    )
    assert {c["action"] for c in changes} == {"cut", "delete"}
    blank, _ = stack_check.strip_agent_comments(src, added, keep_blank=True)
    assert blank.count(b"\n") == src.count(b"\n")
    assert blank.splitlines()[0] == b"int a;" and blank.splitlines()[1] == b""


def test_strip_removes_wrapped_comment_sentences() -> None:
    src = (
        b"// Loads the actor table.\n"
        b"// TODO: frame is 0xE8 instead of 0x110; vector slots and the\n"
        b"// stretch/magnitude FPR assignment still differ.\n"
        b"// Second note stays.\n"
        b"void f();\n"
    )
    out, _ = stack_check.strip_agent_comments(src, {1, 2, 3, 4, 5}, keep_blank=False)
    assert out == b"// Loads the actor table.\n// Second note stays.\nvoid f();\n"


def test_strip_needs_whole_comment_on_added_lines() -> None:
    src = b"/* TODO: nonmatching\n   more */\nint x;\n"
    out, changes = stack_check.strip_agent_comments(src, {2}, keep_blank=False)
    assert out == src and changes == []


# --------------------------------------------------------------------------
# Integration (SMS sandbox)
# --------------------------------------------------------------------------

DEFAULT_SANDBOX = (
    Path(__file__).resolve().parents[5].parent
    / "gamecube-decomp-harness/games/sms/workspace/sb-tooldev"
)
SANDBOX = Path(os.environ.get("STACK_CHECK_SMS_SANDBOX", DEFAULT_SANDBOX))
BASE = os.environ.get("STACK_CHECK_SMS_BASE", "f8542190")
MACTOR = SANDBOX / "build/GMSJ01/src/M3DUtil/MActor.o"

needs_sandbox = pytest.mark.skipif(
    not (MACTOR.is_file() and (SANDBOX / "build/tools/objdiff-cli").is_file()),
    reason="no SMS build sandbox (set STACK_CHECK_SMS_SANDBOX)",
)


def run_cli(*args: str, timeout: int = 600) -> dict:
    result = subprocess.run(
        [sys.executable, str(TOOLS / "stack_check.py"), *args, "--json"],
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    assert result.returncode in (0, 1), result.stderr[-2000:]
    return json.loads(result.stdout)


@needs_sandbox
def test_objects_cli_same_object_is_identical() -> None:
    out = run_cli("objects", str(MACTOR), str(MACTOR))
    assert out["data"] == "identical"
    assert {f["class"] for f in out["functions"]} == {"identical"}


@needs_sandbox
def test_target_cli_mactor() -> None:
    out = run_cli("target", "--repo", str(SANDBOX), "--unit", "M3DUtil/MActor")
    statuses = {f["status"] for f in out["functions"]}
    assert "exact" in statuses and "missing" not in statuses
    assert all(f["frame_target"] is None or f["frame_target"] > 0 for f in out["functions"])


@needs_sandbox
def test_hunks_cli_mactor_operand_swaps_are_stack_only(tmp_path: Path) -> None:
    audit_path = tmp_path / "audit.json"
    run_cli(
        "hunks", "--repo", str(SANDBOX), "--base", BASE,
        "--files", "src/M3DUtil/MActor.cpp", "--jobs", "4", "--tmp", str(tmp_path),
        "--out", str(audit_path),
    )
    audit = json.loads(audit_path.read_text())
    swaps = [h for h in audit["hunks"] if "0 <= mAnmByType" in h["added"]]
    assert len(swaps) == 7
    for h in swaps:
        assert h["effect"] == "stack_only" and h["decision"] == "drop_stack_only"
        deltas = {f["frame_head"] - f["frame_variant"] for f in h["functions"]}
        assert deltas == {8}
    assert SANDBOX.joinpath("src/M3DUtil/MActor.cpp").read_bytes() == subprocess.run(
        ["git", "show", "HEAD:src/M3DUtil/MActor.cpp"], cwd=SANDBOX, capture_output=True
    ).stdout, "the audit must not touch the repo"



def test_addic_on_r1_is_a_stack_offset() -> None:
    for record in (False, True):
        assert sc.stack_word_pair(addic(0, 1, 8, record), addic(0, 1, 12, record))
        assert not sc.stack_word_pair(addic(0, 3, 8, record), addic(0, 3, 12, record))  # not r1
        assert not sc.stack_word_pair(addic(0, 1, 8, record), addic(4, 1, 12, record))  # other register
    assert not sc.stack_word_pair(addic(0, 1, 8), addic(0, 1, 12, True))  # addic vs addic. is code
    assert sc.stack_text_pair("addic. r0,r1,8", "addic. r0, r1, 0xc")
    assert sc.stack_text_pair("addic r3,r1,16", "addic r3,r1,24")
    assert not sc.stack_text_pair("addic. r0,r1,8", "addic r0,r1,12")
    assert not sc.stack_text_pair("addic. r0,r3,8", "addic. r0,r3,12")


def addze(rt: int, ra: int) -> int:
    return (31 << 26) | (rt << 21) | (ra << 16) | (202 << 1)


def addc(rt: int, ra: int, rb: int) -> int:
    return (31 << 26) | (rt << 21) | (ra << 16) | (rb << 11) | (10 << 1)


def beq(disp: int) -> int:  # bc 12,eq,disp
    return (16 << 26) | (12 << 21) | (2 << 16) | (disp & 0xFFFC)


def mfxer(rt: int) -> int:  # mfspr rt, XER (spr 1)
    return (31 << 26) | (rt << 21) | (1 << 16) | (339 << 1)


def bl_word() -> int:
    return (18 << 26) | 1


def b_rel(disp: int) -> int:
    return (18 << 26) | (disp & 0x03FFFFFC)


BCTR = 0x4E800420


def test_mario_gamepad_read_shape_is_stack_only() -> None:
    """TMarioGamePad::read: only the r1 slot differs (stw/lwz 12 vs 8, `addic. r0,r1,N`
    then a branch on CR0 to a block that returns; no path reads the carry)."""
    def fn(slot: int) -> list[int]:
        return PROLOGUE + [stwu(32), stw(3, slot), addic(0, 1, slot, True), beq(12), lwz(3, slot),
                           addi(1, 1, 32), BLR, lwz(4, slot), addi(1, 1, 32), BLR]
    diff = objects(build_elf([("read", fn(12))]), build_elf([("read", fn(8))]))
    assert {f.name: f.cls for f in diff.functions} == {"read": "stack_only"}


def _cls(fn_a: list[int], fn_b: list[int], relocs=()) -> str:
    diff = objects(build_elf([("f", fn_a)], relocs=list(relocs)), build_elf([("f", fn_b)], relocs=list(relocs)))
    return {f.name: f.cls for f in diff.functions}["f"]


def test_addic_carry_live_on_straight_line_is_code() -> None:
    """Reviewer repros: `addic. r0,r1,-1; addze r3,r3; blr` and `addic r0,r1,-1; mfxer r3; blr` vs 0."""
    assert _cls([addic(0, 1, -1, True), addze(3, 3), BLR], [addic(0, 1, 0, True), addze(3, 3), BLR]) == "code"
    assert _cls([addic(0, 1, -1), mfxer(3), BLR], [addic(0, 1, 0), mfxer(3), BLR]) == "code"
    # a CA writer before the reader ends the carry's life: stack again
    assert _cls([addic(0, 1, 8), addc(4, 4, 5), addze(3, 3), BLR],
                [addic(0, 1, 12), addc(4, 4, 5), addze(3, 3), BLR]) == "stack_only"


def test_addic_carry_live_through_a_branch_is_code() -> None:
    """`addic. r0,r1,N; beq L; ... blr; L: addze r3,r3; blr`: the taken path reads CA."""
    def fn(imm: int) -> list[int]:
        return [addic(0, 1, imm, True), beq(12), lwz(3, 8), BLR, addze(3, 3), BLR]
    assert sc.carry_live(fn(8), 0)
    assert _cls(fn(8), fn(12)) == "code"
    # an unconditional in-function jump is followed too
    def fn_b(imm: int) -> list[int]:
        return [addic(0, 1, imm), b_rel(8), BLR, addze(3, 3), BLR]
    assert _cls(fn_b(8), fn_b(12)) == "code"


def test_call_kills_the_carry() -> None:
    def fn(imm: int) -> list[int]:
        return [addic(0, 1, imm), bl_word(), addze(3, 3), BLR]
    relocs = [(4, R_PPC_REL24, "callee", 0)]
    assert _cls(fn(8), fn(12), relocs) == "stack_only"


def bcl_eq(disp: int) -> int:  # bcl 12,eq,disp (conditional call)
    return (16 << 26) | (12 << 21) | (2 << 16) | (disp & 0xFFFC) | 1


BEQLRL = (19 << 26) | (12 << 21) | (2 << 16) | (16 << 1) | 1  # bclrl 12,eq


def test_conditional_call_falls_through_when_not_taken() -> None:
    """Reviewer repro: `addic r0,r1,-1; bcl 12,2,callee; addze r3,r3; blr` vs 0:
    when the call is not taken, addze reads the original CA."""
    def fn(imm: int) -> list[int]:
        return [addic(0, 1, imm), bcl_eq(64), addze(3, 3), BLR]
    relocs = [(4, R_PPC_REL14, "callee", 0)]
    assert _cls(fn(-1), fn(0), relocs) == "code"
    def fn_lr(imm: int) -> list[int]:
        return [addic(0, 1, imm), BEQLRL, addze(3, 3), BLR]
    assert sc.carry_live(fn_lr(-1), 0)
    assert _cls(fn_lr(-1), fn_lr(0)) == "code"


def test_conditional_call_in_text_rows() -> None:
    for call in ("bcl 12,2,callee", "beql callee", "beqlrl"):
        a = ["addic r0,r1,-1", call, "addze r3,r3", "blr"]
        rows, insts = _text_rows(a, ["addic r0,r1,0"] + a[1:], {0})
        assert sc.classify_text_rows(rows, insts)[0] == "mismatch", call


def test_unknown_targets_are_conservative() -> None:
    # tail jump through a relocation, a computed jump, a branch out of the function
    tail = [addic(0, 1, 8), b_rel(0), BLR]
    assert sc.carry_live(tail, 0, {1})
    assert sc.carry_live([addic(0, 1, 8), BCTR], 0)
    assert sc.carry_live([addic(0, 1, 8), b_rel(64), BLR], 0)
    # loops terminate
    assert not sc.carry_live([addic(0, 1, 8), lwz(3, 8), b_rel(-4)], 0)


def _text_rows(a: list[str], b: list[str], differ: set[int], dests: dict[int, int] = {}):
    """Aligned objdiff-style rows plus per-side instruction dicts (address, branch_dest)."""
    rows = [(x, y, k in differ) for k, (x, y) in enumerate(zip(a, b))]
    def side(texts):
        return [{"formatted": t, "address": str(4 * k), **({"branch_dest": str(dests[k])} if k in dests else {})}
                for k, t in enumerate(texts)]
    return rows, (side(a), side(b))


def test_addic_carry_rule_in_text_rows() -> None:
    # straight-line reader, and mfxer
    rows, insts = _text_rows(["addic. r0,r1,-1", "addze r3,r3", "blr"], ["addic. r0,r1,0", "addze r3,r3", "blr"], {0})
    assert sc.classify_text_rows(rows, insts)[0] == "mismatch"
    rows, insts = _text_rows(["addic r0,r1,-1", "mfxer r3", "blr"], ["addic r0,r1,0", "mfxer r3", "blr"], {0})
    assert sc.classify_text_rows(rows, insts)[0] == "mismatch"
    # reader reached only through a branch target -> code
    a = ["addic. r0,r1,8", "beq 0x10", "lwz r3,8(r1)", "blr", "addze r3,r3", "blr"]
    b = [a[0].replace("8", "12", 1)] + a[1:]
    rows, insts = _text_rows(a, b, {0}, {1: 16})
    assert sc.classify_text_rows(rows, insts)[0] == "mismatch"
    # branch to a block that only returns (TMarioGamePad::read shape) -> stack_only
    a = ["addic. r0,r1,8", "beq 0xc", "lwz r3,8(r1)", "blr", "addze r3,r3", "blr"]
    rows, insts = _text_rows(a, [a[0].replace("8", "12", 1)] + a[1:], {0}, {1: 12})
    assert sc.classify_text_rows(rows, insts)[0] == "stack_only"
    # a call kills CA; a CA writer kills CA
    a = ["addic r0,r1,8", "bl callee", "addze r3,r3", "blr"]
    rows, insts = _text_rows(a, [a[0].replace("8", "12")] + a[1:], {0})
    assert sc.classify_text_rows(rows, insts)[0] == "stack_only"
    a = ["addic r0,r1,8", "addc r4,r4,r5", "addze. r3,r3", "blr"]
    rows, insts = _text_rows(a, [a[0].replace("8", "12")] + a[1:], {0})
    assert sc.classify_text_rows(rows, insts)[0] == "stack_only"
    # unresolvable branch (no addresses: legacy 3-tuple rows) -> conservative mismatch
    legacy = [("addic. r0,r1,8", "addic. r0,r1,12", True), ("beq 0x10", "beq 0x10", False), ("blr", "blr", False)]
    assert sc.classify_text_rows(legacy)[0] == "mismatch"
    # bctr is a computed jump -> conservative
    a = ["addic r0,r1,8", "bctr"]
    rows, insts = _text_rows(a, ["addic r0,r1,12", "bctr"], {0})
    assert sc.classify_text_rows(rows, insts)[0] == "mismatch"


def test_classify_objdiff_follows_branches() -> None:
    def sym(imm: int, dest: int) -> dict:
        rows = [("addic. r0, r1, %#x" % imm, None), ("beq %#x" % dest, dest), ("lwz r3, 0x8(r1)", None), ("blr", None),
                ("addze r3, r3", None), ("blr", None)]
        out = []
        for k, (text, d) in enumerate(rows):
            ins = {"formatted": text, "size": 4, **({"address": str(4 * k)} if k else {})}
            if d is not None:
                ins["branch_dest"] = str(d)
            out.append({"instruction": ins, **({"diff_kind": "DIFF_ARG_MISMATCH"} if k == 0 else {})})
        return {"name": "f", "kind": "SYMBOL_FUNCTION", "instructions": out}

    def payload(dest: int) -> dict:
        left, right = sym(8, dest), sym(12, dest)
        left["target_symbol"] = 0
        right["match_percent"] = 99.0
        return {"left": {"symbols": [left]}, "right": {"symbols": [right]}}

    assert sc.classify_objdiff(payload(16))["functions"][0]["status"] == "mismatch"  # beq -> addze
    assert sc.classify_objdiff(payload(12))["functions"][0]["status"] == "stack_only"  # beq -> blr
