#!/usr/bin/env python3
"""names_defines_headers_and_prototypes QA rules for review_lint.

Vertical slice owning the naming/define ship-gate rules:
``m2c_residue_names``, ``define_alias``, ``shadowed_declaration``, and
``bare_local_prototype``.

Loaded by ``review_lint/api/_qa_rules.py`` (the rule engine); shared helpers
and regex primitives are imported from there. Check-function bodies are moved
verbatim from the former monolithic rules module.
"""

from __future__ import annotations

import re
from typing import Any

import symbol_metadata
from _qa_rules import (
    ADDRESS_NAME_RE,
    C_KEYWORDS,
    DEFAULT_APPLIES_TO,
    SDK_PATH_EXCLUDES,
    STANDARD_TITLES,
    _added_macro_definitions,
    _normalize_ws,
    blank_line,
    strip_comments_and_strings,
)

M2C_REGISTER_NAME_RE = re.compile(r"\b(?:temp|var|phi)_[rf]\d+\w*\b")
SP_LOCAL_DECL_RE = re.compile(
    r"^\s*(?:(?:static|const|volatile|unsigned|signed|long|short|struct\s+[A-Za-z_]\w*)\s+)*"
    r"[A-Za-z_]\w*(?:\s*\*+\s*|\s+)+(?P<name>sp[0-9A-Fa-f]{2,})\b"
)
IDENT_RE = re.compile(r"^[A-Za-z_]\w*$")
MACRO_CANONICAL_SUFFIX_RE = re.compile(r"_(?:ABS|MIN|MAX|CLAMP)$")
CAST_ALIAS_RE = re.compile(r"^\(*\s*\([A-Za-z_]\w*(?:\s+[A-Za-z_]\w*)*\s*\*+\s*\)\s*[A-Za-z_]\w*\s*\)*$")
BARE_PROTOTYPE_RE = re.compile(
    r"^\s*(?P<return_type>"
    r"(?:(?:(?:struct|union|enum)\s+[A-Za-z_]\w*|[A-Za-z_]\w*)"
    r"(?:\s+|\s*\*+\s*))+"
    r")(?P<name>[A-Za-z_]\w*)\s*"
    # Deliberately exclude nested parentheses. Function-pointer parameters are
    # an accepted false-negative; accepting them would also admit call shapes.
    r"\((?P<params>[^()]*)\)\s*;\s*$"
)
STATEMENT_KEYWORDS = {"return", "goto", "else", "do", "case", "break", "continue"}
FUNCTION_NAME_KEYWORDS = {"if", "while", "for", "switch", "sizeof"}
PARAM_LITERAL_TOKEN_RE = re.compile(
    r"(?:^|[,\s])(?:[-+]?\s*)?(?:\d|\.\d)",
)
FUNCTION_CALL_TARGET_RE = re.compile(r"\b([A-Za-z_]\w*)\s*\(")
STORAGE_CLASS_TOKENS = {"extern", "static", "typedef"}
SIMPLE_TYPEDEF_ALIAS_RE = re.compile(
    r"^\s*typedef\s+(?P<canonical>[^;{}(),=]+?)\s+"
    r"(?P<alias>[A-Za-z_]\w*)\s*;\s*$"
)
STRUCT_TYPEDEF_RE = re.compile(
    r"\btypedef\s+(?:struct|union)\s+(?:[A-Za-z_]\w*\s*)?\{"
    r"[^{}]*\}\s*(?P<alias>[A-Za-z_]\w*)\s*;",
    re.DOTALL,
)
PREPROCESSOR_CONDITIONAL_RE = re.compile(
    r"^\s*#\s*(?P<kind>if|ifdef|ifndef|elif|else|endif)\b(?P<body>.*)$"
)


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
    without_comments = blank_line(body.strip())
    return "\n".join(
        re.sub(r"\\\s*$", "", line) for line in without_comments.splitlines()
    ).strip()


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


