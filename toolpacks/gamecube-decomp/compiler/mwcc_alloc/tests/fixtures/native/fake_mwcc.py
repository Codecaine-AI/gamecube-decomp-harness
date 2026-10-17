#!/usr/bin/env python3
"""A stand-in for `<runner> mwcceppc.exe <cflags> -c <src> -o <obj>` in tests.

It "compiles" a tiny C subset deterministically: each function becomes an ELF
symbol whose words hash its preprocessed body (quote-includes resolved from
the source directory, then include/), so header and TU edits change code the
way they would for MWCC. Called through `build/compilers-traced/...` with
MWCC_TRACE_OUT set, it also writes mwcc-trace-v1 records:

- args and locals (`int x = ...;`, `float f;`) become vregs (gpr/fpr) in
  declaration order from 32, with their absolute declaration file (the
  basename, as MWCC records it, with FAKE_MWCC_BASENAMES=1) and line;
- a call to an `inline` helper defined in a header inlines it: an `inline`
  event and the helper's locals as vregs declared in the header;
- each web interferes with the next web of its class; registers come from a
  hash of the object name, so renumbering vregs never changes a register.

FAKE_MWCC_OVERFLOW=<what> adds the `overflow` record a full trace buffer writes.
A function with an empty body has no decisions: it writes no records, and a
trace with no records is not created. `-o <dir>` (the ninja shape the object cache intercepts) writes <dir>/<stem>.o
and a depfile. FAKE_MWCC_DIVERGE=1 makes the traced build emit a different object. Every run
appends its argv and MWCC_* environment to FAKE_MWCC_LOG when that is set.
"""

import hashlib
import json
import os
import re
import struct
import sys
from pathlib import Path

FUNC_RE = re.compile(r"^(static\s+)?(inline\s+)?(int|float|void)\s+(\w+)\s*\(([^)]*)\)\s*\{\s*$")
LOCAL_RE = re.compile(r"^\s+(int|float)\s+(\w+)\s*(=|;)")
CALL_RE = re.compile(r"\b(\w+)\s*\(")
INCLUDE_RE = re.compile(r'^#include\s+"([^"]+)"')


def preprocess(path: Path, cwd: Path, out: list, seen: set) -> None:
    if path in seen:
        return
    seen.add(path)
    for number, text in enumerate(path.read_text().splitlines(), 1):
        match = INCLUDE_RE.match(text)
        if match:
            for base in (path.parent, cwd / "include"):
                candidate = base / match.group(1)
                if candidate.is_file():
                    preprocess(candidate, cwd, out, seen)
                    break
            else:
                sys.stderr.write(f"### {path}:{number}: cannot open include {match.group(1)}\n")
                sys.exit(1)
            continue
        # Real MWCC records declaration files by basename.
        name = path.name if os.environ.get("FAKE_MWCC_BASENAMES") == "1" else str(path.resolve())
        out.append((name, number, text))


def functions(lines: list) -> list:
    found, current = [], None
    for file, number, text in lines:
        if current is None:
            match = FUNC_RE.match(text)
            if match:
                current = {"name": match.group(4), "inline": bool(match.group(2)), "file": file, "line": number,
                           "args": [a.strip() for a in match.group(5).split(",") if a.strip() and a.strip() != "void"],
                           "body": []}
            continue
        if text.startswith("}"):
            found.append(current)
            current = None
        else:
            current["body"].append((file, number, text))
    return found


def words_for(text: str, count: int) -> list:
    digest = hashlib.sha256(text.encode()).digest()
    return [0x38000000 | struct.unpack(">H", digest[(2 * i) % 32: (2 * i) % 32 + 2])[0] for i in range(count)] + [0x4E800020]


def elf(funcs: list) -> bytes:
    text = b"".join(struct.pack(">I", w) for _, ws in funcs for w in ws)
    shstr = b"\0.text\0.symtab\0.strtab\0.shstrtab\0"
    strtab = b"\0"
    syms = [b"\0" * 16]
    pos = 0
    for name, ws in funcs:
        syms.append(struct.pack(">IIIBBH", len(strtab), pos, 4 * len(ws), (1 << 4) | 2, 0, 1))
        strtab += name.encode() + b"\0"
        pos += 4 * len(ws)
    symtab = b"".join(syms)
    blobs = [text, symtab, strtab, shstr]
    body, offsets = b"", []
    for blob in blobs:
        offsets.append(52 + len(body))
        body += blob + b"\0" * (-len(blob) % 4)
    sh = [b"\0" * 40]
    for (name, typ, flags, link, info, align, ent), blob, off in zip(
        [(".text", 1, 6, 0, 0, 4, 0), (".symtab", 2, 0, 3, 1, 4, 16), (".strtab", 3, 0, 0, 0, 1, 0),
         (".shstrtab", 3, 0, 0, 0, 1, 0)], blobs, offsets):
        sh.append(struct.pack(">10I", shstr.index(name.encode() + b"\0"), typ, flags, 0, off, len(blob), link, info, align, ent))
    ehdr = b"\x7fELF\x01\x02\x01" + b"\0" * 9 + struct.pack(">HHIIIIIHHHHHH", 1, 20, 1, 0, 0, 52 + len(body), 0, 52, 0, 0, 40, len(sh), 4)
    return ehdr + body + b"".join(sh)


