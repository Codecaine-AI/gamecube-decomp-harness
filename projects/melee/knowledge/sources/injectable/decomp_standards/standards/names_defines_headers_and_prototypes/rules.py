#!/usr/bin/env python3
"""names_defines_headers_and_prototypes QA rules for review_lint.

Vertical slice owning the naming/define ship-gate rules:
``m2c_residue_names``, ``define_alias``, and ``bare_local_prototype``.

Loaded by ``review_lint/api/_qa_rules.py`` (the rule engine); shared helpers
and regex primitives are imported from there. Check-function bodies are moved
verbatim from the former monolithic rules module.
"""

from __future__ import annotations

import re
from typing import Any

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
        "rule_id": "bare_local_prototype",
        "severity": "error",
        "standard_id": "global_standard:truthful-headers-and-includes",
        "check": check_bare_local_prototype,
        "message": "Source-local function prototype added to a .c file.",
        "applies_to": DEFAULT_APPLIES_TO,
        "excludes": SDK_PATH_EXCLUDES,
    },
]
