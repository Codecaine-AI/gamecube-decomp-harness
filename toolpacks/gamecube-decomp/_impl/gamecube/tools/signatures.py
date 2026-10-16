#!/usr/bin/env python3
"""Exact C++ function-signature identity for a CodeWarrior (MWCC) decomp.

Decides whether a function definition in source text is the same function
as a CodeWarrior-mangled symbol of the original object. Both sides are put
in one canonical, ABI-exact spelling:

  * builtins as MWCC mangles them, never folded (`int` != `long`);
    `unsigned` = `unsigned int`, `signed`/`signed int` = `int`,
    `long int` = `long`, word order normalized;
  * typedefs only through the repo's own declarations (`TypeIndex`);
  * pointee/referee cv kept, postfix (`char const *`), top-level cv of a
    by-value parameter dropped, array/function parameters decayed;
  * names fully qualified, template arguments canonical
    (`JGadget::TAllocator<void *>`), `struct`/`enum` keywords dropped,
    typedef'd tags resolved to the tag (`GXTexFmt` -> `_GXTexFmt`).

Identity that cannot be resolved (template parameters, dependent base
members, unparsable declarations, undemangleable symbols) is reported as
None, never guessed True.

Stdlib only; loaded by file path from lint code, so it imports no sibling
TOOLS module (the m2c demangler is loaded by path when first needed). No
`from __future__ import annotations`: dataclasses would then need the module
registered in sys.modules, which a by-path loader may not do.
"""

import hashlib
import importlib.util
import itertools
import json
import os
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Optional

MODULE_VERSION = 1

_TOOLS_DIR = Path(__file__).resolve().parent
_DEMANGLER_PATH = _TOOLS_DIR.parent / "m2c" / "m2c" / "demangle_codewarrior.py"
_INDEX_SUFFIXES = (".h", ".hpp", ".hh", ".inl", ".inc", ".cpp", ".c", ".cp", ".cc", ".tpp")
_MAX_ALTS = 64
_MAX_DEPTH = 24

# --------------------------------------------------------------------------
# Text scanning
# --------------------------------------------------------------------------

_STRIP_RE = re.compile(
    r"//[^\n]*"
    r"|/\*.*?(?:\*/|\Z)"
    r"|\"(?:\\.|[^\"\\\n])*\"?"
    r"|'(?:\\.|[^'\\\n])*'?"
    r"|^[ \t]*\#(?:[^\n]*\\\n)*[^\n]*",
    re.S | re.M,
)


def _blank(s: str) -> str:
    return re.sub(r"[^\n]", " ", s)


def _strip_sub(m: "re.Match[str]") -> str:
    s = m.group()
    if s[0] in "\"'" and len(s) >= 2 and s[-1] == s[0]:
        return s[0] + _blank(s[1:-1]) + s[-1]
    if s[0] in "\"'":
        return s[0] + _blank(s[1:])
    return _blank(s)


def strip_code(text: str) -> str:
    """Blank comments, literal contents and preprocessor lines (offsets kept)."""
    return _STRIP_RE.sub(_strip_sub, text)


_PP_RE = re.compile(r"^[ \t]*#[ \t]*(if|ifdef|ifndef|elif|else|endif)\b(.*)$")


def _blank_if0(text: str) -> str:
    """Blank `#if 0` regions (to the matching #else/#elif/#endif)."""
    if "#" not in text or not re.search(r"^[ \t]*#[ \t]*if[ \t]+\(?[ \t]*0", text, re.M):
        return text
    out, stack, inactive = [], [], False
    for line in text.split("\n"):
        m = _PP_RE.match(line)
        if m:
            kw, rest = m.group(1), m.group(2).split("//")[0].split("/*")[0].strip()
            if kw in ("if", "ifdef", "ifndef"):
                if inactive:
                    stack.append("nested")
                elif kw == "if" and re.fullmatch(r"\(?\s*(?:0+|false)\s*\)?", rest):
                    stack.append("zero")
                    inactive = True
                else:
                    stack.append("normal")
            elif kw in ("else", "elif"):
                if stack and stack[-1] == "zero":
                    stack[-1] = "done"
                    inactive = False
            elif kw == "endif" and stack:
                if stack.pop() == "zero":
                    inactive = False
            out.append(line)
            continue
        out.append(_blank(line) if inactive else line)
    return "\n".join(out)


def _brace_map(code: str) -> dict[int, int]:
    pairs: dict[int, int] = {}
    stack: list[int] = []
    for m in re.finditer(r"[{}]", code):
        if m.group() == "{":
            stack.append(m.start())
        elif stack:
            pairs[stack.pop()] = m.start()
    n = len(code)
    for o in stack:
        pairs[o] = n
    return pairs


_TOK_RE = re.compile(r"[A-Za-z_]\w*|\d[\w.']*|::|\.\.\.|->\*?|&&|\|\||\+\+|--|<<=?|[=!<>+\-*/%&|^]=|[^\s\w]")
_CV = {"const", "volatile"}
_BUILTIN = {"void", "bool", "char", "short", "int", "long", "float", "double", "signed", "unsigned", "wchar_t",
            "__int64"}
_ELAB = {"struct", "class", "union", "enum"}
_IGNORE_SPEC = {"register", "inline", "static", "extern", "mutable", "__restrict", "restrict", "auto",
                "virtual", "explicit", "friend", "typedef", "__inline", "__volatile__", "asm", "__asm"}
_KEYWORDS = _CV | _BUILTIN | _ELAB | _IGNORE_SPEC | {"typename", "template", "operator", "namespace", "using",
                                                     "public", "private", "protected", "sizeof", "throw",
                                                     "return", "new", "delete", "this", "true", "false"}
_ATTRIBUTE_WORDS = {"__declspec", "__attribute__", "alignas", "decltype", "sizeof", "__section"}
_ACCESS_RE = re.compile(r"^\s*(?:(?:public|protected|private)\s*:(?!:)\s*)+")


def _tokens(text: str) -> list[str]:
    return _TOK_RE.findall(text)


def _is_ident(t: str) -> bool:
    return bool(t) and (t[0].isalpha() or t[0] == "_")


def _match_tok(toks: list[str], i: int, open_: str, close: str) -> int:
    """Index of the token closing toks[i] (an `open_`), -1 if unbalanced."""
    depth = 0
    for j in range(i, len(toks)):
        if toks[j] == open_:
            depth += 1
        elif toks[j] == close:
            depth -= 1
            if depth == 0:
                return j
    return -1


def _match_angle(toks: list[str], i: int) -> int:
    """Close of a template argument list opened at toks[i] (`<`), parens aware."""
    depth = 0
    paren = 0
    for j in range(i, len(toks)):
        t = toks[j]
        if t in "([":
            paren += 1
        elif t in ")]":
            paren -= 1
        elif paren == 0 and t == "<":
            depth += 1
        elif paren == 0 and t == ">":
            depth -= 1
            if depth == 0:
                return j
        elif paren == 0 and t in (";", "{", "}"):
            return -1
    return -1


def _split_top(toks: list[str], sep: str = ",") -> list[list[str]]:
    parts: list[list[str]] = [[]]
    depth = 0
    for t in toks:
        if t in ("(", "[", "<", "{"):
            depth += 1
        elif t in (")", "]", ">", "}"):
            depth -= 1
        if t == sep and depth == 0:
            parts.append([])
            continue
        parts[-1].append(t)
    return parts


def _strip_template_prefix(toks: list[str], detail: Optional[list] = None
                           ) -> tuple[list[str], Optional[list[str]], bool]:
    """Remove leading `template<...>` clauses: (rest, param names, explicit specialization).

    `detail`, when given, receives [name, default text or None] for the last clause."""
    names: Optional[list[str]] = None
    explicit = False
    while len(toks) >= 2 and toks[0] == "template" and toks[1] == "<":
        j = _match_angle(toks, 1)
        if j < 0:
            break
        inner = toks[2:j]
        if not inner:
            explicit = True
        names = names or []
        if detail is not None:
            detail.clear()
        for p in _split_top(inner):
            default = None
            if "=" in p:
                default = " ".join(p[p.index("=") + 1:])
                p = p[:p.index("=")]
            idents = [t for t in p if _is_ident(t) and t not in ("typename", "class", "template")
                      and t not in _BUILTIN and t not in _CV]
            if idents and (p[0] in ("typename", "class") or len(p) >= 2):
                names.append(idents[-1])
                if detail is not None:
                    detail.append([idents[-1], default])
            elif detail is not None:
                detail.append(["", default])
        toks = toks[j + 1:]
    return toks, names, explicit


def _strip_access(toks: list[str]) -> list[str]:
    while len(toks) >= 2 and toks[0] in ("public", "private", "protected") and toks[1] == ":":
        toks = toks[2:]
    return toks


# --------------------------------------------------------------------------
# Type trees
#
# Unresolved (parsed) nodes:
#   ("b", builtin)  ("n", glob, ((ident, args|None), ...), elab)  ("cv", quals, t)
#   ("p", t)  ("r", t)  ("a", dim|None, t)  ("f", ret, (params...))  ("lit", s)
#   ("e",) ellipsis  ("u",) unresolvable
# Resolved nodes replace "n" by ("N", name) or ("alt", (nodes...), certain).
# --------------------------------------------------------------------------


