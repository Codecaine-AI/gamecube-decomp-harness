"""Deterministic source edits for the steering gate (steering_check.py).

An *edit* is a line-level change between a base text and a candidate text of
one file. Hunks are `git diff -U0`-style runs of changed lines, computed with
difflib (pure Python, so the sandbox and the host derive identical edits and
ids from identical texts, whatever their git version or diff config). Each
replace hunk is refined into sub-edits: a maximum-similarity monotone pairing
of removed and added lines; a paired line is its own sub-edit and the
unpaired lines between two pairs form one sub-edit. Sub-edits partition the
hunk in order, so any subset can be reverted independently.

Edit ids are `<path>#<hunk>.<sub>`. `edits_hash` binds the base revision,
every path, both existence flags and the full texts.

Groups are the atomic units of reversion: edits that touch one statement
(in either text), and a newly declared (or removed) local/alias with every
edit in its scope that mentions the identifier. `neighbours` widens a group
to everything in the same top-level block, for edits whose revert alone
does not compile.

Texts are `str` decoded from bytes with utf-8 + surrogateescape, so any byte
content (Shift-JIS comments) round-trips through JSON and back to bytes.
"""

from __future__ import annotations

import difflib
import hashlib
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Optional, Sequence

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from stack_check import top_level_blocks  # noqa: E402

SIMILARITY = 0.5
REFINE_CELLS = 6400  # removed*added lines above which a hunk is not refined
SOURCE_SUFFIXES = (".c", ".cc", ".cp", ".cpp", ".cxx")


# --------------------------------------------------------------------------
# Text helpers
# --------------------------------------------------------------------------


def decode(data: Optional[bytes]) -> Optional[str]:
    return None if data is None else data.decode("utf-8", "surrogateescape")


def encode(text: Optional[str]) -> Optional[bytes]:
    return None if text is None else text.encode("utf-8", "surrogateescape")


def sha256_text(text: Optional[str]) -> Optional[str]:
    return None if text is None else hashlib.sha256(encode(text)).hexdigest()


def split_lines(text: Optional[str]) -> list[str]:
    return [] if not text else text.splitlines(keepends=True)


def strip_code(text: str) -> str:
    """Text with comments removed and string/char literals emptied."""
    out = []
    i, n = 0, len(text)
    while i < n:
        if text.startswith("//", i):
            j = text.find("\n", i)
            i = n if j < 0 else j
            continue
        if text.startswith("/*", i):
            j = text.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append("\n" * text.count("\n", i, j) or " ")
            i = j
            continue
        ch = text[i]
        if ch in "\"'":
            j = i + 1
            while j < n and text[j] != ch and text[j] != "\n":
                j += 2 if text[j] == "\\" else 1
            out.append(ch + ch)
            i = j + 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


_WS = re.compile(r"\s+")


def is_cosmetic(removed: Sequence[str], added: Sequence[str]) -> bool:
    """Only comments or whitespace differ."""
    a = _WS.sub("", strip_code("".join(removed)))
    b = _WS.sub("", strip_code("".join(added)))
    return a == b


# --------------------------------------------------------------------------
# Edits
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Edit:
    id: str
    file: str
    hunk: int
    sub: int
    base_start: int  # 0-based index of the first removed line in base
    cand_start: int  # 0-based index of the first added line in the candidate
    removed: tuple[str, ...]
    added: tuple[str, ...]

    @property
    def base_line(self) -> int:
        return self.base_start + 1

    @property
    def cand_line(self) -> int:
        return self.cand_start + 1

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "file": self.file,
            "hunk": self.hunk,
            "sub": self.sub,
            "base_line": self.base_line,
            "cand_line": self.cand_line,
            "removed": list(self.removed),
            "added": list(self.added),
        }


def _similarity(a: str, b: str) -> float:
    a, b = a.strip(), b.strip()
    if not a or not b:
        return 0.0
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    if sm.real_quick_ratio() < SIMILARITY or sm.quick_ratio() < SIMILARITY:
        return 0.0
    r = sm.ratio()
    return r if r >= SIMILARITY else 0.0


