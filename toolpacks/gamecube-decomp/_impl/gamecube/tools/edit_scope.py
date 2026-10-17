#!/usr/bin/env python3
"""edit_scope: the edit-scope fence ("don't jump the fence").

objectives/sms-real-codegen/order-scope-plan.md sections 3-5, interface in
order-scope-contract.md. Pure: it reads git texts and a `readiness.Readiness`
(class owners and readiness bound to one revision) and never writes the repo.

`classify` compares complete before/after texts of every changed file under
src/, include/ and libs/*/include/ per qualified class:

- class definitions (heads, bases, members, inline bodies; nested class bodies
  are their own classes), out-of-class member definitions `C::f() {}` (part of
  C's definition) and `typedef X Y;` / `using Y = X;` aliases (resolved to the
  target class), active code only (comments, literals, preprocessor lines and
  `#if 0` regions blanked);
- a class is introduced_or_changed when it is defined in after but in no
  before text, or gained/changed members, bases, inline bodies or out-of-class
  member definitions. Removals alone are not changes. An identical normalized
  definition removed in one file and added in another is `moved`; `class C;`
  is `forward_decl`;
- each changed class is judged in every file (the target .cpp included) by its
  readiness: own_class, not_ready (declaration fence: owner has no started
  implementation), local_helper (not in the map, defined only in .cpp files),
  unresolved, foreign_header (ready/shared, header not owned by the target
  unit; counted against soft limits) or ready;
- order-gated files (`readiness.gated`): added lines referencing a class
  (`new TX`, `TX::`, `TX(`, `#include` of a header defining classes) whose
  construction is not_ready/unresolved -> order_gated;
- UNUSED reconstructions (plan section 4): a non-trivial body for a function
  the link map marks UNUSED needs a bound `inlined` unused check
  (base_rev, body_sha256, optionally edits_hash), else dead_unused /
  unused_unverified.

CLI:
  edit_scope.py check --repo R --base-rev B [--head-rev H | --overlay-dir D | --worktree]
                [--target-unit U] [--unused-checks FILE] [--policy-json JSON] --json
  edit_scope.py pr --repo R --base B --head H [--policy-json JSON] [--unused-checks FILE] --json
Exit 0 with the result; exit 2 with stderr JSON {"error": kind, "detail": ...}
on a readiness error (kind from readiness.ReadinessError) or a tool failure.
"""

from __future__ import annotations

import argparse
import difflib
import fnmatch
import hashlib
import json
import os
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Iterable, Optional

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import evidence_search as es  # noqa: E402
import steering_check as sc  # noqa: E402
import steering_edits as se  # noqa: E402
import preprocess  # noqa: E402

TOOL = "edit_scope"
VERSION = 1
SCOPE_PATHS = ("src", "include", "libs")
HEADER_EXTS = (".h", ".hpp", ".hh", ".hxx", ".inl", ".inc")
REJECT = frozenset({"not_ready", "unresolved", "order_gated", "dead_unused", "unused_unverified"})
VERDICTS = ("own_class", "ready", "foreign_header", "local_helper", "not_ready", "unresolved", "order_gated",
            "dead_unused", "unused_unverified", "forward_decl", "moved")
DEFAULT_SCOPE = {"maxForeignHeaders": 3, "maxForeignHeaderLines": 25}
# PR size warnings (human distribution, objectives/sms-real-codegen/validation/human-order.json):
# 70% of human PRs touch one unit; files and changed lines above roughly the human p90.
PR_MAX_UNITS = 1
PR_MAX_FILES = 6
PR_MAX_CHANGED_LINES = 400
PREREQ_SUGGESTION = "split: land the class's own unit first"


class ToolFailure(Exception):
    pass


# --------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------


def in_scope(path: str) -> bool:
    """src/, include/ or libs/<lib>/include/."""
    parts = PurePosixPath(path).parts
    if not parts:
        return False
    if parts[0] in ("src", "include"):
        return len(parts) > 1
    return parts[0] == "libs" and len(parts) > 3 and parts[2] == "include"


def is_header(path: str) -> bool:
    return path.lower().endswith(HEADER_EXTS)


def _stem(path: Optional[str]) -> Optional[str]:
    return PurePosixPath(path).stem.lower() if path else None


# --------------------------------------------------------------------------
# Source parsing: classes, out-of-class member definitions, aliases
# --------------------------------------------------------------------------

_PP_RE = re.compile(r"^\s*#\s*(if|ifdef|ifndef|elif|else|endif)\b(.*)$")
_SCOPE_HEAD_RE = re.compile(r"\b(namespace|class|struct|union)\s+([A-Za-z_]\w*)")
_BASES_RE = re.compile(r"\s*(?:final\s*)?(?::([^;{}]*))?\s*")
_PREV_WORD_RE = re.compile(r"([A-Za-z_]\w*)\s*$")
_TYPEDEF_BODY_RE = re.compile(r"\btypedef\s+(struct|class|union)\s*([A-Za-z_]\w*)?\s*(?::[^;{}]*)?\{")
_NAME = r"(?:::)?[A-Za-z_]\w*(?:\s*::\s*[A-Za-z_]\w*)*(?:\s*<[^;{}()]*>)?"
_TYPEDEF_RE = re.compile(rf"\btypedef\s+(?:(?:struct|class|union)\s+)?({_NAME})\s+([A-Za-z_]\w*)\s*;")
_USING_RE = re.compile(rf"\busing\s+([A-Za-z_]\w*)\s*=\s*(?:typename\s+)?(?:(?:struct|class|union)\s+)?({_NAME})\s*;")
_NEW_RE = sc._NEW_RE
_SCOPE_RE = sc._SCOPE_RE
_CALL_RE = sc._CALL_RE
_INCLUDE_RE = sc._INCLUDE_RE


def blank_inactive(text: str) -> str:
    """Inactive preprocessor branches blanked (offsets and lines preserved); undecidable
    branches stay (declarations there are still judged): preprocess.active_text."""
    return preprocess.active_text(text, unknown="active")


def norm(text: str) -> str:
    """Whitespace-insensitive form of a code fragment."""
    s = re.sub(r"\s+", " ", text).strip()
    return re.sub(r"\s*([^\w\s])\s*", r"\1", s)


