"""
Clang-derived type oracle for the source-level permuter.

The permuter needs the *type* of an expression to extract it into a temporary
(`T tmp = expr;`) -- the highest-value mutation for shifting register
allocation, which mwcc has no way to express via `typeof`. But it only needs
those types for the **base** source, computed **once** per run: every candidate
mutates the base, so an expression's type is fixed up front.

`build_oracle()` parses the TU with libclang (using the project's real
compile_commands flags, so macros and headers resolve exactly like the build)
and returns a map from a source byte span to the expression's type spelling.
clang's expansion locations land on the macro *call site* in the main file, so
even macro results (e.g. `GET_ITEM(gobj)` -> `Item *`) are typed, and the spans
line up with tree-sitter's nodes. The permuter then just looks up the span of
the node it wants to extract -- a dict hit, ~free in the hot loop.
"""

from __future__ import annotations

import json
import shlex
from pathlib import Path
from typing import Dict, List, Optional, Tuple

try:
    import clang.cindex as ci
except Exception:  # libclang missing -> oracle disabled, permuter still runs
    ci = None  # type: ignore

Span = Tuple[int, int]
TypeMap = Dict[Span, str]


def available() -> bool:
    return ci is not None


def clang_flags_for(c_file: Path, compile_commands: Path) -> Optional[List[str]]:
    """Pull the clang flags for `c_file` out of compile_commands.json, stripped
    of the driver, the `-c`/`-o`, and the input/output files. A
    `-working-directory` is added so relative `-I`s resolve regardless of cwd."""
    try:
        entries = json.loads(compile_commands.read_text())
    except OSError:
        return None
    target = c_file.resolve()
    for e in entries:
        ef = Path(e.get("file", ""))
        if ef.resolve() != target and ef.name != c_file.name:
            continue
        raw = e.get("arguments") or shlex.split(e.get("command", ""))
        if not raw:
            return None
        flags: List[str] = []
        i = 1  # skip the compiler (argv[0])
        while i < len(raw):
            a = raw[i]
            if a == "-c":
                i += 1
                continue
            if a in ("-o", "-MF", "-MT"):
                i += 2
                continue
            if Path(a).suffix in {".c", ".cc", ".cpp", ".cxx", ".o"}:
                i += 1
                continue
            flags.append(a)
            i += 1
        directory = e.get("directory")
        if directory:
            flags.append(f"-working-directory={directory}")
        return flags
    return None


_index = None


def _get_index():
    global _index
    if _index is None:
        _index = ci.Index.create()
    return _index


def build_oracle(c_file: Path, flags: List[str]) -> TypeMap:
    """Map each main-file expression's `(start,end)` byte span to its clang type
    spelling. Returns {} if libclang is unavailable or parsing fails outright.

    When several cursors share a span (an implicit-cast wrapper over the real
    expression), the outermost (visited first) wins -- that's the in-context
    type, the one that keeps `T tmp = expr;` compiling where the expr sits."""
    if ci is None:
        return {}
    try:
        tu = _get_index().parse(str(c_file), args=flags)
    except Exception:
        return {}
    name = str(c_file)
    out: TypeMap = {}
    # Start from the TU's top-level decls and prune any cursor not located in
    # the main file -- that skips the entire header-declaration subtree (the
    # bulk of the AST), so we only walk this file's function bodies.
    stack = list(tu.cursor.get_children())
    while stack:
        c = stack.pop()
        ext = c.extent
        f = ext.start.file
        if f is None or f.name != name:
            continue
        try:
            if c.kind.is_expression():
                t = c.type.spelling
                if t:
                    out.setdefault((ext.start.offset, ext.end.offset), t)
        except ValueError:
            # libclang raises ValueError on some unexposed cursor kinds
            pass
        stack.extend(c.get_children())
    return out