def refine(removed: Sequence[str], added: Sequence[str]) -> list[tuple[int, int, int, int]]:
    """Partition a hunk into (r0, r1, a0, a1) segments (relative indices)."""
    n, m = len(removed), len(added)
    if n == 0 or m == 0 or n * m > REFINE_CELLS:
        return [(0, n, 0, m)]
    w = [[_similarity(removed[i], added[j]) for j in range(m)] for i in range(n)]
    best = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            best[i][j] = max(best[i - 1][j], best[i][j - 1], best[i - 1][j - 1] + w[i - 1][j - 1])
    pairs = []
    i, j = n, m
    while i > 0 and j > 0:
        if w[i - 1][j - 1] > 0 and best[i][j] == best[i - 1][j - 1] + w[i - 1][j - 1]:
            pairs.append((i - 1, j - 1))
            i, j = i - 1, j - 1
        elif best[i][j] == best[i - 1][j]:
            i -= 1
        else:
            j -= 1
    pairs.reverse()
    segs: list[tuple[int, int, int, int]] = []
    r, a = 0, 0
    for pi, pj in pairs:
        if pi > r or pj > a:
            segs.append((r, pi, a, pj))
        segs.append((pi, pi + 1, pj, pj + 1))
        r, a = pi + 1, pj + 1
    if r < n or a < m:
        segs.append((r, n, a, m))
    return segs


def hunks(base_lines: Sequence[str], cand_lines: Sequence[str]) -> list[tuple[int, int, int, int]]:
    sm = difflib.SequenceMatcher(None, list(base_lines), list(cand_lines), autojunk=False)
    return [(i1, i2, j1, j2) for tag, i1, i2, j1, j2 in sm.get_opcodes() if tag != "equal"]


def enumerate_edits(path: str, base_text: Optional[str], cand_text: Optional[str]) -> list[Edit]:
    """Every edit of one file, in file order. Deterministic in the texts."""
    base_lines, cand_lines = split_lines(base_text), split_lines(cand_text)
    if base_text == cand_text:
        return []
    out: list[Edit] = []
    for h, (b0, b1, c0, c1) in enumerate(hunks(base_lines, cand_lines)):
        removed, added = base_lines[b0:b1], cand_lines[c0:c1]
        for s, (r0, r1, a0, a1) in enumerate(refine(removed, added)):
            out.append(
                Edit(f"{path}#{h}.{s}", path, h, s, b0 + r0, c0 + a0, tuple(removed[r0:r1]), tuple(added[a0:a1]))
            )
    if not out and (base_text is None) != (cand_text is None):
        # An empty file created or deleted: one edit with no lines.
        out.append(Edit(f"{path}#0.0", path, 0, 0, 0, 0, (), ()))
    return out


def edit_from_json(row: dict) -> Edit:
    return Edit(row["id"], row["file"], row["hunk"], row["sub"], row["base_line"] - 1, row["cand_line"] - 1,
                tuple(row["removed"]), tuple(row["added"]))


def edits_hash(base_rev: str, files: Iterable[dict]) -> str:
    """Bind base_rev, paths, existence flags and full texts."""
    rows = []
    for f in sorted(files, key=lambda f: f["path"]):
        rows.append([
            f["path"],
            bool(f["base_exists"]),
            bool(f["cand_exists"]),
            sha256_text(f.get("base_text")) if f["base_exists"] else None,
            sha256_text(f.get("cand_text")) if f["cand_exists"] else None,
        ])
    blob = json.dumps({"base_rev": base_rev, "files": rows}, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode()).hexdigest()


def _join_safe(lines: Sequence[str]) -> bool:
    for line in lines:
        s = line.strip()
        if s.startswith("#") or "//" in line or s.endswith("\\") or '"' in line or "'" in line:
            return False
    return True


def apply_reverts(
    base_text: Optional[str],
    cand_text: Optional[str],
    edits: Sequence[Edit],
    revert_ids: Iterable[str],
    *,
    base_exists: Optional[bool] = None,
    cand_exists: Optional[bool] = None,
    preserve_lines: bool = False,
) -> Optional[str]:
    """The candidate text with the chosen edits reverted to base (None = absent).

    With `preserve_lines`, a reverted edit that is shorter than its candidate
    side is padded with blank lines, and one that is longer is joined onto
    fewer lines when that is safe, so line numbers (and `__LINE__`) after it
    stay those of the candidate.
    """
    base_exists = base_text is not None if base_exists is None else base_exists
    cand_exists = cand_text is not None if cand_exists is None else cand_exists
    wanted = set(revert_ids)
    chosen = [e for e in edits if e.id in wanted]
    if not chosen:
        return cand_text if cand_exists else None
    if len(chosen) == len(edits) and not preserve_lines:
        return base_text if base_exists else None
    lines = split_lines(cand_text)
    for e in sorted(chosen, key=lambda e: (e.cand_start, e.sub), reverse=True):
        repl = list(e.removed)
        if preserve_lines:
            want = len(e.added)
            if len(repl) < want:
                pad_nl = "\r\n" if any(x.endswith("\r\n") for x in e.added) else "\n"
                repl += [pad_nl] * (want - len(repl))
            elif len(repl) > want and want >= 1 and _join_safe(repl):
                head = repl[: want - 1]
                rest = repl[want - 1 :]
                nl = "\n" if rest[-1].endswith("\n") else ""
                joined = " ".join(x.rstrip("\r\n") for x in rest) + nl
                repl = head + [joined]
        lines[e.cand_start : e.cand_start + len(e.added)] = repl
    text = "".join(lines)
    if len(chosen) == len(edits) and not base_exists and not text.strip():
        return None
    return text