def strip_name(name: str) -> str:
    name = es._strip_templates(re.sub(r"\s+", "", name))
    return name[2:] if name.startswith("::") else name


@dataclass
class Scope:
    kind: str  # namespace | class | struct | union
    name: str
    open: int
    close: int
    head: int  # offset of the keyword
    bases: str = ""
    qualified: str = ""
    parent: Optional["Scope"] = None
    children: list = field(default_factory=list)


@dataclass
class ClassDef:
    name: str  # qualified (as defined)
    file: str
    line: int
    bases: str
    members: tuple
    end_line: int = 0  # line of the closing brace

    @property
    def key(self) -> tuple:
        return (self.bases, self.members)


@dataclass
class OutOfClass:
    owner: str  # qualified class as written
    sig: tuple  # (member name, params)
    file: str
    line: int
    text: str  # normalized declaration + body
    open: int = -1  # offset of the body's `{` in the file text (identifies this exact definition)


@dataclass
class Parsed:
    classes: list  # ClassDef
    ooc: list  # OutOfClass
    fwd: list  # (qualified name, line)
    aliases: dict  # alias -> target (qualified, templates stripped)
    namespaces: set


def _line(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def _scopes(code: str) -> tuple[list[Scope], list[tuple[str, int]], dict[str, str]]:
    scopes: list[Scope] = []
    fwd: list[tuple[str, int]] = []
    typedef_names: dict[str, str] = {}  # typedef name -> class name (named typedef'd structs)
    n = len(code)
    by_open: dict[int, Scope] = {}
    for m in _SCOPE_HEAD_RE.finditer(code):
        kw, name = m.group(1), m.group(2)
        prev = _PREV_WORD_RE.search(code[max(0, m.start() - 48):m.start()])
        if prev and prev.group(1) in ("enum", "friend"):
            continue
        j = m.end()
        while j < n and code[j] not in "{;()=":
            j += 1
        if j >= n:
            continue
        head = code[m.end():j]
        if code[j] == "{":
            if kw == "namespace":
                if head.strip():
                    continue
                bases = ""
            else:
                hm = _BASES_RE.fullmatch(head)
                if not hm:
                    continue
                bases = norm(hm.group(1) or "")
            s = Scope(kw, name, j, es.match_brace(code, j), m.start(), bases)
            scopes.append(s)
            by_open[j] = s
        elif code[j] == ";" and kw != "namespace" and not head.strip():
            fwd.append((name, m.start()))
    for m in _TYPEDEF_BODY_RE.finditer(code):
        open_ = m.end() - 1
        close = es.match_brace(code, open_)
        nm = re.match(r"\s*([A-Za-z_]\w*)\s*;", code[close + 1:close + 200])
        if not nm:
            continue
        named = by_open.get(open_)
        if named is not None:
            if named.name != nm.group(1):
                typedef_names[nm.group(1)] = named.name
        else:
            s = Scope(m.group(1), nm.group(1), open_, close, m.start(), "")
            scopes.append(s)
            by_open[open_] = s
    scopes.sort(key=lambda s: s.open)
    stack: list[Scope] = []
    for s in scopes:
        while stack and not (stack[-1].open < s.open <= stack[-1].close):
            stack.pop()
        s.parent = stack[-1] if stack else None
        s.qualified = f"{s.parent.qualified}::{s.name}" if s.parent else s.name
        if s.parent:
            s.parent.children.append(s)
        stack.append(s)
    return scopes, fwd, typedef_names


def _enclosing(scopes: list[Scope], offset: int) -> Optional[Scope]:
    best = None
    for s in scopes:
        if s.open < offset <= s.close and (best is None or s.open > best.open):
            best = s
    return best


def split_members(body: str) -> list[str]:
    """Top-level statements of a class body (stripped code), normalized."""
    out: list[str] = []
    i, start, n = 0, 0, len(body)

    def add(a: int, b: int) -> None:
        s = norm(body[a:b])
        if s and s != ";":
            out.append(s)

    while i < n:
        ch = body[i]
        if ch == ";":
            add(start, i + 1)
            start = i + 1
        elif ch == "{":
            close = es.match_brace(body, i)
            decl = body[start:i]
            flat = es._strip_templates(decl)
            kw = es.TYPE_KEYWORD_RE.search(flat)
            paren = flat.find("(")
            func = paren >= 0 and not (kw and kw.start() < paren) and not re.search(r"=\s*$", decl)
            i = close
            if func:
                add(start, close + 1)
                start = close + 1
        elif ch == ":" and body[i + 1:i + 2] != ":" and (i == 0 or body[i - 1] != ":") \
                and re.fullmatch(r"\s*(?:public|protected|private)\s*", body[start:i]):
            add(start, i + 1)
            start = i + 1
        i += 1
    add(start, n)
    return out


def _class_body(code: str, s: Scope) -> str:
    parts, pos = [], s.open + 1
    for c in sorted(s.children, key=lambda c: c.open):
        parts.append(code[pos:c.open] + "{}")
        pos = c.close + 1
    parts.append(code[pos:s.close])
    return "".join(parts)


def parse_source(path: str, text: Optional[str]) -> Parsed:
    if not text:
        return Parsed([], [], [], {}, set())
    active = blank_inactive(text)
    code = es.strip_code(active)
    scopes, fwd_raw, typedef_names = _scopes(code)
    classes = [ClassDef(s.qualified, path, _line(text, s.head), s.bases, tuple(split_members(_class_body(code, s))),
                        _line(text, s.close)) for s in scopes if s.kind != "namespace"]
    namespaces = {s.qualified for s in scopes if s.kind == "namespace"}
    fwd = []
    for name, off in fwd_raw:
        enc = _enclosing(scopes, off)
        if enc is not None and enc.kind != "namespace":
            continue  # nested/friend declarations are members of the enclosing class
        fwd.append((f"{enc.qualified}::{name}" if enc else name, _line(text, off)))
    aliases: dict[str, str] = {}

    def alias(name: str, target: str, off: int) -> None:
        if re.search(r"[*&(]", target):
            return
        enc = _enclosing(scopes, off)
        target = strip_name(target)
        if not target or target == name:
            return
        aliases[name] = target
        if enc is not None:
            aliases[f"{enc.qualified}::{name}"] = target

    for name, target in typedef_names.items():
        aliases[name] = target
    for m in _TYPEDEF_RE.finditer(code):
        alias(m.group(2), m.group(1), m.start())
    for m in _USING_RE.finditer(code):
        alias(m.group(1), m.group(2), m.start())
    ooc = []
    for d in sc.function_defs(active):
        if any(s.kind != "namespace" and s.open < d.start <= s.close for s in scopes):
            continue  # in-class body: part of the class statement list
        if "::" not in d.qualified:
            continue
        owner, member = d.qualified.rsplit("::", 1)
        owner = strip_name(owner)
        if not owner or owner in namespaces:
            continue
        ooc.append(OutOfClass(owner, (member, tuple(d.params) if d.params is not None else None), path,
                              d.line, norm(code[d.start:d.close + 1]), d.open))
    return Parsed(classes, ooc, fwd, aliases, namespaces)


class Aliases:
    def __init__(self) -> None:
        self.map: dict[str, str] = {}

    def update(self, other: dict) -> None:
        for k, v in other.items():
            self.map.setdefault(k, v)

    def resolve(self, name: str) -> str:
        name = strip_name(name)
        for _ in range(8):
            if name in self.map:
                name = strip_name(self.map[name])
                continue
            head, sep, rest = name.partition("::")
            if sep and head in self.map:
                name = strip_name(self.map[head]) + "::" + rest
                continue
            break
        return name


# --------------------------------------------------------------------------
# Readiness access (duck-typed readiness.Readiness)
# --------------------------------------------------------------------------


def _load_readiness(repo: Path, rev: str, policy: dict):
    import readiness  # lazy: the module is optional at import time

    return readiness.load(Path(repo), rev, policy=policy)


class _State:
    def __init__(self, readiness) -> None:
        self.r = readiness
        self.cache: dict[str, dict] = {}

    def cls(self, name: str) -> dict:
        if name not in self.cache:
            try:
                st = dict(self.r.class_state(name) or {})
            except Exception as exc:  # a lookup failure never grants readiness
                st = {"class": name, "owner_unit": None, "provenance": "absent", "started": False,
                      "construct": "unresolved", "declare": "unresolved", "error": str(exc)}
            st.setdefault("class", name)
            self.cache[name] = st
        return self.cache[name]

    def unit_for_source(self, path: str) -> Optional[str]:
        fn = getattr(self.r, "unit_for_source", None)
        try:
            return fn(path) if fn else None
        except Exception:
            return None

    def source_of(self, unit: Optional[str]) -> Optional[str]:
        fn = getattr(self.r, "source_of", None)
        if not unit or not fn:
            return None
        try:
            return fn(unit)
        except Exception:
            return None

    def unused(self, unit: str) -> list[str]:
        fn = getattr(self.r, "unused_symbols", None)
        try:
            return list(fn(unit) or []) if fn else []
        except Exception:
            return []

    def is_namespace(self, name: str) -> bool:
        """readiness.is_namespace (additive): a mapped scope the source declares as a namespace."""
        fn = getattr(self.r, "is_namespace", None)
        try:
            return bool(fn(name)) if fn else False
        except Exception:
            return False

    def gated(self, path: str) -> bool:
        try:
            return bool(self.r.gated(path))
        except Exception:
            return False


# --------------------------------------------------------------------------
# classify
# --------------------------------------------------------------------------


def patch_sha256(files: list[dict]) -> str:
    rows = [[f["path"], f.get("before"), f.get("after")] for f in sorted(files, key=lambda f: f["path"])]
    return hashlib.sha256(json.dumps(rows, separators=(",", ":"), ensure_ascii=False).encode("utf-8",
                                                                                           "surrogatepass")).hexdigest()


def git_blob_id(text: Optional[str]) -> Optional[str]:
    """`git hash-object` of a text's original bytes (None: the file does not exist)."""
    if text is None:
        return None
    data = se.encode(text)
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def scope_inputs(state: "_State", files: list[dict]) -> dict:
    """What a verdict over `files` depends on besides the readiness revision, for a
    caller that reuses it at a later revision (integration re-verifies these
    instead of re-running the check): the changed files as git blob ids, and
    the owner-unit sources (owners and constructor owners) of every class the
    check looked up. Header and namespace drift is the caller's to check."""
    owners = getattr(state.r, "owners", None) or {}
    units: set[str] = set()
    for name, st in state.cache.items():
        if st.get("owner_unit"):
            units.add(st["owner_unit"])
        o = owners.get(st.get("class") or name) or owners.get(name) or {}
        if o.get("owner"):
            units.add(o["owner"])
        for c in o.get("ctors") or []:
            if isinstance(c, (list, tuple)) and len(c) > 3 and c[3]:
                units.add(c[3])
    sources = sorted({src for src in (state.source_of(u) for u in units) if src})
    return {"files": [{"path": f["path"], "before_blob": git_blob_id(f.get("before")),
                       "after_blob": git_blob_id(f.get("after"))} for f in sorted(files, key=lambda f: f["path"])],
            "owner_sources": sources}


def _rev_eq(a: Optional[str], b: Optional[str]) -> bool:
    if not a or not b:
        return False
    a, b = a.strip().lower(), b.strip().lower()
    return a == b or (min(len(a), len(b)) >= 7 and (a.startswith(b) or b.startswith(a)))


def _subsequence(small: tuple, big: tuple) -> bool:
    it = iter(big)
    return all(any(x == y for y in it) for x in small)


def _changed(before: ClassDef, after: ClassDef) -> list[str]:
    """What after gained or changed relative to before ([] for unchanged or removal-only)."""
    if after.bases != before.bases:
        return [f"bases changed ({before.bases or 'none'} -> {after.bases or 'none'})"]
    if _subsequence(after.members, before.members):
        return []
    have = Counter(before.members)
    added = [m for m in after.members if not have[m] or have.subtract([m])]
    if not added:
        return ["members reordered"]
    return ["members added/changed: " + "; ".join(a[:60] for a in added[:3]) + (" ..." if len(added) > 3 else "")]


@dataclass
class Analysis:
    """Per-class changes over the patch (shared by check and pr)."""
    changes: dict  # class -> list of (file, line, kind, detail), kind change|moved
    fwd: list  # (file, line, class)
    after_defs: dict  # class -> [ClassDef]
    ooc_added: dict  # class -> [(file, line, member)]
    aliases: Aliases
    after_text: dict  # path -> text


def analyze(files: list[dict]) -> Analysis:
    aliases = Aliases()
    before = {f["path"]: parse_source(f["path"], f.get("before")) for f in files}
    after = {f["path"]: parse_source(f["path"], f.get("after")) for f in files}
    for p in list(before.values()) + list(after.values()):
        aliases.update(p.aliases)

    def group_defs(side: dict) -> dict:
        out: dict[str, list] = {}
        for p in side.values():
            for c in p.classes:
                out.setdefault(aliases.resolve(c.name), []).append(c)
        return out

    def group_ooc(side: dict) -> dict:
        out: dict[str, list] = {}
        for p in side.values():
            for o in p.ooc:
                out.setdefault(aliases.resolve(o.owner), []).append(o)
        return out

    bdefs, adefs = group_defs(before), group_defs(after)
    booc, aooc = group_ooc(before), group_ooc(after)
    texts = {f["path"]: (f.get("before"), f.get("after")) for f in files}
    added_cache: dict[str, list[int]] = {}

    def added_lines(path: str) -> list[int]:
        """Sorted after-side lines the patch adds or changes in `path`."""
        if path not in added_cache:
            b, a = texts.get(path, (None, None))
            bl, al = (b or "").split("\n") if b else [], (a or "").split("\n") if a else []
            out = []
            for tag, _i1, _i2, j1, j2 in difflib.SequenceMatcher(None, bl, al, autojunk=False).get_opcodes():
                if tag in ("replace", "insert"):
                    out += range(j1 + 1, j2 + 1)
            added_cache[path] = out
        return added_cache[path]

    def first_changed(d: ClassDef) -> int:
        """First added/changed line inside the class definition (the head line if none)."""
        return next((ln for ln in added_lines(d.file) if d.line <= ln <= (d.end_line or d.line)), d.line)

    def head_line(cls: str, path: str, fallback: int) -> int:
        return next((d.line for d in adefs.get(cls, []) if d.file == path), fallback)

    changes: dict[str, list] = {}
    ooc_added: dict[str, list] = {}
    for cls, defs in adefs.items():
        olds = bdefs.get(cls, [])
        for d in defs:
            if not olds:
                changes.setdefault(cls, []).append((d.file, first_changed(d), "change", "class introduced", d.line))
                continue
            same = [b for b in olds if b.key == d.key]
            if same:
                if not any(b.file == d.file for b in same):
                    changes.setdefault(cls, []).append(
                        (d.file, d.line, "moved", f"identical definition moved from {same[0].file}", d.line))
                continue
            ref = next((b for b in olds if b.file == d.file), olds[0])
            what = _changed(ref, d)
            if what:
                changes.setdefault(cls, []).append((d.file, first_changed(d), "change", "; ".join(what), d.line))
    for cls, defs in aooc.items():
        olds = booc.get(cls, [])
        for o in defs:
            same = [b for b in olds if b.sig == o.sig and b.text == o.text]
            if same:
                if not any(b.file == o.file for b in same):
                    changes.setdefault(cls, []).append(
                        (o.file, o.line, "moved", f"identical {o.sig[0]} definition moved from {same[0].file}",
                         head_line(cls, o.file, o.line)))
                continue
            known = any(b.sig == o.sig for b in olds)
            detail = f"out-of-class definition {'changed' if known else 'added'}: {cls}::{o.sig[0]}"
            # kind ("ooc", open offset): this exact definition, for the own-unit check
            changes.setdefault(cls, []).append((o.file, o.line, ("ooc", o.open), detail,
                                                head_line(cls, o.file, o.line)))
            ooc_added.setdefault(cls, []).append((o.file, o.line, o.sig[0]))
    fwd = []
    for path, p in after.items():
        old = {aliases.resolve(n) for n, _ in before[path].fwd}
        for name, line in p.fwd:
            cls = aliases.resolve(name)
            if cls not in old:
                fwd.append((path, line, cls))
    return Analysis(changes, fwd, adefs, ooc_added, aliases, {f["path"]: f.get("after") for f in files})


class _Context:
    def __init__(self, state: _State, targets_for: Callable[[str], set], analysis: Analysis):
        self.state = state
        self.targets_for = targets_for
        self.analysis = analysis

    def own_unit_function(self, path: str, open_offset: int) -> bool:
        """Does the base-rev map place the exact function definition whose body opens at
        `open_offset` in `path` in the object of `path`'s own unit? (readiness.own_unit_function;
        unknown -> False: current behaviour)."""
        fn = getattr(self.state.r, "own_unit_function", None)
        unit = self.state.unit_for_source(path)
        text = self.analysis.after_text.get(path)
        if fn is None or unit is None or text is None:
            return False
        try:
            return open_offset >= 0 and fn(unit, text, open_offset, path) is True
        except Exception:
            return False

    def header_owned(self, path: str) -> bool:
        stem = _stem(path)
        for u in self.targets_for(path):
            src = self.state.source_of(u)
            cand = _stem(src) if src else (u.rsplit("/", 1)[-1].lower() if u else None)
            if cand and cand == stem:
                return True
        return False


def class_verdict(ctx: _Context, cls: str, path: str) -> tuple[str, str]:
    st = ctx.state.cls(cls)
    owner, prov = st.get("owner_unit"), st.get("provenance")
    declare = st.get("declare")
    if owner and owner in ctx.targets_for(path):
        return "own_class", f"{cls} is owned by the target unit {owner}"
    if declare == "not_ready":
        return "not_ready", (f"{cls} belongs to {owner or 'an undecompiled unit'}, whose implementation of it has "
                             "not started; do not add or change its declaration out of order")
    if prov == "absent" or (prov is None and not owner):
        defs = ctx.analysis.after_defs.get(cls, [])
        if defs and all(not is_header(d.file) for d in defs):
            return "local_helper", f"{cls} is not in the target map and is defined only in .cpp files (TU-local helper)"
        return "unresolved", f"{cls} is not in the target map/objects and is declared in a header"
    if declare == "unresolved" or prov == "ambiguous":
        why = "its owner is ambiguous" if prov == "ambiguous" else (
            f"its owner unit {owner} has no source file" if owner else "its owner is unknown")
        return "unresolved", f"{cls}: readiness unresolved ({why})"
    if declare not in ("ready", "shared"):
        return "unresolved", f"{cls}: unknown readiness state {declare!r}"
    if is_header(path) and not ctx.header_owned(path):
        return "foreign_header", f"{cls} ({declare}, owner {owner or 'shared'}) changed in a foreign header"
    return "ready", f"{cls} is {declare} (owner {owner or 'shared'})"


def _class_hunks(ctx: _Context) -> tuple[list[dict], list[str]]:
    hunks, warnings = [], []
    for cls, rows in sorted(ctx.analysis.changes.items()):
        per_file: dict[str, dict] = {}
        for path, line, kind, detail, class_line in rows:
            slot = per_file.setdefault(path, {"change": [], "moved": [], "own": []})
            if isinstance(kind, tuple):
                # an out-of-class member definition whose symbol the base-rev map places in this
                # file's own unit is the unit's own work, whoever owns the class; judged per exact
                # definition (its body offset), never per line
                if ctx.own_unit_function(path, kind[1]):
                    slot["own"].append((line, detail, class_line))
                    continue
                kind = "change"
            slot[kind].append((line, detail, class_line))
        for path, slot in sorted(per_file.items()):
            if slot["own"]:
                unit = ctx.state.unit_for_source(path)
                line = min(l for l, _, _ in slot["own"])
                detail = "; ".join(dict.fromkeys(d for _, d, _ in sorted(slot["own"])))
                hunks.append({"file": path, "line": line, "class": cls, "verdict": "own_class",
                              "reason": f"functions of this file's own unit {unit}: the map places their symbols "
                                        f"in its object ({detail})",
                              "class_line": min(c for _, _, c in slot["own"])})
            if slot["change"]:
                # `line`: first added/changed line of the class's members; `class_line`: the class head
                line = min(l for l, _, _ in slot["change"])
                class_line = min(c for _, _, c in slot["change"])
                detail = "; ".join(dict.fromkeys(d for _, d, _ in sorted(slot["change"])))
                st = ctx.state.cls(cls)
                if not ctx.analysis.after_defs.get(cls) and ctx.state.is_namespace(cls):
                    continue  # `void NS::f() {}` for a namespace declared in an unchanged header
                if st.get("provenance") == "absent" and not ctx.analysis.after_defs.get(cls) \
                        and st.get("owner_unit") is None:
                    warnings.append(f"{path}:{line}: out-of-class definitions for {cls}, which is neither defined "
                                    "in the patch nor in the target map (namespace or unknown scope): not judged")
                    continue
                verdict, reason = class_verdict(ctx, cls, path)
                if verdict == "local_helper":
                    warnings.append(f"{path}:{line}: {reason}")
                hunks.append({"file": path, "line": line, "class": cls, "verdict": verdict,
                              "reason": f"{reason} ({detail})", "class_line": class_line})
            elif slot["moved"]:
                line, detail, class_line = min(slot["moved"])
                hunks.append({"file": path, "line": line, "class": cls, "verdict": "moved", "reason": detail,
                              "class_line": class_line})
    seen = set()
    for path, line, cls in ctx.analysis.fwd:
        if (path, cls) in seen:
            continue
        seen.add((path, cls))
        hunks.append({"file": path, "line": line, "class": cls, "verdict": "forward_decl",
                      "reason": f"forward declaration of {cls}"})
    return hunks, warnings


def _constructed(text: Optional[str]) -> set[str]:
    """Classes the text constructs (`new X`, placement new) in active code; undecidable
    preprocessor branches do not count (precedent is positive evidence)."""
    if not text:
        return set()
    return {r["class"] for r in sc.class_references(preprocess.active_text(text, unknown="inactive"))
            if r["via"] == "new"}


def _order_hunks(ctx: _Context, repo: Optional[Path], base_rev: str, files: list[dict],
                 known: list[dict]) -> list[dict]:
    """Direct class references (`new X`, placement new, `TX::`, `TX(`) in added code of
    order-gated files, matched over whole expressions. Added `#include` lines are not
    references (an existing header declares nothing new, a moved include adds nothing;
    changed headers are the declaration check's job). `known` is kept for callers."""
    out, seen = [], set()
    for f in files:
        after = f.get("after")
        if after is None or not ctx.state.gated(f["path"]):
            continue
        own = ctx.targets_for(f["path"]) | {u for u in [ctx.state.unit_for_source(f["path"])] if u}
        # precedent: classes the base text of this file already constructs were accepted there
        # (canonical class identity, not the final name: `Ready::TStub` does not cover `Other::TStub`)
        precedent = {ctx.state.cls(ctx.analysis.aliases.resolve(n)).get("class") or n
                     for n in _constructed(f.get("before"))}
        refs = sc.class_references(preprocess.active_text(after, unknown="active"))
        for r in sc.added_references(f["path"], f.get("before"), after, refs):
            raw, via, ln = r["class"], r["via"], r["line"]
            cls = ctx.analysis.aliases.resolve(raw)
            if (f["path"], ln, cls) in seen:
                continue
            seen.add((f["path"], ln, cls))
            if ctx.state.is_namespace(cls):
                continue
            st = ctx.state.cls(cls)
            if (st.get("class") or cls) in precedent:
                continue  # ready by precedent in this file
            if st.get("owner_unit") and st["owner_unit"] in own:
                continue
            construct = st.get("construct")
            if construct == "not_ready":
                why = f"its owner unit {st.get('owner_unit')} does not define its constructor yet"
            elif construct == "unresolved" or construct not in ("ready", "shared"):
                why = "its readiness is unresolved (" + (st.get("provenance") or "absent") + ")"
            else:
                continue
            out.append({"file": f["path"], "line": ln, "class": cls, "verdict": "order_gated",
                        "reason": f"order-gated file references {cls} via {via}; {why}"})
    return out


def _load_checks(unused_checks: Optional[list]) -> list[dict]:
    return [r for r in (unused_checks or []) if isinstance(r, dict)]


def _unused_hunks(ctx: _Context, base_rev: str, files: list[dict], checks: list[dict],
                  edits_hash: Optional[str], repo: Optional[Path] = None,
                  known: Optional[list[dict]] = None) -> tuple[list[dict], list[str]]:
    """UNUSED reconstructions need a bound `inlined` certificate. A row carrying
    `unit_inputs_sha256` is bound when its body hash matches and the unit
    inputs it lists hash the same over the texts being checked (whatever the
    base revision); a row without one keeps the base_rev(+edits_hash) rule."""
    hunks, warnings = [], []
    index = None
    texts = {f["path"]: f.get("after") for f in (known or files)}

    def read(path: str) -> Optional[bytes]:
        if path in texts:
            return se.encode(texts[path])
        return sc.git_show(repo, base_rev, path) if repo is not None else None

    def bound_row(r: dict, sha: str, path: str) -> tuple[bool, str]:
        if r.get("body_sha256") != sha:
            return False, "body_sha256 mismatch"
        if r.get("unit_flags_sha256"):
            unit = ctx.state.unit_for_source(path)
            fn = getattr(ctx.state.r, "unit_flags", None)
            flags = fn(unit) if fn and unit else None
            if flags is None:
                return False, "cannot verify the unit's compile flags; re-certify"
            if hashlib.sha256(flags.encode("utf-8")).hexdigest() != r["unit_flags_sha256"]:
                return False, "stale certificate (compile flags changed); re-certify"
        if r.get("unit_inputs_sha256"):
            if sc.unit_inputs_sha256(r.get("unit_inputs") or [], read) == r["unit_inputs_sha256"]:
                return True, ""
            return False, "stale certificate (unit inputs changed); re-certify"
        if not _rev_eq(r.get("base_rev"), base_rev):
            return False, "base_rev mismatch"
        if edits_hash is not None and r.get("edits_hash") != edits_hash:
            return False, "edits_hash mismatch"
        return True, ""

    for f in files:
        after = f.get("after")
        if after is None:
            continue
        unit = ctx.state.unit_for_source(f["path"])
        if not unit:
            continue
        mangled = ctx.state.unused(unit)
        if not mangled:
            continue
        symbols = [sc.demangled_symbol(m) for m in mangled]
        if index is None:
            index = sc.signature_index(repo, base_rev, {x["path"]: x.get("after") for x in (known or files)})
        for c in sc.unused_candidates(f.get("before"), after, symbols, index=index, path=f["path"]):
            sym, d = c["symbol"], c["def"]
            sha = sc.body_sha256(after, d)
            cls = d.qualified.rsplit("::", 1)[0] if "::" in d.qualified else None
            rows = [r for r in checks
                    if (not r.get("file") or r.get("file") == f["path"])
                    and ((r.get("mangled") and r["mangled"] == sym["mangled"])
                         or (not r.get("mangled") and r.get("function") in (sym["function"], sym["qualified"])))]
            judged = [(r, *bound_row(r, sha, f["path"])) for r in rows]
            bound = [r for r, ok, _ in judged if ok]
            stale_why = sorted({why for _, ok, why in judged if not ok})
            head = {"file": f["path"], "line": d.line, "class": cls}
            inlined = [r for r in bound if r.get("status") == "inlined"]
            dead = [r for r in bound if r.get("status") == "dead"]
            if inlined:
                ev = inlined[0]
                hunks.append(dict(head, verdict="ready", reason=f"UNUSED {sym['function']} reconstructed with bound "
                                  f"inlined evidence: {ev.get('reason') or 'stub test made a same-unit caller worse'}"))
            elif dead:
                hunks.append(dict(head, verdict="dead_unused", reason=f"UNUSED {sym['function']} is dead: "
                                  "stubbing its body changes no function of this unit; leave it as a stub"))
            else:
                if not rows:
                    why = "no unused check"
                elif not bound:
                    why = "the unused check is stale (" + "; ".join(stale_why) + ")"
                else:
                    why = "the unused check is " + ", ".join(sorted({str(r.get('status')) for r in bound}))
                hunks.append(dict(head, verdict="unused_unverified",
                                  reason=f"UNUSED {sym['function']} reconstructed without bound inlined evidence: "
                                  f"{why}"))
    return hunks, warnings


def _limits(ctx: _Context, files: list[dict], policy: dict) -> tuple[dict, list[str]]:
    scope = dict(DEFAULT_SCOPE, **((policy or {}).get("scope") or {}))
    headers, lines = 0, 0
    for f in files:
        if not is_header(f["path"]) or ctx.header_owned(f["path"]):
            continue
        headers += 1
        lines += sum(len(e.added) for e in se.enumerate_edits(f["path"], f.get("before"), f.get("after")))
    warnings = []
    if headers > int(scope["maxForeignHeaders"]):
        warnings.append(f"soft limit: {headers} foreign headers changed (max {scope['maxForeignHeaders']})")
    if lines > int(scope["maxForeignHeaderLines"]):
        warnings.append(f"soft limit: {lines} lines added to foreign headers (max {scope['maxForeignHeaderLines']})")
    return {"foreign_headers": headers, "foreign_header_lines": lines}, warnings


def _sort(hunks: list[dict]) -> list[dict]:
    return sorted(hunks, key=lambda h: (h["file"], h["line"], h["class"] or "", h["verdict"]))


def _run(repo: Optional[Path], base_rev: str, files: list[dict], *, targets_for: Callable[[str], set], readiness,
         unused_checks: Optional[list], policy: Optional[dict], edits_hash: Optional[str]) -> tuple[dict, _Context]:
    policy = policy or {}
    if edits_hash is None:
        edits_hash = policy.get("edits_hash")
    known = files
    files = [f for f in files if f.get("before") != f.get("after")]
    state = _State(readiness)
    ctx = _Context(state, targets_for, analyze(files))
    hunks, warnings = _class_hunks(ctx)
    hunks += _order_hunks(ctx, Path(repo) if repo else None, base_rev, files, known)
    uh, uw = _unused_hunks(ctx, base_rev, files, _load_checks(unused_checks), edits_hash,
                           repo=Path(repo) if repo else None, known=known)
    hunks += uh
    warnings += uw
    limits, lw = _limits(ctx, files, policy)
    warnings += lw
    hunks = _sort(hunks)
    result = {
        "identity": {"base_rev": base_rev, "patch_sha256": patch_sha256(files),
                     "readiness": dict(getattr(readiness, "identity", {}) or {})},
        "verdict": "reject" if any(h["verdict"] in REJECT for h in hunks) else "pass",
        "hunks": hunks,
        "warnings": warnings,
        "limits": limits,
        "scope_inputs": scope_inputs(state, files),
    }
    return result, ctx


def classify(repo: Path, base_rev: str, files: list[dict], *, target_unit: Optional[str], readiness,
             unused_checks: Optional[list] = None, policy: Optional[dict] = None,
             edits_hash: Optional[str] = None) -> dict:
    """The edit-scope fence over complete before/after texts (contract: order-scope-contract.md)."""
    targets = {target_unit} if target_unit else set()
    result, _ = _run(repo, base_rev, files, targets_for=lambda _p: targets, readiness=readiness,
                     unused_checks=unused_checks, policy=policy, edits_hash=edits_hash)
    return result


# --------------------------------------------------------------------------
# PR check
# --------------------------------------------------------------------------


def _made_ready(ctx: _Context, cls: str, src: str, need_ctor: bool, files: list[dict]) -> Optional[int]:
    """The line where this PR's candidate owner source makes `cls` ready, judged by
    readiness's own rules (active definitions matching the target's strong
    signatures: the constructors for construction, any strong member for a
    declaration), or None. A same-named member with another signature (e.g.
    `TStub::TStub(Unrelated*)`) does not make it ready."""
    text = next((f.get("after") for f in files if f["path"] == src), None)
    fn = getattr(ctx.state.r, "class_state_with_sources", None)
    if text is None or fn is None:
        return None
    try:
        st = fn(cls, {src: text})
    except Exception:
        return None
    ok = st.get("construct") in ("ready", "shared") if need_ctor else st.get("declare") in ("ready", "shared")
    if not ok:
        return None
    rows = [line for path, line, _m in ctx.analysis.ooc_added.get(cls, []) if path == src]
    return min(rows) if rows else 1


def pr_check(repo: Path, base_rev: str, files: list[dict], *, readiness, unused_checks: Optional[list] = None,
             policy: Optional[dict] = None) -> dict:
    state = _State(readiness)
    units = {}
    for f in files:
        u = state.unit_for_source(f["path"])
        if u:
            units[f["path"]] = u
    pr_units = set(units.values())

    def targets_for(path: str) -> set:
        return {units[path]} if path in units else set(pr_units)

    result, ctx = _run(repo, base_rev, files, targets_for=targets_for, readiness=readiness,
                       unused_checks=unused_checks, policy=policy, edits_hash=None)
    prereqs = []
    for h in result["hunks"]:
        if h["verdict"] not in ("not_ready", "order_gated") or not h["class"]:
            continue
        st = ctx.state.cls(h["class"])
        src = ctx.state.source_of(st.get("owner_unit"))
        if not src or src == h["file"]:
            continue
        line = _made_ready(ctx, h["class"], src, need_ctor=h["verdict"] == "order_gated", files=files)
        if line is None:
            continue
        prereqs.append({"class": h["class"], "file": h["file"], "line": h["line"], "suggestion": PREREQ_SUGGESTION,
                        "made_ready_by": f"{src}:{line}"})
        h["reason"] = (f"{h['class']} is made ready in this PR by {src}:{line} (same-PR prerequisite; "
                       f"{PREREQ_SUGGESTION}); was {h['verdict']}: {h['reason']}")
        h["verdict"] = "ready"
    result["verdict"] = "reject" if any(h["verdict"] in REJECT for h in result["hunks"]) else "pass"
    changed = sum(len(e.added) + len(e.removed) for f in files
                  for e in se.enumerate_edits(f["path"], f.get("before"), f.get("after")))
    size_warn = []
    if len(pr_units) > PR_MAX_UNITS:
        size_warn.append(f"PR touches {len(pr_units)} units ({', '.join(sorted(pr_units))}); humans touch one")
    if len(files) > PR_MAX_FILES:
        size_warn.append(f"PR changes {len(files)} files (human p90 {PR_MAX_FILES})")
    if changed > PR_MAX_CHANGED_LINES:
        size_warn.append(f"PR changes {changed} lines (human p90 {PR_MAX_CHANGED_LINES})")
    result["pr_size"] = {"units": len(pr_units), "files": len(files), "changed_lines": changed,
                         "warnings": size_warn}
    result["same_pr_prerequisites"] = prereqs
    return result


# --------------------------------------------------------------------------
# File collection
# --------------------------------------------------------------------------


def _decode(data: Optional[bytes]) -> Optional[str]:
    return se.decode(data) if data is not None else None


def files_between(repo: Path, base: str, head: str) -> list[dict]:
    out = sc.git(repo, "diff", "--name-only", "--no-renames", "--no-color", base, head, "--",
                 *SCOPE_PATHS).stdout.decode()
    files = []
    for rel in sorted({l for l in out.splitlines() if l and in_scope(l)}):
        before, after = _decode(sc.git_show(repo, base, rel)), _decode(sc.git_show(repo, head, rel))
        if before != after:
            files.append({"path": rel, "before": before, "after": after})
    return files


def files_overlay(repo: Path, base: str, overlay_dir: str) -> list[dict]:
    files = []
    for rel, data in sorted(sc.read_overlay(overlay_dir).items()):
        if not in_scope(rel):
            continue
        before, after = _decode(sc.git_show(repo, base, rel)), se.decode(data)
        if before != after:
            files.append({"path": rel, "before": before, "after": after})
    return files


def files_worktree(repo: Path, base: str) -> list[dict]:
    return [{"path": f["path"], "before": f["base_text"], "after": f["cand_text"]}
            for f in sc.collect_files(repo, base, SCOPE_PATHS) if in_scope(f["path"])]


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def _json_arg(value: Optional[str]) -> Any:
    if not value:
        return None
    try:
        return json.loads(value)
    except ValueError:
        p = Path(value[1:] if value.startswith("@") else value)
        if p.is_file():
            return json.loads(p.read_text())
        raise ToolFailure(f"not JSON: {value[:80]}")


def read_unused_checks(path: Optional[str]) -> list[dict]:
    """A JSON list, an object with `unused_checks`, or JSONL."""
    if not path:
        return []
    text = Path(path).read_text()
    try:
        data = json.loads(text)
    except ValueError:
        return [json.loads(l) for l in text.splitlines() if l.strip()]
    if isinstance(data, dict):
        data = data.get("unused_checks") or []
    return [r for r in data if isinstance(r, dict)]


def _resolve(repo: Path, rev: str) -> str:
    full = sc.rev_parse(repo, f"{rev}^{{commit}}")
    if not full:
        raise _BadRev(rev)
    return full


class _BadRev(Exception):
    pass


def cli_policy(value: Optional[str]) -> dict:
    """--policy-json, else $ORCH_ORDERING_POLICY; neither -> tool failure (exit 2).
    A silently empty policy would drop every order-gated check."""
    raw = value if value else os.environ.get("ORCH_ORDERING_POLICY")
    if not raw:
        raise ToolFailure("no ordering policy: pass --policy-json or set ORCH_ORDERING_POLICY "
                          "(e.g. {\"gatedPaths\": [\"src/System/MarNameRefGen*.cpp\"]})")
    policy = _json_arg(raw)
    if not isinstance(policy, dict) or not isinstance(policy.get("gatedPaths", []), list):
        raise ToolFailure("ordering policy must be a JSON object with a gatedPaths list")
    return policy


def _infer_target(state: _State, files: list[dict]) -> Optional[str]:
    units = {u for u in (state.unit_for_source(f["path"]) for f in files) if u}
    return next(iter(units)) if len(units) == 1 else None


def cmd_check(args) -> dict:
    repo = Path(args.repo)
    base = _resolve(repo, args.base_rev)
    if args.head_rev:
        files = files_between(repo, base, _resolve(repo, args.head_rev))
    elif args.overlay_dir:
        files = files_overlay(repo, base, args.overlay_dir)
    else:
        files = files_worktree(repo, base)
    policy = cli_policy(args.policy_json)
    readiness = _load_readiness(repo, base, policy)
    target = args.target_unit or _infer_target(_State(readiness), files)
    return classify(repo, base, files, target_unit=target, readiness=readiness,
                    unused_checks=read_unused_checks(args.unused_checks), policy=policy, edits_hash=args.edits_hash)


def cmd_pr(args) -> dict:
    repo = Path(args.repo)
    base, head = _resolve(repo, args.base), _resolve(repo, args.head)
    mb = sc.git(repo, "merge-base", base, head, check=False).stdout.decode().strip()
    if not mb:
        raise _BadRev(f"no merge base of {args.base} and {args.head}")
    policy = cli_policy(args.policy_json)
    readiness = _load_readiness(repo, base, policy)
    return pr_check(repo, mb, files_between(repo, mb, head), readiness=readiness,
                    unused_checks=read_unused_checks(args.unused_checks), policy=policy)


def _human(payload: dict) -> list[str]:
    lines = [f"verdict: {payload['verdict']}  ({len(payload['hunks'])} hunks)"]
    for h in payload["hunks"]:
        lines.append(f"  {h['verdict']:<18} {h['file']}:{h['line']}  {h['class'] or ''}  {h['reason']}")
    lines += ["  warning: " + w for w in payload["warnings"]]
    for p in payload.get("same_pr_prerequisites") or []:
        lines.append(f"  prerequisite: {p['class']} at {p['file']}:{p['line']}: {p['suggestion']}")
    if "pr_size" in payload:
        lines += ["  size: " + w for w in payload["pr_size"]["warnings"]]
    return lines


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="edit_scope.py", description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="command", required=True)
    c = sub.add_parser("check", help="classify a change against the edit-scope fence")
    c.add_argument("--repo", required=True)
    c.add_argument("--base-rev", required=True)
    src = c.add_mutually_exclusive_group()
    src.add_argument("--head-rev")
    src.add_argument("--overlay-dir")
    src.add_argument("--worktree", action="store_true", help="working tree incl. untracked (default)")
    c.add_argument("--target-unit")
    c.add_argument("--unused-checks")
    c.add_argument("--edits-hash", help="also require unused checks bound to this edits_hash")
    c.add_argument("--policy-json", help="ordering policy JSON (default $ORCH_ORDERING_POLICY; one is required)")
    c.add_argument("--json", action="store_true")
    c.set_defaults(func=cmd_check)
    p = sub.add_parser("pr", help="pr_scope_check over base...head")
    p.add_argument("--repo", required=True)
    p.add_argument("--base", required=True)
    p.add_argument("--head", required=True)
    p.add_argument("--policy-json", help="ordering policy JSON (default $ORCH_ORDERING_POLICY; one is required)")
    p.add_argument("--unused-checks")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=cmd_pr)
    return ap


def _fail(kind: str, detail: str) -> int:
    sys.stderr.write(json.dumps({"error": kind, "detail": detail}) + "\n")
    return 2


def main(argv: Optional[list[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        payload = args.func(args)
    except _BadRev as exc:
        return _fail("bad_rev", f"unknown revision: {exc}")
    except (ToolFailure, sc.ToolFailure) as exc:
        return _fail("tool_failure", str(exc))
    except Exception as exc:  # readiness.ReadinessError carries .kind/.detail
        if hasattr(exc, "kind"):
            return _fail(str(getattr(exc, "kind")), str(getattr(exc, "detail", exc)))
        return _fail("tool_failure", f"{type(exc).__name__}: {exc}")
    if args.json:
        sys.stdout.write(json.dumps(payload, indent=1) + "\n")
    else:
        print("\n".join(_human(payload)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
