#!/usr/bin/env python3
"""literals_data_and_externs QA rules for review_lint.

Vertical slice owning the literal/data-ownership ship-gate rules:
``extern_in_c`` (ALL extern declarations in .c files are errors),
``string_literal_to_symbol``, ``numeric_literal_to_symbol``,
``address_named_static_data``, and ``packed_string_blob``, plus the post-scan
ownership analysis that enriches each ``extern_in_c`` finding with its
specific repair path (TU-owned data / same-TU forward declaration / cross-TU
header ownership). The analysis never changes the severity: every extern in a
.c file is an error under the project policy.

Loaded by ``review_lint/api/_qa_rules.py`` (the rule engine); shared helpers
and regex primitives are imported from there.
"""

from __future__ import annotations

import re
from typing import Any

import _qa_rules
import check_extern_ownership
import symbol_metadata
from _qa_rules import (
    ADDRESS_DATA_REPAIR_HINT,
    ADDRESS_NAME_RE,
    DEFAULT_APPLIES_TO,
    FLOAT_TYPES,
    NUMERIC_DATA_REPAIR_HINT,
    SDK_PATH_EXCLUDES,
    STANDARD_TITLES,
    STRING_DATA_REPAIR_HINT,
    _normalize_ws,
    address_from_name,
    blank_line,
    data_ordering_repair_detail,
    symbol_may_be_sdata2,
)

EXTERN_IN_C_REQUIREMENT = (
    "Externs in .c files are not allowed; declare the symbol in the owning "
    "header or define the data in the TU that owns it."
)

# Any line-shaped extern declaration (no initializer): file-scope or
# block-scope, any object type. Function externs are matched separately.
EXTERN_LINE_RE = re.compile(r"^\s*extern\b")
FUNCTION_EXTERN_DECL_RE = re.compile(
    r"^\s*extern\s+(?P<return_type>.+?)\b(?P<name>[A-Za-z_]\w*)"
    r"\s*\((?P<params>[^;{}]*)\)\s*;\s*$"
)
OBJECT_EXTERN_DECL_RE = re.compile(
    r"^\s*extern\s+(?P<body>[^;=(){}]*?)"
    r"(?P<name>[A-Za-z_]\w*)"
    r"\s*(?P<array>(?:\[[^\]]*\]\s*)*)\s*;\s*$"
)
LITERAL_CTYPE_RE = re.compile(r"\b(f32|f64|float|double|char|u8)\b")

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

ADDRESS_NAMED_DATA_DEF_RE = re.compile(
    r"^\s*(?!extern\b)(?!typedef\b)"
    r"(?:(?:static|const|volatile|signed|unsigned|long|short|SDATA|RODATA|DATA)\s+)*"
    r"(?:(?:struct|union|enum)\s+[A-Za-z_]\w*\s+|[A-Za-z_]\w*(?:\s*\*+\s*|\s+)+)"
    r"(?P<name>[A-Za-z_]\w*_8[0-9A-Fa-f]{7})"
    r"\s*(?:\[[^\]]*\])?\s*(?:=|;)"
)

# `ident + 0xNN` offset expression (string-table pointer arithmetic).
OFFSET_EXPR_RE = re.compile(r"\b(?P<base>[A-Za-z_]\w*)\s*\+\s*0[xX][0-9A-Fa-f]+\b")
NUMERIC_LITERAL_START_RE = re.compile(
    r"^(?:[-+]\s*)?(?:F32_MAX|0[xX][0-9A-Fa-f]+|(?:\d+(?:\.\d*)?|\.\d+)"
    r"(?:[eE][+-]?\d+)?[fFlLuU]*)\b"
)


