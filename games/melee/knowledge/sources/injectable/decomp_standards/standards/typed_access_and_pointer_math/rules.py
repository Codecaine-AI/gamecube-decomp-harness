#!/usr/bin/env python3
"""typed_access_and_pointer_math QA rules for review_lint.

Vertical slice owning the typed-access ship-gate rules:
``stage_ground_var_owner`` (including the stage GroundVars ownership table),
``m2c_field_use``, ``pointer_offset_arithmetic``, and ``type_erasing_cast``.

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
    _normalize_ws,
    blank_line,
)

M2C_FIELD_RE = re.compile(r"\bM2C_FIELD\s*\(")
TYPE_ERASING_CAST_RE = re.compile(r"\(\s*(?:void|u8|char)\s*\*+\s*\)")
BYTE_POINTER_OFFSET_RE = re.compile(
    r"\(\s*(?P<cast>u8|char)\s*\*+\s*\)\s*"
    r"(?P<base>[A-Za-z_]\w*)"
    r"(?P<trailer>(?:\s*(?:->|\.)\s*[A-Za-z_]\w*|\s*\([^)]*\)|\s*)*)"
    r"\+\s*(?P<offset>0[xX][0-9A-Fa-f]+|\d+|[A-Za-z_]\w*\s*\*\s*(?:0[xX][0-9A-Fa-f]+|\d+))\b"
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


def check_pointer_offset_arithmetic(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Flag raw byte-pointer offset access in added lines."""

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


def check_type_erasing_cast(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Flag new void*/u8*/char* casts in added lines (advisory, LLM review)."""

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
        "rule_id": "stage_ground_var_owner",
        "severity": "error",
        "standard_id": "global_standard:typed-fields-over-pointer-math",
        "check": check_stage_ground_var_owner,
        "message": "Stage TU borrows another stage's GroundVars arm.",
        "applies_to": ["src/melee/gr/gr*.c"],
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
        "severity": "error",
        "standard_id": "global_standard:typed-fields-over-pointer-math",
        "check": check_pointer_offset_arithmetic,
        "message": "New raw byte-pointer offset arithmetic.",
        "applies_to": DEFAULT_APPLIES_TO,
    },
    {
        # Advisory by design: type-erasing casts are common in legitimate
        # generic-buffer code, so this stays a warning and routes to LLM
        # review instead of hard-failing the gate.
        "rule_id": "type_erasing_cast",
        "severity": "warning",
        "standard_id": "global_standard:typed-fields-over-pointer-math",
        "check": check_type_erasing_cast,
        "message": "New type-erasing pointer cast.",
        "applies_to": DEFAULT_APPLIES_TO,
        "llm_review": True,
    },
]
