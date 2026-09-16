#!/usr/bin/env python3
"""source_fidelity QA rules for review_lint.

Global (any MWCC decomp) rules from the SMS worktree source-quality audit
(``audits/sms-worktree-source-quality-2026-09-16/REPORT.md`` Part 4.2).
They cover symbol forgery (mangled globals, ``extern "C"`` spoofs, manual
vtables, header-override macros, placeholder classes), inert emission
(discarded expressions, unused static data), C++ validity defects
(dangling reference returns, indexing through a scalar member), and a set
of warning/review-tier matching-tactic detectors.

Rule ids:

- errors: ``dangling_ref_return``, ``scalar_member_index``,
  ``header_override_macro``, ``mangled_symbol_in_source``, ``manual_vtable``,
  ``discarded_expression``, ``unused_static_data``,
  ``local_class_shadows_header``
- warnings: ``fixed_fn_pointer_call``, ``storage_widening``,
  ``duplicated_inline_body``, ``single_use_wrapper``, ``guard_removal``,
  ``unassigned_member_deref``, ``arg_order_change``
- review tier (``info``): ``cancelling_arithmetic``, ``layout_cue_local``

Whole-file context comes from ``hunk["post_file_text"]`` when the scanner
supplies it, falling back to ``$REVIEW_LINT_POST_TREE/<file>`` when set
(diff-file scans against a checked-out post tree), and finally to the hunk's
added lines alone. Rules that need the repo's ``include/`` tree
(``local_class_shadows_header``, ``scalar_member_index``,
``duplicated_inline_body``) run inline when ``$REVIEW_LINT_REPO_ROOT`` (or the
post tree) is set; otherwise they defer to the ``POST_SCAN_HOOKS`` entry,
which receives the repo root from ``scan_diff.py`` and re-runs them.

Loaded by ``review_lint/api/_qa_rules.py``; shared helpers come from there.
"""

from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path
from typing import Any, Callable

from _qa_rules import (
    STANDARD_TITLES,
    TOKEN_RE,
    blank_line,
    path_matches,
    strip_comments_and_strings,
)

APPLIES_TO = ["src/**/*.c", "src/**/*.cpp"]
VENDOR_EXCLUDES = [
    "src/dolphin/**",
    "src/MSL/**",
    "src/MetroTRK/**",
    "src/Runtime/**",
    "src/JSystem/**",
    "src/PowerPC_EABI_Support/**",
    "src/TRK_MINNOW_DOLPHIN/**",
    "src/THPPlayer/**",
]

POST_TREE_ENV = "REVIEW_LINT_POST_TREE"
REPO_ROOT_ENV = "REVIEW_LINT_REPO_ROOT"

STD_SYMBOL = "global_standard:no-symbol-forgery"
STD_INERT = "global_standard:no-inert-emission"
STD_TACTICS = "global_standard:matching-tactics-need-evidence"
STD_LEDGER = "global_standard:verification-and-regression-ledger"
STD_HEADER_INLINES = "global_standard:header-inlines"
STD_STYLE = "global_standard:infer-authored-source-style"
STD_TYPED = "global_standard:typed-fields-over-pointer-math"

STANDARD_TITLES.setdefault(
    STD_SYMBOL, "Do not forge symbols the compiler would emit from real source"
)
STANDARD_TITLES.setdefault(
    STD_INERT, "Do not add inert statements or data to steer section bytes"
)
STANDARD_TITLES.setdefault(
    STD_LEDGER, "Keep the verification and regression ledger truthful"
)
STANDARD_TITLES.setdefault(
    STD_STYLE, "Infer authored source style instead of fabricating helpers"
)


def _title(standard: str) -> str:
    return STANDARD_TITLES.get(standard, standard)


MANGLED_NAME_RE = re.compile(r"^[A-Za-z_]\w*__(?:\d+|Q\d)\w*$")
MANGLED_TOKEN_RE = re.compile(r"\b[A-Za-z_]\w*__(?:\d+|Q\d)\w*\b")
IDENT_RE = re.compile(r"[A-Za-z_]\w*")


# ---------------------------------------------------------------------------
# Shared context helpers.
# ---------------------------------------------------------------------------


_FORCED_ROOT: Path | None = None


def _repo_root_hint() -> Path | None:
    """Repo root for header lookups (hook-forced, env, or post tree)."""

    if _FORCED_ROOT is not None:
        return _FORCED_ROOT
    for env in (REPO_ROOT_ENV, POST_TREE_ENV):
        value = os.environ.get(env)
        if value and Path(value).is_dir():
            return Path(value)
    return None


def _aligned(hunk: dict[str, Any], text: str) -> bool:
    """Whole-file text must reproduce the hunk's added lines at their numbers.

    ``scan_diff --diff-file`` without ``--post-tree`` supplies only the diff's
    added lines joined together; that text is not line-addressable.
    """

    lines = text.splitlines()
    for lineno, added in hunk["added"]:
        if lineno < 1 or lineno > len(lines) or lines[lineno - 1] != added:
            return False
    return True


def _post_text(hunk: dict[str, Any]) -> str | None:
    text = hunk.get("post_file_text")
    if text is not None and _aligned(hunk, text):
        return text
    root = os.environ.get(POST_TREE_ENV)
    rel = hunk.get("file")
    if root and rel:
        path = Path(root) / rel
        if path.is_file():
            return path.read_text(encoding="utf-8", errors="replace")
    return None


def _analysis_lines(hunk: dict[str, Any]) -> tuple[list[tuple[int, str]], bool]:
    """Return ``[(lineno, text)]`` for whole-file analysis.

    Second element tells whether the lines are the real post-change file
    (True) or only the hunk's added lines (False).
    """

    text = _post_text(hunk)
    if text is not None:
        return [(i, line) for i, line in enumerate(text.splitlines(), start=1)], True
    return [(lineno, text) for lineno, text in hunk["added"]], False


def _added_set(hunk: dict[str, Any]) -> set[int]:
    return {lineno for lineno, _ in hunk["added"]}


def _joined(lines: list[tuple[int, str]]) -> tuple[str, list[int]]:
    """Join lines to one text and return the start offset of each line."""

    starts: list[int] = []
    pos = 0
    parts: list[str] = []
    for _, text in lines:
        starts.append(pos)
        parts.append(text)
        pos += len(text) + 1
    return "\n".join(parts), starts


def _index_at(starts: list[int], offset: int) -> int:
    lo, hi = 0, len(starts) - 1
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if starts[mid] <= offset:
            lo = mid
        else:
            hi = mid - 1
    return lo