def check_extern_in_c(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Flag EVERY added extern declaration in a .c file (object or function).

    File-scope and block-scope externs both count; ``extern "C"`` blocks and
    macro-definition/continuation lines are skipped (same skip patterns as the
    assert checks). The post-scan ownership hook enriches each finding with
    the specific repair path; the severity is always error.
    """

    findings: list[dict[str, Any]] = []
    for lineno, text in hunk["added"]:
        # Skip macro definitions and continuation lines.
        if re.search(r"\\\s*$", text) or re.search(r"^\s*#\s*define\b", text):
            continue
        # Linkage blocks (`extern "C"`) are not symbol declarations.
        if 'extern "C"' in text:
            continue
        clean = blank_line(text)
        if not EXTERN_LINE_RE.match(clean):
            continue
        # `extern T x = init;` is a definition, not a declaration.
        if "=" in clean:
            continue
        fn_match = FUNCTION_EXTERN_DECL_RE.match(clean)
        if fn_match:
            name = fn_match.group("name")
            standard = "global_standard:matching-tactics-need-evidence"
            findings.append(
                {
                    "line": lineno,
                    "excerpt": text.strip(),
                    "standard_id": standard,
                    "message": (
                        f"Added function `extern` declaration `{name}` in a .c file. "
                        f"{EXTERN_IN_C_REQUIREMENT}"
                    ),
                    "detail": {
                        "symbol": name,
                        "kind": "function",
                        "return_type": _normalize_ws(fn_match.group("return_type")),
                        "params": _normalize_ws(fn_match.group("params")),
                    },
                }
            )
            continue
        obj_match = OBJECT_EXTERN_DECL_RE.match(clean)
        name = obj_match.group("name") if obj_match else None
        ctype_match = LITERAL_CTYPE_RE.search(
            obj_match.group("body") if obj_match else clean
        )
        address = address_from_name(name) if name else None
        findings.append(
            {
                "line": lineno,
                "excerpt": text.strip(),
                "message": (
                    f"Added `extern` declaration"
                    + (f" `{name}`" if name else "")
                    + f" in a .c file. {EXTERN_IN_C_REQUIREMENT}"
                ),
                "detail": {
                    "symbol": name,
                    "kind": "object",
                    "ctype": ctype_match.group(1) if ctype_match else None,
                    "address": f"0x{address:08X}" if address is not None else None,
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


RULES: list[dict[str, Any]] = [
    {
        "rule_id": "extern_in_c",
        "severity": "error",
        "standard_id": "global_standard:literals-and-data-ownership",
        "check": check_extern_in_c,
        "message": "Added extern declaration in a .c file.",
        "applies_to": DEFAULT_APPLIES_TO,
        "excludes": SDK_PATH_EXCLUDES,
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
]


# ---------------------------------------------------------------------------
# Post-scan ownership analysis: pick the repair path for extern_in_c findings.
#
# The diff/base-text helpers stay in scan_diff.py (they belong to the diff
# CLI); the proxies below import it lazily so loading this slice never pulls
# the CLI module in at engine-import time.
# ---------------------------------------------------------------------------


def post_diff_file_text(repo, rel_path, mode, file_diffs):
    """Lazy proxy to ``scan_diff.post_diff_file_text``."""

    import scan_diff

    return scan_diff.post_diff_file_text(repo, rel_path, mode, file_diffs)


def symbol_existed_in_base(
    repo, rel_path, symbol, mode, file_diffs, merge_base, base_text_cache
):
    """Lazy proxy to ``scan_diff.symbol_existed_in_base``."""

    import scan_diff

    return scan_diff.symbol_existed_in_base(
        repo, rel_path, symbol, mode, file_diffs, merge_base, base_text_cache
    )


def has_in_file_definition(file_text: str, symbol: str) -> bool:
    """Check whether the TU defines (not just declares extern) the symbol."""

    clean = _qa_rules.strip_comments_and_strings(file_text)
    name = re.escape(symbol)
    init_re = re.compile(
        r"^\s*(?:static\s+)?(?:(?:const|volatile)\s+)*"
        r"(?:f32|f64|float|double|char|u8|s8|u16|s16|u32|s32|int|unsigned|signed|long|short)\b"
        rf"[\w \t*]*?\b{name}\s*(?:\[[^\]]*\])?\s*(?:=(?!=)|;)"
    )
    for line in clean.splitlines():
        if "extern" in line:
            continue
        if init_re.match(line):
            return True
    return False


def has_function_definition(file_text: str, symbol: str) -> bool:
    """Check whether the TU defines a function with this symbol name."""

    clean = _qa_rules.strip_comments_and_strings(file_text)
    name = re.escape(symbol)
    return_type = (
        r"(?:(?:static|inline|const|volatile|signed|unsigned|long|short|"
        r"struct\s+[A-Za-z_]\w*|enum\s+[A-Za-z_]\w*|union\s+[A-Za-z_]\w*|"
        r"[A-Za-z_]\w*)[ \t*]+)+"
    )
    fn_re = re.compile(
        rf"(?m)^[ \t]*(?!extern\b){return_type}\b{name}\s*\([^;{{}}]*\)\s*\{{"
    )
    return fn_re.search(clean) is not None


def enrich_extern_in_c_findings(
    findings: list[dict[str, Any]],
    repo,
    mode: str,
    file_diffs: list[dict[str, Any]],
    merge_base: str | None = None,
) -> list[dict[str, Any]]:
    """Attach the specific repair path to extern_in_c findings.

    Every extern in a .c file is an error; the ownership analysis only picks
    the fix message:

    - encoded address inside the TU's own splits.txt data ranges -> this TU
      owns the data; define it here in binary order (plus the isolated
      sdata2_order helper detail when the type is float-like and the address
      sits in the .sdata2 band).
    - definition elsewhere in the same TU -> forward declaration; reorder or
      restructure the file instead (function externs additionally note the
      MWCC inline-decision hazard).
    - otherwise -> cross-TU reference; declare it in the owning header and
      include it.
    """

    file_text_cache: dict[str, str | None] = {}
    base_text_cache: dict[str, str | None] = {}
    result: list[dict[str, Any]] = []
    for finding in findings:
        if finding["rule_id"] != "extern_in_c":
            result.append(finding)
            continue
        finding = dict(finding)
        detail = dict(finding.get("detail") or {})
        rel_path = finding["file"]
        symbol = str(detail.get("symbol") or "")
        kind = detail.get("kind")
        ctype = detail.get("ctype")
        address = _qa_rules.address_from_name(symbol) if symbol else None

        if rel_path not in file_text_cache:
            file_text_cache[rel_path] = post_diff_file_text(
                repo, rel_path, mode, file_diffs
            )
        file_text = file_text_cache[rel_path]

        if (
            kind != "function"
            and address is not None
            and check_extern_ownership.tu_owns_address(repo, rel_path, address)
        ):
            finding["message"] = (
                f"Added `extern` declaration `{symbol}` in a .c file. "
                f"{EXTERN_IN_C_REQUIREMENT} This TU owns the data "
                f"(0x{address:08X} is inside its own section ranges in "
                "splits.txt); define it here in binary order instead of "
                "externing it."
            )
            finding["detail"] = _qa_rules.data_ordering_repair_detail(
                {**detail, "verdict": "self_tu_owned"},
                source_ref=rel_path,
                source_shape="extern_in_c:self_tu_owned",
                hint=_qa_rules.NUMERIC_DATA_REPAIR_HINT,
                include_sdata2_tool=(
                    ctype in FLOAT_TYPES and _qa_rules.symbol_may_be_sdata2(symbol)
                ),
                symbols=[symbol],
            )
            result.append(finding)
            continue

        defined_in_tu = bool(
            file_text
            and symbol
            and (
                has_function_definition(file_text, symbol)
                if kind == "function"
                else has_in_file_definition(file_text, symbol)
            )
        )
        if defined_in_tu:
            existed_in_base = symbol_existed_in_base(
                repo, rel_path, symbol, mode, file_diffs, merge_base, base_text_cache
            )
            if kind == "function":
                finding["message"] = (
                    f"Added function `extern` declaration `{symbol}` in a .c "
                    f"file. {EXTERN_IN_C_REQUIREMENT} `{symbol}` is defined in "
                    "this TU: a same-TU extern can change MWCC inline "
                    "decisions; reorder/restructure the file instead."
                )
            else:
                finding["message"] = (
                    f"Added `extern` declaration `{symbol}` in a .c file. "
                    f"{EXTERN_IN_C_REQUIREMENT} `{symbol}` is defined elsewhere "
                    "in this TU: this is a forward declaration; "
                    "reorder/restructure the file instead of externing it."
                )
            finding["detail"] = {
                **detail,
                "verdict": "same_tu_forward_decl",
                "symbol_existed_in_base": existed_in_base,
            }
            result.append(finding)
            continue

        finding["message"] = (
            f"Added {'function ' if kind == 'function' else ''}`extern` "
            f"declaration{f' `{symbol}`' if symbol else ''} in a .c file. "
            f"{EXTERN_IN_C_REQUIREMENT} Cross-TU reference: declare it in the "
            "owning header and include it."
        )
        finding["detail"] = {**detail, "verdict": "cross_tu"}
        result.append(finding)
    return result


def gate_numeric_literal_to_symbol_findings(
    findings: list[dict[str, Any]],
    repo,
    mode: str,
    file_diffs: list[dict[str, Any]],
    merge_base: str | None = None,
) -> list[dict[str, Any]]:
    """Drop numeric-promotion findings for functions and mutable data.

    Unknown symbols stay flagged so newly introduced data anchors still get
    reviewed. Repository or symbols.txt absence likewise fails open.
    """

    if repo is None:
        return findings

    result: list[dict[str, Any]] = []
    for finding in findings:
        if finding.get("rule_id") != "numeric_literal_to_symbol":
            result.append(finding)
            continue

        detail = finding.get("detail") or {}
        replacement = detail.get("replacement")
        info = symbol_metadata.symbol_info(repo, replacement) if replacement else None
        if info is None:
            result.append(finding)
            continue

        section = info["section"]
        symbol_type = info["type"]
        if symbol_type == "function" or section in {".text", ".data", ".sdata"}:
            continue

        finding = dict(finding)
        finding["detail"] = {
            **detail,
            "symbol_section": section,
            "symbol_type": symbol_type,
        }
        result.append(finding)
    return result


POST_SCAN_HOOKS = [
    enrich_extern_in_c_findings,
    gate_numeric_literal_to_symbol_findings,
]