def register(name: str, cls: str) -> int:
    return 31 - int(hashlib.sha256(name.encode()).hexdigest(), 16) % 18 if cls == "gpr" else 14 + int(hashlib.sha256(name.encode()).hexdigest(), 16) % 18


def trace(fn: dict, helpers: dict, emit) -> None:
    head = {"v": 1, "fn": fn["name"], "pass": 1}
    emit({**head, "pass": 0, "cls": "-", "ev": "function", "name": fn["name"], "display": fn["name"] + "()"})
    webs = []
    for arg in fn["args"]:
        kind, name = arg.split()[-2], arg.split()[-1]
        webs.append(("gpr" if kind != "float" else "fpr", name, "arg", fn["file"], fn["line"]))
    for file, number, text in fn["body"]:
        match = LOCAL_RE.match(text)
        if match:
            webs.append(("gpr" if match.group(1) == "int" else "fpr", match.group(2), "local", file, number))
        for call in CALL_RE.findall(text):
            helper = helpers.get(call)
            if helper:
                emit({**head, "cls": "-", "ev": "inline", "site": f"{file}:{number}", "callee": call, "pass_index": 0,
                      "stmt_count": len(helper["body"]), "verdict": "inlined", "reason": "small"})
                for hfile, hnumber, htext in helper["body"]:
                    hmatch = LOCAL_RE.match(htext)
                    if hmatch:
                        webs.append(("gpr" if hmatch.group(1) == "int" else "fpr", hmatch.group(2), "local", hfile, hnumber))
    for cls in ("gpr", "fpr"):
        mine = [w for w in webs if w[0] == cls]
        vregs = list(range(32, 32 + len(mine)))
        for vreg, (_, name, kind, file, line) in zip(vregs, mine):
            emit({**head, "cls": cls, "ev": "vreg", "vreg": vreg, "kind": kind, "object": name, "decl_file": file,
                  "decl_line": line, "web": vreg - 32})
        for index, vreg in enumerate(vregs):
            neighbors = [v for v in (vreg - 1, vreg + 1) if v in vregs]
            emit({**head, "cls": cls, "ev": "node", "vreg": vreg, "degree": len(neighbors), "neighbors": neighbors,
                  "coalesced": False, "spill_cost": 0})
        for sweep, vreg in enumerate(vregs):
            emit({**head, "cls": cls, "ev": "push", "vreg": vreg, "sweep": 0, "stalled": False})
        for order, (vreg, web) in enumerate(reversed(list(zip(vregs, mine)))):
            color = register(web[1], cls)
            emit({**head, "cls": cls, "ev": "color", "vreg": vreg, "color": color, "order": order})
            emit({**head, "cls": cls, "ev": "commit", "vreg": vreg, "reg": ("r" if cls == "gpr" else "f") + str(color)})


def main() -> None:
    argv = sys.argv[1:]
    compiler = argv[0]
    src = argv[argv.index("-c") + 1]
    out = Path(argv[argv.index("-o") + 1])
    if os.environ.get("FAKE_MWCC_LOG"):
        with open(os.environ["FAKE_MWCC_LOG"], "a") as log:
            log.write(json.dumps({"argv": argv, "env": {k: v for k, v in os.environ.items() if k.startswith("MWCC_")}}) + "\n")
    cwd = Path.cwd()
    lines: list = []
    preprocess(cwd / src, cwd, lines, set())
    funcs = functions(lines)
    helpers = {f["name"]: f for f in funcs if f["inline"]}

    def code_text(fn: dict) -> str:
        text = [" ".join(t.split()) for _, _, t in fn["body"]]
        for _, _, t in fn["body"]:
            for call in CALL_RE.findall(t):
                if call in helpers:
                    text += [" ".join(h.split()) for _, _, h in helpers[call]["body"]]
        return "\n".join(text)

    emitted = [(f["name"], words_for(code_text(f), 4 + len(f["body"]))) for f in funcs if not f["inline"]]
    data = elf(emitted)
    if out.is_dir():  # ninja shape: -o <dir>, with a depfile beside the object
        out = out / (Path(src).stem + ".o")
        deps = " ".join(sorted({file for file, _, _ in lines}))
        out.with_suffix(".d").write_text(f"{out.resolve()}: {deps}\n")
    traced = "compilers-traced" in compiler
    if traced and os.environ.get("FAKE_MWCC_DIVERGE") == "1":
        data = data[:-1] + bytes([data[-1] ^ 1])
    out.write_bytes(data)
    if traced and os.environ.get("MWCC_TRACE_OUT"):
        wanted = os.environ.get("MWCC_TRACE_FUNC")
        lines = []
        for fn in funcs:
            # Like the traced MWCC, a function without decisions writes nothing.
            if not fn["inline"] and fn["body"] and (not wanted or wanted in (fn["name"], "*")):
                trace(fn, helpers, lambda record: lines.append(json.dumps(record) + "\n"))
                if os.environ.get("FAKE_MWCC_OVERFLOW"):
                    lines.append(json.dumps({"v": 1, "fn": fn["name"], "display": fn["name"], "pass": 0, "cls": "-",
                                             "ev": "overflow", "what": os.environ["FAKE_MWCC_OVERFLOW"],
                                             "limit": 1024, "dropped": 3}) + "\n")
        if lines:  # and no lines at all means no file
            Path(os.environ["MWCC_TRACE_OUT"]).write_text("".join(lines))


if __name__ == "__main__":
    main()
