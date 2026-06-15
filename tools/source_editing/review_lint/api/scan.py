#!/usr/bin/env python3
"""Scan C source text for decomp-specific review anti-patterns."""

from __future__ import annotations

import argparse
from pathlib import Path
import re
import sys
from typing import Any

sys.path.append(str(Path(__file__).resolve().parents[3] / "_shared"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from melee_tooling import print_json

import _qa_rules

QA_TEXT_RULES = tuple(rule["rule_id"] for rule in _qa_rules.RULES)


CAST_RE = re.compile(r"\(\s*(?:void|u8|char)\s*\*+\s*\)")
M2C_RE = re.compile(r"\bM2C_FIELD\s*\(")
DECL_RE = re.compile(r"\b(Item|Fighter)\b\s*\*+\s*([A-Za-z_]\w*)")
NAME_RE = re.compile(r"([A-Za-z_]\w*)\s*\(")


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
        elif c in {"\"", "'"}:
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


def line_for_offset(text: str, offset: int) -> int:
    """Return one-based line number for a character offset."""

    return text.count("\n", 0, offset) + 1


def type_erasing_findings(text: str) -> list[dict[str, Any]]:
    """Find type-erasing pointer casts and m2c residue."""

    clean = strip_comments_and_strings(text)
    findings: list[dict[str, Any]] = []
    for pattern, rule_id, message in (
        (CAST_RE, "type_erasing_cast", "Type-erasing pointer cast hides the real source type."),
        (M2C_RE, "m2c_field_residue", "M2C_FIELD residue should be replaced with a real field or union access."),
    ):
        for match in pattern.finditer(clean):
            findings.append(
                {
                    "rule_id": rule_id,
                    "line": line_for_offset(clean, match.start()),
                    "snippet": text[match.start() : match.end()],
                    "message": message,
                }
            )
    return findings


def find_function_regions(clean: str) -> list[tuple[int, int, str]]:
    """Return rough top-level C function regions as (start, end, name)."""

    regions: list[tuple[int, int, str]] = []
    depth = 0
    body_start: int | None = None
    for index, char in enumerate(clean):
        if char == "{":
            if depth == 0:
                sig_start = max(clean.rfind(";", 0, index), clean.rfind("}", 0, index)) + 1
                signature = clean[sig_start:index]
                match = NAME_RE.search(signature)
                if match and not signature.strip().startswith(("struct", "union", "enum", "typedef")):
                    body_start = sig_start
                else:
                    body_start = None
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0 and body_start is not None:
                signature = clean[body_start:index]
                match = NAME_RE.search(signature)
                name = match.group(1) if match else "<unknown>"
                regions.append((body_start, index + 1, name))
                body_start = None
    return regions


def inline_pointer_findings(text: str) -> list[dict[str, Any]]:
    """Find functions with multiple distinct Item* or Fighter* declarations."""

    clean = strip_comments_and_strings(text)
    findings: list[dict[str, Any]] = []
    for start, end, function_name in find_function_regions(clean):
        region = clean[start:end]
        by_type: dict[str, set[str]] = {"Item": set(), "Fighter": set()}
        for match in DECL_RE.finditer(region):
            by_type[match.group(1)].add(match.group(2))
        for type_name, names in by_type.items():
            if len(names) > 1:
                findings.append(
                    {
                        "rule_id": "multiple_pointer_vars_possible_inline",
                        "line": line_for_offset(clean, start),
                        "function": function_name,
                        "type": type_name,
                        "variables": sorted(names),
                        "message": f"Multiple {type_name}* variables in one function may indicate an inlined helper or split opportunity.",
                    }
                )
    return findings


def qa_text_findings(text: str, rule_ids: set[str], source_ref: str) -> list[dict[str, Any]]:
    """Whole-file advisory pass for the diff-aware QA rules.

    Whole-file scans cannot do paired-line or ownership analysis (that is
    scan_diff.py's job), so these findings are advisory: they flag the
    pattern wherever it appears in the text, including pre-existing code.
    """

    findings: list[dict[str, Any]] = []
    path = source_ref if source_ref != "<text>" else None
    for finding in _qa_rules.scan_text_as_hunk(text, rule_ids, path=path):
        findings.append(
            {
                "rule_id": finding["rule_id"],
                "line": finding["line"],
                "snippet": finding["excerpt"],
                "message": finding["message"],
                "severity": finding["severity"],
                "standard_id": finding.get("standard_id"),
            }
        )
    return findings


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--file", help="File to scan.")
    source.add_argument("--text", help="Source snippet to scan.")
    parser.add_argument(
        "--rule",
        choices=("all", "type_erasing_casts", "inline_pointer_vars", "qa_text", *QA_TEXT_RULES),
        default="all",
        help="Rule group to run. 'qa_text' runs the diff-gate QA rules in advisory whole-file mode (not part of 'all' to keep existing behavior).",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    args = parser.parse_args()

    if args.file:
        path = Path(args.file)
        if not path.exists():
            print_json({"tool": "review_lint", "status": "file_not_found", "file": args.file})
            return
        text = path.read_text(encoding="utf-8", errors="replace")
        source_ref = str(path)
    else:
        text = args.text or ""
        source_ref = "<text>"

    findings: list[dict[str, Any]] = []
    if args.rule in {"all", "type_erasing_casts"}:
        findings.extend(type_erasing_findings(text))
    if args.rule in {"all", "inline_pointer_vars"}:
        findings.extend(inline_pointer_findings(text))
    if args.rule == "qa_text":
        findings.extend(qa_text_findings(text, set(QA_TEXT_RULES), source_ref))
    elif args.rule in QA_TEXT_RULES:
        findings.extend(qa_text_findings(text, {args.rule}, source_ref))

    print_json(
        {
            "tool": "review_lint",
            "status": "failed" if findings else "passed",
            "operation": "review_lint:scan",
            "source": source_ref,
            "rule": args.rule,
            "findings": findings,
        }
    )


if __name__ == "__main__":
    main()