# --------------------------------------------------------------------------
# Statements, declarations, identifiers
# --------------------------------------------------------------------------


def statement_map(text: Optional[str]) -> list[frozenset[int]]:
    """Per line (0-based): ids of the statements with code on that line.

    A statement ends at `;` outside parentheses/brackets, at `{` and at `}`;
    a preprocessor line is one statement. Comments and literals are skipped.
    """
    if not text:
        return []
    code = strip_code(text)
    lines = code.split("\n")
    out: list[set[int]] = [set() for _ in lines]
    stmt = 0
    depth = 0
    for ln, line in enumerate(lines):
        s = line.strip()
        if s.startswith("#"):
            stmt += 1
            out[ln].add(stmt)
            stmt += 1
            continue
        for ch in line:
            if ch in " \t\r":
                continue
            out[ln].add(stmt)
            if ch in "([":
                depth += 1
            elif ch in ")]":
                depth = max(0, depth - 1)
            elif ch in "{}":
                depth = 0
                stmt += 1
            elif ch == ";" and depth == 0:
                stmt += 1
    n = len(split_lines(text))
    return [frozenset(x) for x in out[:n]] + [frozenset()] * max(0, n - len(out))


C_KEYWORDS = frozenset(
    """alignas alignof and asm auto bool break case catch char class const const_cast continue
    default delete do double dynamic_cast else enum explicit extern false float for friend goto if
    inline int long mutable namespace new not operator or private protected public register
    reinterpret_cast return short signed sizeof static static_cast struct switch template this throw
    true try typedef typeid typename union unsigned using virtual void volatile while xor""".split()
)
NOT_A_TYPE = frozenset("return delete new throw goto case else do sizeof typedef using operator if while for switch".split())
_DECL_RE = re.compile(
    r"(?:^|[;{}(,])\s*"
    r"(?:(?:const|static|volatile|register|unsigned|signed|struct|class|enum|typename|mutable)\s+)*"
    r"(?P<type>[A-Za-z_]\w*(?:\s*::\s*[A-Za-z_]\w*)*(?:\s*<[^;(){}]*?>)?)"
    r"(?:\s+const|\s+volatile)?"
    r"(?P<ptr>[\s*&]+?)"
    r"(?P<name>[A-Za-z_]\w*)\s*(?=[=;,(\[)]|$)",
    re.M,
)
_IDENT = re.compile(r"[A-Za-z_]\w*")
_CALL = re.compile(r"(?<![\w])([A-Za-z_]\w*)\s*\(")


def declared_names(lines: Sequence[str]) -> set[str]:
    """Identifiers declared (locals, aliases, globals, functions) in `lines`."""
    code = strip_code("".join(lines))
    out = set()
    for m in _DECL_RE.finditer(code):
        type_head = m.group("type").split("<")[0].split("::")[-1].strip()
        name = m.group("name")
        if type_head in NOT_A_TYPE or name in C_KEYWORDS or type_head in ("const", "static"):
            continue
        if not m.group("ptr").strip() and not re.search(r"\s", m.group("ptr")):
            continue
        out.add(name)
    return out


def identifiers(lines: Sequence[str]) -> set[str]:
    return set(_IDENT.findall(strip_code("".join(lines)))) - C_KEYWORDS


def call_names(lines: Sequence[str]) -> list[str]:
    """Names called in `lines` (`f(`, `x.f(`, `p->f(`, `A::f(`), keywords excluded."""
    out = []
    for m in _CALL.finditer(strip_code("".join(lines))):
        name = m.group(1)
        if name not in C_KEYWORDS and name not in NOT_A_TYPE:
            out.append(name)
    return out