def _brace_body(text: str, open_index: int) -> int:
    """Return the index of the ``}`` matching ``text[open_index] == '{'``."""

    depth = 0
    for i in range(open_index, len(text)):
        c = text[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i
    return len(text) - 1


FUNC_HEADER_LINE_RE = re.compile(r"^[A-Za-z_~][\w:<>*&\s,~]*\(")
FUNC_NAME_RE = re.compile(r"([A-Za-z_~][\w:~]*)\s*\($")


def _enclosing_function(
    lines: list[tuple[int, str]], index: int
) -> tuple[str | None, int]:
    """Best-effort enclosing function name and header index for ``lines[index]``."""

    for i in range(index, -1, -1):
        text = lines[i][1]
        if not text or text[0].isspace() or text.startswith(("#", "}", "/", "*")):
            continue
        clean = blank_line(text)
        if clean.rstrip().endswith(";"):
            continue
        head = clean.split("(", 1)[0] + "("
        if not FUNC_HEADER_LINE_RE.match(head):
            continue
        match = FUNC_NAME_RE.search(head.strip())
        if match:
            return match.group(1), i
        return None, i
    return None, -1


def _function_end(lines: list[tuple[int, str]], index: int) -> int:
    for i in range(index + 1, len(lines)):
        if lines[i][1].startswith("}"):
            return i
    return len(lines) - 1


def _finding(
    lineno: int, text: str, message: str, **detail: Any
) -> dict[str, Any]:
    record: dict[str, Any] = {"line": lineno, "excerpt": text.strip(), "message": message}
    if detail:
        record["detail"] = detail
    return record


# ---------------------------------------------------------------------------
# include/ tree index (cached per repo root).
# ---------------------------------------------------------------------------

CLASS_DEF_RE = re.compile(
    r"(?<![\w:])(?:class|struct)\s+([A-Za-z_]\w*)\s*(?::[^{;]*)?\{"
)
ARRAY_MEMBER_RE = re.compile(r"\b([A-Za-z_]\w*)\s*\[[^\]]*\]\s*(?:\[[^\]]*\]\s*)*(?:;|=)")
DECLARED_NAME_RE = re.compile(r"\b([A-Za-z_]\w*)\s*(?:;|=[^=]|\[)")
STATEMENT_WINDOW = 6
MIN_WINDOW_TOKENS = 30

_INCLUDE_INDEX: dict[Path, dict[str, Any]] = {}


def _statement_lines(lines: list[str]) -> list[tuple[int, str]]:
    """Normalize code lines to statement text, dropping braces/blank/preproc."""

    out: list[tuple[int, str]] = []
    for index, raw in enumerate(lines):
        clean = " ".join(blank_line(raw).split())
        if not clean or clean.startswith("#"):
            continue
        if re.fullmatch(r"[{}();]*(?:else\s*\{?)?", clean):
            continue
        out.append((index, clean))
    return out


def _window_hashes(statements: list[tuple[int, str]]) -> dict[str, int]:
    """Hash every ``STATEMENT_WINDOW``-statement window -> first line index."""

    hashes: dict[str, int] = {}
    for i in range(len(statements) - STATEMENT_WINDOW + 1):
        chunk = statements[i : i + STATEMENT_WINDOW]
        joined = "\n".join(text for _, text in chunk)
        if len(TOKEN_RE.findall(joined)) < MIN_WINDOW_TOKENS:
            continue
        digest = hashlib.md5(joined.encode("utf-8")).hexdigest()
        hashes.setdefault(digest, chunk[0][0])
    return hashes


def _include_index(root: Path) -> dict[str, Any]:
    root = root.resolve()
    cached = _INCLUDE_INDEX.get(root)
    if cached is not None:
        return cached
    class_defs: set[str] = set()
    array_members: set[str] = set()
    declared: set[str] = set()
    by_stem: dict[str, dict[str, set[str]]] = {}
    windows: dict[str, str] = {}
    include_dir = root / "include"
    if include_dir.is_dir():
        for path in sorted(include_dir.rglob("*")):
            if path.suffix not in {".h", ".hpp", ".inl"} or not path.is_file():
                continue
            try:
                raw = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            clean = strip_comments_and_strings(raw)
            class_defs.update(CLASS_DEF_RE.findall(clean))
            file_arrays = set(ARRAY_MEMBER_RE.findall(clean))
            file_declared = set(DECLARED_NAME_RE.findall(clean))
            array_members.update(file_arrays)
            declared.update(file_declared)
            stem_entry = by_stem.setdefault(
                path.stem, {"arrays": set(), "declared": set(), "text": ""}
            )
            stem_entry["arrays"].update(file_arrays)
            stem_entry["declared"].update(file_declared)
            stem_entry["text"] += clean + "\n"
            rel = str(path.relative_to(root))
            for digest in _window_hashes(_statement_lines(raw.splitlines())):
                windows.setdefault(digest, rel)
    index = {
        "class_defs": class_defs,
        "array_members": array_members,
        "declared": declared,
        "by_stem": by_stem,
        "windows": windows,
        "available": include_dir.is_dir(),
    }
    _INCLUDE_INDEX[root] = index
    return index


# ---------------------------------------------------------------------------
# dangling_ref_return (error)
# ---------------------------------------------------------------------------

REF_FUNC_RE = re.compile(
    r"(?P<ret>(?:const\s+)?[A-Za-z_][\w:]*(?:<[^;{}()]*>)?)\s*&\s*"
    r"(?P<name>[A-Za-z_][\w:~]*)\s*\((?P<params>[^;{}()]*)\)\s*(?:const\s*)?\{"
)
RETURN_NAME_RE = re.compile(r"\breturn\s+([A-Za-z_]\w*)\s*;")


def _split_params(params: str) -> list[str]:
    out: list[str] = []
    depth = 0
    current: list[str] = []
    for c in params:
        if c == "<":
            depth += 1
        elif c == ">":
            depth -= 1
        if c == "," and depth == 0:
            out.append("".join(current))
            current = []
        else:
            current.append(c)
    if current:
        out.append("".join(current))
    return [p.strip() for p in out if p.strip()]


def _base_type(spec: str) -> str:
    spec = re.sub(r"\b(?:const|volatile|static|inline)\b", " ", spec)
    return " ".join(spec.replace("&", " ").replace("*", " ").split())


def check_dangling_ref_return(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Reference-returning function that returns a by-value param or local."""

    lines, _ = _analysis_lines(hunk)
    added = _added_set(hunk)
    text, starts = _joined(lines)
    clean = strip_comments_and_strings(text)
    findings: list[dict[str, Any]] = []
    for match in REF_FUNC_RE.finditer(clean):
        open_index = match.end() - 1
        close_index = _brace_body(clean, open_index)
        body = clean[open_index + 1 : close_index]
        ret_base = _base_type(match.group("ret"))
        by_value: dict[str, str] = {}
        for param in _split_params(match.group("params")):
            if "&" in param or "*" in param:
                continue
            parts = param.rsplit(None, 1)
            if len(parts) != 2:
                continue
            by_value[parts[1]] = _base_type(parts[0])
        locals_: set[str] = set()
        for decl in re.finditer(
            r"(?m)^\s*(?!return\b|static\b|extern\b)(?:const\s+)?"
            r"[A-Za-z_][\w:]*(?:<[^;{}()]*>)?\s+([A-Za-z_]\w*)\s*(?:;|=|\()",
            body,
        ):
            locals_.add(decl.group(1))
        header_index = _index_at(starts, match.start())
        for ret in RETURN_NAME_RE.finditer(body):
            name = ret.group(1)
            kind = None
            if name in by_value and (
                by_value[name] == ret_base or ret_base.endswith(by_value[name])
            ):
                kind = "by-value parameter"
            elif name in locals_:
                kind = "automatic local"
            if kind is None:
                continue
            line_index = _index_at(starts, open_index + 1 + ret.start())
            lineno, raw = lines[line_index]
            if lineno not in added and lines[header_index][0] not in added:
                continue
            findings.append(
                _finding(
                    lineno,
                    raw,
                    f"`{match.group('name')}` returns a reference to `{name}`, a "
                    f"{kind} that is destroyed when the function returns. This is "
                    "undefined behavior, not a matching tactic; return by value or "
                    "take the argument by reference.",
                    function=match.group("name"),
                    returned=name,
                    kind=kind,
                )
            )
    return findings


# ---------------------------------------------------------------------------
# scalar_member_index (error; warning when header lookup unavailable)
# ---------------------------------------------------------------------------

PTR_FROM_MEMBER_RE = re.compile(
    r"\b[A-Za-z_][\w:<>]*\s*\*+\s*(?P<ptr>[A-Za-z_]\w*)\s*=\s*&\s*"
    r"(?P<expr>(?:[A-Za-z_]\w*(?:->|\.))*)(?P<member>[A-Za-z_]\w*)\s*;"
)
DIRECT_MEMBER_INDEX_RE = re.compile(
    r"\(\s*&\s*(?P<expr>(?:[A-Za-z_]\w*(?:->|\.))*)(?P<member>[A-Za-z_]\w*)\s*\)"
    r"\s*\[\s*(?P<idx>[^\]]+)\]"
)


def _nonzero_index(idx: str) -> bool:
    idx = idx.strip()
    return not re.fullmatch(r"0+", idx)


def _member_lookup(member: str, source_file: str | None) -> str:
    """Classify ``member`` from include/: prefer the header sharing the .cpp stem."""

    root = _repo_root_hint()
    if root is None:
        return "unavailable"
    index = _include_index(root)
    if not index["available"]:
        return "unavailable"
    stem = Path(source_file).stem if source_file else None
    own = index["by_stem"].get(stem) if stem else None
    if own and member in own["declared"]:
        return "array" if member in own["arrays"] else "scalar"
    if member in index["array_members"]:
        return "array"
    if member in index["declared"]:
        return "scalar"
    return "unknown"


def check_scalar_member_index(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Pointer taken from a scalar member and then indexed or offset."""

    lines, _ = _analysis_lines(hunk)
    added = _added_set(hunk)
    findings: list[dict[str, Any]] = []
    seen: set[tuple[int, str]] = set()

    def emit(lineno: int, raw: str, member: str, form: str) -> None:
        if (lineno, member) in seen or lineno not in added:
            return
        lookup = _member_lookup(member, hunk.get("file"))
        seen.add((lineno, member))
        record = _finding(
            lineno,
            raw,
            f"`{form}` indexes through the address of member `{member}`. "
            "Adjacent members are not an array (and `(&array)[n]` steps past the "
            "whole array); declare the real array field in the owning header "
            "instead of pointer math through a member. "
            f"{_title(STD_TYPED)}.",
            member=member,
            header_lookup=lookup,
        )
        if lookup in {"unavailable", "unknown"}:
            record["severity"] = "warning"
            record["message"] += (
                " (Header lookup could not confirm the member's declaration; "
                "verify the field type manually.)"
            )
        findings.append(record)

    clean_lines = [(lineno, blank_line(raw), raw) for lineno, raw in lines]
    for i, (lineno, clean, raw) in enumerate(clean_lines):
        for match in DIRECT_MEMBER_INDEX_RE.finditer(clean):
            if _nonzero_index(match.group("idx")):
                emit(lineno, raw, match.group("member"), match.group(0).strip())
        match = PTR_FROM_MEMBER_RE.search(clean)
        if not match:
            continue
        ptr, member = match.group("ptr"), match.group("member")
        end = _function_end(lines, i)
        index_re = re.compile(rf"\b{re.escape(ptr)}\s*\[\s*([^\]]+)\]")
        offset_re = re.compile(rf"\b{re.escape(ptr)}\s*\+\s*(?:\d+|[A-Za-z_]\w*)\b")
        for j in range(i + 1, end + 1):
            l2, c2, r2 = clean_lines[j]
            hit = None
            idx = index_re.search(c2)
            if idx and _nonzero_index(idx.group(1)):
                hit = idx.group(0)
            elif offset_re.search(c2):
                hit = offset_re.search(c2).group(0)  # type: ignore[union-attr]
            if hit:
                target = l2 if l2 in added else lineno
                emit(target, r2 if l2 in added else raw, member, hit.strip())
    return findings


# ---------------------------------------------------------------------------
# header_override_macro (error)
# ---------------------------------------------------------------------------

GUARD_DEFINE_RE = re.compile(r"^\s*#\s*define\s+([A-Za-z_]\w*_(?:HPP|H|HPP_|H_|INCLUDED|INC))\s*$")
ALIAS_DEFINE_RE = re.compile(r"^\s*#\s*define\s+([A-Za-z_]\w*)\s+([A-Za-z_]\w*)\s*$")
SELF_CALL_DEFINE_RE = re.compile(r"^\s*#\s*define\s+([A-Za-z_]\w*)\s+\1\s*\(")
INCLUDE_RE = re.compile(r"^\s*#\s*include\b")
UNDEF_RE = re.compile(r"^\s*#\s*undef\s+([A-Za-z_]\w*)")


def check_header_override_macro(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Macros that predefine guards or rename identifiers around an include."""

    lines, _ = _analysis_lines(hunk)
    added = _added_set(hunk)
    findings: list[dict[str, Any]] = []
    texts = [blank_line(raw) for _, raw in lines]
    for i, (lineno, raw) in enumerate(lines):
        if lineno not in added:
            continue
        clean = texts[i]
        guard = GUARD_DEFINE_RE.match(clean)
        if guard:
            findings.append(
                _finding(
                    lineno,
                    raw,
                    f"`#define {guard.group(1)}` predefines a header guard so the "
                    "real header is skipped. Include the owning header and fix it "
                    f"there instead. {_title(STD_SYMBOL)}.",
                    macro=guard.group(1),
                    form="guard_predefine",
                )
            )
            continue
        self_call = SELF_CALL_DEFINE_RE.match(clean)
        if self_call:
            findings.append(
                _finding(
                    lineno,
                    raw,
                    f"`#define {self_call.group(1)} {self_call.group(1)}(...` rewrites "
                    "a header declaration through the preprocessor. Declare the "
                    f"function the header way. {_title(STD_SYMBOL)}.",
                    macro=self_call.group(1),
                    form="declaration_shadow",
                )
            )
            continue
        alias = ALIAS_DEFINE_RE.match(clean)
        if not alias:
            continue
        name = alias.group(1)
        saw_include = False
        for later in texts[i + 1 :]:
            if INCLUDE_RE.match(later):
                saw_include = True
            undef = UNDEF_RE.match(later)
            if undef and undef.group(1) == name and saw_include:
                findings.append(
                    _finding(
                        lineno,
                        raw,
                        f"`#define {name} {alias.group(2)}` renames an identifier "
                        "for the duration of an include and then undefines it. "
                        "That forges a different declaration than the header "
                        f"owns. {_title(STD_SYMBOL)}.",
                        macro=name,
                        form="include_rename",
                    )
                )
                break
    return findings


# ---------------------------------------------------------------------------
# mangled_symbol_in_source (error)
# ---------------------------------------------------------------------------

EXTERN_C_RE = re.compile(r'\bextern\s+"C"')
EXTERN_C_BLANK_RE = re.compile(r'\bextern\s+"\s*"')
MANGLED_DECL_RE = re.compile(
    r'^(?P<indent>\s*)(?:extern\s+"\s*"\s+)?'
    r"(?:(?:static|const|unsigned|signed|volatile|extern|inline)\s+)*"
    r"[A-Za-z_][\w:<>]*(?:\s*[*&]+\s*|\s+)"
    r"(?P<name>[A-Za-z_]\w*__(?:\d+|Q\d)\w*)\s*(?:\[|=|;|\()"
)


def check_mangled_symbol_in_source(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Hand-mangled file-scope symbols and ``extern "C"`` in C++ game code."""

    findings: list[dict[str, Any]] = []
    is_cpp = (hunk.get("file") or "").endswith((".cpp", ".cc", ".cxx"))
    in_extern_c = False
    block: dict[str, Any] | None = None
    for lineno, raw in hunk["added"]:
        clean = blank_line(raw)
        stripped = clean.strip()
        if not stripped:
            continue
        if EXTERN_C_BLANK_RE.search(clean):
            if stripped.endswith("{"):
                in_extern_c = True
                block = None
            if is_cpp:
                findings.append(
                    _finding(
                        lineno,
                        raw,
                        '`extern "C"` in a C++ translation unit forces unmangled '
                        "linkage so a hand-written symbol name can stand in for "
                        "a class member or function. Declare the real C++ entity "
                        f"in its owner instead. {_title(STD_SYMBOL)}.",
                        form="extern_c",
                    )
                )
                if in_extern_c:
                    block = findings[-1]
            if not MANGLED_DECL_RE.match(clean):
                continue
        elif stripped.startswith("}") and in_extern_c and not raw[0].isspace():
            in_extern_c = False
            block = None
            continue
        match = MANGLED_DECL_RE.match(clean)
        if not match:
            continue
        if match.group("indent") and not in_extern_c:
            continue
        name = match.group("name")
        if name.startswith("__vt__"):
            continue  # owned by manual_vtable
        if in_extern_c and block is not None and "=" not in clean and "(" in clean:
            # Prototype inside an extern "C" block: aggregate on the block line.
            block["detail"]["mangled_prototypes"] = block["detail"].get("mangled_prototypes", 0) + 1
            continue
        if findings and findings[-1]["line"] == lineno:
            findings[-1]["detail"]["symbol"] = name
            findings[-1]["detail"]["form"] = "extern_c_mangled"
            continue
        findings.append(
            _finding(
                lineno,
                raw,
                f"`{name}` is a hand-mangled symbol written directly in source. "
                "The compiler emits this name from a real declaration "
                "(`T Class::member = value;` or the class method); write that "
                f"declaration in the owner instead. {_title(STD_SYMBOL)}.",
                symbol=name,
                form="mangled_definition",
            )
        )
    return findings


# ---------------------------------------------------------------------------
# manual_vtable (error)
# ---------------------------------------------------------------------------

VT_ARRAY_RE = re.compile(r"\b(?P<name>__vt__\w*)\s*(?:\[|=)")
VOID_PTR_MANGLED_RE = re.compile(
    r"\(\s*void\s*\*\s*\)\s*&?\s*(?P<name>[A-Za-z_]\w*__(?:\d+|Q\d)\w*)"
)
VT_PADDING_RE = re.compile(r"\b(?P<name>\w*vtable_padding\w*)\b")


def check_manual_vtable(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Hand-written vtable arrays and their mangled slot initializers."""

    findings: list[dict[str, Any]] = []
    in_vtable = False
    for lineno, raw in hunk["added"]:
        clean = blank_line(raw)
        if in_vtable:
            if clean.lstrip().startswith("}"):
                in_vtable = False
            elif VOID_PTR_MANGLED_RE.search(clean) or not VT_PADDING_RE.search(clean):
                if findings and VOID_PTR_MANGLED_RE.search(clean):
                    findings[-1]["detail"]["slots"] = findings[-1]["detail"].get("slots", 0) + 1
                continue
        for pattern, form, message in (
            (VT_ARRAY_RE, "vtable_array", "defines a vtable array by hand"),
            (VOID_PTR_MANGLED_RE, "mangled_slot", "fills a vtable slot with a cast mangled name"),
            (VT_PADDING_RE, "vtable_padding", "pads a hand-written vtable"),
        ):
            match = pattern.search(clean)
            if not match:
                continue
            findings.append(
                _finding(
                    lineno,
                    raw,
                    f"`{match.group('name')}` {message}. Vtables come from the "
                    "class definition with its virtual methods; write the class "
                    f"and the methods instead. {_title(STD_SYMBOL)}.",
                    symbol=match.group("name"),
                    form=form,
                )
            )
            if form == "vtable_array" and "{" in clean and "}" not in clean:
                in_vtable = True
            break
    return findings


# ---------------------------------------------------------------------------
# discarded_expression (error)
# ---------------------------------------------------------------------------

VOID_LITERAL_RE = re.compile(
    r"^\s*\(\s*void\s*\)\s*[-+]?\s*(?:\d|\.\d|\"|')"
)
STRING_STATEMENT_RE = re.compile(r'^\s*"(?:\\.|[^"\\])*"\s*;\s*$')
PURE_CALL_RE = re.compile(
    r"^\s*(?P<callee>strcmp|strncmp|strlen|memcmp|strcasecmp|strncasecmp|wcslen|wcscmp)"
    r"\s*\(.*\)\s*;\s*$"
)
VOID_MEMBER_RE = re.compile(
    r"^\s*\(\s*void\s*\)\s*[A-Za-z_]\w*(?:(?:\.|->)[A-Za-z_]\w*)+\s*;\s*$"
)
ORDER_HELPER_NAME_RE = re.compile(r"^(?:order_\w*|\w*_order)$")
TODO_RE = re.compile(r"@todo|\bTODO\b|\bFIXME\b", re.IGNORECASE)


def _order_helper_exempt(lines: list[tuple[int, str]], index: int) -> bool:
    name, header_index = _enclosing_function(lines, index)
    if name is None or header_index < 0:
        return False
    if not ORDER_HELPER_NAME_RE.match(name.split("::")[-1]):
        return False
    for i in range(max(0, header_index - 3), min(len(lines), header_index + 4)):
        if TODO_RE.search(lines[i][1]):
            return True
    return False


def check_discarded_expression(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Statements whose only effect is to emit a literal or a pure-call string."""

    lines, _ = _analysis_lines(hunk)
    added = _added_set(hunk)
    findings: list[dict[str, Any]] = []
    for i, (lineno, raw) in enumerate(lines):
        if lineno not in added:
            continue
        stripped = raw.strip()
        if stripped.startswith(("//", "/*", "*")):
            continue
        clean = blank_line(raw)
        form = None
        if VOID_LITERAL_RE.match(raw) and not raw.lstrip().startswith(("//", "/*")):
            form = "void_literal"
        elif STRING_STATEMENT_RE.match(raw):
            form = "string_statement"
        elif PURE_CALL_RE.match(clean):
            form = "pure_call"
        elif VOID_MEMBER_RE.match(clean):
            form = "void_member"
        if form is None:
            continue
        if _order_helper_exempt(lines, i):
            continue
        findings.append(
            _finding(
                lineno,
                raw,
                "Discarded expression statement emits bytes without doing work "
                f"({form.replace('_', ' ')}). Real source does not carry "
                "no-op literals or pure calls; recover the code that uses the "
                f"value instead. {_title(STD_INERT)}.",
                form=form,
            )
        )
    return findings


# ---------------------------------------------------------------------------
# unused_static_data (error)
# ---------------------------------------------------------------------------

STATIC_DATA_RE = re.compile(
    r"^static\s+(?P<const>const\s+)?(?!inline\b|void\b)"
    r"(?P<type>[A-Za-z_][\w:<>]*(?:\s+(?:const|unsigned|signed|long|short|int|char))*)"
    r"\s*[*&]*\s*(?P<name>[A-Za-z_]\w*)\s*(?P<arr>(?:\[[^\]]*\]\s*)+)?\s*(?:=|;)"
)
DUMMY_MARKER_RE = re.compile(r"//\s*dummy\s*:\s*emits", re.IGNORECASE)


def check_unused_static_data(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """File-scope static data with no reference elsewhere in the post file."""

    lines, whole_file = _analysis_lines(hunk)
    if not whole_file:
        return []
    added = _added_set(hunk)
    text = "\n".join(raw for _, raw in lines)
    clean_text = strip_comments_and_strings(text)
    findings: list[dict[str, Any]] = []
    for i, (lineno, raw) in enumerate(lines):
        if lineno not in added or not raw or raw[0].isspace():
            continue
        clean = blank_line(raw)
        match = STATIC_DATA_RE.match(clean)
        if not match:
            continue
        if not match.group("arr") and not match.group("const") and "=" not in clean:
            continue
        name = match.group("name")
        if len(re.findall(rf"\b{re.escape(name)}\b", clean_text)) > 1:
            continue
        marker_window = lines[max(0, i - 2) : i + 2]
        if any(DUMMY_MARKER_RE.search(t) for _, t in marker_window):
            continue
        findings.append(
            _finding(
                lineno,
                raw,
                f"`static` data `{name}` has no reference in this translation "
                "unit. Unreferenced statics exist only to emit section bytes; "
                "recover the code that owns the data or drop it. "
                f"{_title(STD_INERT)}.",
                symbol=name,
            )
        )
    return findings


# ---------------------------------------------------------------------------
# local_class_shadows_header (error; repo-aware)
# ---------------------------------------------------------------------------

LOCAL_CLASS_RE = re.compile(r"^(?:class|struct)\s+(?P<name>[A-Za-z_]\w*)\s*(?P<rest>.*)$")


def check_local_class_shadows_header(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """File-scope class definition in a .cpp that include/ already defines."""

    root = _repo_root_hint()
    if root is None:
        return []
    index = _include_index(root)
    if not index["available"]:
        return []
    findings: list[dict[str, Any]] = []
    added = hunk["added"]
    for i, (lineno, raw) in enumerate(added):
        clean = blank_line(raw)
        match = LOCAL_CLASS_RE.match(clean)
        if not match:
            continue
        rest = match.group("rest").strip()
        if rest.startswith(";"):
            continue  # forward declaration
        if "{" not in rest:
            nxt = blank_line(added[i + 1][1]).strip() if i + 1 < len(added) else ""
            if not nxt.startswith(("{", ":")):
                continue
        name = match.group("name")
        if name not in index["class_defs"]:
            continue
        findings.append(
            _finding(
                lineno,
                raw,
                f"File-scope `class {name}` re-defines a class that `include/` "
                "already declares. A placeholder layout in the .cpp violates the "
                "one-definition rule and hides the real header; include the "
                f"owner and fix its layout there. {_title(STD_SYMBOL)}.",
                class_name=name,
            )
        )
    return findings


# ---------------------------------------------------------------------------
# fixed_fn_pointer_call (warning)
# ---------------------------------------------------------------------------

FN_PTR_LOCAL_RE = re.compile(
    r"^\s+[A-Za-z_][\w:<>]*\s*\*?\s*\(\s*\*\s*(?P<name>[A-Za-z_]\w*)\s*\)\s*\([^)]*\)"
    r"\s*=\s*&?\s*[A-Za-z_][\w:<>]*\s*;"
)


def check_fixed_fn_pointer_call(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Local function pointer bound to a fixed function and called at once."""

    lines, _ = _analysis_lines(hunk)
    added = _added_set(hunk)
    findings: list[dict[str, Any]] = []
    for i, (lineno, raw) in enumerate(lines):
        if lineno not in added:
            continue
        match = FN_PTR_LOCAL_RE.match(blank_line(raw))
        if not match:
            continue
        name = match.group("name")
        call_re = re.compile(rf"\b{re.escape(name)}\s*\(")
        window = [blank_line(t) for _, t in lines[i + 1 : i + 5] if t.strip()]
        if any(call_re.search(t) for t in window[:3]):
            findings.append(
                _finding(
                    lineno,
                    raw,
                    f"Function pointer `{name}` is bound to a fixed function and "
                    "called immediately. This steers the call sequence; the "
                    "authored source calls the function (or a header inline) "
                    f"directly. {_title(STD_TACTICS)}.",
                    name=name,
                )
            )
    return findings


# ---------------------------------------------------------------------------
# storage_widening (warning)
# ---------------------------------------------------------------------------

WIDEN_PAIRS = {
    ("Mtx", "Mtx44"),
    ("s8", "s16"), ("s8", "s32"), ("s16", "s32"), ("s32", "s64"),
    ("u8", "u16"), ("u8", "u32"), ("u16", "u32"), ("u32", "u64"),
    ("f32", "f64"), ("float", "double"),
    ("char", "short"), ("char", "int"), ("short", "int"), ("int", "long"),
    ("bool", "int"), ("bool", "u32"), ("bool", "s32"),
}
DECL_RE = re.compile(
    r"^\s*(?:(?:static|const|volatile|unsigned|signed)\s+)*"
    r"(?P<type>[A-Za-z_][\w:<>]*)\s+(?P<name>[A-Za-z_]\w*)\s*"
    r"(?:\[(?P<len>[^\]]*)\])?\s*(?:;|=)"
)
SNPRINTF_RE = re.compile(r"\bsnprintf\s*\(\s*(?P<buf>[A-Za-z_]\w*)\s*,\s*(?P<n>\d+)\s*,")


def _decl(text: str) -> dict[str, str] | None:
    match = DECL_RE.match(blank_line(text))
    if not match:
        return None
    return {"type": match.group("type"), "name": match.group("name"), "len": match.group("len") or ""}


def check_storage_widening(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Same-declaration type or buffer growth, and oversized snprintf buffers."""

    findings: list[dict[str, Any]] = []
    removed = [d for d in (_decl(t) for t in hunk["removed"]) if d]
    by_name = {d["name"]: d for d in removed}
    for lineno, raw in hunk["added"]:
        decl = _decl(raw)
        if not decl or decl["name"] not in by_name:
            continue
        before = by_name[decl["name"]]
        reason = None
        if (before["type"], decl["type"]) in WIDEN_PAIRS:
            reason = f"type widened `{before['type']}` -> `{decl['type']}`"
        elif (
            before["type"] == decl["type"]
            and before["len"].strip().isdigit()
            and decl["len"].strip().isdigit()
            and int(decl["len"]) > int(before["len"])
        ):
            reason = f"buffer grown [{before['len'].strip()}] -> [{decl['len'].strip()}]"
        if reason:
            findings.append(
                _finding(
                    lineno,
                    raw,
                    f"Declaration `{decl['name']}`: {reason}. Widening storage to "
                    "move the stack or data layout is a matching tactic; keep the "
                    "type the API expects and record objdiff evidence if it must "
                    f"stay. {_title(STD_TACTICS)}.",
                    name=decl["name"],
                    form="widened_declaration",
                )
            )
    lines, _ = _analysis_lines(hunk)
    sizes: dict[str, int] = {}
    for _, raw in lines:
        decl = _decl(raw)
        if decl and decl["len"].strip().isdigit():
            sizes[decl["name"]] = int(decl["len"])
    for lineno, raw in hunk["added"]:
        match = SNPRINTF_RE.search(blank_line(raw))
        if not match:
            continue
        buf, n = match.group("buf"), int(match.group("n"))
        if buf in sizes and sizes[buf] > n:
            findings.append(
                _finding(
                    lineno,
                    raw,
                    f"`snprintf({buf}, {n}, ...)` writes at most {n} bytes but "
                    f"`{buf}` is declared with {sizes[buf]}. The oversized buffer "
                    "only shapes the stack frame; size it to the length passed. "
                    f"{_title(STD_TACTICS)}.",
                    name=buf,
                    form="oversized_snprintf_buffer",
                    declared=sizes[buf],
                    passed=n,
                )
            )
    return findings


# ---------------------------------------------------------------------------
# duplicated_inline_body (warning; repo-aware)
# ---------------------------------------------------------------------------


def check_duplicated_inline_body(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Added statement block token-identical to a header body or another block."""

    root = _repo_root_hint()
    lines, whole_file = _analysis_lines(hunk)
    added = _added_set(hunk)
    header_windows: dict[str, str] = {}
    if root is not None:
        header_windows = _include_index(root)["windows"]
    if not header_windows and not whole_file:
        return []
    statements = _statement_lines([raw for _, raw in lines])
    added_stmts = [(idx, text) for idx, text in statements if lines[idx][0] in added]
    other_stmts = [(idx, text) for idx, text in statements if lines[idx][0] not in added]
    added_windows = _window_hashes(added_stmts)
    other_windows = _window_hashes(other_stmts) if whole_file else {}
    findings: list[dict[str, Any]] = []
    reported: set[int] = set()
    for digest, first_index in sorted(added_windows.items(), key=lambda kv: kv[1]):
        source = None
        if digest in header_windows:
            source = header_windows[digest]
        elif digest in other_windows:
            source = f"{hunk.get('file')}:{lines[other_windows[digest]][0]}"
        if source is None:
            continue
        if any(abs(first_index - r) < STATEMENT_WINDOW for r in reported):
            continue
        reported.add(first_index)
        lineno, raw = lines[first_index]
        findings.append(
            _finding(
                lineno,
                raw,
                f"{STATEMENT_WINDOW}+ consecutive statements are token-identical "
                f"to a body in `{source}`. Expanded inline bodies are rejected; "
                f"call the inline instead. {_title(STD_HEADER_INLINES)}.",
                duplicate_of=source,
            )
        )
    return findings


# ---------------------------------------------------------------------------
# single_use_wrapper (warning)
# ---------------------------------------------------------------------------

STATIC_INLINE_RE = re.compile(
    r"\bstatic\s+inline\s+[^;{}()]*?\b(?P<name>[A-Za-z_]\w*)\s*\([^;{}()]*\)\s*(?:const\s*)?\{"
)
MARKER_RE = re.compile(r"fabricated|fake|\bTODO\b|@todo", re.IGNORECASE)


def check_single_use_wrapper(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Trivial static inline with one expression and exactly one call site."""

    lines, whole_file = _analysis_lines(hunk)
    if not whole_file:
        return []
    added = _added_set(hunk)
    text, starts = _joined(lines)
    clean = strip_comments_and_strings(text)
    findings: list[dict[str, Any]] = []
    for match in STATIC_INLINE_RE.finditer(clean):
        header_index = _index_at(starts, match.start())
        name_index = _index_at(starts, match.start("name"))
        if lines[header_index][0] not in added and lines[name_index][0] not in added:
            continue
        close = _brace_body(clean, match.end() - 1)
        body = clean[match.end() : close]
        if body.count(";") != 1 or re.search(r"\b(?:if|for|while|switch|do)\b", body):
            continue
        name = match.group("name")
        calls = len(re.findall(rf"\b{re.escape(name)}\s*\(", clean)) - 1
        if calls != 1:
            continue
        window = lines[max(0, header_index - 2) : name_index + 1]
        if any(MARKER_RE.search(raw) for _, raw in window):
            continue
        lineno, raw = lines[name_index]
        findings.append(
            _finding(
                lineno,
                raw,
                f"`static inline {name}` wraps one expression and has a single "
                "call site. A fabricated wrapper is a stack/register tactic unless "
                "it mirrors a lost inline; mark it (`// fabricated` / TODO) with "
                f"the evidence or fold it back. {_title(STD_STYLE)}.",
                name=name,
            )
        )
    return findings


# ---------------------------------------------------------------------------
# guard_removal (warning)
# ---------------------------------------------------------------------------

LOGIC_SPLIT_RE = re.compile(r"\s*(?:&&|\|\|)\s*")


def _terms(text: str) -> list[str]:
    clean = blank_line(text).strip()
    clean = re.sub(r"^\}?\s*(?:else\s+)?(?:if|while|return)\b\s*", "", clean)
    parts = [p.strip(" ();{}") for p in LOGIC_SPLIT_RE.split(clean)]
    return ["".join(p.split()) for p in parts if p and IDENT_RE.search(p)]


def _ident_tokens(text: str) -> set[str]:
    return set(IDENT_RE.findall(blank_line(text)))


def check_guard_removal(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Removed condition term absent from the replacing added line."""

    findings: list[dict[str, Any]] = []
    added = hunk["added"]
    for removed in hunk["removed"]:
        clean_removed = blank_line(removed)
        if "&&" not in clean_removed and "||" not in clean_removed:
            continue
        terms = _terms(removed)
        if len(terms) < 2:
            continue
        removed_tokens = _ident_tokens(removed)
        best, best_score = None, 0.0
        for lineno, raw in added:
            tokens = _ident_tokens(raw)
            if not tokens or not removed_tokens:
                continue
            score = len(tokens & removed_tokens) / len(tokens | removed_tokens)
            if score > best_score:
                best, best_score = (lineno, raw), score
        if best is None or best_score < 0.4:
            continue
        added_flat = "".join(blank_line(best[1]).split())
        all_added_flat = "".join("".join(blank_line(r).split()) for _, r in added)
        present = [t for t in terms if t in added_flat]
        missing = [t for t in terms if t not in all_added_flat]
        if not present or not missing:
            continue
        if len(_terms(best[1])) >= len(terms):
            continue  # same term count: a rewritten term, not a dropped guard
        # Added terms that were not already present in the removed condition:
        # a missing term that shares half its identifiers with one of them was
        # rewritten (renamed accessor, hoisted local), not dropped.
        added_terms = [t for _, r in added for t in _terms(r) if t not in terms]

        def rewritten(term: str) -> bool:
            idents = set(IDENT_RE.findall(term))
            return any(
                idents and len(idents & set(IDENT_RE.findall(other))) * 2 >= len(idents)
                for other in added_terms
            )

        missing = [t for t in missing if not rewritten(t)]
        if not missing:
            continue
        findings.append(
            _finding(
                best[0],
                best[1],
                f"Condition term `{missing[0]}` from the removed line is gone from "
                "the replacement. Dropping a guard changes behavior; keep the term "
                "or record the target instruction window that proves it absent. "
                f"{_title(STD_LEDGER)}.",
                removed_terms=missing,
                removed_line=removed.strip(),
            )
        )
    return findings


# ---------------------------------------------------------------------------
# unassigned_member_deref (warning)
# ---------------------------------------------------------------------------

LOCAL_CLASS_BODY_RE = re.compile(
    r"(?<![\w:])(?:class|struct)\s+(?P<name>[A-Za-z_]\w*)\s*(?::[^{;]*)?\{"
)
MEMBER_DECL_RE = re.compile(
    r"(?m)^\s*(?!return\b|static\b|typedef\b|public\b|private\b|protected\b|virtual\b)"
    r"(?:const\s+)?[A-Za-z_][\w:<>]*\s*[*&]*\s+(?P<name>[A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)*;"
)
DEREF_RE = re.compile(r"(?:->|\.)\s*(?P<name>[A-Za-z_]\w*)\b(?!\s*\()")


def check_unassigned_member_deref(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Read of a locally declared member that nothing in the TU assigns."""

    lines, whole_file = _analysis_lines(hunk)
    if not whole_file:
        return []
    added = _added_set(hunk)
    text, starts = _joined(lines)
    clean = strip_comments_and_strings(text)
    members: dict[str, str] = {}
    for match in LOCAL_CLASS_BODY_RE.finditer(clean):
        close = _brace_body(clean, match.end() - 1)
        body = clean[match.end() : close]
        for decl in MEMBER_DECL_RE.finditer(body):
            members.setdefault(decl.group("name"), match.group("name"))
    if not members:
        return []
    # Variables typed with a local class: declared in this file, or in the
    # header sharing the .cpp stem (the usual owner of `TParams* mParams;`).
    scopes = [clean]
    root = _repo_root_hint()
    if root is not None and hunk.get("file"):
        own = _include_index(root)["by_stem"].get(Path(hunk["file"]).stem)
        if own:
            scopes.append(own["text"])
    bases: set[str] = set()
    for class_name in set(members.values()):
        for scope in scopes:
            for decl in re.finditer(
                rf"\b{re.escape(class_name)}\s*[*&]*\s+([A-Za-z_]\w*)\s*(?:;|=|,|\)|\[)", scope
            ):
                bases.add(decl.group(1))
    if not bases:
        return []
    findings: list[dict[str, Any]] = []
    reported: set[str] = set()
    for lineno, raw in lines:
        if lineno not in added:
            continue
        clean_line = blank_line(raw)
        for match in DEREF_RE.finditer(clean_line):
            name = match.group("name")
            if name not in members or name in reported:
                continue
            base = re.search(rf"([A-Za-z_]\w*)\s*(?:->|\.)\s*{re.escape(name)}\b", clean_line[: match.end()])
            if base is None or base.group(1) not in bases:
                continue
            if re.search(rf"\b{re.escape(name)}\s*(?:\.|->)\s*[A-Za-z_]\w*\s*\(", clean):
                continue  # a method is invoked on it somewhere: possible mutation
            if re.search(rf"(?:->|\.|\b)\s*{re.escape(name)}\s*(?:[-+*/|&^]|<<|>>)?=(?!=)", clean):
                continue
            if re.search(rf"[:,]\s*{re.escape(name)}\s*\(", clean):
                continue  # constructor initializer
            if re.search(rf"\b(?:sizeof|offsetof)\s*\([^)]*\b{re.escape(name)}\b", clean_line):
                continue
            reported.add(name)
            findings.append(
                _finding(
                    lineno,
                    raw,
                    f"`{name}` (declared in local `{members[name]}`) is read here but "
                    "nothing in this translation unit ever assigns it. The consumer "
                    "reads storage that is never written, which points at a "
                    f"placeholder layout. {_title(STD_TYPED)}.",
                    member=name,
                    owner=members[name],
                )
            )
    return findings


# ---------------------------------------------------------------------------
# arg_order_change (warning)
# ---------------------------------------------------------------------------

COMMUTATIVE_CALLEES = {"max", "min", "MAX", "MIN", "swap", "dot", "cross", "memcmp", "strcmp"}
CALL_START_RE = re.compile(r"\b(?P<callee>[A-Za-z_][\w:]*(?:<[^<>()]*>)?)\s*\(")
KEYWORD_CALLEES = {"if", "for", "while", "switch", "return", "sizeof", "else"}


def _calls(text: str) -> list[tuple[str, list[str]]]:
    clean = blank_line(text)
    out: list[tuple[str, list[str]]] = []
    for match in CALL_START_RE.finditer(clean):
        callee = match.group("callee")
        if callee in KEYWORD_CALLEES:
            continue
        depth = 0
        args: list[str] = []
        current: list[str] = []
        end = None
        for i in range(match.end() - 1, len(clean)):
            c = clean[i]
            if c in "([{":
                depth += 1
                if depth == 1:
                    continue
            elif c in ")]}":
                depth -= 1
                if depth == 0:
                    end = i
                    break
            if c == "," and depth == 1:
                args.append("".join(current))
                current = []
            else:
                current.append(c)
        if end is None:
            continue
        args.append("".join(current))
        normalized = ["".join(a.split()) for a in args if a.strip()]
        if len(normalized) >= 2:
            out.append((callee, normalized))
    return out


def check_arg_order_change(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Same callee, same argument multiset, permuted order between -/+ lines."""

    removed_calls: list[tuple[str, list[str], str]] = []
    for removed in hunk["removed"]:
        for callee, args in _calls(removed):
            removed_calls.append((callee, args, removed))
    if not removed_calls:
        return []
    findings: list[dict[str, Any]] = []
    for lineno, raw in hunk["added"]:
        for callee, args in _calls(raw):
            if callee.split("::")[-1] in COMMUTATIVE_CALLEES:
                continue
            for r_callee, r_args, r_text in removed_calls:
                if r_callee != callee or r_args == args:
                    continue
                if sorted(r_args) != sorted(args):
                    continue
                findings.append(
                    _finding(
                        lineno,
                        raw,
                        f"Call to `{callee}` keeps the same arguments in a different "
                        "order than the removed line. Permuting arguments changes "
                        "semantics on a non-commutative callee; confirm against the "
                        f"target instruction window. {_title(STD_LEDGER)}.",
                        callee=callee,
                        before=r_args,
                        after=args,
                        removed_line=r_text.strip(),
                    )
                )
                break
    return findings


# ---------------------------------------------------------------------------
# cancelling_arithmetic (review tier)
# ---------------------------------------------------------------------------

CANCEL_PATTERNS = [
    (re.compile(r"(?<![-\w])-\s+-\s*[\w(]"), "double negation `- -x`"),
    (re.compile(r"[\w)\]]\s*\+\s+-\s*[\w(]"), "add of a negation `+ -x`"),
    (re.compile(r"[\w)\]]\s*-\s*0\.0+[fF]?\b"), "subtract zero `x - 0.0f`"),
    (re.compile(r"\(\s*([A-Za-z_]\w*(?:(?:->|\.)[A-Za-z_]\w*)*)\s*-\s*\1\s*\)"), "self subtraction `(a - a)`"),
]


def check_cancelling_arithmetic(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Arithmetic that cancels out yet steers the emitted instruction stream."""

    findings: list[dict[str, Any]] = []
    for lineno, raw in hunk["added"]:
        clean = blank_line(raw)
        if clean.lstrip().startswith("#"):
            continue
        for pattern, label in CANCEL_PATTERNS:
            if pattern.search(clean):
                findings.append(
                    _finding(
                        lineno,
                        raw,
                        f"Cancelling arithmetic ({label}) shapes codegen without "
                        "changing the value. Reviewer: check whether the target "
                        "really negates a stored negative or whether this is a "
                        f"sign hack. {_title(STD_TACTICS)}.",
                        form=label,
                    )
                )
                break
    return findings


# ---------------------------------------------------------------------------
# layout_cue_local (review tier)
# ---------------------------------------------------------------------------

UNION_LOCAL_RE = re.compile(r"^\s+union\s*(?:[A-Za-z_]\w*\s*)?\{")
ONE_ELEMENT_ARRAY_RE = re.compile(
    r"^\s+(?:const\s+)?[A-Za-z_][\w:<>]*\s+(?P<name>[A-Za-z_]\w*)\s*\[\s*1\s*\]\s*;"
)
SELF_THIS_RE = re.compile(r"^\s+[A-Za-z_][\w:<>]*\s*\*\s*(?P<name>[A-Za-z_]\w*)\s*=\s*this\s*;")
LITERAL_LOCAL_RE = re.compile(
    r"^\s+(?:const\s+)?(?:f32|float|f64|double|s32|int|u32|s16|u16|u8|s8|bool)\s+"
    r"(?P<name>[A-Za-z_]\w*)\s*=\s*[-+]?(?:\d+\.?\d*(?:[eE][-+]?\d+)?[fF]?|0[xX][0-9A-Fa-f]+|true|false)\s*;"
)


def check_layout_cue_local(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Locals whose only plausible purpose is stack layout or register shaping."""

    lines, whole_file = _analysis_lines(hunk)
    added = _added_set(hunk)
    findings: list[dict[str, Any]] = []
    for i, (lineno, raw) in enumerate(lines):
        if lineno not in added:
            continue
        clean = blank_line(raw)
        label = None
        if UNION_LOCAL_RE.match(clean):
            window = " ".join(blank_line(t) for _, t in lines[i : i + 6])
            if re.search(r"\bu64\b", window) and re.search(r"\bchar\s+\w+\s*\[", window):
                label = "u64/char alignment union"
        elif ONE_ELEMENT_ARRAY_RE.match(clean):
            label = "single-element array"
        elif SELF_THIS_RE.match(clean):
            label = "`T* self = this` alias"
        else:
            match = LITERAL_LOCAL_RE.match(clean)
            if match and whole_file:
                name = match.group("name")
                _, header = _enclosing_function(lines, i)
                end = _function_end(lines, i)
                body = "\n".join(blank_line(t) for _, t in lines[max(header, 0) : end + 1])
                if len(re.findall(rf"\b{re.escape(name)}\b", body)) == 2:
                    label = "literal-initialized local used once"
        if label is None:
            continue
        findings.append(
            _finding(
                lineno,
                raw,
                f"Layout cue local ({label}). Reviewer: this local shapes the stack "
                "or register allocation rather than expressing source; confirm it "
                f"against objdiff or fold it back into the expression. {_title(STD_TACTICS)}.",
                form=label,
            )
        )
    return findings


# ---------------------------------------------------------------------------
# Post-scan hook: run repo-aware rules with the scanner's repo root.
# ---------------------------------------------------------------------------

REPO_AWARE_RULE_IDS = {
    "local_class_shadows_header",
    "scalar_member_index",
    "duplicated_inline_body",
}


def _post_text_for_hook(
    repo: Path, rel_path: str, mode: str, file_diffs: list[dict[str, Any]]
) -> str | None:
    if mode != "diff":
        try:
            import scan_diff  # type: ignore

            return scan_diff.post_diff_file_text(repo, rel_path, mode, file_diffs)
        except Exception:  # pragma: no cover - defensive
            return None
    root = os.environ.get(POST_TREE_ENV)
    if root and (Path(root) / rel_path).is_file():
        return (Path(root) / rel_path).read_text(encoding="utf-8", errors="replace")
    return None


def resolve_repo_aware_rules(
    findings: list[dict[str, Any]],
    repo: Path,
    mode: str,
    file_diffs: list[dict[str, Any]],
    merge_base: str | None,
) -> list[dict[str, Any]]:
    """Re-run the include/-dependent rules now that the repo root is known."""

    global _FORCED_ROOT
    if _repo_root_hint() is not None:
        return findings  # already ran inline via env root
    import _qa_rules  # type: ignore

    repo_rules = [rule for rule in RULES if rule["rule_id"] in REPO_AWARE_RULE_IDS]
    extra: list[dict[str, Any]] = []
    _FORCED_ROOT = Path(repo)
    try:
        for record in file_diffs:
            if not path_matches(record["file"], APPLIES_TO):
                continue
            post_text = _post_text_for_hook(Path(repo), record["file"], mode, file_diffs)
            for hunk in record["hunks"]:
                hunk_for_rules = {**hunk, "post_file_text": post_text}
                extra.extend(_qa_rules.run_rules_on_hunk(repo_rules, hunk_for_rules))
    finally:
        _FORCED_ROOT = None
    return findings + extra


POST_SCAN_HOOKS: list[Callable[..., list[dict[str, Any]]]] = [resolve_repo_aware_rules]


# ---------------------------------------------------------------------------
# Registry.
# ---------------------------------------------------------------------------


def _rule(
    rule_id: str,
    severity: str,
    standard_id: str,
    check: Callable[[dict[str, Any]], list[dict[str, Any]]],
    message: str,
    **extra: Any,
) -> dict[str, Any]:
    rule: dict[str, Any] = {
        "rule_id": rule_id,
        "severity": severity,
        "standard_id": standard_id,
        "check": check,
        "message": message,
        "applies_to": APPLIES_TO,
        "excludes": VENDOR_EXCLUDES,
    }
    rule.update(extra)
    return rule


RULES: list[dict[str, Any]] = [
    _rule("dangling_ref_return", "error", STD_LEDGER, check_dangling_ref_return,
          "Reference returned to a by-value parameter or automatic local."),
    _rule("scalar_member_index", "error", STD_TYPED, check_scalar_member_index,
          "Pointer to a scalar member indexed or offset as an array."),
    _rule("header_override_macro", "error", STD_SYMBOL, check_header_override_macro,
          "Macro predefines a header guard or renames an identifier around an include."),
    _rule("mangled_symbol_in_source", "error", STD_SYMBOL, check_mangled_symbol_in_source,
          "Hand-mangled symbol or extern \"C\" spoof in C++ game code."),
    _rule("manual_vtable", "error", STD_SYMBOL, check_manual_vtable,
          "Hand-written vtable array."),
    _rule("discarded_expression", "error", STD_INERT, check_discarded_expression,
          "Discarded literal, string, pure call, or member read used as a statement."),
    _rule("unused_static_data", "error", STD_INERT, check_unused_static_data,
          "File-scope static data with no reference in the translation unit."),
    _rule("local_class_shadows_header", "error", STD_SYMBOL, check_local_class_shadows_header,
          "File-scope class in a .cpp re-defines a header-owned class."),
    _rule("fixed_fn_pointer_call", "warning", STD_TACTICS, check_fixed_fn_pointer_call,
          "Fixed function pointer local called immediately."),
    _rule("storage_widening", "warning", STD_TACTICS, check_storage_widening,
          "Declaration widened or buffer oversized versus its use."),
    _rule("duplicated_inline_body", "warning", STD_HEADER_INLINES, check_duplicated_inline_body,
          "Added block duplicates a header inline body or another block in the file."),
    _rule("single_use_wrapper", "warning", STD_STYLE, check_single_use_wrapper,
          "Trivial single-use static inline wrapper without a marker."),
    _rule("guard_removal", "warning", STD_LEDGER, check_guard_removal,
          "Condition term dropped from the replacing line."),
    _rule("unassigned_member_deref", "warning", STD_TYPED, check_unassigned_member_deref,
          "Member of a local placeholder class read but never assigned."),
    _rule("arg_order_change", "warning", STD_LEDGER, check_arg_order_change,
          "Same call with permuted arguments."),
    _rule("cancelling_arithmetic", "info", STD_TACTICS, check_cancelling_arithmetic,
          "Cancelling arithmetic used to shape codegen.", llm_review=True),
    _rule("layout_cue_local", "info", STD_TACTICS, check_layout_cue_local,
          "Local exists only to shape stack or register layout.", llm_review=True),
]
