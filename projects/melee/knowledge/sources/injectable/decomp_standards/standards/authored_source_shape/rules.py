#!/usr/bin/env python3
"""authored_source_shape QA rules for review_lint.

Vertical slice owning the authored-control-flow ship-gate rule:
``m2c_goto_label``.

Loaded by ``review_lint/api/_qa_rules.py`` (the rule engine); shared helpers
and regex primitives are imported from there. Check-function bodies are moved
verbatim from the former monolithic rules module.
"""

from __future__ import annotations

import re
from typing import Any

from _qa_rules import (
    DEFAULT_APPLIES_TO,
    STANDARD_TITLES,
    blank_line,
)

BLOCK_GOTO_RE = re.compile(r"\bgoto\s+(?P<label>block_\d+)\s*;")
BLOCK_LABEL_RE = re.compile(r"^\s*(?P<label>block_\d+)\s*:")
ANY_GOTO_RE = re.compile(r"\bgoto\s+(?P<label>[A-Za-z_]\w*)\s*;")


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


RULES: list[dict[str, Any]] = [
    {
        "rule_id": "m2c_goto_label",
        "severity": "error",
        "standard_id": "global_standard:canonical-control-flow-and-macros",
        "check": check_m2c_goto_label,
        "message": "Generated goto/label residue remains.",
        "applies_to": DEFAULT_APPLIES_TO,
    },
]
