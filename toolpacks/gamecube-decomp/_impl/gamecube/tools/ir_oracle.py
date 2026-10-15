#!/usr/bin/env python3
"""Does a source edit change behaviour? Compare canonical clang -O2 IR fingerprints.

A steering edit changes the source form but not the program: single-use temps
and aliases, accessor vs field, if vs ternary, `int` vs `s32`, operand order.
Clang -O2 (mem2reg, instcombine, GVN, inlining) erases exactly those, and keeps
what real fixes change: offsets, widths, constants, callees, call order,
conditions, control flow, emitted functions and data. This module compiles one
SMS unit with clang (flags from `compile_commands.json`) to optimized LLVM IR,
parses it, and reduces every function and global to a canonical fingerprint.

Fingerprint (per function), a Merkle value numbering:

* A pure value hashes as (opcode, types, operand hashes). Commutative operands
  are sorted; `icmp`/`fcmp` operands are sorted with the predicate swapped to
  match; a conditional `br`/`select` on a compare uses the predicate of the
  {P, not-P} pair that is ordered/strict/eq and swaps its targets to match.
* `getelementptr` reduces to (root, byte offset, sorted variable terms), so an
  `i8` offset GEP, a typed struct GEP and a chain of GEPs agree.
* A load hashes as (address, block, barrier count, may-alias earlier stores in
  the same barrier segment). Barriers are calls/invokes (except readnone
  `llvm.*` intrinsics and the prelude's `__ir_oracle_pure_*` shims), fences,
  atomics and volatile accesses. `llvm.lifetime.*`/`llvm.assume` are ignored.
* Each block's side effects form a sequence: barriers in order; the stores
  between two barriers in a canonical topological order of their may-alias
  constraints (distinct bases or disjoint constant ranges commute).
* Blocks are numbered by DFS from the entry in (canonicalized) successor
  order; phis hash their sorted (incoming block id, value) pairs, refined
  twice from a (type, block) seed so loops do not recurse.
* Names are dropped: SSA values, labels, named-struct type names (types are
  expanded structurally), attribute groups, metadata, `align`, `noundef`,
  `nonnull`, `dereferenceable(N)` and the other attribute and poison flags.
  Private/`.`-named/numbered-internal globals and functions are identified by
  content; `.cold.N` split functions are folded into their caller.
* Globals: constness + section + canonical type and initializer.

Library: `oracle_argv`, `run_clang`, `compile_ir`, `parse_ir`, `fingerprint`,
`data_order`, `unit_fingerprint`, `unsupported_functions`, `demangle`,
`template_entry`. Flags come from the repo's compile_commands.json, else from
a per-game template in `ir_oracle_flags/` (`flags-template` writes one).
Overrides may be text or bytes (written byte-exact). CLI:

  fingerprint --repo R --source src/X.cpp [--override FILE] [--json]
  compare --repo R --source S --a FILE --b FILE [--json]
  flags-template --repo R --game sms --detect config/GMSJ01 --out ir_oracle_flags/sms.json

Overrides never touch the repo: clang reads them through a VFS overlay
(`-ivfsoverlay`, `use-external-names: false`) mapped onto the original path,
so quoted includes and `__FILE__` resolve exactly as for the real file.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Optional

TOOLS_DIR = Path(__file__).resolve().parent
PRELUDE = TOOLS_DIR / "ir_oracle_prelude.h"

# --------------------------------------------------------------------------
# Compilation
# --------------------------------------------------------------------------


def find_clang() -> Optional[str]:
    env = os.environ.get("ORCH_IR_ORACLE_CLANG")
    if env:
        return env
    for name in ("clang", "clang-18", "clang-17"):
        path = shutil.which(name)
        if path:
            return path
    return None


FLAGS_DIR = TOOLS_DIR / "ir_oracle_flags"


def _compile_entry(repo: Path, source_rel: str) -> Optional[dict]:
    try:
        entries = json.loads((repo / "compile_commands.json").read_text())
    except (OSError, ValueError):
        return template_entry(repo, source_rel)
    target = (repo / source_rel).resolve()
    for e in entries:
        ef = Path(e.get("file", ""))
        if not ef.is_absolute():
            ef = Path(e.get("directory") or repo) / ef
        if ef.resolve() == target:
            return e
    return template_entry(repo, source_rel)


def _flags_templates(repo: Path) -> list[dict]:
    explicit = os.environ.get("ORCH_IR_ORACLE_FLAGS")
    paths = [Path(explicit)] if explicit else sorted(FLAGS_DIR.glob("*.json"))
    out = []
    for path in paths:
        try:
            data = json.loads(path.read_text())
        except (OSError, ValueError):
            continue
        if explicit or all((Path(repo) / d).exists() for d in data.get("detect") or ["\0"]):
            out.append(data)
    return out


def template_entry(repo: Path, source_rel: str) -> Optional[dict]:
    """A compile_commands-style entry from a per-game flags template
    (ir_oracle_flags/<game>.json), for checkouts without compile_commands.json.
    The template whose `detect` paths all exist in `repo` is used, or the file
    named by ORCH_IR_ORACLE_FLAGS."""
    repo = Path(repo)
    for data in _flags_templates(repo):
        variants = data.get("variants") or []
        idx = (data.get("units") or {}).get(source_rel)
        if idx is None:
            idx = (data.get("default") or {}).get(Path(source_rel).suffix)
        if idx is None or not 0 <= idx < len(variants):
            continue
        src = str(repo / source_rel)
        args = [a.replace("{source}", src).replace("{output}", str(repo / "build/ir_oracle.o")).replace("{repo}", str(repo))
                for a in variants[idx]]
        return {"directory": str(repo), "file": src, "arguments": args, "template": data.get("game")}
    return None


def flags_template(repo: Path, game: str, detect: list[str]) -> dict:
    """Build a flags template from `repo`/compile_commands.json (see template_entry)."""
    repo = Path(repo)
    root = str(repo.resolve())
    entries = json.loads((repo / "compile_commands.json").read_text())
    variants: list[list[str]] = []
    units: dict[str, int] = {}
    by_suffix: dict[str, dict[int, int]] = {}
    for e in entries:
        src = str(Path(e["file"]).resolve())
        rel = os.path.relpath(src, root)
        args = e.get("arguments") or shlex.split(e.get("command", ""))
        norm = ["{source}" if a == e["file"] or a == src else "{output}" if a == e.get("output") else a.replace(root, "{repo}")
                for a in args]
        if norm not in variants:
            variants.append(norm)
        idx = variants.index(norm)
        units[rel] = idx
        counts = by_suffix.setdefault(Path(rel).suffix, {})
        counts[idx] = counts.get(idx, 0) + 1
    default = {suf: max(c, key=c.get) for suf, c in by_suffix.items()}
    return {"game": game, "detect": detect, "variants": variants, "default": default, "units": dict(sorted(units.items()))}


def oracle_argv(
    repo: Path, source_rel: str, out: str = "-", clang: Optional[str] = None, flags: Optional[list[str]] = None
) -> list[str]:
    """Clang argv that compiles `source_rel` (relative to `repo`, run with
    cwd=repo) to -O2 LLVM IR on `out`. `flags` (a compile_commands
    `arguments` list) overrides the lookup in compile_commands.json, which
    falls back to a per-game flags template. Raises LookupError when no
    flags are found and FileNotFoundError when clang is missing."""
    repo = Path(repo)
    if flags is not None:
        raw = list(flags)
    else:
        entry = _compile_entry(repo, source_rel)
        if entry is None:
            raise LookupError(f"{source_rel}: not in {repo}/compile_commands.json")
        raw = entry.get("arguments") or shlex.split(entry.get("command", ""))
    clang = clang or find_clang()
    if not clang:
        raise FileNotFoundError("clang not found (set ORCH_IR_ORACLE_CLANG)")
    is_c = Path(source_rel).suffix == ".c"
    target = (repo / source_rel).resolve()
    flags: list[str] = []
    i = 1  # drop argv[0]
    while i < len(raw):
        a = raw[i]
        if a == "-c":
            i += 1
            continue
        if a in ("-o", "-MF", "-MT", "-MQ"):
            i += 2
            continue
        if a.startswith("-o") and len(a) > 2:
            i += 1
            continue
        if not a.startswith("-") and Path(a).suffix in {".c", ".cc", ".cpp", ".cxx", ".cp"}:
            p = Path(a) if Path(a).is_absolute() else repo / a
            if p.resolve() == target:
                i += 1
                continue
        if is_c:
            if a in ("--language=c++", "-xc++"):
                i += 1
                continue
            if a in ("-x", "--language") and i + 1 < len(raw) and raw[i + 1] == "c++":
                i += 2
                continue
            if a.startswith(("--std=c++", "-std=c++", "--std=gnu++", "-std=gnu++")):
                i += 1
                continue
            if a in ("-fno-cxx-exceptions", "-fno-rtti"):
                i += 1
                continue
        flags.append(a)
        i += 1
    if is_c:
        flags += ["-x", "c", "-std=gnu99"]
    return [
        clang,
        *flags,
        "-O2",
        "-fno-threadsafe-statics",
        "-Xclang",
        "-disable-lifetime-markers",
        "-fno-vectorize",
        "-fno-slp-vectorize",
        "-S",
        "-emit-llvm",
        "-w",
        "-include",
        str(PRELUDE),
        "-o",
        out,
        source_rel,
    ]


@dataclass
class IRResult:
    ok: bool
    ir_text: str = ""
    errors: list[str] = field(default_factory=list)
    argv: list[str] = field(default_factory=list)
    patched_headers: list[str] = field(default_factory=list)


_RETURN_OVERLOAD_RE = re.compile(
    r"^(?P<path>[^:\n]+):(?P<line>\d+):\d+: error: functions that differ only in their return type cannot be overloaded",
    re.M,
)
_ERROR_RE = re.compile(r"\berror\b")


def vfs_overlay(files: dict[Path, Path]) -> dict:
    """Clang VFS overlay mapping each real path onto an external file."""
    by_dir: dict[str, list[dict]] = {}
    for real, external in files.items():
        by_dir.setdefault(str(real.parent), []).append(
            {"name": real.name, "type": "file", "external-contents": str(external)}
        )
    return {
        "version": 0,
        "case-sensitive": "false",
        "use-external-names": False,
        "roots": [
            {"name": d, "type": "directory", "contents": c} for d, c in sorted(by_dir.items())
        ],
    }


def _as_text(data: str | bytes) -> str:
    return data.decode("utf-8", "surrogateescape") if isinstance(data, bytes) else data


def _as_bytes(data: str | bytes) -> bytes:
    return data if isinstance(data, bytes) else data.encode("utf-8", "surrogateescape")


def patch_return_overloads(stderr: str, repo: Path, current: dict[Path, str | bytes]) -> dict[Path, str]:
    """MWCC accepts a block-scope `extern T f();` whose return type differs
    from a visible declaration (cameralib.hpp vs Resolution.hpp); clang does
    not. Blank such `extern` lines in an overlay copy of the header."""
    patched: dict[Path, str] = {}
    for m in _RETURN_OVERLOAD_RE.finditer(stderr):
        path = Path(m["path"])
        if not path.is_absolute():
            path = repo / path
        path = path.resolve()
        text = patched.get(path) or (_as_text(current[path]) if path in current else None)
        if text is None:
            try:
                text = path.read_bytes().decode("utf-8", "surrogateescape")
            except OSError:
                continue
        lines = text.split("\n")
        n = int(m["line"]) - 1
        if 0 <= n < len(lines) and re.match(r"\s*extern\b", lines[n]):
            lines[n] = "/* ir_oracle: " + lines[n].strip().replace("*/", "* /") + " */"
            patched[path] = "\n".join(lines)
    return patched


def run_clang(argv: list[str], cwd: Path, files: Optional[dict[Path, str | bytes]] = None,
              timeout: int = 60) -> IRResult:
    """Run an `oracle_argv` command with cwd=`cwd`; `files` ({absolute real
    path: text or bytes}) are read through a VFS overlay, never written to
    the tree. Retries with return-type overload patches (see
    patch_return_overloads)."""
    cwd = Path(cwd).resolve()
    files = {Path(k): v for k, v in (files or {}).items()}
    patched_all: list[str] = []
    with tempfile.TemporaryDirectory(prefix="ir_oracle_") as tmp:
        tmpd = Path(tmp)
        for attempt in range(3):
            run_argv = list(argv)
            if files:
                mapping: dict[Path, Path] = {}
                for k, (real, data) in enumerate(sorted(files.items())):
                    ext = tmpd / f"f{attempt}_{k}{real.suffix}"
                    ext.write_bytes(_as_bytes(data))
                    mapping[real] = ext
                ov = tmpd / f"overlay{attempt}.json"
                ov.write_text(json.dumps(vfs_overlay(mapping)))
                run_argv[1:1] = ["-ivfsoverlay", str(ov)]
            try:
                proc = subprocess.run(run_argv, cwd=cwd, capture_output=True, timeout=timeout)
            except subprocess.TimeoutExpired:
                return IRResult(False, errors=[f"timeout after {timeout}s"], argv=run_argv)
            except OSError as e:
                return IRResult(False, errors=[str(e)], argv=run_argv)
            stderr = proc.stderr.decode("utf-8", "replace")
            if proc.returncode == 0:
                return IRResult(True, proc.stdout.decode("utf-8", "replace"), [], run_argv, patched_all)
            patch = patch_return_overloads(stderr, cwd, files)
            if not patch:
                errs = [l for l in stderr.splitlines() if _ERROR_RE.search(l)]
                return IRResult(False, errors=(errs or stderr.splitlines())[:20], argv=run_argv)
            files.update(patch)
            patched_all += [str(p.relative_to(cwd)) if p.is_relative_to(cwd) else str(p) for p in patch]
    return IRResult(False, errors=["return-type overload retries exhausted"], argv=argv)


def compile_ir(
    repo: Path,
    source_rel: str,
    override_text: Optional[str | bytes] = None,
    timeout: int = 60,
    overrides: Optional[dict[str, str | bytes]] = None,
    clang: Optional[str] = None,
    flags: Optional[list[str]] = None,
) -> IRResult:
    """Compile one unit to -O2 IR. `override_text` replaces the source and
    `overrides` ({repo-relative path: text or bytes}) replaces headers, all
    through a VFS overlay; nothing is written under `repo`. `flags` replaces
    the compile_commands.json lookup."""
    repo = Path(repo).resolve()
    files: dict[Path, str | bytes] = {}
    if overrides:
        for rel, text in overrides.items():
            files[(repo / rel).resolve()] = text
    if override_text is not None:
        files[(repo / source_rel).resolve()] = override_text
    try:
        argv = oracle_argv(repo, source_rel, "-", clang=clang, flags=flags)
    except (LookupError, FileNotFoundError) as e:
        return IRResult(False, errors=[str(e)])
    return run_clang(argv, repo, files, timeout)


_DEFINE_NAME_RE = re.compile(r"^define\b[^@]*(@(?:\"[^\"]*\"|[-\w$.]+))\(", re.M)
_ATTR_GROUP_LINE_RE = re.compile(r"^attributes (#\d+) = \{([^}]*)\}", re.M)
ALLOWED_INTRINSIC_PREFIXES = (
    "@llvm.memcpy.", "@llvm.memmove.", "@llvm.memset.", "@llvm.va_start", "@llvm.va_end", "@llvm.va_copy",
    "@llvm.trap", "@llvm.expect.", "@llvm.objectsize.", "@llvm.prefetch", "@llvm.stacksave",
    "@llvm.stackrestore", "@llvm.ppc.",
)
UNSUPPORTED_CALLEES = ("@setjmp", "@_setjmp", "@sigsetjmp", "@__setjmp", "@longjmp")


def unsupported_functions(ir_text: str) -> dict[str, str]:
    """IR function name (no `@`) -> reason, for constructs the fingerprint does
    not model: inline asm, `naked`, setjmp/longjmp and llvm intrinsics outside
    the pure/ignored/allowed lists. A gate treats these functions as
    unanalysable."""
    naked_groups = {m.group(1) for m in _ATTR_GROUP_LINE_RE.finditer(ir_text) if re.search(r"\bnaked\b", m.group(2))}
    allowed = PURE_INTRINSIC_PREFIXES + IGNORED_INTRINSIC_PREFIXES + ALLOWED_INTRINSIC_PREFIXES
    out: dict[str, str] = {}
    for m in _DEFINE_NAME_RE.finditer(ir_text):
        name = m.group(1)
        line_end = ir_text.find("\n", m.start())
        header = ir_text[m.start():line_end]
        end = ir_text.find("\n}", line_end)
        body = ir_text[line_end:end if end >= 0 else len(ir_text)]
        clean = name[1:].strip('"')
        if re.search(r"\bnaked\b", header) or any(g in header.split(")")[-1].split() for g in naked_groups):
            out[clean] = "naked"
        elif re.search(r"\basm\s+(?:sideeffect\s+)?(?:alignstack\s+)?(?:inteldialect\s+)?\"", body):
            out[clean] = "inline asm"
        elif any(c + "(" in body for c in UNSUPPORTED_CALLEES):
            out[clean] = "setjmp/longjmp"
        else:
            for call in re.findall(r"@llvm\.[\w.]+", body):
                if not call.startswith(allowed):
                    out[clean] = f"intrinsic {call}"
                    break
    return out


# --------------------------------------------------------------------------
# IR parsing
# --------------------------------------------------------------------------

_TOKEN_RE = re.compile(
    r"""
    (?P<str>c?"(?:[^"\\]|\\.)*")
   |(?P<local>%(?:"(?:[^"\\]|\\.)*"|[-\w$.]+))
   |(?P<global>@(?:"(?:[^"\\]|\\.)*"|[-\w$.]+))
   |(?P<attr>\#\d+)
   |(?P<num>-?(?:0x[KLMHR]?[0-9A-Fa-f]+|\d+(?:\.\d+)?(?:[eE][-+]?\d+)?))
   |(?P<word>[A-Za-z_$][-\w$.]*)
   |(?P<punct>\.\.\.|[()\[\]{}<>,=*:!])
    """,
    re.X,
)

# Attributes with a parenthesised argument (possibly nested) that never matter.
_PAREN_ATTR_RE = re.compile(
    r"\b(?:initializes|captures|range|dereferenceable|dereferenceable_or_null|nofpclass|"
    r"memory|allocsize|inrange|alignstack|allockind|uwtable|vscale_range|byval|sret|"
    r"elementtype|preallocated|inalloca|byref)\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)"
)
# Single-word attributes and poison flags, dropped wherever they appear.
DROP_WORDS = frozenset(
    """noundef nonnull tail musttail notail nuw nsw exact disjoint inbounds nneg samesign
    readnone readonly writeonly noalias nocapture nofree signext zeroext inreg returned
    immarg noext local_unnamed_addr unnamed_addr dso_local dso_preemptable fast nnan ninf
    nsz arcp contract afn reassoc nonlazybind noinline alwaysinline nounwind willreturn
    mustprogress norecurse nosync cold hot minsize optsize speculatable convergent
    noreturn noduplicate nomerge nobuiltin builtin strictfp swiftself swifterror
    hidden protected default""".split()
)
LINKAGES = frozenset(
    """private internal available_externally linkonce weak common appending extern_weak
    linkonce_odr weak_odr external""".split()
)
CALLING_CONVS = frozenset("ccc fastcc coldcc cc".split())
# Kept in the fingerprint (they change what an instruction or call means):
# integer poison flags, fast-math flags, a non-default calling convention, and
# the ABI / control-flow call attributes. Still ignored as non-semantic: the
# value-range and pointer facts (noundef, nonnull, align, dereferenceable,
# range, nofpclass, noalias, nocapture/captures), memory/unwind summaries the
# optimizer infers from the callee (readnone, readonly, writeonly, memory(..),
# nounwind, willreturn, ...; the callee itself is hashed), `tail`, linkage
# decoration and every !metadata attachment. `inbounds`/`nuw` on a GEP are
# also ignored: GEPs are reduced to a root plus byte offset.
POISON_FLAGS = frozenset("nuw nsw exact disjoint nneg samesign".split())
FAST_MATH_FLAGS = frozenset("fast nnan ninf nsz arcp contract afn reassoc".split())
CALL_ABI_ATTRS = frozenset("signext zeroext inreg noreturn returns_twice swiftself swifterror nest".split())
SEMANTIC_FLAGS = POISON_FLAGS | FAST_MATH_FLAGS | CALL_ABI_ATTRS
SEMANTIC_GROUP_ATTRS = frozenset("noreturn returns_twice strictfp".split())
_PAREN_ABI_RE = re.compile(r"\b(byval|sret|inalloca|preallocated|byref)\(")
_FLAGLESS_OPS = frozenset(["getelementptr"])
PRIMITIVE_TYPES = frozenset(
    "void half bfloat float double fp128 x86_fp80 ppc_fp128 ptr label metadata token x86_amx".split()
)
_INT_TYPE_RE = re.compile(r"^i\d+$")


def _strip_metadata(text: str) -> str:
    """Cut `, !name !N` attachments (always trailing) outside string literals."""
    in_str = False
    i = 0
    n = len(text)
    while i < n:
        c = text[i]
        if c == '"':
            in_str = not in_str
        elif not in_str and c == "," and text[i + 1 : i + 4].lstrip().startswith("!"):
            return text[:i]
        elif not in_str and c == ";":
            return text[:i]
        i += 1
    return text


def tokenize(text: str) -> list[str]:
    text = _PAREN_ATTR_RE.sub(" ", _strip_metadata(text))
    out: list[str] = []
    toks = [m.group(0) for m in _TOKEN_RE.finditer(text)]
    i = 0
    while i < len(toks):
        t = toks[i]
        if t in DROP_WORDS or t.startswith("#"):
            i += 1
            continue
        if t == "align" and i + 1 < len(toks) and re.fullmatch(r"\d+", toks[i + 1]):
            i += 2
            continue
        out.append(t)
        i += 1
    return out


def split_top(toks: list[str], sep: str = ",") -> list[list[str]]:
    groups: list[list[str]] = [[]]
    depth = 0
    for t in toks:
        if t in ("(", "[", "{", "<"):
            depth += 1
        elif t in (")", "]", "}", ">"):
            depth -= 1
        if t == sep and depth == 0:
            groups.append([])
        else:
            groups[-1].append(t)
    return groups


@dataclass
class Instr:
    result: Optional[str]
    opcode: str
    tokens: list[str]  # tokens after the opcode, attributes stripped
    text: str
    flags: tuple = ()  # semantic flags/attributes (SEMANTIC_FLAGS, `cc:N`, ABI paren attrs)
    attr_groups: tuple = ()  # `#N` attribute-group references


def semantic_flags(text: str) -> tuple[tuple, tuple]:
    """(sorted semantic flags, attribute-group refs) of one IR line."""
    cleaned = _strip_metadata(text)
    flags = {m.group(1) for m in _PAREN_ABI_RE.finditer(cleaned)}
    raw = [m.group(0) for m in _TOKEN_RE.finditer(_PAREN_ATTR_RE.sub(" ", cleaned))]
    groups = []
    for k, t in enumerate(raw):
        if t in SEMANTIC_FLAGS:
            flags.add(t)
        elif t in ("fastcc", "coldcc"):
            flags.add("cc:" + t)
        elif t == "cc" and k + 1 < len(raw) and raw[k + 1].isdigit():
            flags.add("cc:" + raw[k + 1])
        elif t.startswith("#"):
            groups.append(t)
    return tuple(sorted(flags)), tuple(groups)


@dataclass
class Block:
    label: str
    instructions: list[Instr] = field(default_factory=list)


@dataclass
class Function:
    name: str
    linkage: str
    ret_type: Any
    params: list[tuple[Any, Optional[str]]]
    vararg: bool
    blocks: list[Block] = field(default_factory=list)
    section: Optional[str] = None
    flags: tuple = ()  # calling convention, ABI parameter/return attributes
    attr_groups: tuple = ()


@dataclass
class Global:
    name: str
    linkage: str
    constness: str  # constant | global | alias
    section: Optional[str]
    type: Any
    initializer: list[str]  # tokens
    text: str


@dataclass
class Module:
    functions: dict[str, Function] = field(default_factory=dict)
    globals: dict[str, Global] = field(default_factory=dict)
    types: dict[str, Any] = field(default_factory=dict)  # %name -> parsed type
    declarations: dict[str, Any] = field(default_factory=dict)
    pointer_size: int = 4
    attr_groups: dict[str, frozenset] = field(default_factory=dict)  # #N -> semantic attributes


class TypeParser:
    """Parse type token runs into tuples; named struct references stay
    ('named', '%x') and are expanded by `canon_type`."""

    def __init__(self, type_names: Iterable[str] = ()):
        self.type_names = set(type_names)

    def is_type_start(self, t: str) -> bool:
        return (
            t in PRIMITIVE_TYPES
            or bool(_INT_TYPE_RE.match(t))
            or t in ("[", "{")
            or t == "<"
            or t in self.type_names
            or t == "opaque"
        )

    def parse(self, toks: list[str], i: int) -> tuple[Any, int]:
        t = toks[i]
        if t == "[" or t == "<":
            close = "]" if t == "[" else ">"
            if t == "<" and i + 1 < len(toks) and toks[i + 1] == "{":
                body, j = self.parse(toks, i + 1)
                ty = ("struct", True, body[2])
                i = j + 1  # skip '>'
            else:
                n = int(toks[i + 1])
                assert toks[i + 2] == "x", toks[i : i + 4]
                elem, j = self.parse(toks, i + 3)
                assert toks[j] == close
                ty = ("array" if close == "]" else "vec", n, elem)
                i = j + 1
        elif t == "{":
            elems = []
            j = i + 1
            if toks[j] == "}":
                ty = ("struct", False, ())
                i = j + 1
            else:
                while True:
                    e, j = self.parse(toks, j)
                    elems.append(e)
                    if toks[j] == ",":
                        j += 1
                        continue
                    assert toks[j] == "}", toks[j]
                    break
                ty = ("struct", False, tuple(elems))
                i = j + 1
        elif t in self.type_names:
            ty = ("named", t)
            i += 1
        elif _INT_TYPE_RE.match(t):
            ty = ("int", int(t[1:]))
            i += 1
        elif t == "ptr":
            ty = ("ptr",)
            i += 1
            if i < len(toks) and toks[i] == "addrspace":
                i += 4  # addrspace ( N )
        elif t in PRIMITIVE_TYPES:
            ty = ("prim", t)
            i += 1
        elif t == "opaque":
            ty = ("opaque",)
            i += 1
        else:
            raise ValueError(f"not a type at {toks[i:i + 6]}")
        # function type suffix
        while i < len(toks) and toks[i] == "(" and ty[0] != "ptr":
            params = []
            vararg = False
            j = i + 1
            while toks[j] != ")":
                if toks[j] == "...":
                    vararg = True
                    j += 1
                else:
                    p, j = self.parse(toks, j)
                    params.append(p)
                if toks[j] == ",":
                    j += 1
            ty = ("func", ty, tuple(params), vararg)
            i = j + 1
        while i < len(toks) and toks[i] == "*":
            ty = ("ptr",)
            i += 1
        return ty, i


_DEFINE_LABEL_RE = re.compile(r'^(?P<label>[-\w$.]+|"(?:[^"\\]|\\.)*"):')
_TYPE_DEF_RE = re.compile(r"^(%[-\w$.]+|%\"[^\"]*\")\s*=\s*type\s+(.*)$")
_SOURCE_LINE_DATALAYOUT = re.compile(r'^target datalayout\s*=\s*"([^"]*)"')


def parse_ir(text: str) -> Module:
    mod = Module()
    lines = text.split("\n")
    type_defs: dict[str, str] = {}
    for line in lines:
        m = _TYPE_DEF_RE.match(line)
        if m:
            type_defs[m.group(1)] = m.group(2)
        m = _SOURCE_LINE_DATALAYOUT.match(line)
        if m:
            pm = re.search(r"(?:^|-)p(?:0)?:(\d+)", m.group(1))
            mod.pointer_size = int(pm.group(1)) // 8 if pm else 8
    tp = TypeParser(type_defs)
    for name, body in type_defs.items():
        toks = tokenize(body)
        if toks == ["opaque"]:
            mod.types[name] = ("opaque_named", re.sub(r"\.\d+$", "", name))
        else:
            mod.types[name], _ = tp.parse(toks, 0)

    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        if line.startswith("define "):
            fn, i = _parse_function(lines, i, tp)
            mod.functions[fn.name] = fn
            continue
        if line.startswith("declare "):
            toks = tokenize(line[len("declare ") :])
            for t in toks:
                if t.startswith("@"):
                    mod.declarations[t] = line
                    break
        elif line.startswith("@"):
            g = _parse_global(line, tp)
            if g is not None:
                mod.globals[g.name] = g
        elif line.startswith("attributes #"):
            m = re.match(r"^attributes (#\d+) = \{(.*)\}", line)
            if m:
                words = set(re.findall(r'"[^"]*"|[A-Za-z_][\w.]*', m.group(2)))
                mod.attr_groups[m.group(1)] = frozenset(words & SEMANTIC_GROUP_ATTRS)
        i += 1
    return mod


def _parse_header(toks: list[str], tp: TypeParser) -> tuple[str, str, Any, list, bool, Optional[str]]:
    name_i = next(k for k, t in enumerate(toks) if t.startswith("@") and k + 1 < len(toks) and toks[k + 1] == "(")
    name = toks[name_i]
    linkage = "external"
    pre = []
    for t in toks[:name_i]:
        if t in LINKAGES:
            linkage = t
        elif t in CALLING_CONVS:
            continue
        else:
            pre.append(t)
    # return type: last parseable type run among `pre`
    ret: Any = ("prim", "void")
    for k in range(len(pre)):
        if tp.is_type_start(pre[k]):
            try:
                ty, j = tp.parse(pre, k)
            except (ValueError, AssertionError, IndexError):
                continue
            if j == len(pre):
                ret = ty
                break
    # params
    depth = 0
    j = name_i + 1
    start = j + 1
    while True:
        if toks[j] in ("(", "[", "{", "<"):
            depth += 1
        elif toks[j] in (")", "]", "}", ">"):
            depth -= 1
            if depth == 0:
                break
        j += 1
    params = []
    vararg = False
    for grp in split_top(toks[start:j]):
        if not grp:
            continue
        if grp == ["..."]:
            vararg = True
            continue
        ty, k = tp.parse(grp, 0)
        pname = grp[-1] if grp[-1].startswith("%") and grp[-1] not in tp.type_names and len(grp) > k else None
        params.append((ty, pname))
    section = None
    rest = toks[j + 1 :]
    for k, t in enumerate(rest):
        if t == "section" and k + 1 < len(rest):
            section = rest[k + 1]
    return name, linkage, ret, params, vararg, section


def _parse_instr(line: str) -> Optional[Instr]:
    s = line.strip()
    if not s or s.startswith(";"):
        return None
    result = None
    m = re.match(r'^(%(?:"(?:[^"\\]|\\.)*"|[-\w$.]+))\s*=\s*(.*)$', s)
    if m:
        result, s = m.group(1), m.group(2)
    toks = tokenize(s)
    if not toks:
        return None
    flags, groups = semantic_flags(s)
    if toks[0] in _FLAGLESS_OPS:
        flags = ()
    return Instr(result, toks[0], toks[1:], s, flags, groups)


def _parse_function(lines: list[str], i: int, tp: TypeParser) -> tuple[Function, int]:
    header = lines[i]
    htoks = tokenize(header[len("define ") :].rstrip().rstrip("{"))
    name, linkage, ret, params, vararg, section = _parse_header(htoks, tp)
    hflags, hgroups = semantic_flags(header[len("define ") :].rstrip().rstrip("{"))
    fn = Function(name, linkage, ret, params, vararg, section=section, flags=hflags, attr_groups=hgroups)
    i += 1
    cur: Optional[Block] = None
    unnamed_params = sum(1 for _, p in params if p is None or re.fullmatch(r"%\d+", p))
    while i < len(lines) and lines[i].rstrip() != "}":
        line = lines[i]
        i += 1
        if line.count("[") > line.count("]") and re.match(r"\s+(?:%\S+\s*=\s*)?(?:switch|indirectbr)\b", line):
            while i < len(lines) and line.count("[") > line.count("]"):
                line += " " + lines[i].strip()
                i += 1
        if not line.strip() or line.lstrip().startswith(";"):
            continue
        m = _DEFINE_LABEL_RE.match(line)
        if m and not line[0].isspace():
            label = m.group("label")
            cur = Block("%" + label)
            fn.blocks.append(cur)
            continue
        ins = _parse_instr(line)
        if ins is None:
            continue
        if cur is None:
            cur = Block(f"%{unnamed_params}")
            fn.blocks.append(cur)
        cur.instructions.append(ins)
    return fn, i + 1


def _parse_global(line: str, tp: TypeParser) -> Optional[Global]:
    m = re.match(r'^(@(?:"(?:[^"\\]|\\.)*"|[-\w$.]+))\s*=\s*(.*)$', line)
    if not m:
        return None
    name, rest = m.group(1), m.group(2)
    toks = tokenize(rest)
    linkage = "external"
    k = 0
    while k < len(toks) and toks[k] not in ("global", "constant", "alias", "ifunc"):
        if toks[k] in LINKAGES:
            linkage = toks[k]
        k += 1
    if k >= len(toks):
        return None
    constness = toks[k]
    groups = split_top(toks[k + 1 :])
    body = groups[0]
    section = None
    for g in groups[1:]:
        if g and g[0] == "section" and len(g) > 1:
            section = g[1]
    try:
        ty, j = tp.parse(body, 0)
    except (ValueError, AssertionError, IndexError):
        ty, j = ("unknown",), 0
    return Global(name, linkage, constness, section, ty, body[j:], line)


# --------------------------------------------------------------------------
# Fingerprint
# --------------------------------------------------------------------------


def H(obj: Any) -> str:
    return hashlib.blake2b(repr(obj).encode(), digest_size=8).hexdigest()


COMMUTATIVE = frozenset("add mul and or xor fadd fmul".split())
ICMP_SWAP = {
    "eq": "eq", "ne": "ne", "slt": "sgt", "sgt": "slt", "sle": "sge", "sge": "sle",
    "ult": "ugt", "ugt": "ult", "ule": "uge", "uge": "ule",
}
FCMP_SWAP = {
    "false": "false", "true": "true", "oeq": "oeq", "one": "one", "ueq": "ueq", "une": "une",
    "ord": "ord", "uno": "uno", "olt": "ogt", "ogt": "olt", "ole": "oge", "oge": "ole",
    "ult": "ugt", "ugt": "ult", "ule": "uge", "uge": "ule",
}
ICMP_INV = {
    "eq": "ne", "ne": "eq", "slt": "sge", "sge": "slt", "sgt": "sle", "sle": "sgt",
    "ult": "uge", "uge": "ult", "ugt": "ule", "ule": "ugt",
}
FCMP_INV = {
    "false": "true", "true": "false", "oeq": "une", "une": "oeq", "one": "ueq", "ueq": "one",
    "ord": "uno", "uno": "ord", "olt": "uge", "uge": "olt", "ogt": "ule", "ule": "ogt",
    "ole": "ugt", "ugt": "ole", "oge": "ult", "ult": "oge",
}
# Of {P, not P}, the preferred spelling (eq / strict / ordered / true).
_PREFERRED = frozenset("eq slt sgt ult ugt true oeq one ord olt ogt ole oge".split())

PURE_INTRINSIC_PREFIXES = tuple(
    "@llvm." + n
    for n in """fabs. sqrt. fma. fmuladd. smax. smin. umax. umin. abs. ctlz. cttz. bswap.
    copysign. minnum. maxnum. minimum. maximum. floor. ceil. trunc. rint. nearbyint. round.
    roundeven. ctpop. fshl. fshr. bitreverse. sadd.sat. uadd.sat. ssub.sat. usub.sat.
    sadd.with.overflow. uadd.with.overflow. ssub.with.overflow. usub.with.overflow.
    smul.with.overflow. umul.with.overflow. is.fpclass. canonicalize.""".split()
)
IGNORED_INTRINSIC_PREFIXES = (
    "@llvm.lifetime.",
    "@llvm.assume",
    "@llvm.dbg.",
    "@llvm.experimental.noalias.scope.decl",
    "@llvm.pseudoprobe",
    "@llvm.donothing",
    "@llvm.invariant.",
)
PURE_FUNCTION_PREFIXES = ("@__ir_oracle_pure_",)
# Treat direct calls to const member functions (`_ZNK...`) as reading but not
# writing memory. Unsound in general (a const method may write globals), so
# off unless ORCH_IR_ORACLE_CONST_READONLY=1.
CONST_METHODS_READONLY = os.environ.get("ORCH_IR_ORACLE_CONST_READONLY") == "1"
BARRIER_OPS = frozenset("fence atomicrmw cmpxchg va_arg".split())
TERMINATORS = frozenset("ret br switch indirectbr invoke resume unreachable callbr cleanupret catchret catchswitch".split())

_COLD_RE = re.compile(r"\.cold\.\d+$")
_NUMBERED_RE = re.compile(r"\.\d+$")


def _strip_quotes(name: str) -> str:
    return name[0] + name[2:-1] if len(name) > 2 and name[1] == '"' else name


class ModuleHasher:
    def __init__(self, mod: Module):
        self.mod = mod
        self._type_canon: dict[Any, str] = {}
        self._global_id: dict[str, str] = {}
        self._in_progress: set[str] = set()
        self.fn_fps: dict[str, str] = {}
        self._gstore: dict[str, Optional[list[Instr]]] = {}

    # ---- types -----------------------------------------------------------
    def resolve(self, ty: Any) -> Any:
        while ty[0] == "named":
            ty = self.mod.types.get(ty[1], ("opaque_named", ty[1]))
        return ty

    def canon_type(self, ty: Any) -> str:
        key = ty
        if key in self._type_canon:
            return self._type_canon[key]
        t = self.resolve(ty)
        kind = t[0]
        if kind == "int":
            s = f"i{t[1]}"
        elif kind == "ptr":
            s = "ptr"
        elif kind == "prim":
            s = t[1]
        elif kind == "array":
            s = f"[{t[1]}x{self.canon_type(t[2])}]"
        elif kind == "vec":
            s = f"<{t[1]}x{self.canon_type(t[2])}>"
        elif kind == "struct":
            inner = ",".join(self.canon_type(e) for e in t[2])
            s = f"<{{{inner}}}>" if t[1] else f"{{{inner}}}"
        elif kind == "func":
            s = f"{self.canon_type(t[1])}({','.join(self.canon_type(p) for p in t[2])}{',...' if t[3] else ''})"
        elif kind == "opaque_named":
            s = "opaque:" + _NUMBERED_RE.sub("", t[1])
        else:
            s = repr(t)
        self._type_canon[key] = s
        return s

    def layout(self, ty: Any) -> tuple[int, int]:
        """(size, align) in bytes, big-endian 32-bit PowerPC defaults."""
        t = self.resolve(ty)
        kind = t[0]
        if kind == "int":
            size = max(1, (t[1] + 7) // 8)
            align = 1 if size == 1 else 2 if size == 2 else 4 if size <= 4 else 8
            return size, align
        if kind == "ptr":
            return self.mod.pointer_size, self.mod.pointer_size
        if kind == "prim":
            return {
                "half": (2, 2), "bfloat": (2, 2), "float": (4, 4), "double": (8, 8),
                "fp128": (16, 16), "ppc_fp128": (16, 16), "x86_fp80": (16, 16),
            }.get(t[1], (0, 1))
        if kind == "array":
            es, ea = self.layout(t[2])
            return es * t[1], ea
        if kind == "vec":
            es, _ = self.layout(t[2])
            size = es * t[1]
            return size, max(1, size)
        if kind == "struct":
            off = 0
            align = 1
            for e in t[2]:
                es, ea = self.layout(e)
                if not t[1]:
                    off = (off + ea - 1) // ea * ea
                    align = max(align, ea)
                off += es
            if not t[1]:
                off = (off + align - 1) // align * align
            return off, align
        return 0, 1

    def field_offset(self, ty: Any, idx: int) -> tuple[int, Any]:
        t = self.resolve(ty)
        off = 0
        for k, e in enumerate(t[2]):
            es, ea = self.layout(e)
            if not t[1]:
                off = (off + ea - 1) // ea * ea
            if k == idx:
                return off, e
            off += es
        raise IndexError(idx)

    # ---- global identity ------------------------------------------------------
    def global_id(self, name: str) -> str:
        """How a reference to `@name` hashes: its name when external or
        source-named, its content when the name is compiler-generated."""
        if name in self._global_id:
            return self._global_id[name]
        if name in self._in_progress:
            return "@<cycle>" + _NUMBERED_RE.sub("", name)
        self._in_progress.add(name)
        try:
            ident = self._compute_global_id(name)
        finally:
            self._in_progress.discard(name)
        self._global_id[name] = ident
        return ident

    def _content_named(self, name: str, linkage: str) -> bool:
        bare = _strip_quotes(name)[1:]
        return (
            linkage == "private"
            or bare.startswith(".")
            or bare.startswith("__const.")
            or (linkage == "internal" and bool(_NUMBERED_RE.search(bare)))
        )

    def _compute_global_id(self, name: str) -> str:
        fn = self.mod.functions.get(name)
        if fn is not None:
            if _COLD_RE.search(name):
                return "cold:" + self.function_fp(fn)
            if self._content_named(name, fn.linkage):
                return "fn:" + self.function_fp(fn)
            return name
        g = self.mod.globals.get(name)
        if g is not None and self._content_named(name, g.linkage):
            return "data:" + self.global_fp(g)
        return name

    def global_fp(self, g: Global) -> str:
        return H(
            (
                g.constness,
                g.section,
                self.canon_type(g.type) if g.type != ("unknown",) else "?",
                tuple(self.const_tokens(g.initializer)),
            )
        )

    def const_tokens(self, toks: list[str], local=None) -> list[str]:
        out = []
        tp = self.mod.types
        for t in toks:
            if t.startswith("@"):
                out.append(self.global_id(t))
            elif t.startswith("%"):
                if t in tp:
                    out.append(self.canon_type(("named", t)))
                elif local is not None:
                    out.append(local(t))
                else:
                    out.append(t)
            else:
                out.append(t)
        return out

    def global_store_summary(self, name: str) -> Optional[list[Instr]]:
        """For an internal function (e.g. a `.cold.N` static-local
        initializer) whose only effects are stores to globals and
        `__cxa_atexit` registrations: those store instructions. Else None."""
        if name in self._gstore:
            return self._gstore[name]
        fn = self.mod.functions.get(name)
        result: Optional[list[Instr]] = None
        if fn is not None and fn.linkage in ("internal", "private") and not fn.params:
            stores: list[Instr] = []
            ok = True
            for b in fn.blocks:
                for ins in b.instructions:
                    if ins.opcode in ("br", "ret"):
                        continue
                    if ins.opcode == "store" and "volatile" not in ins.tokens[:1]:
                        if any(t.startswith("%") and t not in self.mod.types for t in ins.tokens):
                            ok = False
                            break
                        stores.append(ins)
                        continue
                    if ins.opcode == "call":
                        callee = next((t for t in ins.tokens if t.startswith("@")), "")
                        if callee in ("@__cxa_atexit", "@atexit") or callee.startswith(IGNORED_INTRINSIC_PREFIXES):
                            continue
                    ok = False
                    break
                if not ok:
                    break
            if ok:
                result = stores
        self._gstore[name] = result
        return result

    # ---- functions ----------------------------------------------------------------
    def function_fp(self, fn: Function) -> str:
        if fn.name in self.fn_fps:
            return self.fn_fps[fn.name]
        fp = _FunctionHasher(self, fn).fingerprint()
        self.fn_fps[fn.name] = fp
        return fp


class _FunctionHasher:
    def __init__(self, mh: ModuleHasher, fn: Function):
        self.mh = mh
        self.fn = fn
        self.tp = TypeParser(mh.mod.types)
        self.blocks = {b.label: b for b in fn.blocks}
        self.defs: dict[str, tuple[Block, int, Instr]] = {}
        for b in fn.blocks:
            for k, ins in enumerate(b.instructions):
                if ins.result:
                    self.defs[ins.result] = (b, k, ins)
        self.params: dict[str, int] = {}
        unnamed = 0
        for k, (_, pname) in enumerate(fn.params):
            if pname is None:
                pname = f"%{unnamed}"
            if re.fullmatch(r"%\d+", pname):
                unnamed += 1
            self.params[pname] = k
        self.memo: dict[str, str] = {}
        self.phi_tokens: dict[str, str] = {}
        self.mem_ctx: dict[str, tuple] = {}  # load result -> (barrier idx, [earlier store instrs])
        self.bid: dict[str, int] = {}
        self.alloca_ord: dict[str, int] = {}
        self.bstate: dict[str, Optional[tuple]] = {}
        self.escaped_allocas: set[str] = set()
        self._escaped_roots: Optional[set[str]] = None
        self.preds: dict[str, list[str]] = {}
        self.rpo: dict[str, int] = {}
        self.forwarders: dict[str, str] = {}
        self.forwarder_pred: dict[str, str] = {}

    # ---- helpers ----------------------------------------------------------------
    def is_type_tok(self, t: str) -> bool:
        return self.tp.is_type_start(t)

    def parse_type(self, toks: list[str], i: int = 0) -> tuple[Any, int]:
        return self.tp.parse(toks, i)

    def callee(self, ins: Instr) -> Optional[str]:
        depth = 0
        for k, t in enumerate(ins.tokens):
            if t in ("(", "[", "{", "<"):
                depth += 1
            elif t in (")", "]", "}", ">"):
                depth -= 1
            elif depth == 0 and (t.startswith("@") or (t.startswith("%") and t not in self.mh.mod.types)):
                if k + 1 < len(ins.tokens) and ins.tokens[k + 1] == "(":
                    return t
        return None

    def call_kind(self, ins: Instr) -> str:
        """'ignored' | 'pure' | 'readonly' | 'gstore' | 'barrier' for a call."""
        if ins.opcode != "call":
            return "barrier"
        c = self.callee(ins) or ""
        if c.startswith(IGNORED_INTRINSIC_PREFIXES):
            return "ignored"
        if c.startswith(PURE_INTRINSIC_PREFIXES) or c.startswith(PURE_FUNCTION_PREFIXES):
            return "pure"
        if self.mh.global_store_summary(c) is not None:
            return "gstore"
        if CONST_METHODS_READONLY and c.startswith("@_ZNK"):
            return "readonly"
        return "barrier"

    def is_volatile(self, ins: Instr) -> bool:
        return ins.opcode in ("load", "store") and "volatile" in ins.tokens[:2]

    def is_barrier(self, ins: Instr) -> bool:
        if ins.opcode in ("call", "invoke", "callbr"):
            return self.call_kind(ins) == "barrier"
        if ins.opcode in BARRIER_OPS:
            return True
        if ins.opcode in ("load", "store") and ("atomic" in ins.tokens or self.is_volatile(ins)):
            return True
        return False

    # ---- control flow -------------------------------------------------------------
    def terminator(self, b: Block) -> Optional[Instr]:
        for ins in reversed(b.instructions):
            if ins.opcode in TERMINATORS:
                return ins
        return None

    def cmp_def(self, tok: str) -> Optional[Instr]:
        d = self.defs.get(tok)
        if d and d[2].opcode in ("icmp", "fcmp"):
            return d[2]
        return None

    def canonical_branch(self, ins: Instr) -> tuple[Optional[str], list[str], bool]:
        """(condition token or None, successor labels, inverted?) for a br."""
        toks = ins.tokens
        if toks[0] == "label":
            return None, [toks[1]], False
        groups = split_top(toks)
        cond = groups[0][-1]
        t, f = groups[1][-1], groups[2][-1]
        cmp = self.cmp_def(cond)
        if cmp is not None and cmp.tokens[0] not in _PREFERRED:
            return cond, [f, t], True
        return cond, [t, f], False

    def successors(self, b: Block) -> list[str]:
        return [self.forward(s) for s in self.raw_successors(b)]

    def forward(self, lab: str) -> str:
        seen = set()
        while lab in self.forwarders and lab not in seen:
            seen.add(lab)
            lab = self.forwarders[lab]
        return lab

    def unforward_pred(self, lab: str) -> str:
        """A phi's incoming block, mapped past forwarding blocks to the
        block that branched into them."""
        seen = set()
        while lab in self.forwarders and lab not in seen:
            seen.add(lab)
            lab = self.forwarder_pred[lab]
        return lab

    def find_forwarders(self) -> None:
        """Blocks that only compute pure values/loads and fall through
        (`br label %S`, one predecessor, no phis): e.g. a loop preheader
        that exists only because a load was hoisted into it. They are
        skipped in the CFG; their values still hash normally."""
        self.forwarders: dict[str, str] = {}
        self.forwarder_pred: dict[str, str] = {}
        raw_preds: dict[str, list[str]] = {}
        for b in self.fn.blocks:
            for s2 in self.raw_successors(b):
                raw_preds.setdefault(s2, []).append(b.label)
        entry = self.fn.blocks[0].label if self.fn.blocks else None
        for b in self.fn.blocks:
            if b.label == entry:
                continue
            term = self.terminator(b)
            if term is None or term.opcode != "br" or term.tokens[0] != "label":
                continue
            target = term.tokens[1]
            preds = raw_preds.get(b.label, [])
            if target == b.label or len(preds) != 1:
                continue
            ok = True
            for ins in b.instructions:
                op = ins.opcode
                if op == "phi" or op == "store" or op == "alloca":
                    ok = False
                elif op in ("call", "invoke", "callbr") and self.call_kind(ins) not in ("pure", "ignored", "readonly"):
                    ok = False
                elif op != "call" and self.is_barrier(ins):
                    ok = False
                if not ok:
                    break
            if ok:
                self.forwarders[b.label] = target
                self.forwarder_pred[b.label] = preds[0]

    def raw_successors(self, b: Block) -> list[str]:
        ins = self.terminator(b)
        if ins is None:
            return []
        if ins.opcode == "br":
            return self.canonical_branch(ins)[1]
        if ins.opcode == "switch":
            default, cases = self.switch_parts(ins)
            return [default] + [lab for _, lab in cases]
        out = []
        for k, t in enumerate(ins.tokens):
            if t == "label" and k + 1 < len(ins.tokens):
                out.append(ins.tokens[k + 1])
        return out

    def switch_parts(self, ins: Instr) -> tuple[str, list[tuple[str, str]]]:
        """`switch T v, label %d [ T c, label %x ... ]` -> (default, sorted cases)."""
        toks = ins.tokens
        lb = toks.index("[")
        default = toks[lb - 1]
        cases = []
        body = toks[lb + 1 : -1]
        j = 0
        while j < len(body):
            if body[j] == "label" and j + 1 < len(body):
                cases.append((body[j - 2] if j >= 2 else "?", body[j + 1]))
                j += 2
            else:
                j += 1
        cases.sort(key=lambda c: _int_key(c[0]))
        return default, cases

    def number_blocks(self) -> list[Block]:
        order: list[Block] = []
        if not self.fn.blocks:
            return order
        self.find_forwarders()
        seen = set()
        stack = [self.fn.blocks[0].label]
        while stack:
            lab = stack.pop()
            if lab in seen or lab not in self.blocks:
                continue
            seen.add(lab)
            b = self.blocks[lab]
            self.bid[lab] = len(order)
            order.append(b)
            for s in reversed(self.successors(b)):
                if s not in seen:
                    stack.append(s)
        return order

    # ---- values ---------------------------------------------------------------------
    def local(self, tok: str) -> str:
        if tok in self.mh.mod.types:
            return self.mh.canon_type(("named", tok))
        if tok in self.forwarders:
            tok = self.forward(tok)
        if tok in self.bid:
            return f"bb{self.bid[tok]}"
        if tok in self.blocks:
            return "bb?"
        if tok in self.params:
            return f"arg{self.params[tok]}"
        if tok in self.defs:
            return "v:" + self.value(tok)
        return "undef:" + tok

    def operand(self, toks: list[str]) -> str:
        """Hash an operand token group (`type value` or a bare value)."""
        if len(toks) == 1 and toks[0].startswith("%") and toks[0] not in self.mh.mod.types:
            return self.local(toks[0])
        return H(tuple(self.mh.const_tokens(toks, self.local)))

    def value_operand(self, grp: list[str]) -> tuple[str, str]:
        """(canonical type, value hash) for a `type value` group."""
        ty, k = self.parse_type(grp, 0)
        return self.mh.canon_type(ty), self.operand(grp[k:])

    def value(self, name: str) -> str:
        if name in self.memo:
            return self.memo[name]
        b, k, ins = self.defs[name]
        if ins.opcode == "phi":
            h = self.phi_tokens.get(name) or H(("phi-seed", self.phi_type(ins), self.bid.get(b.label)))
        else:
            h = self.compute(ins, b)
        self.memo[name] = h
        return h

    def phi_type(self, ins: Instr) -> str:
        ty, _ = self.parse_type(ins.tokens, 0)
        return self.mh.canon_type(ty)

    def phi_hash(self, ins: Instr, b: Block) -> str:
        ty, k = self.parse_type(ins.tokens, 0)
        pairs = []
        for grp in split_top(ins.tokens[k:]):
            # [ value , %label ]
            inner = grp[1:-1]
            parts = split_top(inner)
            pairs.append((self.local(self.unforward_pred(parts[1][0])), self.operand(parts[0])))
        pairs.sort()
        return H(("phi", self.mh.canon_type(ty), self.bid.get(b.label), tuple(pairs)))

    def cmp_hash(self, ins: Instr, invert: bool = False) -> str:
        op = ins.opcode
        pred = ins.tokens[0]
        groups = split_top(ins.tokens[1:])
        ty, k = self.parse_type(groups[0], 0)
        a = self.operand(groups[0][k:])
        b = self.operand(groups[1])
        if invert:
            pred = (ICMP_INV if op == "icmp" else FCMP_INV)[pred]
        if a > b:
            a, b = b, a
            pred = (ICMP_SWAP if op == "icmp" else FCMP_SWAP)[pred]
        if ins.flags:
            return H((op, pred, self.mh.canon_type(ty), a, b, ins.flags))
        return H((op, pred, self.mh.canon_type(ty), a, b))

    def gep_decompose(self, tok: str) -> tuple[str, int, tuple]:
        """Address as (root hash, constant byte offset, sorted var terms)."""
        d = self.defs.get(tok)
        if d is None or d[2].opcode != "getelementptr":
            return (self.root_of([tok]), 0, ())
        return self._gep(d[2])

    def _gep(self, ins: Instr) -> tuple[str, int, tuple]:
        return self._gep_tokens(ins.tokens)

    def _gep_tokens(self, toks: list[str]) -> tuple[str, int, tuple]:
        groups = split_top(toks)
        src_ty, _ = self.parse_type(groups[0], 0)
        base_grp = groups[1]
        _, k = self.parse_type(base_grp, 0)
        base_toks = base_grp[k:]
        if len(base_toks) == 1 and base_toks[0].startswith("%") and base_toks[0] in self.defs and self.defs[base_toks[0]][2].opcode == "getelementptr":
            root, off, terms = self._gep(self.defs[base_toks[0]][2])
            terms = dict(terms)
        elif base_toks and base_toks[0] == "getelementptr":
            root, off, terms = self._gep_tokens(base_toks[2:-1] if base_toks[1] == "(" else base_toks[1:])
            terms = dict(terms)
        else:
            root = self.root_of(base_toks)
            off, terms = 0, {}
        cur = src_ty
        for n, grp in enumerate(groups[2:]):
            ity, k = self.parse_type(grp, 0)
            vtoks = grp[k:]
            const = _int_const(vtoks)
            if n == 0:
                size = self.mh.layout(cur)[0]
                elem = cur
            else:
                r = self.mh.resolve(cur)
                if r[0] == "struct":
                    foff, elem = self.mh.field_offset(cur, const if const is not None else 0)
                    off += foff
                    cur = elem
                    continue
                elem = r[2]
                size = self.mh.layout(elem)[0]
            if const is not None:
                off += const * size
            else:
                vh = self.operand(vtoks)
                terms[vh] = terms.get(vh, 0) + size
            cur = elem
        return root, off, tuple(sorted((v, s) for v, s in terms.items() if s))

    def access(self, addr_grp: list[str], ty: Any) -> tuple[str, int, tuple, int]:
        _, k = self.parse_type(addr_grp, 0)
        at = addr_grp[k:]
        if len(at) == 1 and at[0].startswith("%"):
            root, off, terms = self.gep_decompose(at[0])
        elif at and at[0] == "getelementptr":
            root, off, terms = self._gep_tokens(at[2:-1] if at[1] == "(" else at[1:])
        else:
            root, off, terms = self.root_of(at), 0, ()
        return root, off, terms, self.mh.layout(ty)[0]

    def may_alias(self, a: tuple, b: tuple) -> bool:
        ra, oa, ta, sa = a
        rb, ob, tb, sb = b
        if ra == rb and ta == tb:
            return not (oa + sa <= ob or ob + sb <= oa)
        if ra == rb:
            return True
        if self.private_alloca(ra) or self.private_alloca(rb):
            return False
        if self.distinct_object(ra) and self.distinct_object(rb):
            return False
        return True

    def private_alloca(self, root: str) -> bool:
        """An alloca whose address is never stored to memory. Only pointers
        derived from it can reach it (calls are assumed not to retain it)."""
        if not root.startswith("v:alloca"):
            return False
        if self._escaped_roots is None:
            self._escaped_roots = {"v:" + self.value(n) for n in self.escaped_allocas}
        return root not in self._escaped_roots

    def distinct_object(self, root: str) -> bool:
        # A root that is an alloca or a global is its own object.
        return root.startswith(("v:alloca", "g:"))

    def root_of(self, toks: list[str]) -> str:
        if len(toks) == 1 and toks[0].startswith("@"):
            return "g:" + self.mh.global_id(toks[0])
        if toks and toks[0] == "getelementptr":
            r, off, terms = self._gep_tokens(toks[2:-1] if toks[1] == "(" else toks[1:])
            return H(("cgep", r, off, terms)) if (off or terms) else r
        return self.operand(toks)

    def load_access(self, ins: Instr) -> tuple:
        groups = split_top([t for t in ins.tokens if t not in ("volatile", "atomic")])
        ty, _ = self.parse_type(groups[0], 0)
        return self.access(groups[1], ty)

    def store_parts(self, ins: Instr) -> tuple[Any, list[str], list[str]]:
        groups = split_top([t for t in ins.tokens if t not in ("volatile", "atomic")])
        ty, k = self.parse_type(groups[0], 0)
        return ty, groups[0][k:], groups[1]

    def store_access(self, ins: Instr) -> tuple:
        ty, _, addr = self.store_parts(ins)
        return self.access(addr, ty)

    def store_hash(self, ins: Instr) -> str:
        ty, val, addr = self.store_parts(ins)
        root, off, terms, size = self.access(addr, ty)
        vol = "volatile" in ins.tokens[:1]
        return H(("store", vol, self.mh.canon_type(ty), self.operand(val), root, off, terms))

    def flags_of(self, ins_flags: tuple, groups: tuple) -> tuple:
        extra = set(ins_flags)
        for g in groups:
            extra |= self.mh.mod.attr_groups.get(g, frozenset())
        return tuple(sorted(extra))

    def compute(self, ins: Instr, b: Block) -> str:
        h = self._compute(ins, b)
        if ins.opcode in ("icmp", "fcmp"):
            return h  # cmp_hash mixes the flags itself
        extra = self.flags_of(ins.flags, ins.attr_groups if ins.opcode in ("call", "invoke", "callbr") else ())
        return H((h, extra)) if extra else h

    def _compute(self, ins: Instr, b: Block) -> str:
        op = ins.opcode
        bid = self.bid.get(b.label)
        toks = ins.tokens
        if op in COMMUTATIVE:
            groups = split_top(toks)
            ty, k = self.parse_type(groups[0], 0)
            ops = sorted([self.operand(groups[0][k:]), self.operand(groups[1])])
            return H((op, self.mh.canon_type(ty), tuple(ops)))
        if op in ("icmp", "fcmp"):
            return self.cmp_hash(ins)
        if op == "getelementptr":
            root, off, terms = self._gep(ins)
            return H(("gep", root, off, terms))
        if op == "alloca":
            # Layout, not the type name: TPosition3f vs TMtx34f locals agree.
            ty, k = self.parse_type(toks, 0)
            count = tuple(toks[k:])
            return "alloca" + H(("alloca", self.mh.layout(ty), count, self.alloca_ord.get(ins.result, -1)))
        if op == "load":
            acc = self.load_access(ins)
            groups = split_top([t for t in toks if t not in ("volatile", "atomic")])
            ty, _ = self.parse_type(groups[0], 0)
            state, stores = self.ctx(ins, b)
            if self.is_barrier(ins):
                return H(("vload", self.mh.canon_type(ty), acc[:3], state))
            aliasing = sorted(self.store_hash(s) for s in stores if self.may_alias(acc, self.store_access(s)))
            return H(("load", self.mh.canon_type(ty), acc[:3], state, tuple(aliasing)))
        if op == "select":
            groups = split_top(toks)
            cond = groups[0][-1]
            cmp = self.cmp_def(cond)
            a, c = self.operand(groups[1]), self.operand(groups[2])
            if cmp is not None and cmp.tokens[0] not in _PREFERRED:
                return H(("select", "v:" + self.cmp_hash(cmp, invert=True), c, a))
            return H(("select", self.operand(groups[0][-1:]), a, c))
        if op in ("call", "invoke", "callbr"):
            kind = self.call_kind(ins)
            body = tuple(self.mh.const_tokens([t for t in toks if t not in ("to", "unwind")], self.local))
            if kind == "pure":
                return H(("purecall", body))
            if kind == "readonly":
                state, stores = self.ctx(ins, b)
                return H(("rocall", body, state, tuple(sorted(self.store_hash(x) for x in stores))))
            state, _ = self.ctx(ins, b)
            return H(("call", body, state))
        if self.is_barrier(ins):
            state, _ = self.ctx(ins, b)
            return H((op, tuple(self.mh.const_tokens(toks, self.local)), state))
        return H((op, tuple(self.mh.const_tokens(toks, self.local))))

    # ---- block walk -------------------------------------------------------------------
    def walk_memory(self, order: list[Block]) -> None:
        """Per block, the memory events in order: ("barrier"|"store"|"load", ins)."""
        self.block_events: dict[str, list] = {}
        for b in order + [self.blocks[f] for f in self.forwarders]:
            events: list = []
            for ins in b.instructions:
                op = ins.opcode
                if op in TERMINATORS and op != "invoke":
                    continue
                if op in ("call", "invoke", "callbr") and self.call_kind(ins) == "ignored":
                    continue
                kind = self.call_kind(ins) if op == "call" else None
                if kind == "gstore":
                    events.append(("gstore", ins))
                elif kind == "readonly":
                    if ins.result:
                        events.append(("load", ins))
                elif self.is_barrier(ins):
                    events.append(("barrier", ins))
                elif op == "load" and ins.result:
                    events.append(("load", ins))
                elif op == "store":
                    events.append(("store", ins))
            self.block_events[b.label] = events
        # predecessors and reverse post-order over the canonical successors
        self.preds: dict[str, list[str]] = {}
        post: list[str] = []
        seen: set[str] = set()
        entry = self.fn.blocks[0].label
        stack: list[tuple[str, int]] = [(entry, 0)]
        seen.add(entry)
        succs = {b.label: [s for s in self.successors(b) if s in self.blocks] for b in order}
        for lab, ss in succs.items():
            for s2 in ss:
                self.preds.setdefault(s2, [])
                if lab not in self.preds[s2]:
                    self.preds[s2].append(lab)
        while stack:
            lab, k = stack.pop()
            ss = succs.get(lab, [])
            if k < len(ss):
                stack.append((lab, k + 1))
                if ss[k] not in seen:
                    seen.add(ss[k])
                    stack.append((ss[k], 0))
            else:
                post.append(lab)
        self.rpo = {lab: n for n, lab in enumerate(reversed(post))}
        # Loop headers whose whole natural loop has no memory writes: memory
        # is the same on every iteration, so the back edges are ignored.
        self.transparent_loops: set[str] = set()
        writes = {lab for lab, ev in self.block_events.items() if any(k != "load" for k, _ in ev)}
        for h in self.rpo:
            back = [p for p in self.preds.get(h, []) if self.rpo.get(p, -1) >= self.rpo[h]]
            if not back:
                continue
            body = {h}
            work = [p for p in back if p != h]
            while work:
                x = work.pop()
                if x in body:
                    continue
                body.add(x)
                work.extend(self.preds.get(x, []))
            if not (body & writes):
                self.transparent_loops.add(h)

    # Memory state: a chain hash of the barriers (and the stores before each)
    # that reach a point. A block with one memory-equivalent predecessor
    # inherits its exit state, so a load hoisted or sunk across side-effect
    # free blocks keeps its hash; joins of differing states and loop headers
    # start a fresh merge state keyed by the block id.
    def ctx(self, ins: Instr, b: Block) -> tuple[str, tuple]:
        key = ins.result or id(ins)
        if key not in self.mem_ctx:
            self.block_exit(b)
        return self.mem_ctx.get(key, ("m?", ()))

    def _merge_state(self, b: Block) -> tuple[str, tuple]:
        return (H(("mphi", self.bid.get(b.label))), ())

    def entry_state(self, b: Block) -> tuple[str, tuple]:
        lab = b.label
        if lab == self.fn.blocks[0].label:
            return ("m0", ())
        if lab in self.forwarders:
            return self.block_exit(self.blocks[self.forwarder_pred[lab]])
        preds = self.preds.get(lab, [])
        r = self.rpo.get(lab)
        if r is not None and lab in self.transparent_loops:
            preds = [p for p in preds if self.rpo.get(p, 1 << 30) < r]
        if not preds or r is None or any(self.rpo.get(p, 1 << 30) >= r for p in preds):
            return self._merge_state(b)
        exits = [self.block_exit(self.blocks[p]) for p in preds]
        if len({st for st, _ in exits}) != 1:
            return self._merge_state(b)
        # Same barrier chain on every path: the stores pending on any path
        # may have happened (a `may` set, ordered by hash).
        union: dict[str, Instr] = {}
        for _, pend in exits:
            for x in pend:
                union.setdefault(self.store_hash(x), x)
        return (exits[0][0], tuple(union[h] for h in sorted(union)))

    def block_exit(self, b: Block) -> tuple[str, tuple]:
        lab = b.label
        if lab in self.bstate:
            return self.bstate[lab] or self._merge_state(b)
        self.bstate[lab] = None
        state, pending_t = self.entry_state(b)
        pending = list(pending_t)
        for kind, ins in self.block_events.get(lab, []):
            if kind == "load":
                self.mem_ctx[ins.result] = (state, tuple(pending))
            elif kind == "store":
                pending.append(ins)
            elif kind == "gstore":
                self.mem_ctx[ins.result or id(ins)] = (state, tuple(pending))
                pending.extend(self.mh.global_store_summary(self.callee(ins)) or [])
            else:
                self.mem_ctx[ins.result or id(ins)] = (state, tuple(pending))
                if ins.opcode == "store":
                    h = self.store_hash(ins)
                elif ins.result:
                    h = self.value(ins.result)
                else:
                    h = self.compute(ins, b)
                state = H(("m", state, tuple(sorted(self.store_hash(x) for x in pending)), h))
                pending = []
        self.bstate[lab] = (state, tuple(pending))
        return self.bstate[lab]

    def assign_allocas(self, order: list[Block]) -> None:
        n = 0
        allocas = {name for name, (_, _, ins) in self.defs.items() if ins.opcode == "alloca"}
        if not allocas:
            return
        for b in order:
            for ins in b.instructions:
                if ins.opcode == "store":
                    _, val, _ = self.store_parts(ins)
                    self.escaped_allocas.update(t for t in val if t in allocas)
                if ins.opcode == "alloca":
                    continue
                if ins.opcode == "call" and self.call_kind(ins) == "ignored":
                    continue
                for t in ins.tokens:
                    if t in allocas and t not in self.alloca_ord:
                        self.alloca_ord[t] = n
                        n += 1

    def block_sequence(self, b: Block) -> tuple:
        seq: list[str] = []
        pending: list[Instr] = []

        def flush():
            if not pending:
                return
            accs = [self.store_access(s) for s in pending]
            hashes = [self.store_hash(s) for s in pending]
            remaining = list(range(len(pending)))
            while remaining:
                ready = [
                    i for i in remaining
                    if not any(j < i and j in remaining and self.may_alias(accs[i], accs[j]) for j in remaining)
                ]
                pick = min(ready, key=lambda i: hashes[i])
                seq.append(hashes[pick])
                remaining.remove(pick)
            pending.clear()

        for kind, ins in self.block_events.get(b.label, []):
            if kind == "load":
                continue
            if kind == "store":
                if self.is_volatile(ins):
                    flush()
                    seq.append(self.store_hash(ins))
                else:
                    pending.append(ins)
                continue
            flush()
            if ins.opcode == "store":
                seq.append(self.store_hash(ins))
            elif ins.result:
                seq.append(self.value(ins.result))
            else:
                seq.append(self.compute(ins, b))
        flush()
        return tuple(seq)

    def term_hash(self, b: Block) -> str:
        ins = self.terminator(b)
        if ins is None:
            return "none"
        if ins.opcode == "br":
            cond, succ, inv = self.canonical_branch(ins)
            ids = tuple(self.local(s) for s in succ)
            if cond is None:
                return H(("br", ids))
            cmp = self.cmp_def(cond)
            ch = "v:" + self.cmp_hash(cmp, invert=True) if inv else self.operand([cond])
            return H(("br", ch, ids))
        if ins.opcode == "switch":
            lb = ins.tokens.index("[")
            ty, cond = self.value_operand(split_top(ins.tokens[:lb])[0])
            default, cases = self.switch_parts(ins)
            return H(("switch", ty, cond, self.local(default), tuple((c, self.local(l)) for c, l in cases)))
        return H((ins.opcode, tuple(self.mh.const_tokens(ins.tokens, self.local))))

    def fingerprint(self) -> str:
        fn = self.fn
        header = (
            self.mh.canon_type(fn.ret_type),
            tuple(self.mh.canon_type(t) for t, _ in fn.params),
            fn.vararg,
            fn.section,
        )
        fn_flags = self.flags_of(fn.flags, fn.attr_groups)
        if fn_flags:
            header = header + (fn_flags,)
        if not fn.blocks:
            return H(("decl", header))
        order = self.number_blocks()
        self.assign_allocas(order)
        self.walk_memory(order)
        phis = [(b, ins) for b in order for ins in b.instructions if ins.opcode == "phi" and ins.result]
        rounds = 3 if phis else 1
        result = None
        sys.setrecursionlimit(max(sys.getrecursionlimit(), 50000))
        for _ in range(rounds):
            self.memo = {}
            self.mem_ctx = {}
            self.bstate = {}
            self._escaped_roots = None
            body = []
            for b in order:
                body.append((self.bid[b.label], self.block_sequence(b), self.term_hash(b)))
            result = H(("fn", header, tuple(body)))
            if phis:
                new_tokens = {ins.result: self.phi_hash(ins, b) for b, ins in phis}
                if new_tokens == self.phi_tokens:
                    break
                self.phi_tokens = new_tokens
        return result


def _int_const(toks: list[str]) -> Optional[int]:
    if len(toks) == 1:
        t = toks[0]
        if re.fullmatch(r"-?\d+", t):
            return int(t)
        if t in ("true",):
            return 1
        if t in ("false", "zeroinitializer", "null"):
            return 0
    return None


def _int_key(s: str):
    try:
        return (0, int(s))
    except ValueError:
        return (1, s)


def fingerprint(module: Module) -> dict[str, str]:
    """{function or global name: fingerprint}. `.cold.N` splits and
    compiler-named (private, `.str`-style) data are folded into their users."""
    mh = ModuleHasher(module)
    out: dict[str, str] = {}
    for name, fn in module.functions.items():
        if _COLD_RE.search(name):
            continue
        if mh._content_named(name, fn.linkage):
            continue
        out[_strip_quotes(name)[1:]] = mh.function_fp(fn)
    for name, g in module.globals.items():
        if mh._content_named(name, g.linkage):
            continue
        if not g.initializer and g.constness != "alias":
            continue  # external declaration
        out[_strip_quotes(name)[1:]] = mh.global_fp(g)
    return out


def data_order(module: Module) -> list[str]:
    """Defined, source-named globals in IR emission order. Not part of
    `fingerprint` (moving a definition is behaviour-neutral) but MWCC lays
    out .data/.bss/.sbss in definition order, so a gate may want it."""
    mh = ModuleHasher(module)
    return [
        _strip_quotes(n)[1:]
        for n, g in module.globals.items()
        if g.initializer and not mh._content_named(n, g.linkage)
    ]


def unit_fingerprint(
    repo: Path,
    source_rel: str,
    override_text: Optional[str] = None,
    overrides: Optional[dict[str, str]] = None,
) -> tuple[bool, dict[str, str], list[str]]:
    res = compile_ir(repo, source_rel, override_text, overrides=overrides)
    if not res.ok:
        return False, {}, res.errors
    try:
        return True, fingerprint(parse_ir(res.ir_text)), []
    except Exception as e:  # parser gap: report, never crash a gate
        return False, {}, [f"ir_oracle parse/fingerprint failed: {type(e).__name__}: {e}"]


def compare_fps(a: dict[str, str], b: dict[str, str]) -> dict[str, str]:
    out = {}
    for name in sorted(set(a) | set(b)):
        if name not in b:
            out[name] = "ONLY_A"
        elif name not in a:
            out[name] = "ONLY_B"
        else:
            out[name] = "SAME" if a[name] == b[name] else "DIFF"
    return out


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def demangle(names: list[str]) -> dict[str, str]:
    """Itanium names -> demangled text (c++filt / llvm-cxxfilt; {} if absent)."""
    tool = shutil.which("c++filt") or shutil.which("llvm-cxxfilt")
    if not tool or not names:
        return {}
    try:
        p = subprocess.run([tool], input="\n".join(names), capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired):
        return {}
    return dict(zip(names, p.stdout.splitlines()))


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fingerprint", help="per-function/global fingerprints of one unit")
    f.add_argument("--repo", required=True, type=Path)
    f.add_argument("--source", required=True)
    f.add_argument("--override", type=Path)
    f.add_argument("--json", action="store_true")
    c = sub.add_parser("compare", help="compare two versions of one unit's source")
    c.add_argument("--repo", required=True, type=Path)
    c.add_argument("--source", required=True)
    c.add_argument("--a", required=True, type=Path)
    c.add_argument("--b", required=True, type=Path)
    c.add_argument("--json", action="store_true")
    c.add_argument("--all", action="store_true", help="also print SAME rows")
    t = sub.add_parser("flags-template", help="per-game flags template from compile_commands.json")
    t.add_argument("--repo", required=True, type=Path)
    t.add_argument("--game", required=True)
    t.add_argument("--detect", nargs="+", required=True, help="repo paths that identify the game")
    t.add_argument("--out", required=True, type=Path)
    args = ap.parse_args(argv)

    if args.cmd == "flags-template":
        data = flags_template(args.repo, args.game, args.detect)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(data, indent=1) + "\n")
        print(f"{len(data['units'])} units, {len(data['variants'])} flag variants -> {args.out}")
        return 0

    if args.cmd == "fingerprint":
        text = args.override.read_text() if args.override else None
        ok, fps, errors = unit_fingerprint(args.repo, args.source, text)
        if args.json:
            print(json.dumps({"tool": "ir_oracle", "ok": ok, "source": args.source, "fingerprints": fps, "errors": errors}, indent=2))
        else:
            if not ok:
                print("\n".join(errors), file=sys.stderr)
            dem = demangle(list(fps))
            for name, fp in sorted(fps.items()):
                print(f"{fp}  {dem.get(name, name)}")
        return 0 if ok else 2

    def load(path: Path) -> tuple[bool, dict, list, list]:
        res = compile_ir(args.repo, args.source, path.read_text())
        if not res.ok:
            return False, {}, [], res.errors
        mod = parse_ir(res.ir_text)
        return True, fingerprint(mod), data_order(mod), []

    ok_a, fa, da, ea = load(args.a)
    ok_b, fb, db, eb = load(args.b)
    rows = compare_fps(fa, fb) if ok_a and ok_b else {}
    order = "SAME" if da == db else "DIFF"
    if args.json:
        print(json.dumps({
            "tool": "ir_oracle", "source": args.source, "ok": ok_a and ok_b,
            "errors": {"a": ea, "b": eb}, "functions": rows, "data_order": order,
            "summary": {k: sum(1 for v in rows.values() if v == k) for k in ("SAME", "DIFF", "ONLY_A", "ONLY_B")},
        }, indent=2))
    else:
        if not (ok_a and ok_b):
            print("compile failed:\n" + "\n".join(ea + eb), file=sys.stderr)
        dem = demangle(list(rows))
        for name, v in rows.items():
            if v != "SAME" or args.all:
                print(f"{v:6}  {dem.get(name, name)}")
        print(f"# {sum(v == 'SAME' for v in rows.values())} same, {sum(v != 'SAME' for v in rows.values())} differ; data order {order}")
    return 0 if ok_a and ok_b else 2


if __name__ == "__main__":
    sys.exit(main())


# Backwards-compatible private names.
_vfs_overlay = vfs_overlay
_patch_return_overloads = patch_return_overloads
_demangle = demangle