class _ParseError(Exception):
    pass


def _builtin(words: list[str]) -> str:
    w = [x for x in words if x != "__int64"] + (["long", "long"] if "__int64" in words else [])
    uns = "unsigned" in w
    sig = "signed" in w
    longs = w.count("long")
    if "char" in w:
        return "unsigned char" if uns else ("signed char" if sig else "char")
    if "short" in w:
        return "unsigned short" if uns else "short"
    if longs >= 2:
        return "unsigned long long" if uns else "long long"
    if "double" in w:
        return "long double" if longs else "double"
    if longs == 1:
        return "unsigned long" if uns else "long"
    for single in ("float", "bool", "void", "wchar_t"):
        if single in w:
            return single
    return "unsigned int" if uns else "int"


class _Parser:
    def __init__(self, toks: list[str]):
        self.t = toks
        self.i = 0

    def peek(self, k: int = 0) -> str:
        j = self.i + k
        return self.t[j] if j < len(self.t) else ""

    def specs(self) -> tuple:
        quals: set[str] = set()
        words: list[str] = []
        name = None
        elab = False
        while self.i < len(self.t):
            tok = self.peek()
            if tok in _CV:
                quals.add(tok)
                self.i += 1
            elif tok in _BUILTIN:
                if name is not None:
                    break
                words.append(tok)
                self.i += 1
            elif tok in _ELAB:
                elab = True
                self.i += 1
                if self.peek() in ("class", "struct"):  # `enum class X`
                    self.i += 1
            elif tok == "typename":
                self.i += 1
            elif tok in _IGNORE_SPEC:
                self.i += 1
            elif tok == "{":  # a class body already replaced by `{}`
                j = _match_tok(self.t, self.i, "{", "}")
                if j < 0:
                    raise _ParseError("brace")
                self.i = j + 1
            elif (tok == "::" or (_is_ident(tok) and tok not in _KEYWORDS)) and name is None and not words:
                name = self.qualname()
            else:
                break
        if words:
            base: tuple = ("b", _builtin(words))
        elif name is not None:
            base = ("n", name[0], name[1], elab)
        else:
            raise _ParseError("no type")
        return ("cv", frozenset(quals), base) if quals else base

    def qualname(self) -> tuple:
        glob = False
        if self.peek() == "::":
            glob = True
            self.i += 1
        parts = []
        while True:
            tok = self.peek()
            if not _is_ident(tok) or tok in _KEYWORDS - {"template"}:
                raise _ParseError("name")
            if tok == "template":
                self.i += 1
                continue
            self.i += 1
            args = None
            if self.peek() == "<":
                j = _match_angle(self.t, self.i)
                if j < 0:
                    raise _ParseError("angle")
                args = tuple(_parse_arg(a) for a in _split_top(self.t[self.i + 1:j])) if j > self.i + 1 else ()
                self.i = j + 1
            parts.append((tok, args))
            if self.peek() == "::" and (_is_ident(self.peek(1)) and self.peek(1) not in _KEYWORDS - {"template"}):
                self.i += 1
                continue
            break
        return glob, tuple(parts)

    def declarator(self, base: tuple, allow_name: bool) -> tuple[tuple, Optional[str]]:
        ops: list[tuple[str, frozenset]] = []
        while self.peek() in ("*", "&", "&&"):
            op = "p" if self.peek() == "*" else "r"
            self.i += 1
            quals = set()
            while self.peek() in _CV or self.peek() in ("__restrict", "restrict"):
                if self.peek() in _CV:
                    quals.add(self.peek())
                self.i += 1
            ops.append((op, frozenset(quals)))
        if _is_ident(self.peek()) and self.peek(1) == "::" and self.peek(2) == "*":
            raise _ParseError("member pointer")
        inner: Optional[list[str]] = None
        name = None
        if self.peek() == "(" and self.peek(1) in ("*", "&", "("):
            j = _match_tok(self.t, self.i, "(", ")")
            if j < 0:
                raise _ParseError("paren")
            inner = self.t[self.i + 1:j]
            self.i = j + 1
        elif allow_name and _is_ident(self.peek()) and self.peek() not in _KEYWORDS:
            name = self.peek()
            self.i += 1
        suffixes: list[tuple] = []
        while self.peek() in ("[", "("):
            if self.peek() == "[":
                j = _match_tok(self.t, self.i, "[", "]")
                if j < 0:
                    raise _ParseError("bracket")
                dim_toks = self.t[self.i + 1:j]
                dim = None
                if len(dim_toks) == 1 and re.fullmatch(r"\d+[uUlL]*", dim_toks[0]):
                    dim = int(re.sub(r"[uUlL]+$", "", dim_toks[0]), 0) if not dim_toks[0].startswith("0x") else int(
                        dim_toks[0], 16)
                elif dim_toks:
                    dim = -1  # an expression: unknown dimension
                suffixes.append(("a", dim))
                self.i = j + 1
            else:
                j = _match_tok(self.t, self.i, "(", ")")
                if j < 0:
                    raise _ParseError("paren")
                params = _parse_param_list(self.t[self.i + 1:j])
                if params is None:
                    raise _ParseError("params")
                suffixes.append(("f", params))
                self.i = j + 1
                while self.peek() in _CV:
                    self.i += 1
                if self.peek() == "throw" and self.peek(1) == "(":
                    k = _match_tok(self.t, self.i + 1, "(", ")")
                    self.i = k + 1 if k > 0 else len(self.t)
        t = base
        for op, quals in ops:
            t = (op, t)
            if quals:
                t = ("cv", quals, t)
        for suf in reversed(suffixes):
            if suf[0] == "a":
                t = ("a", suf[1], t)
            else:
                t = ("f", t, suf[1])
        if inner is not None:
            sub = _Parser(inner)
            t, name = sub.declarator(t, allow_name)
            if sub.i != len(inner):
                raise _ParseError("inner")
        return t, name


def _parse_arg(toks: list[str]) -> tuple:
    if not toks:
        return ("u",)
    if len(toks) <= 2 and re.fullmatch(r"-?\d+", "".join(toks)):
        return ("lit", str(int("".join(toks))))
    if toks in (["true"], ["false"]):
        return ("lit", "1" if toks[0] == "true" else "0")
    try:
        p = _Parser(toks)
        base = p.specs()
        t, name = p.declarator(base, allow_name=False)
        if p.i != len(toks):
            return ("u",)
        return t
    except _ParseError:
        return ("u",)


def _parse_param(toks: list[str]) -> Optional[tuple]:
    """One parameter (name and default argument removed) -> unresolved tree."""
    eq = None
    depth = 0
    for k, t in enumerate(toks):
        if t in ("(", "[", "<"):
            depth += 1
        elif t in (")", "]", ">"):
            depth -= 1
        elif t == "=" and depth == 0:
            eq = k
            break
    if eq is not None:
        toks = toks[:eq]
    if toks == ["..."]:
        return ("e",)
    try:
        p = _Parser(toks)
        base = p.specs()
        t, _name = p.declarator(base, allow_name=True)
        if p.i != len(toks):
            return None
        return t
    except _ParseError:
        return None


def _parse_param_list(toks: list[str]) -> Optional[tuple]:
    if not toks or toks == ["void"]:
        return ()
    out = []
    for part in _split_top(toks):
        t = _parse_param(part)
        if t is None:
            return None
        out.append(t)
    return tuple(out)


def _param_norm(t: tuple) -> tuple:
    """Top-level cv dropped, arrays and functions decayed to pointers (resolved trees)."""
    while t[0] == "cv":
        t = t[2]
    if t[0] == "alt":
        return ("alt", tuple(_param_norm(x) for x in t[1]), t[2])
    if t[0] == "a":
        return ("p", t[2])
    if t[0] == "f":
        return ("p", t)
    return t


def _render(t: tuple) -> tuple[frozenset, bool]:
    """Resolved tree -> (canonical spellings, certain)."""
    k = t[0]
    if k == "b":
        return frozenset([t[1]]), True
    if k == "N":
        return frozenset([t[1]]), True
    if k == "lit":
        return frozenset([t[1]]), True
    if k == "e":
        return frozenset(["..."]), True
    if k == "alt":
        out: set[str] = set()
        certain = t[2]
        for x in t[1]:
            s, c = _render(x)
            out |= s
            certain = certain and c
        return frozenset(out), certain
    if k == "cv":
        quals = set(t[1])
        inner = t[2]
        while inner[0] == "cv":
            quals |= inner[1]
            inner = inner[2]
        if inner[0] in ("r", "f"):
            return _render(inner)
        if inner[0] == "a":
            return _render(("a", inner[1], ("cv", frozenset(quals), inner[2])))
        s, c = _render(inner)
        suffix = " ".join(q for q in ("const", "volatile") if q in quals)
        return frozenset(f"{x} {suffix}" for x in s), c
    if k == "p":
        s, c = _render(t[1])
        return frozenset(f"{x} *" for x in s), c
    if k == "r":
        s, c = _render(t[1])
        return frozenset(f"{x} &" for x in s), c
    if k == "a":
        s, c = _render(t[2])
        dim = "" if t[1] is None else str(t[1])
        return frozenset(f"{x} [{dim}]" for x in s), c
    if k == "f":
        rs, c = _render(t[1])
        ps = []
        for p in t[2]:
            s, pc = _render(p)
            ps.append(sorted(s))
            c = c and pc
        out = set()
        for combo in itertools.islice(itertools.product(*ps), _MAX_ALTS + 1):
            for r in rs:
                out.add(f"{r} ({', '.join(combo)})")
        return frozenset(out), c
    raise ValueError(k)


