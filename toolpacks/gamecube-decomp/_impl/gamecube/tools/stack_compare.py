"""Pure object comparison for `stack_check.py`: is a difference only the stack frame?

Two layers, both stdlib-only and free of project side effects:

* Word level (`compare_objects`): two MWCC ELF objects of the same TU, e.g. a
  build with and without one source edit. Functions are paired by name and
  compared word by word at function-relative offsets. Relocated fields are
  masked and the relocations compared by type and resolved target; branches
  without relocations are compared by function-relative target. A differing
  word pair is a stack difference only when both are the same D-form (or
  paired-single) instruction with base register r1 and only the displacement
  differs: `stwu r1,-N(r1)`, `addi r1,r1,N`, `addi rX,r1,N` (including
  `addi r11,r1,N` before `_savegpr`/`_restgpr`), and every `N(r1)` load/store
  (lwz/stw/lfd/stfd/lmw/stmw/psq_l/psq_st ...). Anything else is code.

* Text level (`classify_objdiff_symbol`): an objdiff-cli JSON row pair from a
  compiled-vs-target diff. objdiff pairs symbols across the two objects (whose
  anonymous names like `@123` or `...rodata.0` never agree), so the target mode
  trusts its row alignment and only re-checks each differing row with the same
  stack normalization applied to the formatted instruction text (the textual
  twin of `mwcc_diagnose.stack_inst_signature`).
"""

from __future__ import annotations

import re
import struct
from dataclasses import dataclass, field
from typing import Any, Iterable, Optional

# --------------------------------------------------------------------------
# ELF32 reader
# --------------------------------------------------------------------------

SHT_SYMTAB = 2
SHT_RELA = 4
SHT_NOBITS = 8
SHF_ALLOC = 0x2
SHF_EXECINSTR = 0x4
STT_FUNC = 2
STT_SECTION = 3
STT_FILE = 4
SHN_UNDEF = 0
SHN_LORESERVE = 0xFF00

# Bits of the 32-bit word that a relocation of this type rewrites. The rest of
# the word (opcode, registers) must still match.
RELOC_FIELD_MASK = {
    1: 0xFFFFFFFF,  # R_PPC_ADDR32
    2: 0x03FFFFFC,  # R_PPC_ADDR24
    3: 0x0000FFFF,  # R_PPC_ADDR16
    4: 0x0000FFFF,  # R_PPC_ADDR16_LO
    5: 0x0000FFFF,  # R_PPC_ADDR16_HI
    6: 0x0000FFFF,  # R_PPC_ADDR16_HA
    7: 0x0000FFFC,  # R_PPC_ADDR14
    8: 0x0000FFFC,
    9: 0x0000FFFC,
    10: 0x03FFFFFC,  # R_PPC_REL24
    11: 0x0000FFFC,  # R_PPC_REL14
    12: 0x0000FFFC,
    13: 0x0000FFFC,
    26: 0xFFFFFFFF,  # R_PPC_REL32
    32: 0x0000FFFF,  # R_PPC_SDAREL16
    109: 0x001FFFFF,  # R_PPC_EMB_SDA21 (rA + d)
}

# D-form opcodes whose rA field is a base register: addi (14) and every
# integer/float load/store from lwz (32) to stfdu (55), incl. lmw/stmw.
_D_FORM_BASE_OPS = frozenset([14, *range(32, 56)])
# Paired-single quantized load/store: 12-bit displacement.
_PSQ_OPS = frozenset([56, 57, 60, 61])


@dataclass
class Symbol:
    index: int
    name: str
    value: int
    size: int
    type: int
    bind: int
    shndx: int


@dataclass
class Reloc:
    offset: int
    type: int
    sym: Symbol
    addend: int


@dataclass
class Section:
    index: int
    name: str
    type: int
    flags: int
    data: bytes
    size: int
    relocs: list[Reloc] = field(default_factory=list)

    @property
    def is_exec(self) -> bool:
        return bool(self.flags & SHF_EXECINSTR)

    @property
    def is_alloc(self) -> bool:
        return bool(self.flags & SHF_ALLOC)


@dataclass
class Function:
    name: str
    section: Section
    start: int
    size: int