def new_calls(removed: Sequence[str], added: Sequence[str]) -> list[str]:
    """Callees in `added` that `removed` does not call (sorted, unique)."""
    before = set(call_names(removed))
    return sorted({c for c in call_names(added) if c not in before})


def dropped_calls(removed: Sequence[str], added: Sequence[str]) -> list[str]:
    after = set(call_names(added))
    return sorted({c for c in call_names(removed) if c not in after})


# --------------------------------------------------------------------------
# Groups
# --------------------------------------------------------------------------


@dataclass
class Group:
    id: str
    file: str
    edits: list[Edit]
    blocks: frozenset = field(default_factory=frozenset)  # ("c", k) / ("b", k) block ids
    functions: list[str] = field(default_factory=list)

    @property
    def edit_ids(self) -> list[str]:
        return [e.id for e in self.edits]

    @property
    def removed(self) -> list[str]:
        return [x for e in self.edits for x in e.removed]

    @property
    def added(self) -> list[str]:
        return [x for e in self.edits for x in e.added]

    @property
    def line(self) -> int:
        e = self.edits[0]
        return e.cand_line if e.added else e.base_line

    @property
    def size(self) -> int:
        return sum(len(e.removed) + len(e.added) for e in self.edits)


class _UF:
    def __init__(self, n: int):
        self.p = list(range(n))

    def find(self, x: int) -> int:
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[max(ra, rb)] = min(ra, rb)


_NAME_RE = re.compile(r"((?:[A-Za-z_~]\w*\s*::\s*)*(?:operator\s*[^\s(]+|~?[A-Za-z_]\w*))\s*\($")
# Function-defining macros: name -> format of the defined function (args by index).
DEFINING_MACROS = {
    "DEFINE_NERVE": "{0}::execute",
    "DEFINE_NERVE_EXECUTE": "{0}::execute",
}


def block_name(header: str) -> Optional[str]:
    """`T::f` from a block header like `void T::f(int x) const`, else None.

    Known function-defining macros (`DEFINE_NERVE(T, A) { ... }`) map to the
    function they define; other all-caps macro headers give None.
    """
    code = _WS.sub(" ", strip_code(header)).strip()
    depth = 0
    for i, ch in enumerate(code):
        if ch == "(":
            if depth == 0:
                m = _NAME_RE.search(code[: i + 1])
                if not m:
                    return None
                name = re.sub(r"\s+", "", m.group(1))
                if re.fullmatch(r"[A-Z][A-Z0-9_]*", name):
                    fmt = DEFINING_MACROS.get(name)
                    close = _close_paren(code, i)
                    args = [a.strip() for a in code[i + 1 : close].split(",")] if close > i else []
                    return fmt.format(*args) if fmt and args else None
                return name
            depth += 1
        elif ch == ")":
            depth -= 1
    return None


def _close_paren(code: str, open_index: int) -> int:
    depth = 0
    for k in range(open_index, len(code)):
        if code[k] == "(":
            depth += 1
        elif code[k] == ")":
            depth -= 1
            if depth == 0:
                return k
    return -1


def _span_blocks(blocks: list[tuple[int, int]], lo: int, hi: int) -> set[int]:
    return {k for k, (a, b) in enumerate(blocks) if a <= hi and b >= lo}


def edit_blocks(edit: Edit, cand_blocks: list[tuple[int, int]], base_blocks: list[tuple[int, int]]) -> frozenset:
    out = set()
    if edit.added:
        out |= {("c", k) for k in _span_blocks(cand_blocks, edit.cand_line, edit.cand_line + len(edit.added) - 1)}
    else:  # a deletion sits between two candidate lines
        out |= {("c", k) for k in _span_blocks(cand_blocks, max(edit.cand_line - 1, 1), edit.cand_line)
                if cand_blocks[k][0] < edit.cand_line <= cand_blocks[k][1]}
    if edit.removed:
        out |= {("b", k) for k in _span_blocks(base_blocks, edit.base_line, edit.base_line + len(edit.removed) - 1)}
    return frozenset(out)