# --------------------------------------------------------------------------
# File facts (one walk per text)
# --------------------------------------------------------------------------


@dataclass
class _Ctx:
    scope: tuple  # qualified scope components
    kinds: tuple  # "ns" | "class" per component
    usings: tuple  # ((namespace text, declaring scope), ...)
    tparams: frozenset
    subst: tuple = ()  # ((template parameter, resolved tree), ...) while filling default arguments


@dataclass
class _FuncRec:
    name_toks: list
    param_toks: Optional[list]
    start: int
    open: int
    close: int
    ctx: _Ctx
    friend: bool
    fn_tparams: frozenset
    templated: bool
    is_const: bool = False
    c_linkage: bool = False


@dataclass
class _Facts:
    aliases: list = field(default_factory=list)  # [qname, target text, scope, usings, tparams]
    types: list = field(default_factory=list)
    templates: list = field(default_factory=list)
    namespaces: list = field(default_factory=list)
    bases: list = field(default_factory=list)  # [cls qname, base text, scope, usings, tparams]
    defaults: list = field(default_factory=list)  # [template qname, [[param, default text|None]...], scope, usings, tparams]

    def to_json(self) -> list:
        return [self.aliases, self.types, self.templates, self.namespaces, self.bases, self.defaults]

    @classmethod
    def from_json(cls, data: list) -> "_Facts":
        return cls(*data)


def _q(parts: Iterable[str]) -> str:
    return "::".join(parts)


def _ctx_json(ctx: _Ctx) -> tuple:
    return list(ctx.scope), [[u, list(s)] for u, s in ctx.usings], sorted(ctx.tparams)


