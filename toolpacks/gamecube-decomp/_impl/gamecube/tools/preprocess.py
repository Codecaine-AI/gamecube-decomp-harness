#!/usr/bin/env python3
"""Preprocessor branch evaluation for source texts (stdlib only, no sibling imports).

`active_text(text, defines, unknown)` has two modes:
- reference mode (`unknown="active"`, the default): for everything that looks
  for things to FLAG. No condition is evaluated: every branch, `#if 0`
  included, is scanned as possibly active (the text is returned unchanged).
- positive-evidence mode (`unknown="inactive"`): for readiness definitions,
  construction precedent and base definitions that exempt an UNUSED body.
  Branches that are not certainly active are blanked: every character of
  such a line becomes a space, so lengths, offsets and lines are preserved.
Shared by readiness.py, steering_check.py, edit_scope.py and the sms_fidelity lints.

Evidence-mode evaluation fails closed: whatever is not certain is undecidable.
- `#if` expressions: object-like macros are expanded at the token level first
  (recursively, never re-expanding a macro inside its own expansion), then a
  C integer-expression evaluator with C precedence runs over the result.
  Function-like macros, any literal suffix, any literal >= 2^31 (unsigned or
  long semantics, e.g. `0xffffffffffffffff`), any intermediate or final value
  outside signed 32-bit, casts, `sizeof`, character literals and anything else
  unsupported are undecidable; an identifier left after expansion is 0 only
  when known to be #undef'd.
- `#define`/`#undef` count only on certainly active lines; on an undecidable
  line the macro becomes UNKNOWN, and every condition that depends on it
  (`defined` included) is undecidable.
- Once a branch of an #if group is undecidable, every later branch of that
  group is undecidable too, except one whose own condition is false.
"""

from __future__ import annotations

import re
from typing import Optional

_DIRECTIVE = re.compile(r"^\s*#\s*(if|ifdef|ifndef|elif|else|endif|define|undef)\b(.*)$", re.S)
_PP_TOKEN = re.compile(r"\s*(?:(?P<num>(?:0[xX][0-9a-fA-F]+|\d+)[uUlL]*)|(?P<id>[A-Za-z_]\w*)"
                       r"|(?P<op>\|\||&&|==|!=|<=|>=|<<|>>|[-+*/%()<>!~&|^?:]))")
_LEVELS = [("||",), ("&&",), ("|",), ("^",), ("&",), ("==", "!="), ("<", "<=", ">", ">="), ("<<", ">>"),
           ("+", "-"), ("*", "/", "%")]
_MAX_DEPTH = 32
UNKNOWN = object()  # a macro whose definition state is uncertain
_INT_MAX, _INT_MIN = (1 << 31) - 1, -(1 << 31)


class _Undecidable(Exception):
    pass


def _tokenize(expr: str) -> list[tuple[str, str]]:
    toks, pos = [], 0
    expr = re.sub(r"/\*.*?\*/|//.*$", " ", expr).rstrip()
    while pos < len(expr):
        m = _PP_TOKEN.match(expr, pos)
        if not m or m.end() == pos:
            if expr[pos:].strip():
                raise _Undecidable(f"unsupported token at {expr[pos:pos + 8]!r}")
            break
        pos = m.end()
        toks.append((m.lastgroup, m.group(m.lastgroup)))
    return toks


def _expand(toks: list[tuple[str, str]], macros: dict, hide: frozenset = frozenset(), depth: int = 0
            ) -> list[tuple[str, str]]:
    """Token-level expansion of object-like macros (the operand of `defined` is not expanded;
    a macro is not re-expanded inside its own expansion)."""
    if depth > _MAX_DEPTH:
        raise _Undecidable("macro expansion too deep")
    out: list[tuple[str, str]] = []
    i = 0
    while i < len(toks):
        kind, val = toks[i]
        if kind == "id" and val == "defined":
            j = i + 1
            if j < len(toks) and toks[j][1] == "(":
                if j + 2 >= len(toks) or toks[j + 1][0] != "id" or toks[j + 2][1] != ")":
                    raise _Undecidable("malformed defined()")
                out += toks[i:j + 3]
                i = j + 3
            else:
                if j >= len(toks) or toks[j][0] != "id":
                    raise _Undecidable("malformed defined")
                out += toks[i:j + 1]
                i = j + 1
            continue
        if kind == "id" and val in macros and val not in hide:
            repl = macros[val]
            if repl is UNKNOWN:
                raise _Undecidable(f"{val}: definition uncertain")
            if repl is None:
                raise _Undecidable(f"{val}: function-like macro")
            out += _expand(_tokenize(repl), macros, hide | {val}, depth + 1)
            i += 1
            continue
        out.append(toks[i])
        i += 1
    return out


