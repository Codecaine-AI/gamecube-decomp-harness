#!/usr/bin/env python3
"""codegen_tactics QA rules for review_lint.

Vertical slice owning the codegen-steering ship-gate rules:
``volatile_local_tactic``, ``register_keyword``, ``inline_asm``,
``novel_pragma``, and ``codegen_pragma``. All are hard errors; the
SDK-like directories (``src/dolphin``, ``src/MSL``, ``src/MetroTRK``,
``src/Runtime``) are excluded for the tactics that upstream vendor code
legitimately uses (``volatile_local_tactic``, ``register_keyword``,
``inline_asm``).

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
CODEGEN_PRAGMAS = {"dont_inline", "auto_inline", "global_optimizer", "pool_data"}
VOLATILE_LOCAL_DECL_RE = re.compile(
    r"^\s+"
    r"(?!(?:extern|typedef)\b)"
    r"(?:(?:static|const|signed|unsigned|long|short|struct\s+[A-Za-z_]\w*)\s+)*"
    r"volatile\s+"
    r"(?:(?:const|signed|unsigned|long|short|struct\s+[A-Za-z_]\w*)\s+)*"
    r"[A-Za-z_]\w*(?:\s*\*+\s*|\s+)+(?P<name>[A-Za-z_]\w*)\b"
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
    """Flag local volatile declarations used as matching tactics."""

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


RULES: list[dict[str, Any]] = [
    {
        "rule_id": "volatile_local_tactic",
        "severity": "error",
        "standard_id": "global_standard:matching-tactics-need-evidence",
        "check": check_volatile_local_tactic,
        "message": "New local volatile declaration used as a codegen tactic.",
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
