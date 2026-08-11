#!/usr/bin/env python3
"""Shared QA ship-gate rule engine for review_lint.

Implements the deterministic maintainer-rejection rules from the QA ship
gate flow (docs/10-system-design/60-score-and-pr-handoff.md). The rule
implementations live in per-family vertical slices under
``projects/melee/knowledge/sources/injectable/decomp_standards/standards/
<family>/rules.py`` (env override ``REVIEW_LINT_STANDARDS_DIR``); this module
keeps the shared helpers and regex primitives, loads every slice, validates
each slice module against its ``slice.json`` manifest, and assembles the
``RULES`` registry in the canonical order below.

Rule families and their slices:

- ``literals_data_and_externs``: ``extern_in_c``,
  ``string_literal_to_symbol``, ``numeric_literal_to_symbol``,
  ``address_named_static_data``, ``packed_string_blob``, plus the post-scan
  ownership analysis that picks the repair path for ``extern_in_c`` findings
  (TU-owned data / same-TU forward declaration / cross-TU header ownership).
- ``asserts_reports_and_header_inlines``: ``copied_jobj_inline``,
  ``unrolled_assert``, ``fake_assert_macro``, ``assert_idiom_downgrade``.
- ``typed_access_and_pointer_math``: ``stage_ground_var_owner``,
  ``m2c_field_use``, ``pointer_offset_arithmetic``, ``type_erasing_cast``.
- ``codegen_tactics``: ``volatile_local_tactic``, ``register_keyword``,
  ``inline_asm``, ``novel_pragma``, ``codegen_pragma``.
- ``names_defines_headers_and_prototypes``: ``m2c_residue_names``,
  ``define_alias``.
- ``authored_source_shape``: ``m2c_goto_label``.
- ``pipeline_owned_verification``: standards-only slice (no rules.py).

Severity model: every rule is a hard error except the two explicitly-justified
advisory rules that route to LLM review (``type_erasing_cast`` and the ``spNN``
stack-slot-name subcase of ``m2c_residue_names``); those stay warnings and
carry ``"llm_review": true`` in their finding detail. Rules may declare an
optional per-surface severity map (``"surfaces": {"worker": ..., "pr_gate":
...}``) resolved when the caller passes ``--surface``; absent entries fall back
to the base severity on both surfaces. Rules may also declare an optional
``"excludes"`` glob list that carves SDK-like paths out of ``applies_to``.

Engine-owned data-driven rules:

- banned-pattern rules loaded from
  ``projects/melee/knowledge/sources/injectable/banned_patterns/data/banned.jsonl``.
- resubmission tombstones (fuzzy token-shingle hashes of previously rejected
  hunks) loaded from ``.../banned_patterns/data/tombstones.jsonl``.

The module is shared by ``scan.py`` (whole-file advisory mode) and
``scan_diff.py`` (diff-aware gate mode).
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
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
STANDARDS_DIR_ENV = "REVIEW_LINT_STANDARDS_DIR"
DEFAULT_STANDARDS_DIR = (
    project_knowledge_root(TOOL_ROOT)
    / "sources"
    / "injectable"
    / "decomp_standards"
    / "standards"
)

DEFAULT_APPLIES_TO = ["src/**/*.c"]

# Optional per-rule severity surfaces (see rule "surfaces" maps).
QA_SURFACES = ("worker", "pr_gate")

# SDK-like directories where upstream vendor code conventions differ from the
# melee/sysdolphin source-quality rules. Rules opt in via their "excludes"
# list; the engine never applies this implicitly.
SDK_PATH_EXCLUDES = [
    "src/dolphin/**",
    "src/MSL/**",
    "src/MetroTRK/**",
    "src/Runtime/**",
]

# Canonical slice order (spec order of the source-quality families). Hook and
# tie-break ordering only; RULES order comes from CANONICAL_RULE_ORDER.
CANONICAL_FAMILY_ORDER = [
    "literals_data_and_externs",
    "asserts_reports_and_header_inlines",
    "typed_access_and_pointer_math",
    "codegen_tactics",
    "names_defines_headers_and_prototypes",
    "authored_source_shape",
    "pipeline_owned_verification",
]

# Canonical RULES registry order. Findings order is part of the gate contract
# (parity with the former monolithic registry), so the assembled RULES list is
# ordered by this explicit id list — never by slice-directory glob order.
CANONICAL_RULE_ORDER = [
    "extern_in_c",
    "volatile_local_tactic",
    "string_literal_to_symbol",
    "numeric_literal_to_symbol",
    "address_named_static_data",
    "packed_string_blob",
    "copied_jobj_inline",
    "stage_ground_var_owner",
    "unrolled_assert",
    "fake_assert_macro",
    "assert_idiom_downgrade",
    "register_keyword",
    "inline_asm",
    "m2c_residue_names",
    "m2c_goto_label",
    "m2c_field_use",
    "pointer_offset_arithmetic",
    "define_alias",
    "novel_pragma",
    "codegen_pragma",
    "type_erasing_cast",
]

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

# HSD assert-macro call sites (shared with scan_diff's file-level counting).
HSD_ASSERT_CALL_RE = re.compile(r"\bHSD_ASSERT\w*\s*\(")

DEFINE_START_RE = re.compile(r"^\s*#\s*define\s+(?P<name>[A-Za-z_]\w*)(?P<after>.*)$")

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


def path_excluded(path: str | None, patterns: list[str]) -> bool:
    """Return whether a path matches an exclusion glob (None never excludes)."""

    if path is None or not patterns:
        return False
    return path_matches(path, patterns)


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


# ---------------------------------------------------------------------------
# Rule slices. Each check receives a hunk dict:
#   {"file": str | None,
#    "added": [(new_lineno, text), ...],
#    "removed": [text, ...]}
# and returns partial findings: {"line", "excerpt", optional overrides}.
# ---------------------------------------------------------------------------


def standards_dir() -> Path:
    """Resolve the standards slice directory (env-overridable for tests)."""

    override = os.environ.get(STANDARDS_DIR_ENV)
    if override:
        return Path(override)
    return DEFAULT_STANDARDS_DIR


def _family_rank(family: str) -> tuple[int, str]:
    try:
        return (CANONICAL_FAMILY_ORDER.index(family), family)
    except ValueError:
        return (len(CANONICAL_FAMILY_ORDER), family)


def _import_slice_rules(family: str, rules_py: Path) -> Any:
    """Import one slice's rules.py, sharing this module as `_qa_rules`."""

    module_name = f"_review_lint_slice_{family}"
    existing = sys.modules.get(module_name)
    if existing is not None and getattr(existing, "__file__", None) == str(rules_py):
        return existing
    # Slices import shared helpers via `import _qa_rules`; make sure that name
    # resolves to this (possibly still-initializing) module even when this
    # file runs as a __main__ script, and that sibling api modules import.
    sys.modules.setdefault("_qa_rules", sys.modules[__name__])
    api_dir = str(Path(__file__).resolve().parent)
    if api_dir not in sys.path:
        sys.path.insert(0, api_dir)
    spec = importlib.util.spec_from_file_location(module_name, rules_py)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"review_lint: unable to load rule slice {rules_py}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def _validate_slice_rules(manifest: dict[str, Any], module: Any, slice_dir: Path) -> None:
    """Check a slice module's RULES against its slice.json manifest."""

    module_rules = {rule["rule_id"]: rule for rule in getattr(module, "RULES", [])}
    manifest_rules = {entry["rule_id"]: entry for entry in manifest.get("rules", [])}
    missing = sorted(set(manifest_rules) - set(module_rules))
    extra = sorted(set(module_rules) - set(manifest_rules))
    if missing or extra:
        raise RuntimeError(
            f"review_lint: slice {slice_dir.name} rules.py/slice.json mismatch "
            f"(missing from rules.py: {missing}; missing from slice.json: {extra})"
        )
    for rule_id, entry in manifest_rules.items():
        rule = module_rules[rule_id]
        for key in ("severity", "standard_id", "applies_to", "excludes", "surfaces", "llm_review"):
            if rule.get(key) != entry.get(key):
                raise RuntimeError(
                    f"review_lint: slice {slice_dir.name} rule {rule_id} "
                    f"{key} mismatch (rules.py {rule.get(key)!r} != "
                    f"slice.json {entry.get(key)!r})"
                )