class _Eval:
    """C integer-expression evaluator (precedence climbing) over expanded tokens.
    Values are ints or None (undecidable)."""

    def __init__(self, toks: list[tuple[str, str]], macros: dict, undefined: set):
        self.toks, self.i = toks, 0
        self.macros, self.undefined = macros, undefined

    def peek(self) -> Optional[str]:
        return self.toks[self.i][1] if self.i < len(self.toks) else None

    def take(self) -> tuple[str, str]:
        if self.i >= len(self.toks):
            raise _Undecidable("unexpected end")
        t = self.toks[self.i]
        self.i += 1
        return t

    def expect(self, op: str) -> None:
        if self.take()[1] != op:
            raise _Undecidable(f"expected {op}")

    def ternary(self) -> Optional[int]:
        cond = self.binary(0)
        if self.peek() != "?":
            return cond
        self.take()
        a = self.ternary()
        self.expect(":")
        b = self.ternary()
        if cond is None:
            return a if a is not None and a == b else None
        return a if cond else b

    def binary(self, level: int) -> Optional[int]:
        if level >= len(_LEVELS):
            return self.unary()
        left = self.binary(level + 1)
        while self.peek() in _LEVELS[level]:
            op = self.take()[1]
            right = self.binary(level + 1)
            left = _apply(op, left, right)
        return left

    def unary(self) -> Optional[int]:
        kind, val = self.take()
        if kind == "op" and val in ("!", "~", "-", "+"):
            v = self.unary()
            if v is None:
                return None
            r = {"!": lambda: int(not v), "~": lambda: ~v, "-": lambda: -v, "+": lambda: v}[val]()
            return r if _INT_MIN <= r <= _INT_MAX else None
        if kind == "op" and val == "(":
            if self.peek() is not None and self.toks[self.i][0] == "id" and self.i + 1 < len(self.toks) \
                    and self.toks[self.i + 1][1] == ")":
                raise _Undecidable("cast")  # `(type)expr`
            v = self.ternary()
            self.expect(")")
            return v
        if kind == "num":
            digits = val.rstrip("uUlL")
            if digits != val:
                raise _Undecidable("literal suffix")  # unsigned/long semantics are not modelled
            v = int(digits, 8) if re.fullmatch(r"0\d+", digits) else int(digits, 0)
            if v > _INT_MAX:
                raise _Undecidable("literal outside signed 32-bit")  # may have unsigned semantics
            return v
        if kind == "id":
            if val == "defined":
                paren = self.peek() == "("
                if paren:
                    self.take()
                k, name = self.take()
                if paren:
                    self.expect(")")
                state = self.macros.get(name, None) if name in self.macros else None
                if name in self.macros and state is UNKNOWN:
                    return None
                if name in self.macros:
                    return 1
                return 0 if name in self.undefined else None
            if val == "sizeof":
                raise _Undecidable("sizeof")
            if val in ("true", "false"):
                return int(val == "true")
            # an identifier left after expansion: C reads it as 0, but it may be a macro from a
            # header we did not read (or a self-referential one); only a known #undef is 0
            return 0 if val in self.undefined else None
        raise _Undecidable(f"unexpected {val!r}")


def _apply(op: str, a: Optional[int], b: Optional[int]) -> Optional[int]:
    if op == "&&":
        if a == 0 or b == 0:
            return 0
        return None if a is None or b is None else 1
    if op == "||":
        if (a is not None and a != 0) or (b is not None and b != 0):
            return 1
        return None if a is None or b is None else 0
    if a is None or b is None:
        return None
    if op in ("/", "%"):
        if b == 0:
            return None
        q = abs(a) // abs(b) * (1 if (a >= 0) == (b >= 0) else -1)  # C truncates toward zero
        return q if op == "/" else a - q * b
    if op in ("<<", ">>") and (b < 0 or b > 31):
        return None
    ops = {"|": lambda: a | b, "^": lambda: a ^ b, "&": lambda: a & b, "==": lambda: int(a == b),
           "!=": lambda: int(a != b), "<": lambda: int(a < b), "<=": lambda: int(a <= b), ">": lambda: int(a > b),
           ">=": lambda: int(a >= b), "<<": lambda: a << b, ">>": lambda: a >> b, "+": lambda: a + b,
           "-": lambda: a - b, "*": lambda: a * b}
    v = ops[op]()
    return v if _INT_MIN <= v <= _INT_MAX else None  # outside signed 32-bit: undecidable


