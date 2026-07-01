#!/usr/bin/env python3
"""Shared QA ship-gate rules for review_lint.

Implements the deterministic maintainer-rejection rules from the QA ship
gate flow (docs/10-system-design/60-score-and-pr-handoff.md):

- ``extern_literal_anchor``: added ``extern`` declarations that anchor a
  literal by address-style name (``lbl_804DA60C``-shaped).
- ``function_extern_visibility``: added function ``extern`` declarations that
  can hide same-TU function bodies from MWCC inline decisions.
- ``string_literal_to_symbol``: a string literal argument replaced by a data
  symbol or pointer-offset expression within the same hunk.
- ``numeric_literal_to_symbol``: a numeric literal replaced by an address-style
  data symbol within the same hunk.
- ``packed_string_blob``: hand-packed ``\\0``-padded string blobs and
  pointer-offset ``#define`` macros over address-style symbols.
- ``copied_jobj_inline``: local copies of ``jobj.h`` inline helper bodies in
  stage/source TUs instead of calls to the canonical ``HSD_JObj*`` helpers.
- ``stage_ground_var_owner``: new stage ``gv.<member>`` accesses that borrow a
  different stage's GroundVars union arm instead of using the owning stage arm.
- ``unrolled_assert``: open-coded ``__assert``/``__assert_msg`` call sites
  where the source idiom is ``HSD_ASSERT*``.
- ``fake_assert_macro`` / ``assert_idiom_downgrade``: local assert/report macro
  clones and hunks that replace project assert macros with raw asserts/reports.
- ``register_keyword`` / ``inline_asm`` / ``novel_pragma``: exceptional codegen
  steering introduced in normal ``src/`` code.
- ``pointer_offset_arithmetic`` / ``address_named_static_data`` /
  ``codegen_pragma`` / ``volatile_local_tactic``: recurring source-quality
  issues from recent PR review that are deterministic enough to flag.
- ``m2c_residue_names`` / ``m2c_goto_label`` / ``m2c_field_use``: generated C
  residue that should not reach the ship gate.
- ``define_alias`` / ``type_erasing_cast``: define aliases over names/expressions
  and raw type-erasing casts that need review.
- data-driven banned-pattern rules loaded from
  ``projects/melee/knowledge/sources/injectable/banned_patterns/data/banned.jsonl``.
- resubmission tombstones (fuzzy token-shingle hashes of previously rejected
  hunks) loaded from ``.../banned_patterns/data/tombstones.jsonl``.

The module is shared by ``scan.py`` (whole-file advisory mode) and
``scan_diff.py`` (diff-aware gate mode).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from fnmatch import fnmatch
from pathlib import Path
from typing import Any, Callable

TOOL_ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(Path(__file__).resolve().parents[3] / "_shared"))
from search_index import package_root_for_tool, project_knowledge_root  # type: ignore

ORCHESTRATOR_ROOT = package_root_for_tool(TOOL_ROOT)
BANNED_DIR_ENV = "REVIEW_LINT_BANNED_DIR"
DEFAULT_BANNED_DIR = (
    project_knowledge_root(TOOL_ROOT) / "sources" / "injectable" / "banned_patterns" / "data"
)

DEFAULT_APPLIES_TO = ["src/**/*.c"]

# Identifier ending in an encoded address: lbl_804DA60C, ftColl_804D82E0,
# un_803FF074, grKg_803E1A00, ...
ADDRESS_NAME_RE = re.compile(r"\b[A-Za-z_]\w*_8[0-9A-Fa-f]{7}\b")
ADDRESS_SUFFIX_RE = re.compile(r"_(8[0-9A-Fa-f]{7})$")

FLOAT_TYPES = {"f32", "f64", "float", "double"}
STRING_TYPES = {"char", "u8"}

SDATA2_ORDER_HELPER_TOOL_ID = "review_lint_sdata2_order_helper"
SDATA2_ORDER_HELPER_SCRIPT = (
    "toolpacks/gamecube-decomp/source_editing/review_lint/api/sdata2_order_helper.py"
)
MELEE_SDATA2_START = 0x804D79E0
MELEE_SDATA2_END = 0x804DEC00
NUMERIC_DATA_REPAIR_HINT = (
    "Restore the numeric literal in ordinary logic. If the only remaining "
    "exact-match gap is .sdata2 float/double order, use an isolated "
    "sdata2_order helper generated from the reference object instead of "
    "referencing address-named data from the function body."
)
STRING_DATA_REPAIR_HINT = (
    "Restore the string literal at the call site. Do not replace review-facing "
    "string literals with address-named data symbols or pointer-offset aliases."
)
ADDRESS_DATA_REPAIR_HINT = (
    "Remove the address-named data definition unless this change is explicitly "
    "scoped to evidenced data ownership. Keep ordinary literals inline; for a "
    "pure .sdata2 float/double ordering gap, use an isolated sdata2_order helper."
)

# `extern [const] <type> [const] name[optional array];` with NO initializer.
EXTERN_DECL_RE = re.compile(
    r"^\s*extern\s+(?:(?:const|volatile)\s+)*"
    r"(?P<ctype>f32|f64|float|double|char|u8)\b"
    r"(?:\s+(?:const|volatile))*"
    r"\s+(?P<name>[A-Za-z_]\w*_8[0-9A-Fa-f]{7})"
    r"\s*(?P<array>\[[^\]]*\])?\s*;\s*$"
)
FUNCTION_EXTERN_DECL_RE = re.compile(
    r"^\s*extern\s+(?P<return_type>.+?)\b(?P<name>[A-Za-z_]\w*)"
    r"\s*\((?P<params>[^;{}]*)\)\s*;\s*$"
)

# `static char name[0xNN] =` (blob declarations; `char*` tables do not match).
BLOB_DECL_RE = re.compile(
    r"(?:static\s+)?(?:unsigned\s+)?char\s+(?P<name>[A-Za-z_]\w*)"
    r"\s*\[\s*(?:(?:0[xX][0-9A-Fa-f]+|\d+)\s*)?\]\s*="
)
STRING_LIT_RE = re.compile(r'"(?:\\.|[^"\\])*"')

# `#define NAME (lbl_8XXXXXXX + 0xNN)` pointer-offset macro.
PTR_OFFSET_DEFINE_RE = re.compile(
    r"^\s*#\s*define\s+\w+\s+\(?\s*"
    r"(?P<base>[A-Za-z_]\w*_8[0-9A-Fa-f]{7})\s*\+\s*0[xX][0-9A-Fa-f]+\s*\)?\s*$"
)

ASSERT_CALL_RE = re.compile(r"\b__assert(?:_msg)?\s*\(")
OSREPORT_CALL_RE = re.compile(r"\bOSReport\s*\(")
HSD_ASSERT_CALL_RE = re.compile(r"\bHSD_ASSERT\w*\s*\(")

DEFINE_START_RE = re.compile(r"^\s*#\s*define\s+(?P<name>[A-Za-z_]\w*)(?P<after>.*)$")
ASSERT_MACRO_NAME_RE = re.compile(r"(?:^|_)ASSERT(?:MSG|REPORT)?$")

REGISTER_DECL_RE = re.compile(
    r"\bregister\s+"
    r"(?:(?:const|volatile|signed|unsigned|long|short|struct\s+[A-Za-z_]\w*)\s+)*"
    r"[A-Za-z_]\w*(?:\s*\*+\s*|\s+)+[A-Za-z_]\w*\b"
)
INLINE_ASM_RE = re.compile(r"\b(?:asm|__asm__)\s*(?:\{|volatile\b|\()")
M2C_REGISTER_NAME_RE = re.compile(r"\b(?:temp|var|phi)_[rf]\d+\w*\b")
SP_LOCAL_DECL_RE = re.compile(
    r"^\s*(?:(?:static|const|volatile|unsigned|signed|long|short|struct\s+[A-Za-z_]\w*)\s+)*"
    r"[A-Za-z_]\w*(?:\s*\*+\s*|\s+)+(?P<name>sp[0-9A-Fa-f]{2,})\b"
)
BLOCK_GOTO_RE = re.compile(r"\bgoto\s+(?P<label>block_\d+)\s*;")
BLOCK_LABEL_RE = re.compile(r"^\s*(?P<label>block_\d+)\s*:")
ANY_GOTO_RE = re.compile(r"\bgoto\s+(?P<label>[A-Za-z_]\w*)\s*;")
M2C_FIELD_RE = re.compile(r"\bM2C_FIELD\s*\(")
TYPE_ERASING_CAST_RE = re.compile(r"\(\s*(?:void|u8|char)\s*\*+\s*\)")
BYTE_POINTER_OFFSET_RE = re.compile(
    r"\(\s*(?P<cast>u8|char)\s*\*+\s*\)\s*"
    r"(?P<base>[A-Za-z_]\w*)"
    r"(?P<trailer>(?:\s*(?:->|\.)\s*[A-Za-z_]\w*|\s*\([^)]*\)|\s*)*)"
    r"\+\s*(?P<offset>0[xX][0-9A-Fa-f]+|\d+|[A-Za-z_]\w*\s*\*\s*(?:0[xX][0-9A-Fa-f]+|\d+))\b"
)
ADDRESS_NAMED_DATA_DEF_RE = re.compile(
    r"^\s*(?!extern\b)(?!typedef\b)"
    r"(?:(?:static|const|volatile|signed|unsigned|long|short|SDATA|RODATA|DATA)\s+)*"
    r"(?:(?:struct|union|enum)\s+[A-Za-z_]\w*\s+|[A-Za-z_]\w*(?:\s*\*+\s*|\s+)+)"
    r"(?P<name>[A-Za-z_]\w*_8[0-9A-Fa-f]{7})"
    r"\s*(?:\[[^\]]*\])?\s*(?:=|;)"
)
IDENT_RE = re.compile(r"^[A-Za-z_]\w*$")
MACRO_CANONICAL_SUFFIX_RE = re.compile(r"_(?:ABS|MIN|MAX|CLAMP)$")
CAST_ALIAS_RE = re.compile(r"^\(*\s*\([A-Za-z_]\w*(?:\s+[A-Za-z_]\w*)*\s*\*+\s*\)\s*[A-Za-z_]\w*\s*\)*$")
PRAGMA_RE = re.compile(r"^\s*#\s*pragma\s+(?P<body>.+?)\s*$")
ESTABLISHED_PRAGMAS = {
    "push",
    "pop",
    "dont_inline",
    "auto_inline",
    "force_active",
    "fp_contract",
    "global_optimizer",
    "pool_data",
    "clang diagnostic",
}
CODEGEN_PRAGMAS = {"dont_inline", "auto_inline", "global_optimizer", "pool_data"}
VOLATILE_LOCAL_DECL_RE = re.compile(
    r"^\s+"
    r"(?!(?:extern|typedef)\b)"
    r"(?:(?:static|const|signed|unsigned|long|short|struct\s+[A-Za-z_]\w*)\s+)*"
    r"volatile\s+"
    r"(?:(?:const|signed|unsigned|long|short|struct\s+[A-Za-z_]\w*)\s+)*"
    r"[A-Za-z_]\w*(?:\s*\*+\s*|\s+)+(?P<name>[A-Za-z_]\w*)\b"
)
JOBJ_ASSERT_LINE_RE = re.compile(
    r"\b__assert(?:_msg)?\s*\(\s*\"jobj\.h\"\s*,\s*(?P<line>0[xX][0-9A-Fa-f]+|\d+)"
)

# `ident + 0xNN` offset expression (string-table pointer arithmetic).
OFFSET_EXPR_RE = re.compile(r"\b(?P<base>[A-Za-z_]\w*)\s*\+\s*0[xX][0-9A-Fa-f]+\b")
NUMERIC_LITERAL_START_RE = re.compile(
    r"^(?:[-+]\s*)?(?:F32_MAX|0[xX][0-9A-Fa-f]+|(?:\d+(?:\.\d*)?|\.\d+)"
    r"(?:[eE][+-]?\d+)?[fFlLuU]*)\b"
)
LOCAL_JOBJ_INLINE_FUNC_RE = re.compile(
    r"\bstatic\s+(?:inline\s+)?[A-Za-z_]\w*(?:\s*\*+\s*|\s+)+"
    r"(?P<name>[A-Za-z_]\w*JObj[A-Za-z_0-9]*)\s*\("
)
JOBJ_INLINE_BODY_RE = re.compile(
    r"\b(?:HSD_JObjSetMtxDirtySub|JOBJ_MTX_DIRTY|JOBJ_MTX_INDEP_SRT)\b"
    r"|\bjobj\s*->\s*(?:flags|rotate|scale|translate)\b"
)
JOBJ_INLINE_HEADER_RE = re.compile(
    r"\bHSD_ASSERT(?:MSG)?\s*\(|^\s*#\s*define\s+__FILE__\b", re.MULTILINE
)
GV_MEMBER_RE = re.compile(r"\bgv\.(?P<member>[A-Za-z_][A-Za-z0-9_]*)\b")

STAGE_GV_FILE_ALLOW: dict[str, set[str]] = {
    "grbigblue.c": {"bigblue"},
    "grbigblueroute.c": {"bigblue", "bigblueroute2"},
    "grcastle.c": {f"castle{i}" for i in range(2, 13)} | {"castle"},
    "grcorneria.c": {"corneria", "corneria2", "arwing", "smashtaunt"},
    "grfigureget.c": {"figureget"},
    "grflatzone.c": {"flatzone", "flatzone2"},
    "grfourside.c": {"fourside", "fourside2", "foursideCrane", "foursideUfo"},
    "grgarden.c": {"garden", "garden2"},
    "grgreatbay.c": {"greatbay", "greatbay2", "greatbay3", "greatbay4"},
    "grgreens.c": {"greens", "greens2"},
    "grhomerun.c": {"homerun"},
    "gricemt.c": {"icemt", "icemt2"},
    "grinishie1.c": {"inishie1", "inishie12", "inishie13"},
    "grinishie2.c": {"inishie2", "inishie22", "inishie23"},
    "grizumi.c": {"izumi", "izumi2", "izumi3"},
    "grkinokoroute.c": {"kinokoroute", "kinokoroute2"},
    "grkongo.c": {"kongo", "kongo2", "kongo3"},
    "grkraid.c": {"kraid", "kraid2"},
    "grmutecity.c": {"mutecity", "mutecity2"},
    "groldkongo.c": {"oldkongo"},
    "groldpupupu.c": {"oldpupupu", "oldpupupu2"},
    "groldyoshi.c": {"oldyoshicloud", "oldyoshiguest"},
    "gronett.c": {"onett", "onett_building", "onettcar"},
    "grpura.c": {"pura", "pura2", "pura3"},
    "grrcruise.c": {"rcruise", "rcruise2"},
    "grshrineroute.c": {"shrineroute", "shrineroute2", "shrineroute3"},
    "grvenom.c": {"venom", "venom2", "smashtaunt"},
    "gryorster.c": {"yorster"},
    "grzebes.c": {"zebes", "zebes2", "zebes3", "zebes4", "zebes5"},
    "grzebesroute.c": {"zebes2"},
}
GENERIC_GV_MEMBERS = {"pad_0", "unk"}

# Files where a raw __assert call is legitimately allowed. Macro-definition
# headers (src/sysdolphin/baselib/debug.h etc.) are already excluded because
# the rules only apply to .c files; macro-continuation lines inside .c files
# are skipped structurally, so the allowlist starts empty.
ASSERT_ALLOWLIST: list[str] = []

STANDARD_TITLES = {
    "global_standard:typed-fields-over-pointer-math": (
        "Prefer typed fields, union arms, and accessors over pointer math"
    ),
    "global_standard:header-inlines": (
        "Recognize header inlines instead of keeping expanded assert code"
    ),
    "global_standard:literals-and-data-ownership": (
        "Keep literals inline unless data ownership evidence says otherwise"
    ),
    "global_standard:no-string-literal-symbol-regression": (
        "Do not replace string literals with data symbols"
    ),
    "global_standard:assert-report-macros": (
        "Use project assert/report macros (HSD_ASSERT*) when they represent the source"
    ),
    "global_standard:canonical-control-flow-and-macros": (
        "Use canonical control flow and expression macros"
    ),
    "global_standard:matching-tactics-need-evidence": (
        "Matching tactics require targeted evidence"
    ),
    "global_standard:avoid-pragmas-register-asm": (
        "Avoid new pragmas, register steering, and inline assembly for normal source"
    ),
    "global_standard:conservative-naming": (
        "Use semantic names only when the role is evidenced"
    ),
    "global_standard:no-define-alias-global-renames": (
        "Do not alias global renames with defines"
    ),
}

C_KEYWORDS = {
    "auto", "break", "case", "char", "const", "continue", "default", "do",
    "double", "else", "enum", "extern", "float", "for", "goto", "if",
    "inline", "int", "long", "register", "return", "short", "signed",
    "sizeof", "static", "struct", "switch", "typedef", "union", "unsigned",
    "void", "volatile", "while",
    # Common decomp typedefs kept as keywords so renames don't dodge shingles.
    "u8", "u16", "u32", "u64", "s8", "s16", "s32", "s64", "f32", "f64",
    "bool", "size_t", "define", "include",
}

TOKEN_RE = re.compile(
    r'"(?:\\.|[^"\\])*"'          # string literal (contents kept verbatim)
    r"|'(?:\\.|[^'\\])*'"         # char literal
    r"|[A-Za-z_]\w*"              # identifier / keyword
    r"|0[xX][0-9A-Fa-f]+"         # hex literal
    r"|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFlLuU]*"  # numeric literal
    r"|\S"                        # punctuation
)


def strip_comments_and_strings(src: str) -> str:
    """Replace comments and string/char literals with spaces, preserving lines."""

    out = list(src)
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        if c == "/" and nxt == "/":
            end = src.find("\n", i)
            if end < 0:
                end = n
            for k in range(i, end):
                out[k] = " "
            i = end
        elif c == "/" and nxt == "*":
            end = src.find("*/", i + 2)
            end = n if end < 0 else end + 2
            for k in range(i, end):
                if src[k] != "\n":
                    out[k] = " "
            i = end
        elif c in {'"', "'"}:
            quote = c
            i += 1
            while i < n and src[i] != quote:
                if src[i] == "\\" and i + 1 < n:
                    if src[i] != "\n":
                        out[i] = " "
                    if src[i + 1] != "\n":
                        out[i + 1] = " "
                    i += 2
                else:
                    if src[i] != "\n":
                        out[i] = " "
                    i += 1
            if i < n:
                i += 1
        else:
            i += 1
    return "".join(out)


def blank_line(line: str) -> str:
    """Blank string/char literals and comments on a single line."""

    return strip_comments_and_strings(line)


def address_from_name(name: str) -> int | None:
    """Parse the encoded address from an address-style symbol name."""

    match = ADDRESS_SUFFIX_RE.search(name)
    if not match:
        return None
    return int(match.group(1), 16)


def symbol_may_be_sdata2(name: str) -> bool:
    """Heuristic for labels in the usual Melee .sdata2 address band."""

    address = address_from_name(name)
    return (
        address is not None
        and MELEE_SDATA2_START <= address < MELEE_SDATA2_END
    )


def path_matches(path: str | None, patterns: list[str]) -> bool:
    """Return whether a repo-relative path matches any glob pattern."""

    if path is None:
        return True
    normalized = path.replace("\\", "/").lstrip("./")
    return any(fnmatch(normalized, pattern) for pattern in patterns)


# ---------------------------------------------------------------------------
# Rule check implementations. Each receives a hunk dict:
#   {"file": str | None,
#    "added": [(new_lineno, text), ...],
#    "removed": [text, ...]}
# and returns partial findings: {"line", "excerpt", optional overrides}.
# ---------------------------------------------------------------------------


def check_extern_literal_anchor(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Flag added extern declarations of literal-bearing types with address names."""

    findings: list[dict[str, Any]] = []
    for lineno, text in hunk["added"]:
        match = EXTERN_DECL_RE.match(text)
        if not match:
            continue
        ctype = match.group("ctype")
        name = match.group("name")
        address = address_from_name(name)
        detail = {
            "symbol": name,
            "ctype": ctype,
            "address": f"0x{address:08X}" if address is not None else None,
        }
        if ctype in STRING_TYPES:
            standard = "global_standard:no-string-literal-symbol-regression"
            detail = data_ordering_repair_detail(
                detail,
                source_ref=hunk.get("file"),
                source_shape="extern_literal_anchor:string",
                hint=STRING_DATA_REPAIR_HINT,
                include_sdata2_tool=False,
                symbols=[name],
            )
            findings.append(
                {
                    "line": lineno,
                    "excerpt": text.strip(),
                    "severity": "error",
                    "standard_id": standard,
                    "message": (
                        f"Added `extern {ctype} {name}` anchors string data by address "
                        f"instead of keeping the literal inline. {STANDARD_TITLES[standard]}."
                    ),
                    "detail": detail,
                }
            )
        else:
            standard = "global_standard:literals-and-data-ownership"
            detail = data_ordering_repair_detail(
                detail,
                source_ref=hunk.get("file"),
                source_shape="extern_literal_anchor:numeric",
                hint=NUMERIC_DATA_REPAIR_HINT,
                include_sdata2_tool=symbol_may_be_sdata2(name),
                symbols=[name],
            )
            findings.append(
                {
                    "line": lineno,
                    "excerpt": text.strip(),
                    "severity": "warning",
                    "standard_id": standard,
                    "message": (
                        f"Added `extern {ctype} {name}` with no initializer anchors a "
                        f"literal by address. {STANDARD_TITLES[standard]} (ownership "
                        "check decides whether this is a self-TU dodge)."
                    ),
                    "detail": detail,
                }
            )
    return findings