class _Walker:
    def __init__(self, code: str, want_funcs: bool):
        self.code = code
        self.braces = _brace_map(code)
        self.facts = _Facts()
        self.funcs: list[_FuncRec] = []
        self.want_funcs = want_funcs
        self.file_usings: list = []
        self.extern_c: list[tuple[int, int]] = []

    def walk(self, lo: int, hi: int, ctx: _Ctx) -> None:
        code = self.code
        usings = list(ctx.usings)
        pos = lo
        stmt_start = lo
        pieces: list[str] = []
        struct_re = re.compile(r"[{};]")
        while True:
            m = struct_re.search(code, pos, hi)
            if not m:
                break
            i = m.start()
            ch = m.group()
            if ch == ";":
                cur = _Ctx(ctx.scope, ctx.kinds, tuple(usings), ctx.tparams)
                self.statement("".join(pieces) + code[stmt_start:i], cur, usings)
                pieces = []
                stmt_start = pos = i + 1
                continue
            if ch == "}":
                pieces = []
                stmt_start = pos = i + 1
                continue
            close = self.braces.get(i, hi)
            head = "".join(pieces) + code[stmt_start:i]
            cur = _Ctx(ctx.scope, ctx.kinds, tuple(usings), ctx.tparams)
            cont = self.block(head, stmt_start, i, close, cur, usings)
            if cont:
                pieces.append(head + " {} ")
            else:
                pieces = []
            stmt_start = pos = min(close + 1, hi)
            if close >= hi:
                break

    def block(self, head: str, start: int, open_: int, close: int, ctx: _Ctx, usings: list) -> bool:
        """Handle `head {body}`; True when the statement continues after the body."""
        toks = _strip_access(_tokens(head))
        detail: list = []
        toks, tparams, explicit = _strip_template_prefix(toks, detail)
        if not toks:
            return False
        typedef = False
        if toks[0] == "typedef":
            typedef = True
            toks = toks[1:]
        while toks and toks[0] in ("__declspec", "__attribute__", "alignas") and len(toks) > 1 and toks[1] == "(":
            j = _match_tok(toks, 1, "(", ")")
            toks = toks[j + 1:] if j > 0 else []
        if not toks:
            return False
        first = toks[0]
        if first == "namespace" or (first == "inline" and len(toks) > 1 and toks[1] == "namespace"):
            rest = toks[1:] if first == "namespace" else toks[2:]
            if not rest:
                # CodeWarrior mangles the anonymous namespace as `@unnamed@`; its
                # names stay visible in the enclosing scope (implicit using-directive).
                q = ctx.scope + ("@unnamed@",)
                self.walk(open_ + 1, close, _Ctx(q, ctx.kinds + ("ns",), ctx.usings, ctx.tparams))
                usings.append(("@unnamed@", ctx.scope))
                self.facts.namespaces.append(_q(q))
            elif len(rest) == 1 and _is_ident(rest[0]):
                q = ctx.scope + (rest[0],)
                self.facts.namespaces.append(_q(q))
                self.walk(open_ + 1, close, _Ctx(q, ctx.kinds + ("ns",), ctx.usings, ctx.tparams))
            return False
        if first == "extern" and len(toks) >= 2 and toks[1] == '"':
            self.extern_c.append((open_, close))
            self.walk(open_ + 1, close, ctx)
            return False
        if first in ("class", "struct", "union") and "(" not in self._outside_angles(toks):
            return self.class_head(toks, typedef, tparams, explicit, open_, close, ctx, detail)
        if first == "enum":
            self.enum_head(toks, typedef, close, ctx)
            return True
        if self._has_initializer(toks):
            return True
        if self.want_funcs:
            self.function(head, start, open_, close, ctx, tparams, explicit)
        return False

    @staticmethod
    def _outside_angles(toks: list[str]) -> list[str]:
        out, depth = [], 0
        for t in toks:
            if t == "<":
                depth += 1
            elif t == ">" and depth:
                depth -= 1
            elif depth == 0:
                out.append(t)
        return out

    @staticmethod
    def _has_initializer(toks: list[str]) -> bool:
        depth = 0
        for k, t in enumerate(toks):
            if t in "([":
                depth += 1
            elif t in ")]":
                depth -= 1
            elif t == "=" and depth == 0 and (k == 0 or toks[k - 1] != "operator"):
                return True
        return False

    def _typedef_name_after(self, close: int) -> Optional[str]:
        m = re.match(r"\s*([A-Za-z_]\w*)\s*[;,\[]", self.code[close + 1:close + 200])
        return m.group(1) if m else None

    def class_head(self, toks, typedef, tparams, explicit, open_, close, ctx, detail=()) -> bool:
        rest = toks[1:]
        while rest and rest[0] in ("__declspec", "__attribute__", "alignas") and len(rest) > 1 and rest[1] == "(":
            j = _match_tok(rest, 1, "(", ")")
            rest = rest[j + 1:] if j > 0 else []
        name_parts: list[str] = []
        args_present = False
        k = 0
        if k < len(rest) and rest[k] == "::":
            k += 1
        while k < len(rest) and _is_ident(rest[k]) and rest[k] not in _KEYWORDS:
            name_parts.append(rest[k])
            k += 1
            if k < len(rest) and rest[k] == "<":
                j = _match_angle(rest, k)
                if j < 0:
                    return False
                args_present = True
                k = j + 1
            if k < len(rest) and rest[k] == "::":
                k += 1
                continue
            break
        if k < len(rest) and rest[k] == "final":
            k += 1
        bases_toks: list[str] = []
        if k < len(rest):
            if rest[k] != ":":
                return False
            bases_toks = rest[k + 1:]
        anonymous = not name_parts
        if anonymous:
            nm = self._typedef_name_after(close) if typedef else None
            if not nm:
                return True  # anonymous member struct/union: nothing to index
            name_parts = [nm]
        q = ctx.scope + tuple(name_parts)
        qs = _q(q)
        self.facts.types.append(qs)
        is_template = tparams is not None and not explicit and not args_present
        if is_template:
            self.facts.templates.append(qs)
            if any(d[1] is not None for d in detail):
                self.facts.defaults.append([qs, [list(d) for d in detail], *_ctx_json(ctx)])
        inner_tparams = ctx.tparams | frozenset(tparams or ())
        for b in _split_top(bases_toks):
            b = [t for t in b if t not in ("public", "private", "protected", "virtual")]
            if b:
                self.facts.bases.append([qs, " ".join(b), *_ctx_json(_Ctx(ctx.scope, ctx.kinds, ctx.usings,
                                                                           inner_tparams))])
        self.walk(open_ + 1, close, _Ctx(q, ctx.kinds + ("class",) * len(name_parts), ctx.usings, inner_tparams))
        return True

    def enum_head(self, toks, typedef, close, ctx) -> None:
        rest = toks[1:]
        if rest and rest[0] in ("class", "struct"):
            rest = rest[1:]
        name = rest[0] if rest and _is_ident(rest[0]) and rest[0] not in _KEYWORDS else None
        if name is None and typedef:
            name = self._typedef_name_after(close)
        if name:
            self.facts.types.append(_q(ctx.scope + (name,)))

    def statement(self, stmt: str, ctx: _Ctx, usings: list) -> None:
        toks = _strip_access(_tokens(stmt))
        detail: list = []
        toks, tparams, explicit = _strip_template_prefix(toks, detail)
        if not toks:
            return
        first = toks[0]
        actx = _Ctx(ctx.scope, ctx.kinds, ctx.usings, ctx.tparams | frozenset(tparams or ()))
        if first == "typedef":
            self.typedef(toks[1:], actx)
        elif first == "using":
            if len(toks) >= 2 and toks[1] == "namespace":
                name = "".join(toks[2:])
                if re.fullmatch(r"(?:::)?[A-Za-z_]\w*(?:::[A-Za-z_]\w*)*", name):
                    usings.append((name, ctx.scope))
            elif "=" in toks:
                e = toks.index("=")
                if e == 2 and _is_ident(toks[1]):
                    self.add_alias(ctx.scope + (toks[1],), " ".join(toks[e + 1:]), actx)
            else:
                body = [t for t in toks[1:] if t != "typename"]
                if len(body) >= 3 and _is_ident(body[-1]) and body[-2] == "::":
                    self.add_alias(ctx.scope + (body[-1],), " ".join(body), actx)
        elif first == "namespace" and len(toks) >= 4 and toks[2] == "=":
            self.add_alias(ctx.scope + (toks[1],), " ".join(toks[3:]), actx)
        elif first in ("class", "struct", "union", "enum") and "{" not in toks:
            rest = toks[1:]
            if first == "enum" and rest and rest[0] in ("class", "struct"):
                rest = rest[1:]
            if rest and _is_ident(rest[0]) and rest[0] not in _KEYWORDS and (len(rest) == 1 or rest[1] == ":"):
                q = _q(ctx.scope + (rest[0],))
                self.facts.types.append(q)
                if tparams is not None and not explicit:
                    self.facts.templates.append(q)
                    if any(d[1] is not None for d in detail):
                        self.facts.defaults.append([q, [list(d) for d in detail], *_ctx_json(ctx)])

    def add_alias(self, q: tuple, target: str, ctx: _Ctx) -> None:
        self.facts.aliases.append([_q(q), target, *_ctx_json(ctx)])

    def typedef(self, toks: list[str], ctx: _Ctx) -> None:
        # Split the specifiers from the declarators: parse the specifiers once,
        # then each comma-separated declarator.
        anon_name: Optional[str] = None
        kw = None
        body_k = None
        for k, t in enumerate(toks):
            if t == "{":
                body_k = k
                break
            if t not in _ELAB and t not in _CV and t not in ("__declspec",):
                break
            if t in _ELAB:
                kw = t
        if body_k is not None and kw is not None and body_k > 0 and toks[body_k - 1] in _ELAB:
            j = _match_tok(toks, body_k, "{", "}")
            if j < 0:
                return
            rest = toks[j + 1:]
            names = [t for t in rest if _is_ident(t) and t not in _KEYWORDS]
            if not names:
                return
            anon_name = names[0]
            toks = toks[:body_k] + [anon_name] + toks[body_k:]
        p = _Parser(toks)
        try:
            spec_start = 0
            base = p.specs()
            spec_end = p.i
        except _ParseError:
            return
        spec_toks = [t for t in toks[spec_start:spec_end]]
        # drop a replaced class body from the spelling
        if "{" in spec_toks:
            j = _match_tok(spec_toks, spec_toks.index("{"), "{", "}")
            spec_toks = spec_toks[:spec_toks.index("{")] + (spec_toks[j + 1:] if j > 0 else [])
        decls = _split_top(toks[spec_end:])
        for d in decls:
            dp = _Parser(d)
            try:
                _t, name = dp.declarator(base, allow_name=True)
            except _ParseError:
                continue
            if not name or dp.i != len(d):
                continue
            if anon_name is not None and name == anon_name and d == [name]:
                continue  # `typedef struct {..} X;`: X is the class itself
            abstract = [t for t in d]
            abstract.remove(name)
            self.add_alias(ctx.scope + (name,), " ".join(spec_toks + abstract), ctx)

    def function(self, head: str, start: int, open_: int, close: int, ctx: _Ctx, tparams, explicit) -> None:
        m_access = _ACCESS_RE.match(head)
        off = m_access.end() if m_access else 0
        lead = len(head[off:]) - len(head[off:].lstrip())
        decl_start = start + off + lead
        toks = _strip_access(_tokens(head))
        toks, _tp, _ex = _strip_template_prefix(toks)
        friend = "friend" in toks[:4]
        # find the declarator: the first `(` preceded by a (qualified) name
        k = 0
        name_toks = None
        paren = -1
        while k < len(toks):
            if toks[k] == "(":
                if k > 0 and toks[k - 1] in _ATTRIBUTE_WORDS:
                    j = _match_tok(toks, k, "(", ")")
                    if j < 0:
                        return
                    k = j + 1
                    continue
                if k > 0 and toks[k - 1] == "operator":
                    k += 1
                    continue
                nt = self._name_before(toks, k)
                if nt is not None:
                    name_toks = nt
                    paren = k
                    break
                return
            k += 1
        if name_toks is None:
            return
        j = _match_tok(toks, paren, "(", ")")
        param_toks = toks[paren + 1:j] if j > 0 else None
        fn_tparams = frozenset(tparams or ()) if not explicit else frozenset()
        templated = bool(ctx.tparams) or (tparams is not None and not explicit)
        tail = toks[j + 1:j + 3] if j > 0 else []
        c_link = (toks[:2] == ["extern", '"'] and toks[2:3] == ['"']) or any(o < open_ <= c for o, c in self.extern_c)
        self.funcs.append(_FuncRec(name_toks, param_toks, decl_start, open_, close, ctx, friend, fn_tparams,
                                   templated, "const" in tail, c_link))

    @staticmethod
    def _back_angle(toks: list[str], j: int) -> int:
        """Index of the `<` matching the `>` at toks[j], -1 if none."""
        depth = 0
        for b in range(j, -1, -1):
            if toks[b] == ">":
                depth += 1
            elif toks[b] == "<":
                depth -= 1
                if depth == 0:
                    return b
        return -1

    @classmethod
    def _name_before(cls, toks: list[str], k: int) -> Optional[list[str]]:
        """Tokens of the (qualified) declarator name ending right before toks[k] == '('."""
        j = k - 1
        if j < 0:
            return None
        op_k = None
        for back in range(j, max(-1, j - 8), -1):
            if toks[back] == "operator":
                op_k = back
                break
            if toks[back] in (";", "{", "}", ",") or (toks[back] == "(" and back != j - 1):
                break
        if op_k is not None:
            out = toks[op_k:k]
            if out == ["operator"]:
                return None
            j = op_k - 1
        elif _is_ident(toks[j]) and toks[j] not in _KEYWORDS:
            out = [toks[j]]
            j -= 1
            if j >= 0 and toks[j] == "~":
                out.insert(0, "~")
                j -= 1
        elif toks[j] == ">":
            b = cls._back_angle(toks, j)
            if b <= 0 or not _is_ident(toks[b - 1]) or toks[b - 1] in _KEYWORDS:
                return None
            out = toks[b - 1:j + 1]
            j = b - 2
        else:
            return None
        while j >= 1 and toks[j] == "::":
            q_end = j
            j -= 1
            if toks[j] == ">":
                b = cls._back_angle(toks, j)
                if b <= 0:
                    return None
                j = b - 1
            if not _is_ident(toks[j]) or toks[j] in _KEYWORDS:
                return ["::"] + out
            out = toks[j:q_end + 1] + out
            j -= 1
        if j >= 0 and toks[j] == "::":
            out = ["::"] + out
        return out


def _file_facts(text: str, want_funcs: bool = False) -> tuple[_Facts, list[_FuncRec]]:
    code = strip_code(_blank_if0(text))
    w = _Walker(code, want_funcs)
    w.walk(0, len(code), _Ctx((), (), (), frozenset()))
    return w.facts, w.funcs


# --------------------------------------------------------------------------
# TypeIndex
# --------------------------------------------------------------------------


class _Layer:
    def __init__(self, files: dict[str, _Facts]):
        self.paths = set(files)
        self.aliases: dict[str, list] = {}
        self.types: dict[str, set] = {}
        self.templates: dict[str, set] = {}
        self.namespaces: dict[str, set] = {}
        self.bases: dict[str, list] = {}
        self.defaults: dict[str, list] = {}
        for path, f in files.items():
            for d in f.defaults:
                self.defaults.setdefault(d[0], []).append((path, d))
            for a in f.aliases:
                self.aliases.setdefault(a[0], []).append((path, a))
            for t in f.types:
                self.types.setdefault(t, set()).add(path)
            for t in f.templates:
                self.templates.setdefault(t, set()).add(path)
            for n in f.namespaces:
                self.namespaces.setdefault(n, set()).add(path)
            for b in f.bases:
                self.bases.setdefault(b[0], []).append((path, b))