class ElfObject:
    """Minimal ELF32 relocatable-object reader (sections, symbols, RELA)."""

    def __init__(self, data: bytes, path: str = "<memory>"):
        self.path = path
        if data[:4] != b"\x7fELF" or data[4] != 1:
            raise ValueError(f"{path}: not an ELF32 object")
        endian = ">" if data[5] == 2 else "<"
        self.endian = endian
        (shoff,) = struct.unpack_from(endian + "I", data, 0x20)
        shentsize, shnum, shstrndx = struct.unpack_from(endian + "HHH", data, 0x2E)
        raw = []
        for i in range(shnum):
            raw.append(struct.unpack_from(endian + "10I", data, shoff + i * shentsize))
        shstr = raw[shstrndx]
        shstrtab = data[shstr[4] : shstr[4] + shstr[5]]

        def cstr(table: bytes, off: int) -> str:
            end = table.find(b"\0", off)
            return table[off : end if end >= 0 else len(table)].decode("latin-1")

        self.sections: list[Section] = []
        for i, sh in enumerate(raw):
            name_off, sh_type, flags, _addr, off, size = sh[:6]
            body = b"" if sh_type == SHT_NOBITS else data[off : off + size]
            self.sections.append(Section(i, cstr(shstrtab, name_off), sh_type, flags, body, size))

        self.symbols: list[Symbol] = []
        for i, sh in enumerate(raw):
            if sh[1] != SHT_SYMTAB:
                continue
            strsh = raw[sh[6]]
            strtab = data[strsh[4] : strsh[4] + strsh[5]]
            entsize = sh[9] or 16
            for j in range(sh[5] // entsize):
                st_name, value, size, info, _other, shndx = struct.unpack_from(
                    endian + "IIIBBH", data, sh[4] + j * entsize
                )
                name = cstr(strtab, st_name)
                if not name and info & 0xF == STT_SECTION and shndx < len(self.sections):
                    name = self.sections[shndx].name
                self.symbols.append(Symbol(j, name, value, size, info & 0xF, info >> 4, shndx))
            break

        for sh in raw:
            if sh[1] != SHT_RELA:
                continue
            target = self.sections[sh[7]]
            entsize = sh[9] or 12
            for j in range(sh[5] // entsize):
                r_off, r_info, r_add = struct.unpack_from(endian + "IIi", data, sh[4] + j * entsize)
                sym_index = r_info >> 8
                if sym_index >= len(self.symbols):
                    continue
                target.relocs.append(Reloc(r_off, r_info & 0xFF, self.symbols[sym_index], r_add))

        self.functions: list[Function] = []
        by_section: dict[int, list[Symbol]] = {}
        for sym in self.symbols:
            if 0 < sym.shndx < len(self.sections) and sym.type != STT_SECTION and sym.type != STT_FILE:
                by_section.setdefault(sym.shndx, []).append(sym)
        for sec in self.sections:
            if not sec.is_exec:
                continue
            syms = sorted(by_section.get(sec.index, []), key=lambda s: s.value)
            funcs = [s for s in syms if s.type == STT_FUNC]
            for k, sym in enumerate(funcs):
                size = sym.size
                if not size:
                    later = [s.value for s in syms if s.value > sym.value]
                    size = (min(later) if later else sec.size) - sym.value
                self.functions.append(Function(sym.name, sec, sym.value, size))
            if not funcs and sec.size:
                self.functions.append(Function(f"[{sec.name}]", sec, 0, sec.size))
        self._func_index: dict[int, list[Function]] = {}
        for fn in self.functions:
            self._func_index.setdefault(fn.section.index, []).append(fn)
        # Built eagerly so a parsed object can be shared across threads.
        self._relocs_by_word: dict[int, dict[int, list[Reloc]]] = {}
        for sec in self.sections:
            words: dict[int, list[Reloc]] = {}
            for rel in sec.relocs:
                words.setdefault(rel.offset & ~3, []).append(rel)
            self._relocs_by_word[sec.index] = words

    @classmethod
    def from_path(cls, path: str) -> "ElfObject":
        with open(path, "rb") as stream:
            return cls(stream.read(), str(path))

    def word(self, section: Section, offset: int) -> int:
        return struct.unpack_from(self.endian + "I", section.data, offset)[0]

    def function_at(self, section_index: int, offset: int) -> Optional[Function]:
        for fn in self._func_index.get(section_index, []):
            if fn.start <= offset < fn.start + fn.size:
                return fn
        return None

    def relocs_by_word(self, section: Section) -> dict[int, list[Reloc]]:
        return self._relocs_by_word.get(section.index, {})

    def keyed_functions(self) -> dict[str, Function]:
        """Functions by name; a repeated name gets a `#n` suffix."""
        out: dict[str, Function] = {}
        for fn in self.functions:
            key = fn.name
            n = 1
            while key in out:
                n += 1
                key = f"{fn.name}#{n}"
            out[key] = fn
        return out


def _is_anonymous(sym: Symbol) -> bool:
    name = sym.name
    return (
        sym.type == STT_SECTION
        or not name
        or name[0] in "@."
        or "@" in name
        or "$" in name
    )


def reloc_target(obj: ElfObject, rel: Reloc) -> tuple:
    """Stable identity for a relocation target across two builds.

    Named symbols compare by name and addend. Compiler-numbered or section
    symbols (`@123`, `...rodata.0`, `.text`) resolve to a position: inside a
    function as (function, offset), otherwise as (section, offset). Numbering
    can shift between builds while the layout stays the same.
    """
    sym = rel.sym
    defined = 0 < sym.shndx < SHN_LORESERVE and sym.shndx < len(obj.sections)
    if not defined or not _is_anonymous(sym):
        return ("sym", sym.name, rel.addend)
    sec = obj.sections[sym.shndx]
    off = sym.value + rel.addend
    if sec.is_exec:
        fn = obj.function_at(sec.index, off)
        if fn is not None:
            return ("func", fn.name, off - fn.start)
    return ("sec", sec.name, off)


# --------------------------------------------------------------------------
# Word classification
# --------------------------------------------------------------------------


def _sext(value: int, bits: int) -> int:
    sign = 1 << (bits - 1)
    return (value & (sign - 1)) - (value & sign)


def stack_word_pair(wa: int, wb: int) -> bool:
    """True when two differing words differ only in an r1 displacement."""
    if wa == wb:
        return False
    op = wa >> 26
    if op != wb >> 26 or (wa >> 16) & 0x1F != 1:
        return False
    if op in _D_FORM_BASE_OPS:
        return (wa & 0xFFFF0000) == (wb & 0xFFFF0000)
    if op in _PSQ_OPS:
        return (wa & 0xFFFFF000) == (wb & 0xFFFFF000)
    return False


def frame_size_of_word(word: int) -> Optional[int]:
    """Frame size for `stwu r1,-N(r1)`, else None."""
    if word >> 26 == 37 and (word >> 21) & 0x1F == 1 and (word >> 16) & 0x1F == 1:
        return -_sext(word & 0xFFFF, 16)
    return None


def frame_size(words: Iterable[int]) -> Optional[int]:
    for word in words:
        size = frame_size_of_word(word)
        if size is not None:
            return size
    return None


def _branch_disp(word: int) -> Optional[tuple[int, int]]:
    """(displacement, mask of the displacement field) for relative b/bc."""
    op = word >> 26
    if op == 18 and not word & 2:
        return _sext(word & 0x03FFFFFC, 26), 0x03FFFFFC
    if op == 16 and not word & 2:
        return _sext(word & 0x0000FFFC, 16), 0x0000FFFC
    return None


def _branch_target(obj: ElfObject, fn: Function, rel_off: int, disp: int) -> tuple:
    absolute = fn.start + rel_off + disp
    if fn.start <= absolute < fn.start + fn.size:
        return ("local", absolute - fn.start)
    other = obj.function_at(fn.section.index, absolute)
    if other is not None:
        return ("func", other.name, absolute - other.start)
    return ("sec", fn.section.name, absolute)


@dataclass
class FunctionDiff:
    name: str
    cls: str  # identical | stack_only | code | only_a | only_b
    frame_a: Optional[int] = None
    frame_b: Optional[int] = None
    size_a: Optional[int] = None
    size_b: Optional[int] = None
    first_diff: Optional[dict[str, Any]] = None
    stack_diffs: int = 0

    def to_json(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "class": self.cls,
            "frame_a": self.frame_a,
            "frame_b": self.frame_b,
            "size_a": self.size_a,
            "size_b": self.size_b,
            "stack_diffs": self.stack_diffs,
            "first_diff": self.first_diff,
        }


def _function_words(obj: ElfObject, fn: Function) -> list[int]:
    end = min(fn.start + fn.size, len(fn.section.data))
    count = max(0, (end - fn.start) // 4)
    return list(struct.unpack_from(f"{obj.endian}{count}I", fn.section.data, fn.start)) if count else []


def _external_branches(obj: ElfObject, fn: Function, words: list[int]) -> list[tuple]:
    """Relocation-free relative branches leaving `fn`: (offset, target)."""
    relocs = obj.relocs_by_word(fn.section)
    out = []
    for i, word in enumerate(words):
        op = word >> 26
        if op != 18 and op != 16:
            continue
        disp = _branch_disp(word)
        if disp is None or (fn.start + 4 * i) in relocs:
            continue
        target = _branch_target(obj, fn, 4 * i, disp[0])
        if target[0] != "local":
            out.append((4 * i, target))
    return out


def _function_reloc_keys(obj: ElfObject, fn: Function) -> list[tuple]:
    relocs = obj.relocs_by_word(fn.section)
    keys = []
    for word_off in range(fn.start, fn.start + fn.size, 4):
        for r in relocs.get(word_off, ()):
            keys.append((r.offset - fn.start, r.type, reloc_target(obj, r)))
    return sorted(keys)


def compare_function(a: ElfObject, fa: Function, b: ElfObject, fb: Function, name: str) -> FunctionDiff:
    words_a = _function_words(a, fa)
    words_b = _function_words(b, fb)
    result = FunctionDiff(
        name, "identical", frame_size(words_a), frame_size(words_b), fa.size, fb.size
    )
    if (
        words_a == words_b
        and _function_reloc_keys(a, fa) == _function_reloc_keys(b, fb)
        and (fa.start == fb.start or _external_branches(a, fa, words_a) == _external_branches(b, fb, words_b))
    ):
        return result  # fast path: byte-identical with the same relocations
    relocs_a = a.relocs_by_word(fa.section)
    relocs_b = b.relocs_by_word(fb.section)
    first_stack: Optional[int] = None
    first_code: Optional[int] = None
    for i in range(min(len(words_a), len(words_b))):
        rel = i * 4
        wa, wb = words_a[i], words_b[i]
        ra = relocs_a.get(fa.start + rel, [])
        rb = relocs_b.get(fb.start + rel, [])
        if ra or rb:
            ka = sorted((r.offset - fa.start - rel, r.type, reloc_target(a, r)) for r in ra)
            kb = sorted((r.offset - fb.start - rel, r.type, reloc_target(b, r)) for r in rb)
            mask = 0
            for r in ra + rb:
                mask |= RELOC_FIELD_MASK.get(r.type, 0xFFFFFFFF)
            if ka != kb or (wa & ~mask) != (wb & ~mask):
                first_code = rel
                break
            continue
        ba, bb = _branch_disp(wa), _branch_disp(wb)
        if ba is not None and bb is not None:
            if (wa & ~ba[1]) == (wb & ~bb[1]) and _branch_target(a, fa, rel, ba[0]) == _branch_target(
                b, fb, rel, bb[0]
            ):
                continue
            first_code = rel
            break
        if wa == wb:
            continue
        if stack_word_pair(wa, wb):
            result.stack_diffs += 1
            if first_stack is None:
                first_stack = rel
            continue
        first_code = rel
        break
    if first_code is None and len(words_a) != len(words_b):
        first_code = min(len(words_a), len(words_b)) * 4
    if first_code is not None:
        result.cls = "code"
        result.first_diff = {"offset": first_code}
    elif first_stack is not None:
        result.cls = "stack_only"
        result.first_diff = {"offset": first_stack}
    return result


def _masked_section_bytes(obj: ElfObject, sec: Section) -> bytes:
    data = bytearray(sec.data)
    for rel in sec.relocs:
        mask = RELOC_FIELD_MASK.get(rel.type, 0xFFFFFFFF)
        word_off = rel.offset & ~3
        if word_off + 4 > len(data):
            continue
        word = struct.unpack_from(obj.endian + "I", data, word_off)[0] & ~mask
        struct.pack_into(obj.endian + "I", data, word_off, word & 0xFFFFFFFF)
    return bytes(data)


def _section_key_map(obj: ElfObject) -> dict[str, Section]:
    out: dict[str, Section] = {}
    for sec in obj.sections:
        if not sec.is_alloc or sec.is_exec:
            continue
        key = sec.name
        n = 1
        while key in out:
            n += 1
            key = f"{sec.name}#{n}"
        out[key] = sec
    return out


def compare_data(a: ElfObject, b: ElfObject) -> list[dict[str, Any]]:
    """Per allocated non-code section: identical | differs | only_a | only_b."""
    sa, sb = _section_key_map(a), _section_key_map(b)
    out = []
    for name in list(sa) + [n for n in sb if n not in sa]:
        x, y = sa.get(name), sb.get(name)
        if x is None or y is None:
            out.append({"name": name, "status": "only_a" if y is None else "only_b"})
            continue
        status = "identical"
        if x.size != y.size or x.type != y.type:
            status = "differs"
        elif x.type != SHT_NOBITS:
            if _masked_section_bytes(a, x) != _masked_section_bytes(b, y):
                status = "differs"
            else:
                ka = sorted((r.offset, r.type, reloc_target(a, r)) for r in x.relocs)
                kb = sorted((r.offset, r.type, reloc_target(b, r)) for r in y.relocs)
                if ka != kb:
                    status = "differs"
        out.append({"name": name, "status": status, "size_a": x.size, "size_b": y.size})
    return out


@dataclass
class ObjectsDiff:
    functions: list[FunctionDiff]
    data_sections: list[dict[str, Any]]

    @property
    def data(self) -> str:
        return "identical" if all(s["status"] == "identical" for s in self.data_sections) else "differs"

    def summary(self) -> dict[str, int]:
        counts = {k: 0 for k in ("identical", "stack_only", "code", "only_a", "only_b")}
        for fn in self.functions:
            counts[fn.cls] = counts.get(fn.cls, 0) + 1
        return counts

    @property
    def effect(self) -> str:
        """none | stack_only | code for the whole object pair."""
        classes = {fn.cls for fn in self.functions}
        if classes - {"identical", "stack_only"} or self.data != "identical":
            return "code"
        return "stack_only" if "stack_only" in classes else "none"

    def to_json(self) -> dict[str, Any]:
        return {
            "functions": [fn.to_json() for fn in self.functions],
            "data": self.data,
            "data_sections": self.data_sections,
            "effect": self.effect,
            "summary": self.summary(),
        }


def compare_objects(a: ElfObject, b: ElfObject) -> ObjectsDiff:
    fa, fb = a.keyed_functions(), b.keyed_functions()
    out: list[FunctionDiff] = []
    for name, fn in fa.items():
        other = fb.get(name)
        if other is None:
            out.append(FunctionDiff(name, "only_a", frame_size(_function_words(a, fn)), None, fn.size))
            continue
        out.append(compare_function(a, fn, b, other, name))
    for name, fn in fb.items():
        if name not in fa:
            out.append(
                FunctionDiff(name, "only_b", None, frame_size(_function_words(b, fn)), None, fn.size)
            )
    return ObjectsDiff(out, compare_data(a, b))


# --------------------------------------------------------------------------
# Text level (objdump / objdiff formatted instructions)
# --------------------------------------------------------------------------

_IMM = r"-?(?:0x[0-9a-f]+|\d+)"
_STACK_MEM_RE = re.compile(rf"(?<![\w.]){_IMM}\(r1\)")
_STACK_ADDI_RE = re.compile(rf"^(addi r\d+,r1,){_IMM}$")
_FRAME_TEXT_RE = re.compile(rf"^stwu r1,({_IMM})\(r1\)$")


def canonical_inst(text: str) -> str:
    """Lowercase, single spaces, no spaces around commas; drop `#`/`;` notes."""
    text = re.split(r"\s[#;<]", text, maxsplit=1)[0].strip().lower()
    text = re.sub(r"\s+", " ", text)
    return re.sub(r"\s*,\s*", ",", text)


def normalize_stack_text(text: str) -> tuple[str, bool]:
    """(normalized, touched): stack displacements become `<s>`.

    Accepts objdump (`stwu    r1,-56(r1)`) and objdiff (`stwu r1, -0x38(r1)`)
    formatting. `touched` says whether any r1 stack operand was replaced.
    """
    canon = canonical_inst(text)
    norm = _STACK_MEM_RE.sub("<s>(r1)", canon)
    norm = _STACK_ADDI_RE.sub(r"\1<s>", norm)
    return norm, norm != canon


def frame_size_of_text(text: str) -> Optional[int]:
    match = _FRAME_TEXT_RE.match(canonical_inst(text))
    return -int(match.group(1), 0) if match else None


def stack_text_pair(text_a: str, text_b: str) -> bool:
    """True when two instruction texts differ only in r1 stack displacements."""
    if canonical_inst(text_a) == canonical_inst(text_b):
        return False
    na, ta = normalize_stack_text(text_a)
    nb, tb = normalize_stack_text(text_b)
    return ta and tb and na == nb


def classify_text_rows(rows: list[tuple[Optional[str], Optional[str], bool]]) -> tuple[str, Optional[dict]]:
    """Classify aligned rows (text_a, text_b, differs).

    Returns (status, first_diff) with status `exact`, `stack_only` or
    `mismatch`. A flagged row whose texts are equal is a mismatch: the
    difference sits somewhere the text does not show (a relocation target).
    """
    first_stack = None
    for index, (ta, tb, differs) in enumerate(rows):
        if not differs:
            continue
        if ta is None or tb is None or not stack_text_pair(ta, tb):
            return "mismatch", {"row": index, "a": ta, "b": tb}
        if first_stack is None:
            first_stack = {"row": index, "a": ta, "b": tb}
    return ("stack_only", first_stack) if first_stack else ("exact", None)


def _objdiff_rows(left: dict, right: dict) -> list[tuple[Optional[str], Optional[str], bool]]:
    la = left.get("instructions") or []
    rb = right.get("instructions") or []
    rows = []
    for k in range(max(len(la), len(rb))):
        a = la[k] if k < len(la) else {}
        b = rb[k] if k < len(rb) else {}
        ia, ib = a.get("instruction"), b.get("instruction")
        differs = bool(a.get("diff_kind") or b.get("diff_kind")) or (ia is None) != (ib is None)
        rows.append(
            (ia.get("formatted") if ia else None, ib.get("formatted") if ib else None, differs)
        )
    return rows


def _frame_of_rows(symbol: dict) -> Optional[int]:
    for row in symbol.get("instructions") or []:
        inst = row.get("instruction")
        if inst:
            size = frame_size_of_text(inst.get("formatted", ""))
            if size is not None:
                return size
    return None


def classify_objdiff(payload: dict) -> dict[str, Any]:
    """Target statuses from `objdiff-cli diff -1 <target> -2 <compiled>` JSON.

    `left` is the target object, `right` the compiled one. Every target
    function gets `exact | stack_only | mismatch | missing`.
    """
    left = payload.get("left") or {}
    right = payload.get("right") or {}
    lsyms = left.get("symbols") or []
    rsyms = right.get("symbols") or []
    functions = []
    for index, sym in enumerate(lsyms):
        if sym.get("kind") != "SYMBOL_FUNCTION":
            continue
        pair = sym.get("target_symbol")
        other = rsyms[pair] if isinstance(pair, int) and 0 <= pair < len(rsyms) else None
        if other is None:
            for cand in rsyms:
                if cand.get("target_symbol") == index:
                    other = cand
                    break
        entry: dict[str, Any] = {
            "name": sym.get("name"),
            "demangled": sym.get("demangled_name"),
            "compiled_name": other.get("name") if other else None,
            "frame_target": _frame_of_rows(sym),
            "frame_compiled": _frame_of_rows(other) if other else None,
        }
        if other is None:
            entry.update(status="missing", match_percent=0.0, first_diff=None)
        else:
            percent = other.get("match_percent", sym.get("match_percent"))
            percent = float(percent) if percent is not None else 0.0
            status, first = classify_text_rows(_objdiff_rows(sym, other))
            if status == "exact" and percent < 100.0:
                status, first = "mismatch", None
            entry.update(status=status, match_percent=percent, first_diff=first)
        functions.append(entry)
    sections = []
    for sec in left.get("sections") or []:
        if sec.get("kind") == "SECTION_DATA" or (sec.get("kind") or "").endswith("BSS"):
            percent = sec.get("match_percent")
            sections.append(
                {
                    "name": sec.get("name"),
                    "kind": sec.get("kind"),
                    "match_percent": float(percent) if percent is not None else None,
                }
            )
    return {"functions": functions, "sections": sections}


STATUS_TIER = {"missing": 0, "mismatch": 1, "stack_only": 2, "exact": 3}


def status_rank(entry: Optional[dict]) -> tuple[int, float]:
    """Order target statuses: exact > stack_only > mismatch (by %) > missing."""
    if not entry:
        return (0, 0.0)
    tier = STATUS_TIER.get(entry.get("status", "missing"), 0)
    return (tier, round(float(entry.get("match_percent") or 0.0), 6))