def load_rule_slices() -> list[dict[str, Any]]:
    """Discover and import standards/*/ rule slices (deterministic order)."""

    root = standards_dir()
    if not root.is_dir():
        raise RuntimeError(f"review_lint: standards slice directory not found: {root}")
    slices: list[dict[str, Any]] = []
    slice_dirs = sorted(
        (path.parent for path in root.glob("*/slice.json")),
        key=lambda path: _family_rank(path.name),
    )
    for slice_dir in slice_dirs:
        manifest = json.loads((slice_dir / "slice.json").read_text(encoding="utf-8"))
        record: dict[str, Any] = {
            "family": manifest.get("family", slice_dir.name),
            "path": slice_dir,
            "manifest": manifest,
            "module": None,
        }
        rules_py = slice_dir / "rules.py"
        if rules_py.is_file():
            record["module"] = _import_slice_rules(slice_dir.name, rules_py)
            _validate_slice_rules(manifest, record["module"], slice_dir)
        slices.append(record)
    return slices


def _assemble_rules(slices: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge slice rules into one registry in the canonical rule order."""

    by_id: dict[str, dict[str, Any]] = {}
    for record in slices:
        module = record["module"]
        if module is None:
            continue
        for rule in module.RULES:
            rule_id = rule["rule_id"]
            if rule_id in by_id:
                raise RuntimeError(
                    f"review_lint: duplicate rule id {rule_id} "
                    f"(second definition in slice {record['family']})"
                )
            by_id[rule_id] = rule
    rank = {rule_id: index for index, rule_id in enumerate(CANONICAL_RULE_ORDER)}
    return sorted(
        by_id.values(),
        key=lambda rule: (rank.get(rule["rule_id"], len(rank)), rule["rule_id"]),
    )


RULE_SLICES: list[dict[str, Any]] = load_rule_slices()
RULES: list[dict[str, Any]] = _assemble_rules(RULE_SLICES)


def post_scan_hooks() -> list[Callable[..., list[dict[str, Any]]]]:
    """Return slice post-scan escalation hooks in canonical slice order.

    Each hook has the signature
    ``hook(findings, repo, mode, file_diffs, merge_base) -> findings`` and is
    applied by scan_diff.py after the per-hunk rules run over the whole diff.
    """

    hooks: list[Callable[..., list[dict[str, Any]]]] = []
    for record in RULE_SLICES:
        module = record["module"]
        if module is None:
            continue
        hooks.extend(getattr(module, "POST_SCAN_HOOKS", []))
    return hooks


def _reexport_slice_checks() -> None:
    """Re-export slice check functions as `_qa_rules.check_*`.

    The implementations moved into the standards slices, but tests and older
    callers still address them through this module.
    """

    for rule in RULES:
        check = rule.get("check")
        if check is not None:
            globals().setdefault(check.__name__, check)


_reexport_slice_checks()


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


def resolve_severity(
    base_severity: str,
    surfaces: dict[str, str] | None,
    surface: str | None,
) -> str:
    """Resolve a finding severity for an optional scan surface.

    Without a surface (or without a per-surface override for it) the base
    severity applies — fully backward compatible with pre-surface callers.
    """

    if surface and surfaces and surface in surfaces:
        return surfaces[surface]
    return base_severity


def run_rules_on_hunk(
    rules: list[dict[str, Any]],
    hunk: dict[str, Any],
    skip_path_filter: bool = False,
    surface: str | None = None,
) -> list[dict[str, Any]]:
    """Run rules over one hunk, returning complete finding dicts."""

    findings: list[dict[str, Any]] = []
    for rule in rules:
        applies_to = rule.get("applies_to") or DEFAULT_APPLIES_TO
        if not skip_path_filter:
            if not path_matches(hunk.get("file"), applies_to):
                continue
            if path_excluded(hunk.get("file"), rule.get("excludes") or []):
                continue
        check: Callable[[dict[str, Any]], list[dict[str, Any]]] | None = rule.get("check")
        if check is not None:
            partials = check(hunk)
        elif rule.get("pattern") is not None:
            partials = _pattern_check(rule["pattern"], hunk)
        else:
            partials = []
        for partial in partials:
            severity = resolve_severity(
                partial.get("severity", rule["severity"]),
                partial.get("surfaces", rule.get("surfaces")),
                surface,
            )
            finding: dict[str, Any] = {
                "rule_id": partial.get("rule_id", rule["rule_id"]),
                "severity": severity,
                "file": hunk.get("file") or "<text>",
                "line": partial["line"],
                "excerpt": partial["excerpt"][:240],
                "message": partial.get("message", rule["message"]),
                "standard_id": partial.get("standard_id", rule.get("standard_id")),
            }
            detail = partial.get("detail", rule.get("detail"))
            if partial.get("llm_review", rule.get("llm_review")):
                detail = {**(detail or {}), "llm_review": True}
            if detail is not None:
                finding["detail"] = detail
            findings.append(finding)
    return findings


def scan_text_as_hunk(
    text: str,
    rule_ids: set[str],
    path: str | None = None,
    surface: str | None = None,
) -> list[dict[str, Any]]:
    """Whole-file advisory scan: treat every line as an added line."""

    hunk = {
        "file": path,
        "added": [(i + 1, line) for i, line in enumerate(text.splitlines())],
        "removed": [],
    }
    rules = [rule for rule in RULES if rule["rule_id"] in rule_ids]
    return run_rules_on_hunk(rules, hunk, skip_path_filter=True, surface=surface)


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