_MEMO: dict[tuple, "TypeIndex"] = {}
_SOURCE_DIGEST: Optional[str] = None


def _source_digest() -> str:
    """Digest of this module's source: a parser change invalidates disk caches even without a version bump."""
    global _SOURCE_DIGEST
    if _SOURCE_DIGEST is None:
        try:
            _SOURCE_DIGEST = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()[:16]
        except OSError:
            _SOURCE_DIGEST = ""
    return _SOURCE_DIGEST


class TypeIndex:
    """Scoped type facts from header/source texts: typedef/using aliases
    (qualified alias name -> target text + the scope it was declared in),
    class/struct/union/enum names (qualified), namespaces."""

    _unknown_hit = False  # set by _lookup while _param resolves one parameter

    def __init__(self, files: dict[str, _Facts], parent: Optional["TypeIndex"] = None):
        self._files = files
        self._layers: list[_Layer] = (list(parent._layers) if parent else []) + [_Layer(files)]
        self._alias_memo: dict[str, Optional[tuple]] = {}
        self._active: set[str] = set()
        self._members: Optional[set] = None
        self._bases_memo: dict[tuple, Any] = {}

    # ---- construction ----------------------------------------------------

    @classmethod
    def from_texts(cls, texts: dict[str, str]) -> "TypeIndex":
        return cls({p: _file_facts(t)[0] for p, t in texts.items()})

    def with_texts(self, texts: dict[str, str]) -> "TypeIndex":
        return TypeIndex({p: _file_facts(t)[0] for p, t in texts.items()}, parent=self)

    def _with_facts(self, files: dict[str, _Facts]) -> "TypeIndex":
        return TypeIndex(files, parent=self)

    @classmethod
    def from_git(cls, repo, rev: str, roots=("include", "libs", "src"), cache_dir=None) -> "TypeIndex":
        repo_path = Path(repo).resolve()
        sha = subprocess.run(["git", "-C", str(repo_path), "rev-parse", "--verify", f"{rev}^{{commit}}"],
                             capture_output=True, text=True, check=True).stdout.strip()
        key = (str(repo_path), sha, tuple(roots), MODULE_VERSION)
        if key in _MEMO:
            return _MEMO[key]
        cache_root = Path(cache_dir or os.environ.get("ORCH_SIGNATURES_CACHE") or
                          Path(tempfile.gettempdir()) / "orch-signatures")
        digest = hashlib.sha256(json.dumps([*key, _source_digest()]).encode()).hexdigest()[:24]
        cache_file = cache_root / f"typeindex-{digest}.json"
        files: Optional[dict[str, _Facts]] = None
        try:
            data = json.loads(cache_file.read_text(encoding="utf-8"))
            if data.get("key") == list(key[:2]) + [list(roots), MODULE_VERSION]:
                files = {p: _Facts.from_json(f) for p, f in data["files"].items()}
        except (OSError, ValueError, KeyError, TypeError):
            files = None
        if files is None:
            files = {p: _file_facts(t)[0] for p, t in _git_texts(repo_path, sha, roots).items()}
            try:
                cache_root.mkdir(parents=True, exist_ok=True)
                tmp = cache_file.with_suffix(f".{os.getpid()}.tmp")
                tmp.write_text(json.dumps({"key": list(key[:2]) + [list(roots), MODULE_VERSION],
                                           "files": {p: f.to_json() for p, f in files.items()}}),
                               encoding="utf-8")
                os.replace(tmp, cache_file)
            except OSError:
                pass
        index = cls(files)
        _MEMO[key] = index
        return index

    # ---- lookups ---------------------------------------------------------

    def _visible(self, attr: str, name: str) -> list:
        """Facts for `name` from attr across layers, later layers replacing files."""
        out = []
        n = len(self._layers)
        for li, layer in enumerate(self._layers):
            entry = getattr(layer, attr).get(name)
            if not entry:
                continue
            later = [self._layers[k].paths for k in range(li + 1, n)]
            if isinstance(entry, set):
                if any(not any(p in lp for lp in later) for p in entry):
                    out.append(True)
            else:
                out.extend(f for p, f in entry if not any(p in lp for lp in later))
        return out

    def alias_facts(self, q: str) -> list:
        return self._visible("aliases", q)

    def is_type(self, q: str) -> bool:
        return bool(self._visible("types", q))

    def is_template(self, q: str) -> bool:
        return bool(self._visible("templates", q))

    def is_namespace(self, q: str) -> bool:
        return bool(self._visible("namespaces", q))

    def base_facts(self, q: str) -> list:
        return self._visible("bases", q)

    def default_facts(self, q: str) -> list:
        return self._visible("defaults", q)

    def _known(self, q: tuple, types_only: bool) -> bool:
        s = _q(q)
        if self.is_type(s):
            return True
        if types_only:
            return False
        if s not in self._active and self.alias_facts(s):
            return True
        return self.is_namespace(s)

    def _is_alias(self, q: tuple) -> bool:
        s = _q(q)
        return s not in self._active and not self.is_type(s) and bool(self.alias_facts(s))

    # ---- name resolution -------------------------------------------------

    def _using_namespaces(self, ctx: _Ctx) -> list[tuple]:
        out = []
        for text, scope in ctx.usings:
            glob = text.startswith("::")
            parts = tuple(p for p in text.split("::") if p)
            chosen = None
            if not glob:
                for k in range(len(scope), 0, -1):
                    cand = tuple(scope[:k]) + parts
                    if self.is_namespace(_q(cand)):
                        chosen = cand
                        break
            out.append(chosen or parts)
        seen, res = set(), []
        for u in out:
            if u not in seen:
                seen.add(u)
                res.append(u)
        return res

    def _member_names(self) -> set:
        """Every identifier declared as a member type or typedef of some class (any layer)."""
        if self._members is None:
            names: set = set()
            for layer in self._layers:
                for qs in itertools.chain(layer.aliases, layer.types):
                    owner, sep, last = qs.rpartition("::")
                    if sep and any(owner in lay.types for lay in self._layers):
                        names.add(last)
            self._members = names
        return self._members

    def _in_bases(self, cls_q: tuple, ident: str, types_only: bool, depth: int = 0):
        """'unknown', None (not found) or the qualified tuple found in a base.

        No class anywhere declaring a member `ident` proves no base supplies it,
        even when a base is dependent or unresolvable."""
        if ident not in self._member_names():
            return None
        key = (cls_q, ident, types_only)
        if key in self._bases_memo:
            return self._bases_memo[key]
        if depth > 32:
            return "unknown"
        self._bases_memo[key] = "unknown"  # cycle guard
        r = self._in_bases_uncached(cls_q, ident, types_only, depth)
        self._bases_memo[key] = r
        return r

    def _in_bases_uncached(self, cls_q: tuple, ident: str, types_only: bool, depth: int):
        for b in self.base_facts(_q(cls_q)):
            bctx = _Ctx(tuple(b[2]), (), tuple((u, tuple(s)) for u, s in b[3]), frozenset(b[4]))
            node = _parse_arg(_tokens(b[1]))
            if node[0] != "n":
                return "unknown"
            glob, parts, _elab = node[1], node[2], node[3]
            templ = any(a is not None for _i, a in parts)
            res = self._lookup([i for i, _a in parts], glob, bctx, False, strip_args=True)
            if res is None or not res[1] or len(res[0]) != 1:
                return "unknown"
            kind, path = res[0][0][0], res[0][0][1]
            if kind == "alias":
                path = self._alias_class(path)
                if path is None:
                    return "unknown"
            if self._known(path + (ident,), types_only):
                return "unknown" if templ else path + (ident,)
            r = self._in_bases(path, ident, types_only, depth + 1)
            if r is not None:
                return r
        return None

    def _first(self, ident: str, ctx: _Ctx, types_only: bool):
        """(candidates, found, certain) for an unqualified first component, None if unresolvable."""
        scope = ctx.scope
        for k in range(len(scope), 0, -1):
            prefix = tuple(scope[:k])
            q = prefix + (ident,)
            if self._known(q, types_only):
                return [q], True, True
            if self.is_type(_q(prefix)):
                b = self._in_bases(prefix, ident, types_only)
                if b == "unknown":
                    return None
                if b is not None:
                    return [b], True, True
        usings = self._using_namespaces(ctx)
        level = [(ident,)] + [u + (ident,) for u in usings]
        found = []
        for q in level:
            if q not in found and self._known(q, types_only):
                found.append(q)
        if found:
            return found, True, len(found) == 1
        cands = []
        for k in range(len(scope), -1, -1):
            q = tuple(scope[:k]) + (ident,)
            if q not in cands:
                cands.append(q)
        for q in level:
            if q not in cands:
                cands.append(q)
        return cands, False, True

    def _alias_class(self, q: tuple) -> Optional[tuple]:
        """The class an alias names (plain name target without template args), else None."""
        facts = self.alias_facts(_q(q))
        targets = {f[1] for f in facts}
        if len(targets) != 1:
            return None
        f = facts[0]
        node = _parse_arg(_tokens(f[1]))
        while node[0] == "cv":
            node = node[2]
        if node[0] != "n" or any(a is not None for _i, a in node[2]):
            return None
        fctx = _Ctx(tuple(f[2]), (), tuple((u, tuple(s)) for u, s in f[3]), frozenset(f[4]))
        s = _q(q)
        self._active.add(s)
        try:
            res = self._lookup([i for i, _a in node[2]], node[1], fctx, node[3])
        finally:
            self._active.discard(s)
        if res is None or len(res[0]) != 1:
            return None
        kind, path = res[0][0][0], res[0][0][1]
        if kind == "alias":
            if len(self._active) > _MAX_DEPTH:
                return None
            self._active.add(s)
            try:
                return self._alias_class(path)
            finally:
                self._active.discard(s)
        return path

    def _lookup(self, idents: list[str], glob: bool, ctx: _Ctx, elab: bool, strip_args: bool = False):
        """Resolve a written qualified name to qualified tuples.

        Returns None (unresolvable) or ([(kind, path, comps_map)], certain) where kind
        is 'q' (a type/namespace/unknown-name path) or 'alias' (path names an alias);
        comps_map[i] is the index in path of written part i (None when an alias
        or base substitution replaced it)."""
        if not idents:
            return None
        if not glob and idents[0] in ctx.tparams:
            return None
        last_types_only = elab
        if glob:
            q = (idents[0],)
            starts, found, certain = [q], self._known(q, elab and len(idents) == 1), True
        else:
            r = self._first(idents[0], ctx, elab and len(idents) == 1)
            if r is None:
                return None
            starts, found, certain = r
        if not found:
            # a name no class/struct/enum/typedef/namespace in the index declares: its
            # candidate qualifications are spellings, not identities (it may be a typedef
            # we cannot see), so a comparison against it is only safe when equal
            self._unknown_hit = True
        results = []
        for start in starts:
            path = start
            cmap: list = [len(path) - 1]
            ok = True
            for i in range(1, len(idents) + 1):
                if self._is_alias(path) and not (last_types_only and i == len(idents)):
                    if i == len(idents):
                        results.append(("alias", path, cmap))
                        ok = False
                        break
                    target = self._alias_class(path)
                    if target is None:
                        return None
                    path = target
                    cmap = [None] * len(cmap)
                if i == len(idents):
                    break
                p = idents[i]
                q = path + (p,)
                types_only = last_types_only and i == len(idents) - 1
                if self._known(q, types_only) or not found:
                    path = q
                    cmap.append(len(path) - 1)
                else:
                    b = self._in_bases(path, p, types_only) if self.is_type(_q(path)) else None
                    if b == "unknown":
                        return None
                    if b is not None:
                        path = b
                        cmap = [None] * len(cmap) + [len(path) - 1]
                    else:
                        path = q
                        cmap.append(len(path) - 1)
            if ok:
                results.append(("q", path, cmap))
        return results, certain

    def _resolve_name(self, node: tuple, ctx: _Ctx) -> Optional[tuple]:
        glob, parts, elab = node[1], node[2], node[3]
        idents = [i for i, _a in parts]
        if ctx.subst and not glob:
            sub = dict(ctx.subst)
            if idents[0] in sub:
                return sub[idents[0]] if len(parts) == 1 and parts[0][1] is None else None
        res = self._lookup(idents, glob, ctx, elab)
        if res is None:
            return None
        results, certain = res
        alts: list[tuple] = []
        for kind, path, cmap in results:
            written_args = [a for _i, a in parts]
            if kind == "alias":
                if any(a is not None for a in written_args[:-1]) and any(c is None for c in cmap):
                    return None
                if written_args[-1] is not None:
                    return None  # alias template
                t = self._resolve_alias(_q(path))
                if t is None:
                    return None
                alts.append(t)
                continue
            comp_args: list = [None] * len(path)
            for wi, a in enumerate(written_args):
                if a is None:
                    continue
                if wi >= len(cmap) or cmap[wi] is None:
                    return None
                comp_args[cmap[wi]] = a
            rendered_parts: list[list[str]] = []
            for ci, comp in enumerate(path):
                a = comp_args[ci]
                if a is None:
                    if self.is_template(_q(path[:ci + 1])):
                        return None  # injected class name of a template: dependent
                    rendered_parts.append([comp])
                    continue
                trees = []
                for arg in a:
                    rt = self._resolve(arg, ctx)
                    if rt is None:
                        return None
                    trees.append(rt)
                trees = self._fill_defaults(_q(path[:ci + 1]), trees)
                if trees is None:
                    return None
                arg_strs = []
                for rt in trees:
                    s, c = _render(rt)
                    if not c and len(s) > 1:
                        certain = False
                    arg_strs.append(sorted(s))
                combos = list(itertools.islice(itertools.product(*arg_strs), _MAX_ALTS + 1))
                if len(combos) > _MAX_ALTS:
                    return None
                rendered_parts.append([f"{comp}<{', '.join(c)}>" for c in combos])
            names = ["::".join(c) for c in itertools.islice(itertools.product(*rendered_parts), _MAX_ALTS + 1)]
            if len(names) > _MAX_ALTS:
                return None
            alts.extend(("N", n) for n in names)
        if not alts:
            return None
        if len(alts) == 1:
            return alts[0]
        return ("alt", tuple(alts), certain)

    def _fill_defaults(self, template: str, trees: list) -> Optional[list]:
        """Append the template's default arguments the mangler spells out (None: unresolvable)."""
        facts = self.default_facts(template)
        if not facts:
            return trees
        params: list = []
        for f in facts:
            for k, (name, default) in enumerate(f[1]):
                if k >= len(params):
                    params.append([name, None, None])
                if name and not params[k][0]:
                    params[k][0] = name
                if default is not None and params[k][1] is None:
                    params[k][1] = default
                    params[k][2] = f
        if len(trees) >= len(params):
            return trees
        out = list(trees)
        for k in range(len(trees), len(params)):
            name, default, f = params[k]
            if default is None or f is None:
                return None
            subst = tuple((params[i][0], out[i]) for i in range(len(out)) if params[i][0])
            dctx = _Ctx(tuple(f[2]), (), tuple((u, tuple(sc)) for u, sc in f[3]), frozenset(f[4]), subst)
            rt = self._resolve(_parse_arg(_tokens(default)), dctx)
            if rt is None:
                return None
            out.append(rt)
        return out

    def _resolve_alias(self, qs: str) -> Optional[tuple]:
        if qs in self._alias_memo:
            return self._alias_memo[qs]
        if len(self._active) > _MAX_DEPTH:
            return None
        facts = self.alias_facts(qs)
        self._active.add(qs)
        try:
            trees = []
            seen = set()
            for f in facts:
                fctx = _Ctx(tuple(f[2]), (), tuple((u, tuple(s)) for u, s in f[3]), frozenset(f[4]))
                key = (f[1], tuple(f[2]), tuple(map(tuple, f[3])) if f[3] else (), tuple(f[4]))
                if key in seen:
                    continue
                seen.add(key)
                node = _parse_arg(_tokens(f[1]))
                t = self._resolve(node, fctx)
                if t is None:
                    trees = None
                    break
                trees.append(t)
        finally:
            self._active.discard(qs)
        result: Optional[tuple]
        if not trees:
            result = None
        else:
            uniq = []
            rendered = set()
            for t in trees:
                r = _render(t)
                if (r[0], r[1]) not in rendered:
                    rendered.add((r[0], r[1]))
                    uniq.append(t)
            result = uniq[0] if len(uniq) == 1 else ("alt", tuple(uniq), False)
        self._alias_memo[qs] = result
        return result

    def _resolve(self, node: tuple, ctx: _Ctx) -> Optional[tuple]:
        k = node[0]
        if k in ("b", "lit", "e", "N"):
            return node
        if k == "u":
            return None
        if k == "n":
            return self._resolve_name(node, ctx)
        if k == "cv":
            inner = self._resolve(node[2], ctx)
            return None if inner is None else ("cv", node[1], inner)
        if k in ("p", "r"):
            inner = self._resolve(node[1], ctx)
            return None if inner is None else (k, inner)
        if k == "a":
            if node[1] == -1:
                return None
            inner = self._resolve(node[2], ctx)
            return None if inner is None else ("a", node[1], inner)
        if k == "f":
            ret = self._resolve(node[1], ctx)
            if ret is None:
                return None
            ps = []
            for p in node[2]:
                rp = self._resolve(p, ctx)
                if rp is None:
                    return None
                ps.append(_param_norm(rp))
            if ps == [("b", "void")]:
                ps = []
            return ("f", ret, tuple(ps))
        return None

    def _param(self, node: tuple, ctx: _Ctx):
        """Unresolved parameter tree -> (alternatives, certain); (None, False) if unresolvable.

        `certain` is True, False (alternatives from conflicting typedefs) or the
        string "unknown" when a name in the type is not declared anywhere in the
        index: then only an exactly equal spelling is a match, anything else is
        undecidable (it may be a typedef of the other side's type)."""
        if node[0] == "a" and node[1] == -1:
            node = ("p", node[2])  # outermost array of unknown bound decays anyway
        self._unknown_hit = False
        rt = self._resolve(node, ctx)
        unknown = self._unknown_hit
        self._unknown_hit = False
        if rt is None:
            return None, False
        s, c = _render(_param_norm(rt))
        if len(s) > _MAX_ALTS:
            return None, False
        return tuple(sorted(s)), ("unknown" if unknown else c)