def group_edits(path: str, base_text: Optional[str], cand_text: Optional[str], edits: Sequence[Edit]) -> list[Group]:
    """Dependency-aware groups of one file's edits, in file order."""
    if not edits:
        return []
    n = len(edits)
    uf = _UF(n)
    cand_stmts, base_stmts = statement_map(cand_text), statement_map(base_text)
    cand_blocks = top_level_blocks(cand_text or "")
    base_blocks = top_level_blocks(base_text or "")

    def stmts(e: Edit) -> set:
        out = set()
        for k in range(e.cand_start, e.cand_start + len(e.added)):
            if k < len(cand_stmts):
                out |= {("c", s) for s in cand_stmts[k]}
        for k in range(e.base_start, e.base_start + len(e.removed)):
            if k < len(base_stmts):
                out |= {("b", s) for s in base_stmts[k]}
        return out

    st = [stmts(e) for e in edits]
    owner: dict = {}
    for i, keys in enumerate(st):
        for key in keys:
            if key in owner:
                uf.union(owner[key], i)
            else:
                owner[key] = i

    # Control structure: an edit that changes brace structure belongs to one
    # statement with the edit holding the matching brace and everything between.
    for side, text, attr_lines, attr_start in (("c", cand_text, "added", "cand_start"), ("b", base_text, "removed", "base_start")):
        if not text:
            continue
        line_owner: dict[int, int] = {}
        for i, e in enumerate(edits):
            start = getattr(e, attr_start)
            for k in range(start, start + len(getattr(e, attr_lines))):
                line_owner[k] = i
        pairs = brace_pairs(text)
        for i, e in enumerate(edits):
            if _braces(e.added) == _braces(e.removed):
                continue
            start = getattr(e, attr_start)
            mine = set(range(start, start + len(getattr(e, attr_lines))))
            for a, b in pairs:
                if (a in mine) == (b in mine):
                    continue
                if a not in mine and b not in mine:
                    continue
                for k in range(a, b + 1):
                    j = line_owner.get(k)
                    if j is not None:
                        uf.union(i, j)

    blocks = [edit_blocks(e, cand_blocks, base_blocks) for e in edits]

    # Moved statements: a code line removed by one edit and added by another
    # in the same function is one move; its halves revert together.
    removed_code = [_code_lines(e.removed) for e in edits]
    added_code = [_code_lines(e.added) for e in edits]
    for i in range(n):
        for j in range(n):
            if i != j and added_code[i] & removed_code[j] and (
                    (not blocks[i] and not blocks[j]) or blocks[i] & blocks[j]):
                uf.union(i, j)

    idents = [identifiers(e.removed) | identifiers(e.added) for e in edits]
    decl_add = [declared_names(e.added) for e in edits]
    decl_rem = [declared_names(e.removed) for e in edits]

    def same_scope(i: int, j: int) -> bool:
        # A top-level name is file-wide; a local belongs to its function.
        return not blocks[i] or bool(blocks[i] & blocks[j])

    for i in range(n):
        for mine, other in ((decl_add[i] - decl_rem[i], decl_rem), (decl_rem[i] - decl_add[i], decl_add)):
            for name in mine:
                # Declared on the other side by another edit: a move or a
                # redeclaration. The two halves revert together.
                partners = [j for j in range(n) if j != i and name in other[j] and same_scope(i, j)]
                if partners:
                    for j in partners:
                        uf.union(i, j)
                    continue
                # A new (or dropped) name: every edit in scope that uses it.
                for j in range(n):
                    if j != i and name in idents[j] and same_scope(i, j):
                        uf.union(i, j)

    members: dict[int, list[int]] = {}
    for i in range(n):
        members.setdefault(uf.find(i), []).append(i)
    groups = []
    for root in sorted(members, key=lambda r: min(members[r])):
        idx = sorted(members[root])
        es = [edits[i] for i in idx]
        bl = frozenset().union(*(blocks[i] for i in idx))
        names = []
        for kind, k in sorted(bl):
            src, blist = (cand_text, cand_blocks) if kind == "c" else (base_text, base_blocks)
            name = _block_header_name(src or "", blist[k])
            if name and name not in names:
                names.append(name)
        first = es[0]
        groups.append(Group(f"{path}@{first.hunk}.{first.sub}", path, es, bl, names))
    return groups


def _code_lines(lines: Sequence[str]) -> set[str]:
    """Whitespace-free code lines worth matching as moved statements."""
    out = set()
    for line in strip_code("".join(lines)).splitlines():
        key = _WS.sub("", line)
        if len(key) >= 8 and ";" in key and not re.fullmatch(r"(?:return|break|continue)[^;]*;|[{}]+.*", key):
            out.add(key)
    return out


def _braces(lines: Sequence[str]) -> str:
    return "".join(ch for ch in strip_code("".join(lines)) if ch in "{}")