def _function_macro_target(name: str, params: str, body: str) -> str | None:
    """Return a referenced global target from a function-like macro body."""

    if re.search(rf"\b{re.escape(name)}\b", body):
        return name
    target_match = next(
        (
            match
            for match in ADDRESS_NAME_RE.finditer(body)
            if match.group(0) != name
        ),
        None,
    )
    if target_match is not None:
        return target_match.group(0)

    param_names = {
        param.strip()
        for param in params[1:-1].split(",")
        if IDENT_RE.fullmatch(param.strip())
    }
    for match in FUNCTION_CALL_TARGET_RE.finditer(body):
        target = match.group(1)
        if target != name and target not in param_names and target not in C_KEYWORDS:
            return target
    return None


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
        if macro["params"] is not None:
            if name == "M2C_FIELD":
                continue
            standard = "global_standard:no-define-alias-global-renames"
            target = _function_macro_target(name, macro["params"], body)
            if target is None:
                continue
            if target == name:
                message = (
                    f"Function-like macro `{name}` rewrites its own global symbol "
                    "declaration as a prototype shim around an include. Fix the "
                    "declaration in the owning header instead. "
                    f"{STANDARD_TITLES[standard]}."
                )
            else:
                message = (
                    f"Function-like macro `{name}` rewrites or aliases global "
                    f"symbol declaration `{target}`. Fix the declaration in the "
                    "owning header instead. "
                    f"{STANDARD_TITLES[standard]}."
                )
            findings.append(
                {
                    "line": macro["line"],
                    "excerpt": macro["text"].strip(),
                    "message": message,
                    "detail": {
                        "macro": name,
                        "target": target,
                        "kind": "function_macro_shim",
                    },
                }
            )
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


def _update_if_zero_stack(clean: str, stack: list[dict[str, bool]]) -> bool:
    """Update best-effort conditional state; return whether line is a directive."""

    directive = re.match(
        r"^\s*#\s*(?P<kind>if|ifdef|ifndef|elif|else|endif)\b(?P<body>.*)$",
        clean,
    )
    if directive is None:
        return clean.lstrip().startswith("#")

    kind = directive.group("kind")
    body = directive.group("body").strip()
    if kind in {"if", "ifdef", "ifndef"}:
        parent_disabled = stack[-1]["disabled"] if stack else False
        is_if_zero = kind == "if" and re.fullmatch(r"\(?\s*0\s*\)?", body) is not None
        stack.append(
            {
                "parent_disabled": parent_disabled,
                "zero_branch": is_if_zero,
                "disabled": parent_disabled or is_if_zero,
            }
        )
    elif kind in {"else", "elif"} and stack:
        frame = stack[-1]
        if frame["zero_branch"]:
            # The alternate branch of a literal `#if 0` is active unless an
            # enclosing conditional is already disabled.
            frame["disabled"] = frame["parent_disabled"]
            frame["zero_branch"] = False
    elif kind == "endif" and stack:
        stack.pop()
    return True


def _params_look_like_call_arguments(params: str, raw_params: str) -> bool:
    """Reject expression-only shapes that cannot be prototype parameters."""

    if '"' in raw_params or "'" in raw_params:
        return True
    if PARAM_LITERAL_TOKEN_RE.search(params):
        return True
    if any(operator in params for operator in ("->", "&", "!", "==")):
        return True
    return "." in params.replace("...", "")