def _evaluate(expr: str, macros: dict, undefined: set) -> Optional[int]:
    try:
        toks = _expand(_tokenize(expr), macros)
        if not toks:
            return None
        ev = _Eval(toks, macros, undefined)
        val = ev.ternary()
        if ev.i != len(toks):
            return None
        return val
    except (_Undecidable, RecursionError, ValueError):
        return None


def eval_condition(expr: str, macros: dict, undefined: set[str]) -> Optional[bool]:
    """Truth of a `#if`/`#elif` expression; None when it cannot be decided.

    `macros`: name -> replacement text (None: function-like; UNKNOWN: state
    uncertain) from the file's own #defines and the unit's -D flags;
    `undefined`: names known to be #undef'd."""
    val = _evaluate(expr, macros, undefined)
    return None if val is None else val != 0


def eval_value(text: str, macros: dict, undefined: set) -> Optional[int]:
    return _evaluate(text, macros, undefined)


def defines_from_flags(flags: str) -> dict[str, Optional[str]]:
    """-DNAME[=VALUE] from a compiler command line."""
    out: dict[str, Optional[str]] = {}
    for m in re.finditer(r"(?:^|\s)-D\s*([A-Za-z_]\w*)(?:=(\S*))?", flags or ""):
        out[m.group(1)] = m.group(2) if m.group(2) is not None else "1"
    return out


def _splice(text: str) -> tuple[str, list[int]]:
    """Translation phase 2: backslash-newline removed. Returns (spliced text, original
    offset of every spliced character)."""
    out: list[str] = []
    idx: list[int] = []
    i, n = 0, len(text)
    while i < n:
        if text[i] == "\\":
            if text.startswith("\n", i + 1):
                i += 2
                continue
            if text.startswith("\r\n", i + 1):
                i += 3
                continue
        out.append(text[i])
        idx.append(i)
        i += 1
    return "".join(out), idx


def _mask(text: str, comments: Optional[set] = None) -> tuple[str, Optional[int]]:
    """Translation phase 3 (spliced text): comments become spaces and string/char literal
    contents become spaces (quotes kept); newlines and length preserved. Returns (masked,
    offset of an unterminated comment or literal, if any). `comments` collects the
    offsets that were inside comments."""
    out = list(text)
    i, n = 0, len(text)

    def comment(a: int, b: int) -> None:
        for k in range(a, b):
            if out[k] != "\n":
                out[k] = " "
                if comments is not None:
                    comments.add(k)

    while i < n:
        if text.startswith("//", i):
            j = text.find("\n", i)
            j = n if j < 0 else j
            comment(i, j)
            i = j
            continue
        if text.startswith("/*", i):
            j = text.find("*/", i + 2)
            if j < 0:
                comment(i, n)
                return "".join(out), i
            comment(i, j + 2)
            i = j + 2
            continue
        ch = text[i]
        if ch in "\"'":
            j = i + 1
            while j < n and text[j] != ch:
                if text[j] == "\n":
                    return "".join(out), i  # unterminated literal
                if text[j] == "\\":
                    out[j] = " "
                    j += 1
                if j < n and text[j] != "\n":
                    out[j] = " "
                j += 1
            if j >= n:
                return "".join(out), i
            i = j + 1
            continue
        i += 1
    return "".join(out), None


_RAW_TRIGRAPH = re.compile(r"\?\?[=/'()!<>-]")
_RAW_DIGRAPH = re.compile(r"%:|<:|:>|<%|%>")
_RAW_STRING = re.compile(r"(?<![A-Za-z0-9_])(?:u8|u|U|L)?R\"")
_BAD_SPLICE = re.compile(r"\\[ \t\f\v]+\r?\n|\\\Z")
_BARE_CR = re.compile(r"\r(?!\n)")


def undecidable_file(text: str) -> Optional[str]:
    """Why a whole file cannot be modelled exactly in evidence mode (None: it can).

    Checked on the RAW text, before any translation phase: a trigraph (phase 1;
    `??/` is a backslash that splices the next line, even inside a comment), any
    digraph (`%:` `<:` `:>` `<%` `%>`), a backslash followed by whitespace before a
    newline or at end of file (phase 2 splices we do not model), a bare carriage
    return line ending, or a raw string literal (`R"(`, phase 3). Fail closed: such a file gives no evidence at all,
    including the lines before the construct."""
    for why, rx in (("trigraph", _RAW_TRIGRAPH), ("digraph", _RAW_DIGRAPH), ("raw string literal", _RAW_STRING),
                    ("unmodelled line splice", _BAD_SPLICE), ("bare carriage return line ending", _BARE_CR)):
        if rx.search(text):
            return why
    return None