def brace_pairs(text: str) -> list[tuple[int, int]]:
    """(open line, close line) of every matched `{ }` pair (0-based lines);
    comments, literals and preprocessor lines skipped."""
    code = strip_code(text)
    pairs = []
    stack: list[int] = []
    for ln, line in enumerate(code.split("\n")):
        if line.strip().startswith("#"):
            continue
        for ch in line:
            if ch == "{":
                stack.append(ln)
            elif ch == "}" and stack:
                pairs.append((stack.pop(), ln))
    return pairs


def _block_header_name(text: str, block: tuple[int, int]) -> Optional[str]:
    lines = text.splitlines()
    start, end = block
    header = []
    for k in range(start - 1, min(end, len(lines))):
        line = lines[k]
        cut = line.find("{")
        if cut >= 0:
            header.append(line[:cut])
            break
        header.append(line)
    return block_name("\n".join(header))


def neighbours(groups: Sequence[Group], target: Group) -> list[Group]:
    """Groups sharing a top-level block with `target` (closed under sharing).

    Outside any block: the groups of the same file whose edits lie within
    three unchanged lines of each other (a run of declarations).
    """
    same = [g for g in groups if g.file == target.file]
    if target.blocks:
        acc = set(target.blocks)
        while True:
            members = [g for g in same if g.blocks & acc]
            grown = set().union(*(g.blocks for g in members))
            if grown == acc:
                return members
            acc = grown
    loose = sorted((g for g in same if not g.blocks), key=lambda g: g.line)
    runs: list[list[Group]] = []
    for g in loose:
        span_lo = g.line
        if runs:
            prev = runs[-1][-1]
            prev_hi = prev.line + max(len(prev.added), len(prev.removed), 1) - 1
            if span_lo - prev_hi <= 4:
                runs[-1].append(g)
                continue
        runs.append([g])
    return next((run for run in runs if target in run), [target])


def statement_context(base_text: Optional[str], cand_text: Optional[str], g: Group,
                      max_extra: int = 40) -> tuple[list[str], list[str]]:
    """The group's removed/added lines widened to whole statements.

    A group that touches part of a multi-line statement (the continuation
    line of a call) gets the statement's unchanged lines on both sides, so a
    shape classifier sees complete statements. Only for classification: the
    group still reverts exactly its own edits.
    """
    base_lines, cand_lines = split_lines(base_text), split_lines(cand_text)
    b_map, c_map = statement_map(base_text), statement_map(cand_text)
    b2c: dict[int, int] = {}
    c2b: dict[int, int] = {}
    sm = difflib.SequenceMatcher(None, base_lines, cand_lines, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                b2c[i1 + k] = j1 + k
                c2b[j1 + k] = i1 + k
    b_set = {e.base_start + k for e in g.edits for k in range(len(e.removed))}
    c_set = {e.cand_start + k for e in g.edits for k in range(len(e.added))}
    own = len(b_set) + len(c_set)

    def widen(lines: set[int], smap: list[frozenset]) -> set[int]:
        stmts = set().union(*(smap[k] for k in lines if k < len(smap))) if lines else set()
        return lines | {k for k, ids in enumerate(smap) if ids & stmts}

    for _ in range(4):
        nb, nc = widen(b_set, b_map), widen(c_set, c_map)
        nb |= {c2b[k] for k in nc if k in c2b}
        nc |= {b2c[k] for k in nb if k in b2c}
        if (nb, nc) == (b_set, c_set) or len(nb) + len(nc) - own > max_extra:
            break
        b_set, c_set = nb, nc
    return ([base_lines[k].rstrip("\r\n") for k in sorted(b_set) if k < len(base_lines)],
            [cand_lines[k].rstrip("\r\n") for k in sorted(c_set) if k < len(cand_lines)])


def group_to_json(g: Group) -> dict:
    return {
        "id": g.id,
        "file": g.file,
        "edit_ids": g.edit_ids,
        "line": g.line,
        "functions": list(g.functions),
        "base_lines": [x.rstrip("\r\n") for x in g.removed],
        "cand_lines": [x.rstrip("\r\n") for x in g.added],
    }


def include_only(removed: Sequence[str], added: Sequence[str]) -> bool:
    """Every code line on both sides is an `#include`."""
    lines = [x.strip() for x in strip_code("".join(list(removed) + list(added))).splitlines() if x.strip()]
    return bool(lines) and all(re.match(r"#\s*include\b", x) for x in lines)


def is_source(path: str) -> bool:
    return path.endswith(SOURCE_SUFFIXES)