_EMPTY_INDEX: Optional[TypeIndex] = None


def _empty_index() -> TypeIndex:
    global _EMPTY_INDEX
    if _EMPTY_INDEX is None:
        _EMPTY_INDEX = TypeIndex({})
    return _EMPTY_INDEX


def _git_texts(repo: Path, sha: str, roots) -> dict[str, str]:
    ls = subprocess.run(["git", "-C", str(repo), "ls-tree", "-r", "-z", sha, "--", *roots],
                        capture_output=True, check=True).stdout.decode("utf-8", "replace")
    wanted: list[tuple[str, str]] = []
    for entry in ls.split("\0"):
        if not entry:
            continue
        meta, _tab, path = entry.partition("\t")
        parts = meta.split()
        if len(parts) < 3 or parts[1] != "blob":
            continue
        base = path.rsplit("/", 1)[-1]
        if path.endswith(_INDEX_SUFFIXES) or ("." not in base and "/include/" in f"/{path}"):
            wanted.append((path, parts[2]))
    if not wanted:
        return {}
    proc = subprocess.run(["git", "-C", str(repo), "cat-file", "--batch"],
                          input="".join(f"{b}\n" for _p, b in wanted).encode(), capture_output=True, check=True)
    out = proc.stdout
    texts: dict[str, str] = {}
    pos = 0
    for path, _blob in wanted:
        nl = out.index(b"\n", pos)
        header = out[pos:nl].split()
        pos = nl + 1
        if len(header) < 3 or header[1] == b"missing":
            continue
        size = int(header[2])
        texts[path] = out[pos:pos + size].decode("utf-8", "replace")
        pos += size + 1
    return texts


