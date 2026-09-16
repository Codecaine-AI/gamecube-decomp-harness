#!/usr/bin/env python3
"""codegen_tactics QA rules for review_lint.

Vertical slice owning the codegen-steering ship-gate rules:
``volatile_local_tactic``, ``register_keyword``, ``inline_asm``,
``novel_pragma``, and ``codegen_pragma``. All are hard errors; the
SDK-like and vendor directories (``SDK_PATH_EXCLUDES``: ``src/dolphin``,
``src/MSL``, ``src/MetroTRK``, ``src/Runtime``, ``src/JSystem``, ...) are
excluded for the tactics that upstream vendor code legitimately uses
(``volatile_local_tactic``, ``register_keyword``, ``inline_asm``).

``volatile_local_tactic`` covers both local ``volatile`` declarations and
``volatile`` cast forms (``(volatile T*)``, ``(volatile T&)``,
``*(volatile T*)&x``) applied to ordinary storage. ``codegen_pragma`` treats
``force_active`` as a codegen pragma; ``inline_depth`` is outside the
established set and lands in ``novel_pragma``.

``codegen_pragma`` and ``novel_pragma`` are marker-aware: a comment carrying
``TODO``, ``@todo``, ``fabricated``, ``fake`` or ``fakematch`` on the pragma
line or within the two lines above it (``PRAGMA_MARKER_RE``,
``PRAGMA_MARKER_WINDOW``) downgrades the finding to a warning, keeping the
debt visible without blocking the attempt. ``force_active`` is always an
error, marked or not.

Function externs are owned by the ``extern_in_c`` rule in the
``literals_data_and_externs`` slice (every extern in a .c file is an error).

Loaded by ``review_lint/api/_qa_rules.py`` (the rule engine); shared helpers
and regex primitives are imported from there.
"""

from __future__ import annotations

import re
from typing import Any

from _qa_rules import (
    DEFAULT_APPLIES_TO,
    SDK_PATH_EXCLUDES,
    STANDARD_TITLES,
    blank_line,
)

REGISTER_DECL_RE = re.compile(
    r"\bregister\s+"
    r"(?:(?:const|volatile|signed|unsigned|long|short|struct\s+[A-Za-z_]\w*)\s+)*"
    r"[A-Za-z_]\w*(?:\s*\*+\s*|\s+)+[A-Za-z_]\w*\b"
)
INLINE_ASM_RE = re.compile(r"\b(?:asm|__asm__)\s*(?:\{|volatile\b|\()")
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
CODEGEN_PRAGMAS = {
    "dont_inline",
    "auto_inline",
    "global_optimizer",
    "pool_data",
    "force_active",
}
# Marker comments that turn a pragma finding into visible debt (warning).
PRAGMA_MARKER_RE = re.compile(r"(?://|/\*|\*).*?(?:\bTODO\b|@todo\b|fabricated|fakematch|\bfake\b)", re.IGNORECASE)
PRAGMA_MARKER_WINDOW = 2
# Codegen pragmas that stay errors even when marked.
ALWAYS_ERROR_PRAGMAS = {"force_active"}
VOLATILE_LOCAL_DECL_RE = re.compile(
    r"^\s+"
    r"(?!(?:extern|typedef)\b)"
    r"(?:(?:static|const|signed|unsigned|long|short|struct\s+[A-Za-z_]\w*)\s+)*"
    r"volatile\s+"
    r"(?:(?:const|signed|unsigned|long|short|struct\s+[A-Za-z_]\w*)\s+)*"
    r"[A-Za-z_]\w*(?:\s*\*+\s*|\s+)+(?P<name>[A-Za-z_]\w*)\b"
)
# Cast forms: `(volatile T*)`, `(volatile T&)`, `*(volatile T*)&x`,
# `(volatile struct Foo*)`, `(volatile JGeometry::TVec3<f32>&)`.
VOLATILE_CAST_RE = re.compile(
    r"\(\s*volatile\s+"
    r"(?:(?:const|signed|unsigned|long|short|struct|class|union|enum)\s+)*"
    r"[A-Za-z_]\w*(?:\s*::\s*[A-Za-z_]\w*)*(?:\s*<[^<>()]*>)?"
    r"(?:\s+const)?\s*(?P<ref>\*+|&+)\s*\)"
)


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


def _post_lines_by_number(hunk: dict[str, Any]) -> dict[int, str]:
    """Post-image line text by line number: post_lines, else post_file_text, else added."""

    post_lines = hunk.get("post_lines")
    if post_lines:
        return {lineno: text for lineno, text, _added in post_lines}
    post_text = hunk.get("post_file_text")
    if isinstance(post_text, str):
        return {i + 1: text for i, text in enumerate(post_text.splitlines())}
    return {lineno: text for lineno, text in hunk.get("added", [])}


def pragma_marker_present(hunk: dict[str, Any], lineno: int) -> bool:
    """True when a TODO/fabricated marker sits on the pragma line or within
    ``PRAGMA_MARKER_WINDOW`` lines above it."""

    lines = _post_lines_by_number(hunk)
    return any(
        PRAGMA_MARKER_RE.search(lines.get(lineno - offset, ""))
        for offset in range(0, PRAGMA_MARKER_WINDOW + 1)
    )


