#!/usr/bin/env python3
"""asserts_reports_and_header_inlines QA rules for review_lint.

Vertical slice owning the assert/report/header-inline ship-gate rules:
``copied_jobj_inline``, ``unrolled_assert``, ``fake_assert_macro``, and
``assert_idiom_downgrade``.

Loaded by ``review_lint/api/_qa_rules.py`` (the rule engine); shared helpers
and regex primitives are imported from there. Check-function bodies are moved
verbatim from the former monolithic rules module.
"""

from __future__ import annotations

import re
from typing import Any

from _qa_rules import (
    DEFAULT_APPLIES_TO,
    HSD_ASSERT_CALL_RE,
    STANDARD_TITLES,
    _added_macro_definitions,
    blank_line,
    path_matches,
)

ASSERT_CALL_RE = re.compile(r"\b__assert(?:_msg)?\s*\(")
OSREPORT_CALL_RE = re.compile(r"\bOSReport\s*\(")

ASSERT_MACRO_NAME_RE = re.compile(r"(?:^|_)ASSERT(?:MSG|REPORT)?$")

JOBJ_ASSERT_LINE_RE = re.compile(
    r"\b__assert(?:_msg)?\s*\(\s*\"jobj\.h\"\s*,\s*(?P<line>0[xX][0-9A-Fa-f]+|\d+)"
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

# Files where a raw __assert call is legitimately allowed. Macro-definition
# headers (src/sysdolphin/baselib/debug.h etc.) are already excluded because
# the rules only apply to .c files; macro-continuation lines inside .c files
# are skipped structurally, so the allowlist starts empty.
ASSERT_ALLOWLIST: list[str] = []


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


RULES: list[dict[str, Any]] = [
    {
        "rule_id": "copied_jobj_inline",
        "severity": "error",
        "standard_id": "global_standard:header-inlines",
        "check": check_copied_jobj_inline,
        "message": "Local copy of a jobj.h inline helper body.",
        "applies_to": ["src/melee/**/*.c"],
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
]
