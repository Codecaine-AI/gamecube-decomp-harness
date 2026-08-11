#!/usr/bin/env python3
"""names_defines_headers_and_prototypes QA rules for review_lint.

Vertical slice owning the naming/define ship-gate rules:
``m2c_residue_names`` and ``define_alias``.

Loaded by ``review_lint/api/_qa_rules.py`` (the rule engine); shared helpers
and regex primitives are imported from there. Check-function bodies are moved
verbatim from the former monolithic rules module.
"""

from __future__ import annotations

import re
from typing import Any

from _qa_rules import (
    C_KEYWORDS,
    DEFAULT_APPLIES_TO,
    STANDARD_TITLES,
    _added_macro_definitions,
    blank_line,
)

M2C_REGISTER_NAME_RE = re.compile(r"\b(?:temp|var|phi)_[rf]\d+\w*\b")
SP_LOCAL_DECL_RE = re.compile(
    r"^\s*(?:(?:static|const|volatile|unsigned|signed|long|short|struct\s+[A-Za-z_]\w*)\s+)*"
    r"[A-Za-z_]\w*(?:\s*\*+\s*|\s+)+(?P<name>sp[0-9A-Fa-f]{2,})\b"
)
IDENT_RE = re.compile(r"^[A-Za-z_]\w*$")
MACRO_CANONICAL_SUFFIX_RE = re.compile(r"_(?:ABS|MIN|MAX|CLAMP)$")
CAST_ALIAS_RE = re.compile(r"^\(*\s*\([A-Za-z_]\w*(?:\s+[A-Za-z_]\w*)*\s*\*+\s*\)\s*[A-Za-z_]\w*\s*\)*$")


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
            # Advisory by design: spNN stack-slot names sometimes survive as
            # honest "role unknown" locals, so this subcase stays a warning
            # and routes to LLM review instead of hard-failing the gate.
            findings.append(
                {
                    "line": lineno,
                    "excerpt": text.strip(),
                    "severity": "warning",
                    "llm_review": True,
                    "message": (
                        f"Stack-slot local name `{name}` looks like m2c residue. "
                        "Use a source role name when the role is known. "
                        f"{STANDARD_TITLES[standard]}."
                    ),
                    "detail": {"name": name, "kind": "stack_slot_name"},
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


RULES: list[dict[str, Any]] = [
    {
        "rule_id": "m2c_residue_names",
        "severity": "error",
        "standard_id": "global_standard:conservative-naming",
        "check": check_m2c_residue_names,
        "message": "Generated m2c local name remains.",
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
]