# --------------------------------------------------------------------------
# Source side
# --------------------------------------------------------------------------


@dataclass
class SourceSignature:
    """One function definition with a body (offsets into the given text)."""
    qualified: str
    params: Optional[tuple]  # per parameter: tuple of alternative canonical spellings, or None if unresolvable
    start: int
    open: int
    close: int
    line: int
    templated: bool = False  # a (member of a) template: identity depends on the instantiation
    sure: Optional[tuple] = None  # per parameter: True; False when its alternatives come from conflicting
    # typedefs; "unknown" when a name in it is declared nowhere in the index (only an equal spelling matches)
    variants: tuple = ()  # every (qualified, params, sure) owner resolution; the first is (qualified, params, sure)
    is_const: Optional[bool] = None  # const member function (None: unknown)
    c_linkage: bool = False  # inside `extern "C"`: the symbol is the bare name (a .c file may be compiled as C++)


_OPERATOR_SPACE = {"new", "delete"}


def _func_name(name_toks: list[str], index: TypeIndex, ctx: _Ctx) -> Optional[tuple[list, str]]:
    """Split declarator name tokens into (owner parts tokens list, canonical member name)."""
    # Split at top-level `::`
    groups: list[list[str]] = [[]]
    depth = 0
    for t in name_toks:
        if t == "<":
            depth += 1
        elif t == ">":
            depth -= 1
        if t == "::" and depth == 0:
            groups.append([])
            continue
        groups[-1].append(t)
    glob = not groups[0]
    if glob:
        groups = groups[1:]
    member = groups[-1]
    owner = groups[:-1]
    if not member:
        return None
    if member[0] == "operator":
        rest = member[1:]
        if rest and rest[0] in _OPERATOR_SPACE:
            name = "operator " + "".join(rest)
        elif rest and (_is_ident(rest[0]) or rest[0] == "::"):
            t = _parse_arg(rest)
            rt = index._resolve(t, ctx) if t[0] != "u" else None
            if rt is None:
                return None
            s, _c = _render(rt)
            if len(s) != 1:
                return None
            name = "operator " + next(iter(s))
        else:
            name = "operator" + "".join(rest)
    else:
        name = "".join(member)
    return [glob] + owner, name


def _render_member(name: str, index: TypeIndex, ctx: _Ctx) -> Optional[str]:
    """`f<args>` with canonical template arguments."""
    if "<" not in name or name.startswith("operator"):
        return name
    toks = _tokens(name)
    node = _parse_arg(toks)
    if node[0] != "n" or len(node[2]) != 1:
        return None
    ident, args = node[2][0]
    out = []
    for a in args or ():
        rt = index._resolve(a, ctx)
        if rt is None:
            return None
        s, _c = _render(rt)
        if len(s) != 1:
            return None
        out.append(next(iter(s)))
    return f"{ident}<{', '.join(out)}>"


def _strip_args(name: str) -> str:
    out, depth = [], 0
    for ch in name:
        if ch == "<":
            depth += 1
        elif ch == ">" and depth:
            depth -= 1
        elif depth == 0:
            out.append(ch)
    return re.sub(r"operator$", "operator", "".join(out))


def _signature(rec: _FuncRec, index: TypeIndex, text: str) -> Optional[SourceSignature]:
    ctx = rec.ctx
    split = _func_name(rec.name_toks, index, ctx)
    if split is None:
        return None
    owner_info, member = split
    glob, owner = owner_info[0], owner_info[1:]
    params_nodes = _parse_param_list(rec.param_toks) if rec.param_toks is not None else None
    tparams = ctx.tparams | rec.fn_tparams
    templated = rec.templated
    variants: list[tuple] = []  # (qualified, lookup ctx, owner certain)
    if rec.friend and not owner:
        ns_len = 0
        for kind in ctx.kinds:
            if kind != "ns":
                break
            ns_len += 1
        lookup = _Ctx(ctx.scope, ctx.kinds, ctx.usings, tparams)
        m = _render_member(member, index, lookup)
        variants.append((_q(ctx.scope[:ns_len] + ((m or member),)), lookup, True, m is None))
    elif not owner:
        lookup = _Ctx(ctx.scope, ctx.kinds, ctx.usings, tparams)
        m = _render_member(member, index, lookup)
        variants.append((_q(ctx.scope + ((m or member),)), lookup, True, m is None))
    else:
        # owner: a written path `A<..>::B` resolved like a type name
        owner_toks: list[str] = []
        if glob:
            owner_toks.append("::")
        for gi, g in enumerate(owner):
            if gi:
                owner_toks.append("::")
            owner_toks.extend(g)
        node = _parse_arg(owner_toks)
        written_idents = None
        if node[0] == "n":
            written_idents = [i for i, _a in node[2]]
        has_targs = node[0] == "n" and any(a is not None for _i, a in node[2])
        lctx = _Ctx(ctx.scope, ctx.kinds, ctx.usings, tparams)
        res = index._lookup(written_idents, node[1], lctx, False) if written_idents else None
        if res is None:
            # unresolvable owner (e.g. template parameter): keep the written spelling
            qual = _q(ctx.scope + tuple("".join(g) for g in owner) + (member,))
            variants.append((qual, lctx, True, True))
        else:
            results, certain = res
            for kind, path, _cmap in results:
                if kind == "alias":
                    target = index._alias_class(path)
                    if target is None:
                        continue
                    path = target
                owner_name = None
                if has_targs:
                    rn = index._resolve_name(node, lctx)
                    if rn is not None and rn[0] == "N":
                        owner_name = rn[1]
                if owner_name is None:
                    owner_name = _q(path) if not has_targs else _q(path[:len(path) - len(owner)] + tuple(
                        "".join(g) for g in owner))
                    dependent = has_targs
                else:
                    dependent = False
                cls_scope = tuple(path)
                kinds = tuple("ns" if index.is_namespace(_q(cls_scope[:k + 1])) else "class"
                              for k in range(len(cls_scope)))
                fctx = _Ctx(cls_scope, kinds, ctx.usings, tparams)
                m = _render_member(member, index, fctx)
                variants.append((f"{owner_name}::{m or member}", fctx, certain, dependent or m is None))
        if not variants:
            qual = _q(ctx.scope + tuple("".join(g) for g in owner) + (member,))
            variants.append((qual, lctx, True, True))
    out_variants = []
    for qual, vctx, _cert, dependent in variants:
        if params_nodes is None:
            out_variants.append((qual, None, None))
            templated = templated or dependent
            continue
        alts, sure = [], []
        for pn in params_nodes:
            a, c = index._param(pn, vctx)
            alts.append(a)
            sure.append(c)
        out_variants.append((qual, tuple(alts), tuple(sure)))
        templated = templated or dependent
    if not out_variants:
        return None
    qual, params, sure = out_variants[0]
    return SourceSignature(qualified=qual, params=params, start=rec.start, open=rec.open, close=rec.close,
                           line=text.count("\n", 0, rec.start) + 1, templated=templated, sure=sure,
                           variants=tuple(out_variants), is_const=rec.is_const, c_linkage=rec.c_linkage)