def check_function_extern_visibility(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Warn on added function externs that may alter same-TU visibility.

    ``scan_diff.py`` upgrades these to hard errors when the declared function is
    defined in the same translation unit. The hunk-level rule stays a warning
    so legitimate cross-TU declarations remain review prompts rather than
    deterministic rejects.
    """

    standard = "global_standard:matching-tactics-need-evidence"
    findings: list[dict[str, Any]] = []
    for lineno, text in hunk["added"]:
        match = FUNCTION_EXTERN_DECL_RE.match(blank_line(text))
        if not match:
            continue
        name = match.group("name")
        findings.append(
            {
                "line": lineno,
                "excerpt": text.strip(),
                "message": (
                    f"Added function extern `{name}`. If this names a function "
                    "defined in the same translation unit, it can hide the body "
                    "from MWCC and change inline-boundary decisions; use normal "
                    "source structure or helper layers instead. "
                    f"{STANDARD_TITLES[standard]}."
                ),
                "detail": {
                    "symbol": name,
                    "return_type": _normalize_ws(match.group("return_type")),
                    "params": _normalize_ws(match.group("params")),
                },
            }
        )
    return findings


def _symbol_candidates(blanked: str) -> list[tuple[int, str]]:
    """Return (start_offset, candidate_text) symbol-ish argument candidates."""

    candidates: list[tuple[int, str]] = []
    for match in ADDRESS_NAME_RE.finditer(blanked):
        candidates.append((match.start(), match.group(0)))
    for match in OFFSET_EXPR_RE.finditer(blanked):
        candidates.append((match.start(), match.group(0)))
    candidates.sort(key=lambda item: item[0])
    return candidates


def _normalize_ws(text: str) -> str:
    return " ".join(text.split())


def sdata2_order_helper_command(
    source_ref: str | None = None,
    symbols: list[str] | None = None,
) -> str:
    """Return a worker-facing command for the explicit .sdata2 repair helper."""

    command = f"python3 {SDATA2_ORDER_HELPER_SCRIPT} --repo-root <melee-root>"
    if source_ref:
        command += f" --source {source_ref}"
    else:
        command += " --source <src/path.c>"
    for symbol in symbols or []:
        command += f" --symbol {symbol}"
    return command + " --apply --validate --json"


def data_ordering_repair_detail(
    detail: dict[str, Any],
    *,
    source_ref: str | None,
    source_shape: str,
    hint: str,
    include_sdata2_tool: bool,
    symbols: list[str] | None = None,
) -> dict[str, Any]:
    """Attach structured repair context to data/literal ownership findings."""

    enriched = {
        **detail,
        "source_shape": source_shape,
        "repair_hint": hint,
    }
    if include_sdata2_tool:
        enriched["data_ordering_repair"] = {
            "kind": "sdata2_order_helper",
            "when": (
                "after restoring inline numeric literals, if the remaining "
                "mismatch is only .sdata2 float/double order"
            ),
            "tool": SDATA2_ORDER_HELPER_TOOL_ID,
            "command": sdata2_order_helper_command(source_ref, symbols),
        }
    return enriched


def check_string_literal_to_symbol(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Detect string-literal arguments replaced by symbols/offset expressions.

    Conservative paired-line analysis: an added line containing an
    address-style identifier or `ident + 0xNN` expression inside a call's
    argument list matches a removed line in the same hunk with the same call
    prefix where that argument position held a string literal.
    """

    findings: list[dict[str, Any]] = []
    removed_norm = [_normalize_ws(line) for line in hunk["removed"]]
    if not removed_norm:
        return findings
    for lineno, text in hunk["added"]:
        blanked = blank_line(text)
        matched = False
        for start, candidate in _symbol_candidates(blanked):
            prefix = text[:start]
            # Candidate must sit inside an open call argument list.
            if "(" not in prefix or prefix.count("(") <= prefix.count(")"):
                continue
            norm_prefix = _normalize_ws(prefix)
            if not norm_prefix:
                continue
            for norm_removed in removed_norm:
                if not norm_removed.startswith(norm_prefix):
                    continue
                remainder = norm_removed[len(norm_prefix):].lstrip()
                if remainder.startswith('"'):
                    standard = "global_standard:no-string-literal-symbol-regression"
                    findings.append(
                        {
                            "line": lineno,
                            "excerpt": text.strip(),
                            "message": (
                                f"String literal argument replaced by `{candidate.strip()}`. "
                                f"{STANDARD_TITLES[standard]}."
                            ),
                            "detail": data_ordering_repair_detail(
                                {"replacement": candidate.strip()},
                                source_ref=hunk.get("file"),
                                source_shape="string_literal_to_symbol",
                                hint=STRING_DATA_REPAIR_HINT,
                                include_sdata2_tool=False,
                                symbols=[candidate.strip()],
                            ),
                        }
                    )
                    matched = True
                    break
            if matched:
                break
    return findings


def check_numeric_literal_to_symbol(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Detect numeric literals replaced by address-style data symbols.

    This catches the data-ordering regression where a source literal such as
    `1.0F`, `0.0F`, or `-F32_MAX` is swapped for a TU-local address-named
    symbol only to influence `.sdata2` ordering.
    """

    findings: list[dict[str, Any]] = []
    removed_norm = [_normalize_ws(line) for line in hunk["removed"]]
    if not removed_norm:
        return findings
    standard = "global_standard:literals-and-data-ownership"
    for lineno, text in hunk["added"]:
        blanked = blank_line(text)
        for match in ADDRESS_NAME_RE.finditer(blanked):
            candidate = match.group(0)
            prefix = text[: match.start()]
            norm_prefix = _normalize_ws(prefix)
            if not norm_prefix:
                continue
            for norm_removed in removed_norm:
                if not norm_removed.startswith(norm_prefix):
                    continue
                remainder = norm_removed[len(norm_prefix):].lstrip()
                if not NUMERIC_LITERAL_START_RE.match(remainder):
                    continue
                findings.append(
                    {
                        "line": lineno,
                        "excerpt": text.strip(),
                        "message": (
                            f"Numeric literal replaced by address-style data symbol "
                            f"`{candidate}`. Keep float/constants inline unless the "
                            "PR is explicitly scoped to evidenced data ownership. "
                            f"{STANDARD_TITLES[standard]}."
                        ),
                        "detail": data_ordering_repair_detail(
                            {"replacement": candidate},
                            source_ref=hunk.get("file"),
                            source_shape="numeric_literal_to_symbol",
                            hint=NUMERIC_DATA_REPAIR_HINT,
                            include_sdata2_tool=symbol_may_be_sdata2(candidate),
                            symbols=[candidate],
                        ),
                    }
                )
                break
    return findings


def check_packed_string_blob(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Detect hand-packed string blobs and pointer-offset #define macros."""

    findings: list[dict[str, Any]] = []
    standard = "global_standard:no-string-literal-symbol-regression"
    added = hunk["added"]

    # Signal (a): char array declaration whose initializer concatenates
    # string literals with \0 padding (possibly spanning multiple lines).
    block = "\n".join(text for _, text in added)
    line_starts: list[int] = []
    offset = 0
    for _, text in added:
        line_starts.append(offset)
        offset += len(text) + 1
    for match in BLOB_DECL_RE.finditer(block):
        tail = block[match.end():]
        literals = []
        pos = 0
        while True:
            stripped = tail[pos:].lstrip()
            consumed = len(tail) - pos - len(stripped)
            lit = STRING_LIT_RE.match(stripped)
            if not lit:
                break
            literals.append(lit.group(0))
            pos += consumed + lit.end()
        zero_escapes = sum(lit.count("\\0") for lit in literals)
        if (len(literals) >= 2 and zero_escapes >= 1) or (
            len(literals) == 1 and zero_escapes >= 2
        ):
            index = max(
                i for i, start in enumerate(line_starts) if start <= match.start()
            )
            findings.append(
                {
                    "line": added[index][0],
                    "excerpt": added[index][1].strip(),
                    "message": (
                        f"Hand-packed string blob `{match.group('name')}` concatenates "
                        f"{len(literals)} literal(s) with {zero_escapes} \\0 padding "
                        f"escapes. {STANDARD_TITLES[standard]}."
                    ),
                    "detail": {
                        "symbol": match.group("name"),
                        "literal_count": len(literals),
                        "zero_escapes": zero_escapes,
                    },
                }
            )

    # Signal (b): pointer-offset macro over an address-style symbol.
    for lineno, text in added:
        match = PTR_OFFSET_DEFINE_RE.match(text)
        if match:
            findings.append(
                {
                    "line": lineno,
                    "excerpt": text.strip(),
                    "message": (
                        f"Pointer-offset macro over packed data symbol "
                        f"`{match.group('base')}`. {STANDARD_TITLES[standard]}."
                    ),
                    "detail": {"symbol": match.group("base")},
                }
            )
    return findings


def check_copied_jobj_inline(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Detect local copies of jobj.h inline helper bodies in source TUs."""

    block = "\n".join(text for _, text in hunk["added"])
    clean = "\n".join(blank_line(text) for _, text in hunk["added"])
    has_header_signal = JOBJ_INLINE_HEADER_RE.search(clean) is not None or '"jobj.h"' in block
    has_body_signal = JOBJ_INLINE_BODY_RE.search(clean) is not None
    if not (has_header_signal and has_body_signal):
        return []

    standard = "global_standard:header-inlines"
    findings: list[dict[str, Any]] = []
    for lineno, text in hunk["added"]:
        func_match = LOCAL_JOBJ_INLINE_FUNC_RE.search(text)
        if not func_match:
            continue
        findings.append(
            {
                "line": lineno,
                "excerpt": text.strip(),
                "message": (
                    f"Added local copy of `jobj.h` inline helper "
                    f"`{func_match.group('name')}`. Use the canonical `HSD_JObj*` "
                    "helper instead of pasting header inline bodies into a TU. "
                    f"{STANDARD_TITLES[standard]}."
                ),
                "detail": {"helper": func_match.group("name")},
            }
        )
    if findings:
        return findings

    for lineno, text in hunk["added"]:
        if '"jobj.h"' in text or re.search(r"^\s*#\s*define\s+__FILE__\b", text):
            return [
                {
                    "line": lineno,
                    "excerpt": text.strip(),
                    "message": (
                        "Added `jobj.h` assert context together with copied JObj "
                        "field/dirty-matrix code. Use the canonical `HSD_JObj*` "
                        "helper instead. "
                        f"{STANDARD_TITLES[standard]}."
                    ),
                }
            ]
    return []


def check_stage_ground_var_owner(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Detect new stage TUs borrowing another stage's GroundVars arm."""

    path = (hunk.get("file") or "").replace("\\", "/")
    file_name = path.rsplit("/", 1)[-1]
    allowed = STAGE_GV_FILE_ALLOW.get(file_name)
    if allowed is None:
        return []

    standard = "global_standard:typed-fields-over-pointer-math"
    findings: list[dict[str, Any]] = []
    for lineno, text in hunk["added"]:
        clean = blank_line(text)
        seen: set[str] = set()
        for match in GV_MEMBER_RE.finditer(clean):
            member = match.group("member")
            if member in seen or member in allowed or member in GENERIC_GV_MEMBERS:
                continue
            seen.add(member)
            findings.append(
                {
                    "line": lineno,
                    "excerpt": text.strip(),
                    "message": (
                        f"Added `gv.{member}` access in `{file_name}`, but that "
                        "GroundVars union arm belongs to another stage family. "
                        "Use or add the owning stage's `gv` member instead of "
                        "borrowing an unrelated layout. "
                        f"{STANDARD_TITLES[standard]}."
                    ),
                    "detail": {
                        "borrowed_member": member,
                        "allowed_members": sorted(allowed),
                    },
                }
            )
    return findings


def check_unrolled_assert(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Detect open-coded __assert/__assert_msg call sites on added lines."""

    findings: list[dict[str, Any]] = []
    standard = "global_standard:assert-report-macros"
    path = hunk.get("file")
    if path is not None and path_matches(path, ASSERT_ALLOWLIST):
        return findings
    for lineno, text in hunk["added"]:
        # Skip macro definitions and continuation lines.
        if re.search(r"\\\s*$", text) or re.search(r"^\s*#\s*define\b", text):
            continue
        if ASSERT_CALL_RE.search(blank_line(text)):
            jobj_match = JOBJ_ASSERT_LINE_RE.search(text)
            if jobj_match:
                findings.append(
                    {
                        "line": lineno,
                        "excerpt": text.strip(),
                        "message": (
                            f"Open-coded `jobj.h` __assert at line {jobj_match.group('line')}; "
                            "use the line number to recover the owning HSD_JObj* "
                            "inline/helper, or restore the HSD_ASSERT* form if the "
                            "source operation is a plain assertion. "
                            f"{STANDARD_TITLES[standard]}."
                        ),
                        "detail": {
                            "assert_file": "jobj.h",
                            "assert_line": jobj_match.group("line"),
                        },
                    }
                )
                continue
            findings.append(
                {
                    "line": lineno,
                    "excerpt": text.strip(),
                    "message": (
                        "Open-coded __assert call; the source idiom is HSD_ASSERT / "
                        "HSD_ASSERTMSG (or the inline helper containing it). "
                        f"{STANDARD_TITLES[standard]}."
                    ),
                }
            )
    return findings


def check_pointer_offset_arithmetic(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Warn on raw byte-pointer offset access in added lines."""

    standard = "global_standard:typed-fields-over-pointer-math"
    findings: list[dict[str, Any]] = []
    for lineno, text in hunk["added"]:
        clean = blank_line(text)
        for match in BYTE_POINTER_OFFSET_RE.finditer(clean):
            offset = _normalize_ws(match.group("offset"))
            findings.append(
                {
                    "line": lineno,
                    "excerpt": text.strip(),
                    "message": (
                        f"Added raw `({match.group('cast')}*) {match.group('base')} + {offset}` "
                        "pointer-offset arithmetic. Prefer a real field, correct "
                        "union arm, helper, or temporary typed struct before raw "
                        "byte math. "
                        f"{STANDARD_TITLES[standard]}."
                    ),
                    "detail": {
                        "cast": f"({match.group('cast')}*)",
                        "base": match.group("base"),
                        "offset": offset,
                    },
                }
            )
    return findings


def check_address_named_static_data(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Flag newly added address-named static/global data definitions."""

    standard = "global_standard:literals-and-data-ownership"
    findings: list[dict[str, Any]] = []
    for lineno, text in hunk["added"]:
        clean = blank_line(text)
        match = ADDRESS_NAMED_DATA_DEF_RE.match(clean)
        if not match:
            continue
        name = match.group("name")
        findings.append(
            {
                "line": lineno,
                "excerpt": text.strip(),
                "message": (
                    f"Added address-named data definition `{name}`. Do not create "
                    "static literals or globals solely to force data order; keep "
                    "ordinary literals inline or fix symbol/split ownership instead. "
                    f"{STANDARD_TITLES[standard]}."
                ),
                "detail": data_ordering_repair_detail(
                    {"symbol": name},
                    source_ref=hunk.get("file"),
                    source_shape="address_named_static_data",
                    hint=ADDRESS_DATA_REPAIR_HINT,
                    include_sdata2_tool=symbol_may_be_sdata2(name),
                    symbols=[name],
                ),
            }
        )
    return findings


def _added_macro_definitions(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Return added #define records with continuation bodies from one hunk."""

    added = hunk["added"]
    macros: list[dict[str, Any]] = []
    index = 0
    while index < len(added):
        lineno, text = added[index]
        match = DEFINE_START_RE.match(text)
        if not match:
            index += 1
            continue
        after = match.group("after")
        params = None
        tail = after
        # Function-like macro parameters must start immediately after the name;
        # object-like aliases often have whitespace then a parenthesized body.
        if after.startswith("("):
            close = after.find(")")
            if close >= 0:
                params = after[: close + 1]
                tail = after[close + 1 :]
        body_lines = [tail.rstrip()]
        end_index = index
        while body_lines[-1].rstrip().endswith("\\") and end_index + 1 < len(added):
            end_index += 1
            body_lines.append(added[end_index][1].rstrip())
        body = "\n".join(body_lines)
        macros.append(
            {
                "line": lineno,
                "text": text,
                "name": match.group("name"),
                "params": params,
                "body": body,
            }
        )
        index = end_index + 1
    return macros


def check_fake_assert_macro(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Detect local macros that launder raw assert/report calls."""

    findings: list[dict[str, Any]] = []
    standard = "global_standard:assert-report-macros"
    for macro in _added_macro_definitions(hunk):
        clean_body = blank_line(macro["body"])
        name = macro["name"]
        name_matches = ASSERT_MACRO_NAME_RE.search(name) is not None
        body_matches = (
            ASSERT_CALL_RE.search(clean_body) is not None
            or OSREPORT_CALL_RE.search(clean_body) is not None
        )
        if not (name_matches or body_matches):
            continue
        reasons = []
        if name_matches:
            reasons.append("assert-like macro name")
        if body_matches:
            reasons.append("raw __assert/OSReport body")
        findings.append(
            {
                "line": macro["line"],
                "excerpt": macro["text"].strip(),
                "message": (
                    f"Added local assert/report macro `{name}` ({', '.join(reasons)}). "
                    "Use the project HSD_ASSERT/HSD_ASSERTMSG/HSD_ASSERTREPORT forms "
                    "or the owning header inline instead. "
                    f"{STANDARD_TITLES[standard]}."
                ),
                "detail": {"macro": name, "reasons": reasons},
            }
        )
    return findings


def check_assert_idiom_downgrade(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Detect hunks that replace HSD_ASSERT* with raw __assert/OSReport calls."""

    removed_asserts = [
        text.strip()
        for text in hunk["removed"]
        if HSD_ASSERT_CALL_RE.search(blank_line(text))
    ]
    removed_count = len(removed_asserts) or int(hunk.get("file_removed_hsd_asserts") or 0)
    if not removed_count:
        return []
    standard = "global_standard:assert-report-macros"
    findings: list[dict[str, Any]] = []
    for lineno, text in hunk["added"]:
        clean = blank_line(text)
        if not (ASSERT_CALL_RE.search(clean) or OSREPORT_CALL_RE.search(clean)):
            continue
        findings.append(
            {
                "line": lineno,
                "excerpt": text.strip(),
                "message": (
                    "File diff removes HSD_ASSERT* and adds raw __assert/OSReport code. "
                    "Keep the project assert/report idiom unless there is evidence "
                    "the source really used the raw call. "
                    f"{STANDARD_TITLES[standard]}."
                ),
                "detail": {"removed_hsd_asserts": removed_count},
            }
        )
    return findings


def check_register_keyword(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Detect new register-keyword steering in src/ code."""

    standard = "global_standard:avoid-pragmas-register-asm"
    findings: list[dict[str, Any]] = []
    for lineno, text in hunk["added"]:
        if REGISTER_DECL_RE.search(blank_line(text)):
            findings.append(
                {
                    "line": lineno,
                    "excerpt": text.strip(),
                    "message": (
                        "Added `register` storage-class steering. Remove it unless "
                        "the exception is tightly justified by local evidence. "
                        f"{STANDARD_TITLES[standard]}."
                    ),
                }
            )
    return findings


def check_inline_asm(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Detect new inline assembly in normal src/ code."""

    standard = "global_standard:avoid-pragmas-register-asm"
    findings: list[dict[str, Any]] = []
    for lineno, text in hunk["added"]:
        if INLINE_ASM_RE.search(blank_line(text)):
            findings.append(
                {
                    "line": lineno,
                    "excerpt": text.strip(),
                    "message": (
                        "Added inline assembly in normal source. Keep inline asm to "
                        "SDK-like exceptions with evidence that C cannot express it. "
                        f"{STANDARD_TITLES[standard]}."
                    ),
                }
            )
    return findings


def check_m2c_residue_names(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Detect m2c-style temp/var/phi register names and spNN locals."""

    standard = "global_standard:conservative-naming"
    findings: list[dict[str, Any]] = []
    for lineno, text in hunk["added"]:
        clean = blank_line(text)
        seen: set[str] = set()
        for match in M2C_REGISTER_NAME_RE.finditer(clean):
            name = match.group(0)
            if name in seen:
                continue
            seen.add(name)
            findings.append(
                {
                    "line": lineno,
                    "excerpt": text.strip(),
                    "message": (
                        f"Generated m2c local name `{name}` remains in source. "
                        "Use an evidenced role name, or keep address-style names "
                        "only when semantics are not known. "
                        f"{STANDARD_TITLES[standard]}."
                    ),
                    "detail": {"name": name, "kind": "register_residue"},
                }
            )
        sp_match = SP_LOCAL_DECL_RE.search(clean)
        if sp_match:
            name = sp_match.group("name")
            findings.append(
                {
                    "line": lineno,
                    "excerpt": text.strip(),
                    "severity": "warning",
                    "message": (
                        f"Stack-slot local name `{name}` looks like m2c residue. "
                        "Use a source role name when the role is known. "
                        f"{STANDARD_TITLES[standard]}."
                    ),
                    "detail": {"name": name, "kind": "stack_slot_name"},
                }
            )
    return findings


def check_m2c_goto_label(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Detect generated goto/label residue."""

    standard = "global_standard:canonical-control-flow-and-macros"
    findings: list[dict[str, Any]] = []
    for lineno, text in hunk["added"]:
        clean = blank_line(text)
        block_goto = BLOCK_GOTO_RE.search(clean)
        block_label = BLOCK_LABEL_RE.search(clean)
        if block_goto or block_label:
            label = (block_goto or block_label).group("label")
            findings.append(
                {
                    "line": lineno,
                    "excerpt": text.strip(),
                    "message": (
                        f"Generated block label/goto `{label}` remains in source. "
                        "Try structured control flow before landing m2c residue. "
                        f"{STANDARD_TITLES[standard]}."
                    ),
                    "detail": {"label": label, "kind": "block_label"},
                }
            )
            continue
        goto_match = ANY_GOTO_RE.search(clean)
        if goto_match:
            findings.append(
                {
                    "line": lineno,
                    "excerpt": text.strip(),
                    "severity": "warning",
                    "message": (
                        f"Added goto `{goto_match.group('label')}`. Gotos are unusual "
                        "in upstream src/ and need evidence that structured C was "
                        "checked. "
                        f"{STANDARD_TITLES[standard]}."
                    ),
                    "detail": {"label": goto_match.group("label"), "kind": "goto"},
                }
            )
    return findings


def check_m2c_field_use(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Detect new M2C_FIELD bridge-code uses in the gate path."""

    standard = "global_standard:typed-fields-over-pointer-math"
    findings: list[dict[str, Any]] = []
    for lineno, text in hunk["added"]:
        if M2C_FIELD_RE.search(blank_line(text)):
            findings.append(
                {
                    "line": lineno,
                    "excerpt": text.strip(),
                    "message": (
                        "Added `M2C_FIELD` bridge code. Prefer a real field, union "
                        "arm, helper, or temporary typed struct before landing it. "
                        f"{STANDARD_TITLES[standard]}."
                    ),
                }
            )
    return findings


def _strip_outer_parens(text: str) -> str:
    """Strip balanced outer parentheses from a one-line macro body."""

    value = text.strip()
    while value.startswith("(") and value.endswith(")"):
        depth = 0
        balanced_outer = True
        for index, char in enumerate(value):
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0 and index != len(value) - 1:
                    balanced_outer = False
                    break
            if depth < 0:
                balanced_outer = False
                break
        if not balanced_outer or depth != 0:
            break
        value = value[1:-1].strip()
    return value


def _macro_body_without_comment(body: str) -> str:
    return re.sub(r"//.*$", "", body.strip()).strip()


def _body_aliases_expression(name: str, body: str) -> bool:
    stripped = _macro_body_without_comment(body)
    if not stripped or stripped.startswith(('"', "'")):
        return False
    if re.match(r"^(?:0[xX][0-9A-Fa-f]+|\d)", stripped):
        return False
    normalized = _strip_outer_parens(stripped)
    if "." in normalized or "->" in normalized:
        return IDENT_RE.search(normalized.split(".")[0].split("->")[0].strip()) is not None
    if CAST_ALIAS_RE.match(stripped):
        return True
    if any(char.islower() for char in name) and re.search(r"\b[A-Za-z_]\w*\b", normalized):
        return True
    return False


def check_define_alias(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Detect define aliases and local replacements for canonical macros."""

    findings: list[dict[str, Any]] = []
    for macro in _added_macro_definitions(hunk):
        name = macro["name"]
        body = _macro_body_without_comment(macro["body"])
        if MACRO_CANONICAL_SUFFIX_RE.search(name):
            standard = "global_standard:canonical-control-flow-and-macros"
            findings.append(
                {
                    "line": macro["line"],
                    "excerpt": macro["text"].strip(),
                    "severity": "warning",
                    "standard_id": standard,
                    "message": (
                        f"Added `{name}` instead of using the canonical macro family. "
                        "Use ABS/MIN/MAX/CLAMP when they express the source operation. "
                        f"{STANDARD_TITLES[standard]}."
                    ),
                    "detail": {"macro": name, "kind": "canonical_macro_clone"},
                }
            )
            continue
        if macro["params"]:
            continue
        normalized = _strip_outer_parens(body)
        standard = "global_standard:no-define-alias-global-renames"
        if IDENT_RE.match(normalized) and normalized not in C_KEYWORDS:
            findings.append(
                {
                    "line": macro["line"],
                    "excerpt": macro["text"].strip(),
                    "message": (
                        f"Added identifier-to-identifier define alias `{name}` -> "
                        f"`{normalized}`. Update references directly or keep the "
                        "canonical symbol name. "
                        f"{STANDARD_TITLES[standard]}."
                    ),
                    "detail": {"macro": name, "target": normalized, "kind": "identifier_alias"},
                }
            )
        elif _body_aliases_expression(name, body):
            findings.append(
                {
                    "line": macro["line"],
                    "excerpt": macro["text"].strip(),
                    "message": (
                        f"Added expression define alias `{name}`. Defines should not "
                        "hide variable/member aliases or guessed semantic names. "
                        f"{STANDARD_TITLES[standard]}."
                    ),
                    "detail": {"macro": name, "target": normalized, "kind": "expression_alias"},
                }
            )
    return findings


def _pragma_key(body: str) -> str:
    stripped = body.strip()
    if stripped.startswith("clang diagnostic"):
        return "clang diagnostic"
    return re.split(r"[\s(]", stripped, maxsplit=1)[0]


def check_novel_pragma(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Warn on pragmas outside the upstream-established directive set."""

    standard = "global_standard:avoid-pragmas-register-asm"
    findings: list[dict[str, Any]] = []
    for lineno, text in hunk["added"]:
        match = PRAGMA_RE.match(text)
        if not match:
            continue
        key = _pragma_key(match.group("body"))
        if key in ESTABLISHED_PRAGMAS:
            continue
        findings.append(
            {
                "line": lineno,
                "excerpt": text.strip(),
                "message": (
                    f"Added novel pragma directive `{key}`. New pragmas need local "
                    "evidence and tight scope before handoff. "
                    f"{STANDARD_TITLES[standard]}."
                ),
                "detail": {"directive": key},
            }
        )
    return findings


def check_codegen_pragma(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Warn on newly added established pragmas used for codegen steering."""

    standard = "global_standard:avoid-pragmas-register-asm"
    findings: list[dict[str, Any]] = []
    for lineno, text in hunk["added"]:
        match = PRAGMA_RE.match(text)
        if not match:
            continue
        key = _pragma_key(match.group("body"))
        if key not in CODEGEN_PRAGMAS:
            continue
        findings.append(
            {
                "line": lineno,
                "excerpt": text.strip(),
                "message": (
                    f"Added codegen pragma `{key}`. Established MWCC pragmas are "
                    "still matching tactics in normal source; try clean C first "
                    "and keep pragmas only as narrow, evidenced exceptions. "
                    f"{STANDARD_TITLES[standard]}."
                ),
                "detail": {"directive": key},
            }
        )
    return findings


def check_volatile_local_tactic(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Warn on local volatile declarations used as matching tactics."""

    standard = "global_standard:matching-tactics-need-evidence"
    findings: list[dict[str, Any]] = []
    for lineno, text in hunk["added"]:
        clean = blank_line(text)
        match = VOLATILE_LOCAL_DECL_RE.search(clean)
        if not match:
            continue
        findings.append(
            {
                "line": lineno,
                "excerpt": text.strip(),
                "message": (
                    f"Added local volatile declaration `{match.group('name')}`. "
                    "Volatile locals in normal source are codegen tactics; prefer "
                    "ordinary locals or cleaner expressions unless real hardware/"
                    "SDK semantics require volatile. "
                    f"{STANDARD_TITLES[standard]}."
                ),
                "detail": {"name": match.group("name")},
            }
        )
    return findings


def check_type_erasing_cast(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Warn on new void*/u8*/char* casts in added lines."""

    standard = "global_standard:typed-fields-over-pointer-math"
    findings: list[dict[str, Any]] = []
    for lineno, text in hunk["added"]:
        clean = blank_line(text)
        matches = sorted({match.group(0) for match in TYPE_ERASING_CAST_RE.finditer(clean)})
        for cast in matches:
            findings.append(
                {
                    "line": lineno,
                    "excerpt": text.strip(),
                    "message": (
                        f"Added type-erasing cast `{cast}`. Prefer typed fields, "
                        "union arms, or helpers when the access can be recovered. "
                        f"{STANDARD_TITLES[standard]}."
                    ),
                    "detail": {"cast": cast},
                }
            )
    return findings


RULES: list[dict[str, Any]] = [
    {
        "rule_id": "extern_literal_anchor",
        "severity": "warning",
        "standard_id": "global_standard:literals-and-data-ownership",
        "check": check_extern_literal_anchor,
        "message": "Added extern declaration anchors a literal by address.",
        "applies_to": DEFAULT_APPLIES_TO,
    },
    {
        "rule_id": "function_extern_visibility",
        "severity": "warning",
        "standard_id": "global_standard:matching-tactics-need-evidence",
        "check": check_function_extern_visibility,
        "message": "Added function extern that can alter MWCC visibility.",
        "applies_to": DEFAULT_APPLIES_TO,
    },
    {
        "rule_id": "volatile_local_tactic",
        "severity": "warning",
        "standard_id": "global_standard:matching-tactics-need-evidence",
        "check": check_volatile_local_tactic,
        "message": "New local volatile declaration used as a codegen tactic.",
        "applies_to": DEFAULT_APPLIES_TO,
    },
    {
        "rule_id": "string_literal_to_symbol",
        "severity": "error",
        "standard_id": "global_standard:no-string-literal-symbol-regression",
        "check": check_string_literal_to_symbol,
        "message": "String literal replaced by a data symbol.",
        "applies_to": DEFAULT_APPLIES_TO,
    },
    {
        "rule_id": "numeric_literal_to_symbol",
        "severity": "error",
        "standard_id": "global_standard:literals-and-data-ownership",
        "check": check_numeric_literal_to_symbol,
        "message": "Numeric literal replaced by an address-style data symbol.",
        "applies_to": DEFAULT_APPLIES_TO,
    },
    {
        "rule_id": "address_named_static_data",
        "severity": "error",
        "standard_id": "global_standard:literals-and-data-ownership",
        "check": check_address_named_static_data,
        "message": "New address-named static/global data definition.",
        "applies_to": DEFAULT_APPLIES_TO,
    },
    {
        "rule_id": "packed_string_blob",
        "severity": "error",
        "standard_id": "global_standard:no-string-literal-symbol-regression",
        "check": check_packed_string_blob,
        "message": "Hand-packed string blob or pointer-offset macro.",
        "applies_to": DEFAULT_APPLIES_TO,
    },
    {
        "rule_id": "copied_jobj_inline",
        "severity": "error",
        "standard_id": "global_standard:header-inlines",
        "check": check_copied_jobj_inline,
        "message": "Local copy of a jobj.h inline helper body.",
        "applies_to": ["src/melee/**/*.c"],
    },
    {
        "rule_id": "stage_ground_var_owner",
        "severity": "error",
        "standard_id": "global_standard:typed-fields-over-pointer-math",
        "check": check_stage_ground_var_owner,
        "message": "Stage TU borrows another stage's GroundVars arm.",
        "applies_to": ["src/melee/gr/gr*.c"],
    },
    {
        "rule_id": "unrolled_assert",
        "severity": "error",
        "standard_id": "global_standard:assert-report-macros",
        "check": check_unrolled_assert,
        "message": "Open-coded __assert call.",
        "applies_to": ["src/melee/**/*.c", "src/sysdolphin/**/*.c"],
    },
    {
        "rule_id": "fake_assert_macro",
        "severity": "error",
        "standard_id": "global_standard:assert-report-macros",
        "check": check_fake_assert_macro,
        "message": "Local macro launders assert/report code.",
        "applies_to": DEFAULT_APPLIES_TO,
    },
    {
        "rule_id": "assert_idiom_downgrade",
        "severity": "error",
        "standard_id": "global_standard:assert-report-macros",
        "check": check_assert_idiom_downgrade,
        "message": "HSD_ASSERT* idiom downgraded to raw assert/report code.",
        "applies_to": DEFAULT_APPLIES_TO,
    },
    {
        "rule_id": "register_keyword",
        "severity": "error",
        "standard_id": "global_standard:avoid-pragmas-register-asm",
        "check": check_register_keyword,
        "message": "New register-keyword steering.",
        "applies_to": DEFAULT_APPLIES_TO,
    },
    {
        "rule_id": "inline_asm",
        "severity": "error",
        "standard_id": "global_standard:avoid-pragmas-register-asm",
        "check": check_inline_asm,
        "message": "New inline assembly in src/ code.",
        "applies_to": DEFAULT_APPLIES_TO,
    },
    {
        "rule_id": "m2c_residue_names",
        "severity": "error",
        "standard_id": "global_standard:conservative-naming",
        "check": check_m2c_residue_names,
        "message": "Generated m2c local name remains.",
        "applies_to": DEFAULT_APPLIES_TO,
    },
    {
        "rule_id": "m2c_goto_label",
        "severity": "error",
        "standard_id": "global_standard:canonical-control-flow-and-macros",
        "check": check_m2c_goto_label,
        "message": "Generated goto/label residue remains.",
        "applies_to": DEFAULT_APPLIES_TO,
    },
    {
        "rule_id": "m2c_field_use",
        "severity": "error",
        "standard_id": "global_standard:typed-fields-over-pointer-math",
        "check": check_m2c_field_use,
        "message": "New M2C_FIELD bridge-code use.",
        "applies_to": DEFAULT_APPLIES_TO,
    },
    {
        "rule_id": "pointer_offset_arithmetic",
        "severity": "warning",
        "standard_id": "global_standard:typed-fields-over-pointer-math",
        "check": check_pointer_offset_arithmetic,
        "message": "New raw byte-pointer offset arithmetic.",
        "applies_to": DEFAULT_APPLIES_TO,
    },
    {
        "rule_id": "define_alias",
        "severity": "error",
        "standard_id": "global_standard:no-define-alias-global-renames",
        "check": check_define_alias,
        "message": "New define alias over an identifier or expression.",
        "applies_to": DEFAULT_APPLIES_TO,
    },
    {
        "rule_id": "novel_pragma",
        "severity": "warning",
        "standard_id": "global_standard:avoid-pragmas-register-asm",
        "check": check_novel_pragma,
        "message": "New pragma outside the upstream-established directive set.",
        "applies_to": DEFAULT_APPLIES_TO,
    },
    {
        "rule_id": "codegen_pragma",
        "severity": "warning",
        "standard_id": "global_standard:avoid-pragmas-register-asm",
        "check": check_codegen_pragma,
        "message": "New established codegen pragma used as a matching tactic.",
        "applies_to": DEFAULT_APPLIES_TO,
    },
    {
        "rule_id": "type_erasing_cast",
        "severity": "warning",
        "standard_id": "global_standard:typed-fields-over-pointer-math",
        "check": check_type_erasing_cast,
        "message": "New type-erasing pointer cast.",
        "applies_to": DEFAULT_APPLIES_TO,
    },
]


# ---------------------------------------------------------------------------
# Banned patterns + tombstones (external data-driven rules).
# ---------------------------------------------------------------------------


def banned_dir() -> Path:
    """Resolve the banned-pattern data directory (env-overridable for tests)."""

    override = os.environ.get(BANNED_DIR_ENV)
    if override:
        return Path(override)
    return DEFAULT_BANNED_DIR


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    records: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(record, dict):
            records.append(record)
    return records


def load_banned_pattern_rules() -> list[dict[str, Any]]:
    """Load regex-type banned-pattern records as additional rules."""

    rules: list[dict[str, Any]] = []
    for record in _read_jsonl(banned_dir() / "banned.jsonl"):
        detector = record.get("detector") or {}
        if detector.get("type") != "regex" or not detector.get("pattern"):
            continue
        try:
            pattern = re.compile(detector["pattern"])
        except re.error:
            continue
        comment_url = record.get("comment_url") or "<no comment url>"
        rules.append(
            {
                "rule_id": f"banned_pattern:{record.get('id', 'unknown')}",
                "severity": "error",
                "standard_id": record.get("standard_id"),
                "pattern": pattern,
                "message": (
                    f"Matches maintainer-banned pattern from "
                    f"{record.get('source_pr', 'a past PR')} ({comment_url})."
                ),
                "applies_to": DEFAULT_APPLIES_TO,
                "detail": {
                    "banned_id": record.get("id"),
                    "comment_url": record.get("comment_url"),
                    "source_pr": record.get("source_pr"),
                },
            }
        )
    return rules


def load_tombstones() -> list[dict[str, Any]]:
    """Load resubmission tombstones (missing file -> empty list)."""

    return [
        record
        for record in _read_jsonl(banned_dir() / "tombstones.jsonl")
        if record.get("shingles")
    ]


def normalized_shingles(text: str) -> set[str]:
    """Build normalized 4-token shingle hashes for fuzzy hunk matching.

    Identifiers normalize to "ID" and numeric literals to "NUM"; string
    literal contents are kept verbatim (the packed data is the signal);
    keywords and punctuation are kept.
    """

    tokens: list[str] = []
    for match in TOKEN_RE.finditer(text):
        token = match.group(0)
        if token.startswith('"') or token.startswith("'"):
            tokens.append(token)
        elif re.match(r"^[A-Za-z_]", token):
            tokens.append(token if token in C_KEYWORDS else "ID")
        elif re.match(r"^(?:0[xX][0-9A-Fa-f]+|\d)", token):
            tokens.append("NUM")
        else:
            tokens.append(token)
    shingles: set[str] = set()
    for i in range(len(tokens) - 3):
        joined = " ".join(tokens[i : i + 4])
        shingles.add(hashlib.md5(joined.encode("utf-8")).hexdigest()[:8])
    return shingles


def shingle_similarity(a: set[str], b: set[str]) -> float:
    """Jaccard similarity between two shingle sets."""

    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


MIN_TOMBSTONE_TOKENS = 12


def check_tombstones(
    hunk: dict[str, Any], tombstones: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Compare a hunk's added lines against resubmission tombstones."""

    findings: list[dict[str, Any]] = []
    if not tombstones or not hunk["added"]:
        return findings
    added_text = "\n".join(text for _, text in hunk["added"])
    if len(TOKEN_RE.findall(added_text)) < MIN_TOMBSTONE_TOKENS:
        return findings
    shingles = normalized_shingles(added_text)
    if not shingles:
        return findings
    for record in tombstones:
        threshold = float(record.get("threshold") or 0.7)
        similarity = shingle_similarity(shingles, set(record["shingles"]))
        if similarity < threshold:
            continue
        comment_url = record.get("comment_url") or "<no comment url>"
        first_line, first_text = hunk["added"][0]
        findings.append(
            {
                "rule_id": "resubmission_tombstone",
                "severity": "error",
                "line": first_line,
                "excerpt": first_text.strip(),
                "standard_id": record.get("standard_id"),
                "message": (
                    f"Hunk is {similarity:.0%} similar to a change a maintainer "
                    f"already rejected on {record.get('source_pr', 'a past PR')}; "
                    f"do not resubmit it. Original rejection: {comment_url}"
                ),
                "detail": {
                    "tombstone_id": record.get("id"),
                    "source_pr": record.get("source_pr"),
                    "comment_url": record.get("comment_url"),
                    "similarity": round(similarity, 4),
                    "threshold": threshold,
                    "tombstone_file": record.get("file"),
                    "tombstone_symbol": record.get("symbol"),
                },
            }
        )
    return findings


# ---------------------------------------------------------------------------
# Rule engine.
# ---------------------------------------------------------------------------


def _pattern_check(pattern: re.Pattern[str], hunk: dict[str, Any]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for lineno, text in hunk["added"]:
        if pattern.search(text):
            findings.append({"line": lineno, "excerpt": text.strip()})
    return findings


def all_rules(include_banned: bool = True) -> list[dict[str, Any]]:
    """Return built-in rules plus data-driven banned-pattern rules."""

    rules = list(RULES)
    if include_banned:
        rules.extend(load_banned_pattern_rules())
    return rules


def run_rules_on_hunk(
    rules: list[dict[str, Any]],
    hunk: dict[str, Any],
    skip_path_filter: bool = False,
) -> list[dict[str, Any]]:
    """Run rules over one hunk, returning complete finding dicts."""

    findings: list[dict[str, Any]] = []
    for rule in rules:
        applies_to = rule.get("applies_to") or DEFAULT_APPLIES_TO
        if not skip_path_filter and not path_matches(hunk.get("file"), applies_to):
            continue
        check: Callable[[dict[str, Any]], list[dict[str, Any]]] | None = rule.get("check")
        if check is not None:
            partials = check(hunk)
        elif rule.get("pattern") is not None:
            partials = _pattern_check(rule["pattern"], hunk)
        else:
            partials = []
        for partial in partials:
            finding: dict[str, Any] = {
                "rule_id": partial.get("rule_id", rule["rule_id"]),
                "severity": partial.get("severity", rule["severity"]),
                "file": hunk.get("file") or "<text>",
                "line": partial["line"],
                "excerpt": partial["excerpt"][:240],
                "message": partial.get("message", rule["message"]),
                "standard_id": partial.get("standard_id", rule.get("standard_id")),
            }
            detail = partial.get("detail", rule.get("detail"))
            if detail is not None:
                finding["detail"] = detail
            findings.append(finding)
    return findings


def scan_text_as_hunk(
    text: str, rule_ids: set[str], path: str | None = None
) -> list[dict[str, Any]]:
    """Whole-file advisory scan: treat every line as an added line."""

    hunk = {
        "file": path,
        "added": [(i + 1, line) for i, line in enumerate(text.splitlines())],
        "removed": [],
    }
    rules = [rule for rule in RULES if rule["rule_id"] in rule_ids]
    return run_rules_on_hunk(rules, hunk, skip_path_filter=True)


def main() -> None:
    """Debug CLI: compute shingles for other tooling (tombstone authoring)."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--shingles-from-file",
        required=True,
        help="Compute normalized shingles for the given text file.",
    )
    args = parser.parse_args()
    text = Path(args.shingles_from_file).read_text(encoding="utf-8", errors="replace")
    print(json.dumps({"shingles": sorted(normalized_shingles(text))}, indent=2))


if __name__ == "__main__":
    main()