def _pragma_key(body: str) -> str:
    stripped = body.strip()
    if stripped.startswith("clang diagnostic"):
        return "clang diagnostic"
    return re.split(r"[\s(]", stripped, maxsplit=1)[0]


def check_novel_pragma(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Flag pragmas outside the upstream-established directive set."""

    standard = "global_standard:avoid-pragmas-register-asm"
    findings: list[dict[str, Any]] = []
    for lineno, text in hunk["added"]:
        match = PRAGMA_RE.match(text)
        if not match:
            continue
        key = _pragma_key(match.group("body"))
        if key in ESTABLISHED_PRAGMAS:
            continue
        marked = pragma_marker_present(hunk, lineno)
        finding: dict[str, Any] = {
            "line": lineno,
            "excerpt": text.strip(),
            "message": (
                f"Added novel pragma directive `{key}`. New pragmas need local "
                "evidence and tight scope before handoff. "
                f"{STANDARD_TITLES[standard]}."
            ),
            "detail": {"directive": key, "marker": marked},
        }
        if marked:
            finding["severity"] = "warning"
            finding["message"] += " Marked as TODO/fabricated: kept as visible debt."
        findings.append(finding)
    return findings


def check_codegen_pragma(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Flag newly added established pragmas used for codegen steering."""

    standard = "global_standard:avoid-pragmas-register-asm"
    findings: list[dict[str, Any]] = []
    for lineno, text in hunk["added"]:
        match = PRAGMA_RE.match(text)
        if not match:
            continue
        key = _pragma_key(match.group("body"))
        if key not in CODEGEN_PRAGMAS:
            continue
        marked = key not in ALWAYS_ERROR_PRAGMAS and pragma_marker_present(hunk, lineno)
        finding: dict[str, Any] = {
            "line": lineno,
            "excerpt": text.strip(),
            "message": (
                f"Added codegen pragma `{key}`. Established MWCC pragmas are "
                "still matching tactics in normal source; try clean C first "
                "and keep pragmas only as narrow, evidenced exceptions. "
                f"{STANDARD_TITLES[standard]}."
            ),
            "detail": {"directive": key, "marker": marked},
        }
        if marked:
            finding["severity"] = "warning"
            finding["message"] += " Marked as TODO/fabricated: kept as visible debt."
        elif key in ALWAYS_ERROR_PRAGMAS:
            finding["message"] += f" `{key}` is rejected even when marked."
        findings.append(finding)
    return findings


def check_volatile_local_tactic(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Flag local volatile declarations used as matching tactics."""

    standard = "global_standard:matching-tactics-need-evidence"
    findings: list[dict[str, Any]] = []
    for lineno, text in hunk["added"]:
        clean = blank_line(text)
        match = VOLATILE_LOCAL_DECL_RE.search(clean)
        if match:
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
                    "detail": {"name": match.group("name"), "form": "declaration"},
                }
            )
            continue
        cast = VOLATILE_CAST_RE.search(clean)
        if not cast:
            continue
        cast_text = " ".join(cast.group(0).split())
        findings.append(
            {
                "line": lineno,
                "excerpt": text.strip(),
                "message": (
                    f"Added volatile cast `{cast_text}` on ordinary storage. "
                    "Volatile casts in normal source are codegen tactics that "
                    "force loads/stores; prefer the plain expression unless real "
                    "hardware/SDK semantics require volatile. "
                    f"{STANDARD_TITLES[standard]}."
                ),
                "detail": {"cast": cast_text, "form": "cast"},
            }
        )
    return findings


RULES: list[dict[str, Any]] = [
    {
        "rule_id": "volatile_local_tactic",
        "severity": "error",
        "standard_id": "global_standard:matching-tactics-need-evidence",
        "check": check_volatile_local_tactic,
        "message": "New local volatile declaration or volatile cast used as a codegen tactic.",
        "applies_to": DEFAULT_APPLIES_TO,
        "excludes": SDK_PATH_EXCLUDES,
    },
    {
        "rule_id": "register_keyword",
        "severity": "error",
        "standard_id": "global_standard:avoid-pragmas-register-asm",
        "check": check_register_keyword,
        "message": "New register-keyword steering.",
        "applies_to": DEFAULT_APPLIES_TO,
        "excludes": SDK_PATH_EXCLUDES,
    },
    {
        "rule_id": "inline_asm",
        "severity": "error",
        "standard_id": "global_standard:avoid-pragmas-register-asm",
        "check": check_inline_asm,
        "message": "New inline assembly in src/ code.",
        "applies_to": DEFAULT_APPLIES_TO,
        "excludes": SDK_PATH_EXCLUDES,
    },
    {
        "rule_id": "novel_pragma",
        "severity": "error",
        "standard_id": "global_standard:avoid-pragmas-register-asm",
        "check": check_novel_pragma,
        "message": "New pragma outside the upstream-established directive set.",
        "applies_to": DEFAULT_APPLIES_TO,
    },
    {
        "rule_id": "codegen_pragma",
        "severity": "error",
        "standard_id": "global_standard:avoid-pragmas-register-asm",
        "check": check_codegen_pragma,
        "message": "New established codegen pragma used as a matching tactic.",
        "applies_to": DEFAULT_APPLIES_TO,
    },
]