def check_bare_local_prototype(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Detect non-static, non-extern function prototypes added to .c files."""

    findings: list[dict[str, Any]] = []
    if_zero_stack: list[dict[str, bool]] = []
    macro_continuation = False
    added_line_numbers = {lineno for lineno, _ in hunk["added"]}
    post_file_text = hunk.get("post_file_text")
    if post_file_text is not None:
        post_lines = [
            (lineno, text, lineno in added_line_numbers)
            for lineno, text in enumerate(post_file_text.splitlines(), start=1)
        ]
    else:
        post_lines = hunk.get("post_lines") or [
            (lineno, text, True) for lineno, text in hunk["added"]
        ]
    clean_lines = strip_comments_and_strings(
        "\n".join(text for _, text, _ in post_lines)
    ).splitlines()
    for (lineno, text, is_added), clean in zip(post_lines, clean_lines):
        was_macro_continuation = macro_continuation
        macro_continuation = text.rstrip().endswith("\\")

        if _update_if_zero_stack(clean, if_zero_stack):
            continue
        if any(frame["disabled"] for frame in if_zero_stack):
            continue
        if not is_added:
            continue
        if was_macro_continuation or macro_continuation:
            continue
        if "=" in clean:
            continue

        match = BARE_PROTOTYPE_RE.match(clean)
        if match is None:
            continue
        return_type = _normalize_ws(match.group("return_type"))
        if STORAGE_CLASS_TOKENS.intersection(re.findall(r"[A-Za-z_]\w*", return_type)):
            continue
        first_return_token = re.match(r"[A-Za-z_]\w*", return_type)
        if first_return_token and first_return_token.group(0) in STATEMENT_KEYWORDS:
            continue
        name = match.group("name")
        if name in FUNCTION_NAME_KEYWORDS:
            continue
        params = _normalize_ws(match.group("params"))
        raw_params = text[match.start("params") : match.end("params")]
        if _params_look_like_call_arguments(params, raw_params):
            continue

        standard = "global_standard:truthful-headers-and-includes"
        findings.append(
            {
                "line": lineno,
                "excerpt": text.strip(),
                "message": (
                    f"Added non-`static`, non-`extern` function prototype `{name}` "
                    "in a .c file. Declare the function in its owning header (or "
                    "make it `static` if genuinely TU-local) instead of using a "
                    "source-local prototype. "
                    f"{STANDARD_TITLES[standard]}."
                ),
                "detail": {
                    "symbol": name,
                    "return_type": return_type,
                    "params": params,
                    "kind": "bare_prototype",
                },
            }
        )
    return findings


def _shadow_post_lines(hunk: dict[str, Any]) -> list[tuple[int, str, bool]]:
    added_line_numbers = {lineno for lineno, _ in hunk["added"]}
    post_file_text = hunk.get("post_file_text")
    if post_file_text is not None:
        return [
            (lineno, text, lineno in added_line_numbers)
            for lineno, text in enumerate(post_file_text.splitlines(), start=1)
        ]
    return hunk.get("post_lines") or [
        (lineno, text, True) for lineno, text in hunk["added"]
    ]


def _update_shadow_conditional_stack(
    clean: str, lineno: int, stack: list[dict[str, Any]]
) -> bool:
    directive = PREPROCESSOR_CONDITIONAL_RE.match(clean)
    if directive is None:
        return clean.lstrip().startswith("#")
    kind = directive.group("kind")
    body = directive.group("body").strip()
    if kind in {"if", "ifdef", "ifndef"}:
        parent_disabled = stack[-1]["disabled"] if stack else False
        is_if_zero = kind == "if" and re.fullmatch(r"\(?\s*0\s*\)?", body) is not None
        is_mwerks = (
            kind in {"ifdef", "ifndef"}
            and re.search(r"\b__MWERKS__\b", body) is not None
        )
        stack.append(
            {
                "parent_disabled": parent_disabled,
                "zero_branch": is_if_zero,
                "disabled": parent_disabled or is_if_zero,
                "mwerks": is_mwerks or (stack[-1]["mwerks"] if stack else False),
                "mwerks_block_line": (
                    lineno
                    if is_mwerks
                    else (stack[-1]["mwerks_block_line"] if stack else None)
                ),
            }
        )
    elif kind in {"else", "elif"} and stack:
        frame = stack[-1]
        if frame["zero_branch"]:
            frame["disabled"] = frame["parent_disabled"]
            frame["zero_branch"] = False
    elif kind == "endif" and stack:
        stack.pop()
    return True


def _function_declaration_candidate(
    clean: str, raw_text: str
) -> dict[str, str] | None:
    if "=" in clean:
        return None
    match = BARE_PROTOTYPE_RE.match(clean)
    if match is None:
        return None
    return_type = _normalize_ws(match.group("return_type"))
    storage = STORAGE_CLASS_TOKENS.intersection(
        re.findall(r"[A-Za-z_]\w*", return_type)
    )
    if "static" in storage or "typedef" in storage:
        return None
    first_return_token = re.match(r"[A-Za-z_]\w*", return_type)
    if first_return_token and first_return_token.group(0) in STATEMENT_KEYWORDS:
        return None
    name = match.group("name")
    if name in FUNCTION_NAME_KEYWORDS:
        return None
    params = _normalize_ws(match.group("params"))
    raw_params = raw_text[match.start("params") : match.end("params")]
    if _params_look_like_call_arguments(params, raw_params):
        return None
    display_return_type = re.sub(r"^extern\s+", "", return_type)
    return {
        "symbol": name,
        "return_type": display_return_type,
        "params": params,
        "storage": "extern" if "extern" in storage else "bare",
    }


def check_shadowed_declaration(hunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Emit declaration candidates for repository-backed post-scan proof."""

    findings: list[dict[str, Any]] = []
    stack: list[dict[str, Any]] = []
    macro_continuation = False
    post_lines = _shadow_post_lines(hunk)
    clean_lines = strip_comments_and_strings(
        "\n".join(text for _, text, _ in post_lines)
    ).splitlines()
    for (lineno, text, is_added), clean in zip(post_lines, clean_lines):
        was_macro_continuation = macro_continuation
        macro_continuation = text.rstrip().endswith("\\")
        if _update_shadow_conditional_stack(clean, lineno, stack):
            continue
        if any(frame["disabled"] for frame in stack):
            continue
        if not is_added or was_macro_continuation or macro_continuation:
            continue

        function = _function_declaration_candidate(clean, text)
        if function is not None:
            mwerks_frame = next(
                (frame for frame in reversed(stack) if frame["mwerks"]), None
            )
            kind = "mwerks_dual_signature" if mwerks_frame else "function_prototype"
            findings.append(
                {
                    "line": lineno,
                    "excerpt": text.strip(),
                    "message": "Function declaration may shadow its canonical owner.",
                    "detail": {
                        **function,
                        "kind": kind,
                        "mwerks_block_line": (
                            mwerks_frame["mwerks_block_line"] if mwerks_frame else None
                        ),
                        "proof_kind": "function",
                    },
                }
            )
            continue

        typedef_match = SIMPLE_TYPEDEF_ALIAS_RE.match(clean)
        if typedef_match is None:
            continue
        canonical_type = _normalize_ws(typedef_match.group("canonical"))
        findings.append(
            {
                "line": lineno,
                "excerpt": text.strip(),
                "message": "Local typedef may alias an existing canonical type.",
                "detail": {
                    "symbol": typedef_match.group("alias"),
                    "alias": typedef_match.group("alias"),
                    "canonical_type": canonical_type,
                    "kind": "typedef_alias",
                    "proof_kind": "type",
                },
            }
        )
    # PR #2877's BracketAnimData bypass used a source-local aggregate typedef,
    # then cast an already-declared global through that alias. Keep this
    # narrow: the typedef and overlay cast must both be newly added.
    joined_clean = "\n".join(clean_lines)
    line_offsets = []
    offset = 0
    for lineno, text, is_added in post_lines:
        line_offsets.append((offset, lineno, text, is_added))
        offset += len(text) + 1
    for typedef_match in STRUCT_TYPEDEF_RE.finditer(joined_clean):
        start_line = next(
            (
                (lineno, raw, is_added)
                for line_offset, lineno, raw, is_added in reversed(line_offsets)
                if line_offset <= typedef_match.start()
            ),
            None,
        )
        if start_line is None or not start_line[2]:
            continue
        alias = typedef_match.group("alias")
        tail = joined_clean[typedef_match.end() :]
        overlay = re.search(
            rf"\(\s*{re.escape(alias)}\s*\*\s*\)\s*"
            r"&?\s*(?P<symbol>[A-Za-z_]\w*)",
            tail,
        )
        if overlay is None:
            continue
        overlay_offset = typedef_match.end() + overlay.start()
        overlay_line = next(
            (
                (lineno, is_added)
                for line_offset, lineno, _, is_added in reversed(line_offsets)
                if line_offset <= overlay_offset
            ),
            None,
        )
        if overlay_line is None or not overlay_line[1]:
            continue
        findings.append(
            {
                "line": start_line[0],
                "excerpt": start_line[1].strip(),
                "message": "Local typedef may overlay a canonical declaration.",
                "detail": {
                    "symbol": alias,
                    "alias": alias,
                    "canonical_symbol": overlay.group("symbol"),
                    "kind": "typedef_alias",
                    "proof_kind": "type_overlay",
                },
            }
        )
    return findings


def prove_shadowed_declarations(
    findings: list[dict[str, Any]],
    repo,
    mode: str,
    file_diffs: list[dict[str, Any]],
    merge_base: str | None = None,
) -> list[dict[str, Any]]:
    """Keep only declarations proven to duplicate a canonical owner."""

    candidates = [
        finding for finding in findings
        if finding.get("rule_id") == "shadowed_declaration"
    ]
    if not candidates or repo is None:
        return [
            finding for finding in findings
            if finding.get("rule_id") != "shadowed_declaration"
        ]

    function_names = {
        str((finding.get("detail") or {}).get("symbol"))
        for finding in candidates
        if (finding.get("detail") or {}).get("proof_kind") == "function"
    }
    type_texts = {
        str((finding.get("detail") or {}).get("canonical_type"))
        for finding in candidates
        if (finding.get("detail") or {}).get("proof_kind") == "type"
    }
    header_owners = symbol_metadata.find_function_declaration_headers(
        repo, function_names
    )
    type_owners = symbol_metadata.find_type_declaration_headers(repo, type_texts)
    overlay_symbols = {
        str((finding.get("detail") or {}).get("canonical_symbol"))
        for finding in candidates
        if (finding.get("detail") or {}).get("proof_kind") == "type_overlay"
    }
    overlay_owners = symbol_metadata.find_object_declaration_headers(
        repo, overlay_symbols
    )

    proven: list[dict[str, Any]] = []
    suppress_locations: set[tuple[str, int]] = set()
    for candidate in candidates:
        finding = dict(candidate)
        detail = dict(finding.get("detail") or {})
        proof_kind = detail.get("proof_kind")
        symbol = str(detail.get("symbol") or "")
        canonical_source: str | None = None
        if proof_kind == "function":
            canonical_source = header_owners.get(symbol)
            if canonical_source is None and symbol_metadata.symbol_is_function(
                symbol_metadata.symbol_info(repo, symbol)
            ):
                canonical_source = "config/GALE01/symbols.txt"
        elif proof_kind == "type":
            canonical_source = type_owners.get(str(detail.get("canonical_type")))
        elif proof_kind == "type_overlay":
            canonical_symbol = str(detail.get("canonical_symbol") or "")
            canonical_source = overlay_owners.get(canonical_symbol)
            if canonical_source is None and symbol_metadata.symbol_is_data(
                symbol_metadata.symbol_info(repo, canonical_symbol)
            ):
                canonical_source = "config/GALE01/symbols.txt"
        if canonical_source is None:
            continue

        detail.pop("proof_kind", None)
        detail["canonical_source"] = canonical_source
        kind = detail.get("kind")
        if kind == "typedef_alias" and detail.get("canonical_symbol"):
            finding["message"] = (
                f"Added local typedef `{detail['alias']}` to reinterpret "
                f"`{detail['canonical_symbol']}`, whose canonical declaration "
                f"is in {canonical_source}. Fix the owning declaration's type "
                "instead of bypassing it with a source-local overlay."
            )
        elif kind == "typedef_alias":
            finding["message"] = (
                f"Added local typedef `{detail['alias']}` over existing type "
                f"`{detail['canonical_type']}` from {canonical_source}. Do not "
                "hide a wrong canonical type behind a source-local alias; fix "
                "the owning type/declaration and its affected users."
            )
        elif kind == "mwerks_dual_signature":
            finding["message"] = (
                f"Added `__MWERKS__` conditional declaration for `{symbol}`, "
                f"which is canonically declared by {canonical_source}. Do not "
                "use compiler-conditional dual signatures to shadow the owner; "
                "fix the canonical declaration and affected callers together."
            )
        else:
            finding["message"] = (
                f"Added source-local declaration for `{symbol}`, which is "
                f"canonically declared by {canonical_source}. Include and fix "
                "the owning header instead of shadowing it in a .c file."
            )
        finding["detail"] = detail
        proven.append(finding)
        suppress_locations.add((finding["file"], finding["line"]))

    result = [
        finding for finding in findings
        if finding.get("rule_id") != "shadowed_declaration"
        and not (
            finding.get("rule_id") in {"bare_local_prototype", "extern_in_c"}
            and (finding["file"], finding["line"]) in suppress_locations
        )
    ]
    seen_mwerks: set[tuple[str, int | None, str]] = set()
    for finding in proven:
        detail = finding.get("detail") or {}
        if detail.get("kind") == "mwerks_dual_signature":
            key = (
                finding["file"],
                detail.get("mwerks_block_line"),
                str(detail.get("symbol")),
            )
            if key in seen_mwerks:
                continue
            seen_mwerks.add(key)
        result.append(finding)
    return result


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
    {
        "rule_id": "shadowed_declaration",
        "severity": "error",
        "standard_id": "global_standard:truthful-headers-and-includes",
        "check": check_shadowed_declaration,
        "message": "Source-local declaration shadows a canonical declaration.",
        "applies_to": DEFAULT_APPLIES_TO,
        "excludes": SDK_PATH_EXCLUDES,
    },
    {
        "rule_id": "bare_local_prototype",
        "severity": "error",
        "standard_id": "global_standard:truthful-headers-and-includes",
        "check": check_bare_local_prototype,
        "message": "Source-local function prototype added to a .c file.",
        "applies_to": DEFAULT_APPLIES_TO,
        "excludes": SDK_PATH_EXCLUDES,
    },
]


POST_SCAN_HOOKS = [prove_shadowed_declarations]
