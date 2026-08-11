#!/usr/bin/env python3
"""Diff-aware QA ship gate: scan a unified diff for maintainer-rejected patterns.

Runs the review_lint QA rules (externs in .c files, string-literal-to-symbol
swaps, packed string blobs, unrolled asserts, banned patterns, resubmission
tombstones) against the ADDED lines of a diff only, so pre-existing upstream
code is never flagged.

`--surface worker|pr_gate` resolves per-surface severities for rules that
declare a "surfaces" map; without it every finding keeps its base severity
(fully backward compatible).

Output contract (mirrors apps/server/src/core/validation/qa/scan-diff.ts):
  stdout: JSON {tool, operation, status, repo, base, findings, counts}
  stderr: human-readable summary
  exit (with --gate): 0 clean, 1 any error finding, 2 warnings only.
  Without --gate the exit code is always 0 unless the tool itself fails.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

sys.path.append(str(Path(__file__).resolve().parents[3] / "_shared"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import _qa_rules

HUNK_HEADER_RE = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")
GLOBAL_APPLIES_TO = ["src/**/*.c"]
MOVED_LINE_DOWNGRADE_RULES = {
    # The melee tree still carries hundreds of legacy externs in .c files;
    # code moved within a file must not hard-fail the gate.
    "extern_in_c",
    "unrolled_assert",
    "fake_assert_macro",
    "assert_idiom_downgrade",
    "copied_jobj_inline",
    "stage_ground_var_owner",
    "register_keyword",
    "inline_asm",
    "numeric_literal_to_symbol",
    "address_named_static_data",
    "m2c_residue_names",
    "m2c_goto_label",
    "m2c_field_use",
    "define_alias",
    "novel_pragma",
    "codegen_pragma",
    "volatile_local_tactic",
    "pointer_offset_arithmetic",
    "type_erasing_cast",
}


def run_git(repo: Path, args: list[str]) -> str:
    """Run a read-only git command in the target repo and return stdout."""

    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"git {' '.join(args)} failed (exit {result.returncode}): "
            f"{result.stderr.strip()}"
        )
    return result.stdout


def parse_unified_diff(diff_text: str) -> list[dict[str, Any]]:
    """Parse a unified diff into per-file hunk records.

    Returns [{"file": path, "hunks": [{"file", "added", "removed", "context"},
    ...]}]. Added lines carry their new-file line numbers; removed and
    context lines are bare text (both existed in the base version).
    """

    files: list[dict[str, Any]] = []
    current_file: dict[str, Any] | None = None
    hunk: dict[str, Any] | None = None
    new_lineno = 0
    for raw in diff_text.splitlines():
        if raw.startswith("+++ "):
            path = raw[4:].strip()
            if path.startswith("b/"):
                path = path[2:]
            if path == "/dev/null":
                current_file = None
            else:
                current_file = {"file": path, "hunks": []}
                files.append(current_file)
            hunk = None
            continue
        if raw.startswith("--- ") or raw.startswith("diff --git") or raw.startswith("index "):
            hunk = None
            continue
        header = HUNK_HEADER_RE.match(raw)
        if header:
            if current_file is None:
                hunk = None
                continue
            new_lineno = int(header.group(3))
            hunk = {
                "file": current_file["file"],
                "added": [],
                "removed": [],
                "context": [],
            }
            current_file["hunks"].append(hunk)
            continue
        if hunk is None:
            continue
        if raw.startswith("\\"):
            continue  # "\ No newline at end of file"
        if raw.startswith("+"):
            hunk["added"].append((new_lineno, raw[1:]))
            new_lineno += 1
        elif raw.startswith("-"):
            hunk["removed"].append(raw[1:])
        else:
            # Context line (leading space; a fully blank line also counts).
            hunk["context"].append(raw[1:] if raw.startswith(" ") else raw)
            new_lineno += 1
    return [record for record in files if record["hunks"]]


def post_diff_file_text(
    repo: Path,
    rel_path: str,
    mode: str,
    file_diffs: list[dict[str, Any]],
) -> str | None:
    """Return post-diff text used for the in-file-definition check.

    - "head": ref-mode diff against HEAD -> `git show HEAD:<file>`.
    - "worktree": --include-worktree -> read the worktree file.
    - "diff": --diff-file mode -> the diff's own added lines for the file.
      The worktree is NOT consulted here: it may sit on an unrelated branch,
      and a moved definition (the legitimate ftcoll case) is visible in the
      added lines themselves.
    """

    if mode == "worktree":
        path = repo / rel_path
        if path.is_file():
            return path.read_text(encoding="utf-8", errors="replace")
        return None
    if mode == "diff":
        lines: list[str] = []
        for record in file_diffs:
            if record["file"] != rel_path:
                continue
            for hunk in record["hunks"]:
                lines.extend(text for _, text in hunk["added"])
        return "\n".join(lines)
    try:
        return run_git(repo, ["show", f"HEAD:{rel_path}"])
    except RuntimeError:
        return None


def symbol_in_diff_base(
    file_diffs: list[dict[str, Any]], rel_path: str, symbol: str
) -> bool:
    """Infer from the diff itself whether a symbol existed in the BASE file.

    A symbol appearing in any removed (-) or context (space) line of the
    file's hunks must have existed in the base version; a symbol appearing
    only in added (+) lines is new in this diff.

    Caveat: unified-diff context is partial (only a few lines around each
    change), so a base symbol that the diff never touches or passes near is
    invisible here and would be misread as new. For the cases this gate
    targets the inference holds: moving a pre-existing definition later in
    the file (the accepted ftcoll pattern) necessarily shows the old
    definition as removed lines, while an invented anchor (the rejected
    gm_1832 pattern) appears only in added lines.
    """

    pattern = re.compile(rf"\b{re.escape(symbol)}\b")
    for record in file_diffs:
        if record["file"] != rel_path:
            continue
        for hunk in record["hunks"]:
            for text in hunk["removed"]:
                if pattern.search(text):
                    return True
            for text in hunk.get("context", []):
                if pattern.search(text):
                    return True
    return False


def symbol_existed_in_base(
    repo: Path,
    rel_path: str,
    symbol: str,
    mode: str,
    file_diffs: list[dict[str, Any]],
    merge_base: str | None,
    base_text_cache: dict[str, str | None],
) -> bool:
    """Determine whether a symbol existed in the base version of a file.

    Ref mode prefers `git show <merge-base>:<file>` (authoritative full base
    text); --diff-file mode (and a missing base blob) falls back to the
    removed/context-line inference from the diff itself.
    """

    if mode != "diff" and merge_base:
        if rel_path not in base_text_cache:
            try:
                base_text_cache[rel_path] = run_git(
                    repo, ["show", f"{merge_base}:{rel_path}"]
                )
            except RuntimeError:
                base_text_cache[rel_path] = None  # new file in this diff
        base_text = base_text_cache[rel_path]
        if base_text is not None:
            return re.search(rf"\b{re.escape(symbol)}\b", base_text) is not None
    return symbol_in_diff_base(file_diffs, rel_path, symbol)


def added_line_text_by_location(file_diffs: list[dict[str, Any]]) -> dict[tuple[str, int], str]:
    """Index exact added-line text by (file, new line number)."""

    index: dict[tuple[str, int], str] = {}
    for record in file_diffs:
        rel_path = record["file"]
        for hunk in record["hunks"]:
            for lineno, text in hunk["added"]:
                index[(rel_path, lineno)] = text
    return index


def line_text_in_diff_base(file_diffs: list[dict[str, Any]], rel_path: str, text: str) -> bool:
    """Fallback exact-line base check for --diff-file mode.

    Removed and context lines are the only base-version evidence a standalone
    patch contains.
    """

    for record in file_diffs:
        if record["file"] != rel_path:
            continue
        for hunk in record["hunks"]:
            if text in hunk["removed"] or text in hunk.get("context", []):
                return True
    return False


def line_text_existed_in_base(
    repo: Path,
    rel_path: str,
    text: str,
    mode: str,
    file_diffs: list[dict[str, Any]],
    merge_base: str | None,
    base_text_cache: dict[str, str | None],
) -> bool:
    """Return whether an added line existed verbatim in the base file."""

    if mode != "diff" and merge_base:
        if rel_path not in base_text_cache:
            try:
                base_text_cache[rel_path] = run_git(repo, ["show", f"{merge_base}:{rel_path}"])
            except RuntimeError:
                base_text_cache[rel_path] = None
        base_text = base_text_cache[rel_path]
        if base_text is not None:
            return text in base_text.splitlines()
    return line_text_in_diff_base(file_diffs, rel_path, text)


def downgrade_moved_line_findings(
    findings: list[dict[str, Any]],
    repo: Path,
    mode: str,
    file_diffs: list[dict[str, Any]],
    merge_base: str | None,
) -> list[dict[str, Any]]:
    """Downgrade hard findings whose exact added line already existed upstream."""

    added_lines = added_line_text_by_location(file_diffs)
    base_text_cache: dict[str, str | None] = {}
    result: list[dict[str, Any]] = []
    for finding in findings:
        if (
            finding.get("severity") != "error"
            or finding.get("rule_id") not in MOVED_LINE_DOWNGRADE_RULES
        ):
            result.append(finding)
            continue
        rel_path = finding["file"]
        added_text = added_lines.get((rel_path, finding["line"]))
        if added_text is None:
            result.append(finding)
            continue
        if not line_text_existed_in_base(
            repo, rel_path, added_text, mode, file_diffs, merge_base, base_text_cache
        ):
            result.append(finding)
            continue
        detail = dict(finding.get("detail") or {})
        detail["moved_vs_invented"] = "added_line_existed_verbatim_in_base"
        downgraded = dict(finding)
        downgraded["severity"] = "warning"
        downgraded["detail"] = detail
        downgraded["message"] = (
            finding["message"]
            + " Added line exists verbatim in the base version of this file, "
            "so this is downgraded as moved existing code rather than newly invented residue."
        )
        result.append(downgraded)
    return result


def collect_findings(
    file_diffs: list[dict[str, Any]],
    repo: Path,
    mode: str,
    merge_base: str | None = None,
    surface: str | None = None,
) -> list[dict[str, Any]]:
    """Run all rules (built-ins, banned patterns, tombstones) over the diff."""

    rules = _qa_rules.all_rules(include_banned=True)
    tombstones = _qa_rules.load_tombstones()
    findings: list[dict[str, Any]] = []
    for record in file_diffs:
        if not _qa_rules.path_matches(record["file"], GLOBAL_APPLIES_TO):
            continue
        file_removed_hsd_asserts = sum(
            1
            for hunk in record["hunks"]
            for text in hunk["removed"]
            if _qa_rules.HSD_ASSERT_CALL_RE.search(_qa_rules.blank_line(text))
        )
        for hunk in record["hunks"]:
            hunk_for_rules = {**hunk, "file_removed_hsd_asserts": file_removed_hsd_asserts}
            findings.extend(
                _qa_rules.run_rules_on_hunk(rules, hunk_for_rules, surface=surface)
            )
            for partial in _qa_rules.check_tombstones(hunk, tombstones):
                finding = {"file": record["file"], **partial}
                finding["excerpt"] = finding["excerpt"][:240]
                findings.append(finding)
    # Slice-owned post-scan analysis (e.g. extern ownership analysis picking
    # the extern_in_c repair path), in canonical slice order.
    for hook in _qa_rules.post_scan_hooks():
        findings = hook(findings, repo, mode, file_diffs, merge_base)
    findings = downgrade_moved_line_findings(findings, repo, mode, file_diffs, merge_base)
    findings.sort(key=lambda f: (f["file"], f["line"], f["rule_id"]))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, help="Melee repo root.")
    parser.add_argument(
        "--base",
        default=None,
        help="Base ref to diff against (merge-base with HEAD; default origin/master).",
    )
    parser.add_argument(
        "--diff-file",
        default=None,
        help="Pre-computed unified diff to scan instead of a ref diff.",
    )
    parser.add_argument(
        "--path",
        action="append",
        default=[],
        help="Restrict the ref diff to this repo-relative pathspec (repeatable).",
    )
    parser.add_argument(
        "--include-worktree",
        action="store_true",
        help="Diff the worktree against the merge-base instead of HEAD.",
    )
    parser.add_argument(
        "--surface",
        choices=sorted(_qa_rules.QA_SURFACES),
        default=None,
        help=(
            "Resolve per-surface severities for rules that declare a "
            "'surfaces' map. Default: base severity (backward compatible)."
        ),
    )
    parser.add_argument(
        "--gate",
        action="store_true",
        help="Exit 1 on error findings, 2 on warnings only, 0 when clean.",
    )
    parser.add_argument(
        "--json", action="store_true", help="Accepted for symmetry; JSON is always emitted."
    )
    args = parser.parse_args()

    if args.diff_file and args.base:
        parser.error("--diff-file and --base are mutually exclusive")

    repo = Path(args.repo).expanduser().resolve()
    if not repo.is_dir():
        print(f"scan_diff: repo not found: {repo}", file=sys.stderr)
        return 3

    merge_base: str | None = None
    mode = "worktree" if args.include_worktree else "head"
    try:
        if args.diff_file:
            diff_path = Path(args.diff_file)
            if not diff_path.is_file():
                print(f"scan_diff: diff file not found: {diff_path}", file=sys.stderr)
                return 3
            diff_text = diff_path.read_text(encoding="utf-8", errors="replace")
            # In --diff-file mode the post-diff state is reconstructed from
            # the diff's own added lines (the repo worktree may be on an
            # unrelated branch).
            mode = "diff"
        else:
            base_ref = args.base or "origin/master"
            merge_base = run_git(repo, ["merge-base", base_ref, "HEAD"]).strip()
            pathspecs = args.path or ["src"]
            diff_args = ["diff", "--no-color", "--unified=5", merge_base]
            if not args.include_worktree:
                diff_args.append("HEAD")
            diff_args.append("--")
            diff_args.extend(pathspecs)
            diff_text = run_git(repo, diff_args)
    except RuntimeError as error:
        print(f"scan_diff: {error}", file=sys.stderr)
        return 3

    file_diffs = parse_unified_diff(diff_text)
    if args.diff_file and args.path:
        wanted = set(args.path)
        file_diffs = [
            record
            for record in file_diffs
            if record["file"] in wanted
            or any(record["file"].startswith(p.rstrip("/") + "/") for p in wanted)
        ]
    findings = collect_findings(file_diffs, repo, mode, merge_base, surface=args.surface)

    errors = sum(1 for f in findings if f["severity"] == "error")
    warnings = sum(1 for f in findings if f["severity"] == "warning")
    status = "failed" if errors else ("warned" if warnings else "passed")
    payload = {
        "tool": "review_lint",
        "operation": "review_lint:scan_diff",
        "status": status,
        "repo": str(repo),
        "base": merge_base,
        "findings": findings,
        "counts": {"errors": errors, "warnings": warnings},
    }
    print(json.dumps(payload, indent=2, sort_keys=True))

    print(
        f"review_lint scan_diff: {status} "
        f"({errors} error(s), {warnings} warning(s), "
        f"{len(file_diffs)} scanned file(s))",
        file=sys.stderr,
    )
    for finding in findings:
        print(
            f"  [{finding['severity']}] {finding['rule_id']} "
            f"{finding['file']}:{finding['line']} — {finding['message']}",
            file=sys.stderr,
        )

    if args.gate:
        if errors:
            return 1
        if warnings:
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