_ALT_DIRECTIVE = re.compile(r"^\s*(?:%:|\?\?=)")
_TRIGRAPH = re.compile(r"\?\?[=/'()!<>-]")


def active_text(text: str, defines: Optional[dict[str, Optional[str]]] = None, unknown: str = "active") -> str:
    """Reference mode (`unknown="active"`): `text` unchanged, every branch scanned.

    Positive-evidence mode (`unknown="inactive"`): C translation phases first
    (line splices joined, then comments and literal contents masked, offsets and
    newlines kept), then directives recognised on the masked logical lines. Lines
    not certainly active become spaces (lengths, offsets and lines preserved).
    A digraph/trigraph directive (`%:`, `??=`), any other trigraph, or an unterminated comment or
    literal makes everything from there undecidable (never evidence); a file with a
    trigraph, digraph, raw string or unmodelled splice anywhere is undecidable as a
    whole (`undecidable_file`, checked on the raw text first). Comments are
    masked in the result as well; literal contents are kept."""
    if unknown != "inactive":
        return text
    if undecidable_file(text):
        return "".join(ch if ch == "\n" else " " for ch in text)  # nothing in it is evidence
    spliced, idx = _splice(text)
    in_comment: set[int] = set()
    masked, broken = _mask(spliced, in_comment)
    out = list(text)
    for k in in_comment:  # comments masked in the result (literals kept: `extern "C"`)
        out[idx[k]] = " "
    # per #if group: taken (a branch is certainly taken), undecided (an earlier branch was
    # undecidable), cur (this branch: True | False | None)
    stack: list[dict] = []
    macros: dict = dict(defines or {})
    undefined: set[str] = set()
    poisoned = False

    def state() -> Optional[bool]:
        """True: certainly active; False: certainly inactive; None: undecidable."""
        if poisoned:
            return None
        if any(e["cur"] is False for e in stack):
            return False
        return None if any(e["cur"] is None for e in stack) else True

    def cond(d: str, rest: str) -> Optional[bool]:
        if d in ("if", "elif"):
            return eval_condition(rest, macros, undefined)
        name = rest.strip().split()[0] if rest.strip() else ""
        if name in macros:
            val = None if macros[name] is UNKNOWN else True
        else:
            val = False if name in undefined else None
        return val if d == "ifdef" or val is None else not val

    def blank(a: int, b: int) -> None:
        """Blank the original text behind spliced offsets [a, b) (newlines kept)."""
        if a >= b:
            return
        lo = idx[a]
        hi = idx[b - 1] + 1
        for k in range(lo, hi):
            if out[k] not in "\n":
                out[k] = " "

    pos = 0
    for logical in masked.split("\n"):
        a, b = pos, pos + len(logical)
        pos = b + 1
        if broken is not None and b > broken:
            poisoned = True  # an unterminated comment/literal: nothing after it is certain
        if _ALT_DIRECTIVE.match(logical) or _TRIGRAPH.search(logical):
            poisoned = True  # a digraph/trigraph directive or trigraph we do not interpret
        m = None if poisoned else _DIRECTIVE.match(logical)
        if m:
            d, rest = m.group(1), m.group(2)
            if d in ("if", "ifdef", "ifndef"):
                val = cond(d, rest)
                stack.append({"taken": val is True, "undecided": val is None, "cur": val})
            elif d == "elif" and stack:
                e = stack[-1]
                if e["taken"]:
                    e["cur"] = False
                else:
                    val = cond("elif", rest)
                    if e["undecided"]:
                        e["cur"] = False if val is False else None
                    else:
                        e["cur"] = val
                        e["taken"] = val is True
                    e["undecided"] = e["undecided"] or val is None
            elif d == "else" and stack:
                e = stack[-1]
                e["cur"] = False if e["taken"] else (None if e["undecided"] else True)
                e["taken"] = True if e["cur"] is True else e["taken"]
            elif d == "endif" and stack:
                stack.pop()
            elif d in ("define", "undef"):
                where = state()
                mm = re.match(r"([A-Za-z_]\w*)(\([^)]*\))?\s*(.*)$", rest.strip())
                if mm and where is not False:
                    name = mm.group(1)
                    if where is None:
                        # defined/undefined on a line that may or may not be compiled: uncertain
                        macros[name] = UNKNOWN
                        undefined.discard(name)
                    elif d == "define":
                        macros[name] = None if mm.group(2) else (mm.group(3).strip() or "1")
                        undefined.discard(name)
                    else:
                        macros.pop(name, None)
                        undefined.add(name)
            continue
        if state() is not True:
            blank(a, b)
    return "".join(out)