def source_signatures(text: str, index: Optional[TypeIndex] = None, path: str = "") -> list[SourceSignature]:
    """Every function definition with a body in `text` (out-of-class and in-class)."""
    if not text:
        return []
    facts, funcs = _file_facts(text, want_funcs=True)
    base = index if index is not None else _empty_index()
    idx = base._with_facts({path or "<source>": facts})
    out = []
    for rec in funcs:
        sig = _signature(rec, idx, text)
        if sig is not None:
            out.append(sig)
    return out


def canonical_type(text: str, scope=(), usings=(), index: Optional[TypeIndex] = None) -> Optional[tuple]:
    """Alternatives (canonical spellings) for one parameter type; None if unresolvable.

    `scope` is the lookup scope (`"A::B"` or `("A", "B")`), `usings` the
    namespaces of `using namespace` directives in effect (qualified names)."""
    if isinstance(scope, str):
        scope = tuple(p for p in scope.split("::") if p)
    idx = index if index is not None else _empty_index()
    ctx = _Ctx(tuple(scope), (), tuple((u, ()) for u in usings), frozenset())
    node = _parse_param(_tokens(text))
    if node is None:
        return None
    alts, _c = idx._param(node, ctx)
    return alts


# --------------------------------------------------------------------------
# Mangled side
# --------------------------------------------------------------------------

_DEMANGLER: Any = None


def _demangler() -> Any:
    global _DEMANGLER
    if _DEMANGLER is None:
        if not _DEMANGLER_PATH.is_file():
            _DEMANGLER = False
            return _DEMANGLER
        # Load the file directly: the m2c package __init__ (and its types.py)
        # would shadow stdlib modules when added to sys.path.
        spec = importlib.util.spec_from_file_location("_signatures_cw_demangle", _DEMANGLER_PATH)
        module = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
        sys.modules["_signatures_cw_demangle"] = module
        try:
            spec.loader.exec_module(module)  # type: ignore[union-attr]
            _DEMANGLER = module
        except Exception:  # pragma: no cover - only if the vendored file breaks
            _DEMANGLER = False
    return _DEMANGLER


_MANGLED_BUILTIN = {"VOID": "void", "BOOL": "bool", "CHAR": "char", "SHORT": "short", "INT": "int", "LONG": "long",
                    "LONG_LONG": "long long", "WIDE_CHAR": "wchar_t", "FLOAT": "float", "DOUBLE": "double",
                    "LONG_DOUBLE": "long double"}


def _cxx_name(n: Any) -> str:
    if n.template_params is None:
        return n.name
    return f"{n.name}<{', '.join(_cxx_type_str(p) for p in n.template_params)}>"


def _cxx_type_str(ct: Any) -> str:
    s, _c = _render(_cxx_tree(ct))
    if len(s) != 1:
        raise ValueError("ambiguous")
    return next(iter(s))


def _cxx_tree(ct: Any) -> tuple:
    terms = ct.terms
    if not terms:
        raise ValueError("empty type")
    last = terms[-1]
    kind = last.kind.name
    if kind in _MANGLED_BUILTIN:
        t: tuple = ("b", _MANGLED_BUILTIN[kind])
    elif kind == "ELLIPSIS":
        t = ("e",)
    elif kind == "QUALIFIED":
        t = ("N", "::".join(_cxx_name(n) for n in last.qualified_name))
    elif kind == "FUNCTION":
        ret = _cxx_tree(last.function_return) if last.function_return is not None else ("b", "void")
        ps = [_param_norm(_cxx_tree(p)) for p in last.function_params]
        if ps == [("b", "void")]:
            ps = []
        t = ("f", ret, tuple(ps))
    else:
        raise ValueError(kind)
    for term in reversed(terms[:-1]):
        k = term.kind.name
        if k == "CONST":
            t = ("cv", frozenset(["const"]), t)
        elif k == "POINTER":
            t = ("p", t)
        elif k == "REFERENCE":
            t = ("r", t)
        elif k == "ARRAY":
            t = ("a", term.array_dim, t)
        elif k in ("UNSIGNED", "SIGNED"):
            if t[0] != "b":
                raise ValueError("sign")
            base = t[1]
            if k == "UNSIGNED":
                t = ("b", "unsigned " + base if base in ("char", "short", "int", "long", "long long") else base)
            else:
                t = ("b", "signed char" if base == "char" else base)
        else:
            raise ValueError(k)
    return t


def _demangle_full(mangled: str) -> Optional[tuple[str, tuple, bool]]:
    module = _demangler()
    if not module:
        return None
    try:
        sym = module.parse(mangled)
        names = list(sym.name.qualified_name)
        terms = sym.type.terms
        const = False
        k = 0
        while k < len(terms) and terms[k].kind.name == "CONST":
            const = True
            k += 1
        if k != len(terms) - 1 or terms[k].kind.name != "FUNCTION":
            return None
        fn = terms[k]
        last = names[-1].name
        ops = module.CxxTerm.OPS
        if last == "__ct" and len(names) >= 2:
            member = names[-2].name
        elif last == "__dt" and len(names) >= 2:
            member = "~" + names[-2].name
        elif last in ops:
            op = ops[last]
            member = "operator " + op.strip() if op.startswith(" ") else "operator" + op
        elif last.startswith("__op") and names[-1].template_params is None:
            with module.as_stringio(last[4:]) as buf:
                ct = module.CxxType.parse(buf)
            member = "operator " + _cxx_type_str(ct)
        else:
            member = _cxx_name(names[-1])
        qual = "::".join([_cxx_name(n) for n in names[:-1]] + [member])
        params = []
        for p in fn.function_params:
            s, _c = _render(_param_norm(_cxx_tree(p)))
            if len(s) != 1:
                return None
            params.append(next(iter(s)))
        if params == ["void"]:
            params = []
        return qual, tuple(params), const
    except Exception:
        return None


def demangled_signature(mangled: str) -> Optional[tuple[str, tuple]]:
    """(qualified name, canonical parameter types) of a CodeWarrior symbol; None if not demangleable."""
    r = _demangle_full(mangled)
    return None if r is None else (r[0], r[1])


def demangled_is_const(mangled: str) -> Optional[bool]:
    """True for a const member function symbol; None if not demangleable."""
    r = _demangle_full(mangled)
    return None if r is None else r[2]


# --------------------------------------------------------------------------
# Matching
# --------------------------------------------------------------------------


def _combine(results: Iterable[Optional[bool]]) -> Optional[bool]:
    res = list(results)
    if any(r is False for r in res):
        return False
    if all(r is True for r in res):
        return True
    return None


def _plain_symbol(mangled: str) -> bool:
    """An unmangled (C linkage) symbol: an identifier with no `__<type>` mangling suffix."""
    return bool(re.fullmatch(r"[A-Za-z_]\w*", mangled)) and not re.search(r"[^_]__[CFQ\d]", mangled)


def matches(source: SourceSignature, mangled: str) -> Optional[bool]:
    """True: same function; False: provably different; None: undecidable."""
    dem = _demangle_full(mangled)
    if source.c_linkage and "::" not in source.qualified:
        # C linkage: the symbol is the bare name, never a mangled one
        return mangled == source.qualified
    if dem is None:
        if _plain_symbol(mangled) and mangled != source.qualified:
            return False  # an unmangled (C) symbol of another name
        return None
    dq, dparams, dconst = dem
    if source.is_const is not None and dconst != source.is_const and "::" in source.qualified:
        return False
    variants = source.variants or ((source.qualified, source.params, source.sure),)
    outcomes = []
    for qual, params, sure in variants:
        if source.templated:
            name_ok: Optional[bool] = None if _strip_args(qual) == _strip_args(dq) else False
        else:
            name_ok = qual == dq
        if name_ok is False:
            outcomes.append(False)
            continue
        if params is None:
            outcomes.append(None)
            continue
        if len(params) != len(dparams):
            outcomes.append(False)
            continue
        per = [name_ok]
        for k, (alts, dp) in enumerate(zip(params, dparams)):
            how = True if sure is None else sure[k]
            if alts is None:
                per.append(None)
            elif dp in alts:
                # equal spelling: identical (an undeclared name spelled like the mangled class is that class)
                per.append(True if how in (True, "unknown") else None)
            else:
                # different spelling: different type, unless a name could not be resolved (maybe a typedef)
                per.append(None if how == "unknown" else False)
        outcomes.append(_combine(per))
    if any(o is True for o in outcomes):
        return True
    if any(o is None for o in outcomes):
        return None
    return False


__all__ = [
    "MODULE_VERSION", "TypeIndex", "SourceSignature", "source_signatures", "demangled_signature",
    "demangled_is_const", "matches", "canonical_type", "strip_code",
]
