#!/usr/bin/env python3
"""Build the SMS behaviour-change dataset from the PR-189 temp audit.

Reads the audit JSON files (one per split PR), finds each audited function's
line span in the PR head version of its source file, collects the
`git diff -U0 <base> <head>` hunks that fall inside that span, and writes one
JSONL row per (merged) hunk.

Labelling fallback
------------------
The audit records changes per function with no line positions, so hunks cannot
be labelled individually. Labels come from the function-level verdict instead:

* verdict "real"     -> every hunk labelled "real". The audit defines "real"
                        as an exact match with no steering changes, so every
                        hunk in the function is a real behaviour change.
* verdict "steering" -> every hunk labelled "steering". All of the function's
                        changes are temp / form / inline_swap edits that keep
                        the same behaviour.
* verdict "mixed"    -> the per-hunk label cannot be resolved from the audit.
                        These functions are skipped and counted by default.
                        `--include-mixed` emits their hunks labelled "real"
                        with `"label_basis": "mixed-function"`.

Every other row carries `"label_basis": "function-verdict"`.

Functions whose definition cannot be found in the head file (for example
compiler-generated `__sinit_*` static initialisers, or inline template members
defined in headers) are reported as unresolved and skipped; nothing is guessed.

Stdlib only. Git is used read-only (`git diff`, `git show`).
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_AUDIT_DIR = Path(
    "/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/"
    "objectives/sms-pr189-split/audit/temp-audit"
)
DEFAULT_REPO = Path(
    "/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/"
    "games/sms/workspace/sb-up7f"
)
DEFAULT_BASE = "7fed828b"
DEFAULT_OUT = SCRIPT_DIR.parent / "data" / "sms-behaviour-change.jsonl"

MERGE_GAP = 3
HUNK_RE = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


# --------------------------------------------------------------------------
# git helpers
# --------------------------------------------------------------------------

def git(repo: Path, *args: str) -> str:
    out = subprocess.run(
        ["git", "-C", str(repo), "-c", "core.quotepath=off", *args],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    ).stdout
    return out.decode("utf-8", errors="surrogateescape")


def parse_hunks(diff_text: str) -> list[dict]:
    """Parse a -U0 unified diff into hunks with removed/added line lists."""
    hunks: list[dict] = []
    lines = diff_text.split("\n")
    i = 0
    while i < len(lines):
        m = HUNK_RE.match(lines[i])
        if not m:
            i += 1
            continue
        a = int(m.group(1))
        b = int(m.group(2)) if m.group(2) is not None else 1
        c = int(m.group(3))
        d = int(m.group(4)) if m.group(4) is not None else 1
        removed: list[str] = []
        added: list[str] = []
        i += 1
        while i < len(lines) and (len(removed) < b or len(added) < d):
            line = lines[i]
            if line.startswith("\\"):
                i += 1
                continue
            if line.startswith("-") and len(removed) < b:
                removed.append(line[1:])
            elif line.startswith("+") and len(added) < d:
                added.append(line[1:])
            else:
                break
            i += 1
        # Skip trailing "\ No newline at end of file" markers.
        while i < len(lines) and lines[i].startswith("\\"):
            i += 1
        if d > 0:
            new_start, new_end_excl = c, c + d
        else:
            new_start, new_end_excl = c + 1, c + 1
        hunks.append(
            {
                "old": (a, b),
                "c": c,
                "d": d,
                "new_start": new_start,
                "new_end_excl": new_end_excl,
                "removed": removed,
                "added": added,
            }
        )
    return hunks


# --------------------------------------------------------------------------
# source scanning
# --------------------------------------------------------------------------

def code_mask(src: str) -> list[bool]:
    """True for characters that are code (not in comments, strings or chars)."""
    mask = [True] * len(src)
    i, n = 0, len(src)
    while i < n:
        ch = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        if ch == "/" and nxt == "/":
            j = src.find("\n", i)
            j = n if j == -1 else j
            for k in range(i, j):
                mask[k] = False
            i = j
        elif ch == "/" and nxt == "*":
            j = src.find("*/", i + 2)
            j = n if j == -1 else j + 2
            for k in range(i, j):
                mask[k] = False
            i = j
        elif ch in "\"'":
            j = i + 1
            while j < n and src[j] != ch and src[j] != "\n":
                j += 2 if src[j] == "\\" else 1
            j = min(j + 1, n)
            for k in range(i, j):
                mask[k] = False
            i = j
        else:
            i += 1
    return mask


def split_name(name: str) -> tuple[str, str | None]:
    """Split 'A::b(const X&) const' into ('A::b', 'const X&')."""
    depth = 0
    for idx, ch in enumerate(name):
        if ch == "<":
            depth += 1
        elif ch == ">":
            depth -= 1
        elif ch == "(" and depth == 0:
            # 'operator()' keeps its parens as part of the name.
            if name[:idx].rstrip().endswith("operator") and name[idx:idx + 2] == "()":
                continue
            close = name.rfind(")")
            return name[:idx].strip(), name[idx + 1:close].strip()
    return name.strip(), None


def name_pattern(qual: str) -> str:
    """Regex for a qualified name with flexible whitespace and type aliases."""
    aliases = {
        "f32": r"(?:f32|float)",
        "float": r"(?:f32|float)",
        "f64": r"(?:f64|double)",
        "double": r"(?:f64|double)",
        "s32": r"(?:s32|int)",
        "int": r"(?:s32|int)",
        "u32": r"(?:u32|unsigned\s+int|unsigned)",
    }
    tokens = re.findall(r"[A-Za-z_]\w*|::|\S", qual)
    parts: list[str] = []
    in_template = 0
    for tok in tokens:
        if tok == "<":
            in_template += 1
        elif tok == ">":
            in_template -= 1
        if in_template and tok in aliases:
            parts.append(aliases[tok])
        else:
            parts.append(re.escape(tok))
    return r"(?<![\w:~])" + r"\s*".join(parts) + r"(?!\w)"


def norm_params(text: str) -> str:
    text = re.sub(r"/\*.*?\*/|//[^\n]*", "", text, flags=re.S)
    out = []
    for param in text.split(","):
        param = param.split("=")[0].strip()
        toks = re.findall(r"[A-Za-z_]\w*|\S", param)
        # Drop a trailing parameter name ("f32 x", "const Vec& v").
        if len(toks) >= 2 and re.fullmatch(r"[A-Za-z_]\w*", toks[-1]) and toks[-1] not in (
            "const", "volatile", "int", "char", "long", "short", "unsigned", "signed"
        ):
            toks = toks[:-1]
        alias = {"float": "f32", "double": "f64", "int": "s32", "void": ""}
        out.append("".join(alias.get(t, t) for t in toks))
    return ",".join(p for p in out if p)


def find_matching(src: str, mask: list[bool], open_idx: int, op: str, cl: str) -> int:
    depth = 0
    for k in range(open_idx, len(src)):
        if not mask[k]:
            continue
        if src[k] == op:
            depth += 1
        elif src[k] == cl:
            depth -= 1
            if depth == 0:
                return k
    return -1


TRAILER_RE = re.compile(r"\s*(?:const|volatile|throw\s*\(\s*\))?\s*", re.S)


def body_open_after(src: str, mask: list[bool], close_paren: int) -> int:
    """Index of the body '{' if the text after the param list starts a definition."""
    k = close_paren + 1
    n = len(src)
    # Skip comments, whitespace and cv/throw qualifiers.
    while k < n:
        if not mask[k] or src[k].isspace():
            k += 1
            continue
        m = re.match(r"(?:const|volatile)\b|throw\s*\(\s*\)", src[k:])
        if m:
            k += m.end()
            continue
        break
    if k >= n:
        return -1
    if src[k] == "{":
        return k
    if src[k] == ":" and src[k:k + 2] != "::":
        # Constructor initialiser list: body '{' must come before any ';'.
        while k < n:
            if mask[k]:
                if src[k] == ";":
                    return -1
                if src[k] == "{":
                    return k
            k += 1
    return -1


def locate(src: str, mask: list[bool], name: str) -> tuple[int, int] | None:
    """Return the 1-based (start_line, end_line) span of a definition, or None."""
    qual, sig = split_name(name)
    quals = [qual]
    # Fallback: drop leading namespace qualifiers while keeping Class::member.
    parts = qual.split("::")
    while len(parts) > 2:
        parts = parts[1:]
        quals.append("::".join(parts))
    patterns = [re.compile(name_pattern(q) + r"\s*\(") for q in quals]
    # Nerve macros: DEFINE_NERVE(Name, T) / DEFINE_NERVE_EXECUTE(Name, T)
    # expand to `BOOL Name::execute(TSpineBase<T>* spine) const` + body.
    nerve = re.fullmatch(r"(\w+)::execute", qual)
    if nerve:
        patterns.append(
            re.compile(
                r"(?<!\w)DEFINE_NERVE(?:_EXECUTE)?\s*\(\s*"
                + re.escape(nerve.group(1))
                + r"\s*,"
            )
        )
    for pat in patterns:
        candidates: list[tuple[int, int, str]] = []
        for m in pat.finditer(src):
            if not mask[m.start()]:
                continue
            # The parameter list (or macro argument list) opens at the first
            # '(' at or after the end of the name.
            open_paren = src.index("(", m.end() - 1 if src[m.end() - 1] == "(" else m.start())
            close_paren = find_matching(src, mask, open_paren, "(", ")")
            if close_paren == -1:
                continue
            body = body_open_after(src, mask, close_paren)
            if body == -1:
                continue
            end = find_matching(src, mask, body, "{", "}")
            if end == -1:
                continue
            params = src[open_paren + 1:close_paren]
            candidates.append((m.start(), end, params))
        if not candidates:
            continue
        chosen = candidates[0]
        if sig is not None:
            want = norm_params(sig)
            for cand in candidates:
                if norm_params(cand[2]) == want:
                    chosen = cand
                    break
        start_line = src.count("\n", 0, chosen[0]) + 1
        end_line = src.count("\n", 0, chosen[1]) + 1
        return start_line, end_line
    return None


# --------------------------------------------------------------------------
# dataset
# --------------------------------------------------------------------------

def sanitize(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.:-]+", "_", text)


def hunks_in_span(hunks: list[dict], start: int, end: int) -> list[dict]:
    kept = []
    for h in hunks:
        if h["d"] > 0:
            lo, hi = h["c"], h["c"] + h["d"] - 1
            if lo <= end and hi >= start:
                kept.append(h)
        elif start <= h["c"] < end:
            kept.append(h)
    return kept


def merge_hunks(hunks: list[dict]) -> list[dict]:
    merged: list[dict] = []
    for h in hunks:
        if merged and h["new_start"] - merged[-1]["new_end_excl"] <= MERGE_GAP:
            prev = merged[-1]
            prev["removed"] = prev["removed"] + h["removed"]
            prev["added"] = prev["added"] + h["added"]
            prev["new_end_excl"] = max(prev["new_end_excl"], h["new_end_excl"])
        else:
            merged.append(dict(h))
    return merged


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--audit-dir", type=Path, default=DEFAULT_AUDIT_DIR)
    ap.add_argument("--repo", type=Path, default=DEFAULT_REPO)
    ap.add_argument("--base", default=DEFAULT_BASE)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument(
        "--include-mixed",
        action="store_true",
        help='emit hunks of "mixed" functions labelled "real" (label_basis mixed-function)',
    )
    args = ap.parse_args(argv)

    file_cache: dict[tuple[str, str], tuple[str, list[bool]]] = {}
    diff_cache: dict[tuple[str, str], list[dict]] = {}

    rows: list[dict] = []
    seen_ids: set[str] = set()
    emitted: list[str] = []
    skipped: dict[str, list[str]] = {"unresolved span": [], "no hunks in span": [], "mixed": []}

    for audit_path in sorted(args.audit_dir.glob("*.json")):
        audit = json.loads(audit_path.read_text(encoding="utf-8"))
        pr = str(audit["pr"])
        head = audit["head"]
        for fn in audit["functions"]:
            name, path, verdict = fn["name"], fn["file"], fn["verdict"]
            tag = f"PR {pr} {name} ({path})"
            if verdict == "mixed" and not args.include_mixed:
                skipped["mixed"].append(tag)
                continue
            key = (head, path)
            if key not in file_cache:
                src = git(args.repo, "show", f"{head}:{path}")
                file_cache[key] = (src, code_mask(src))
            src, mask = file_cache[key]
            span = locate(src, mask, name)
            if span is None:
                skipped["unresolved span"].append(tag)
                continue
            if key not in diff_cache:
                diff_cache[key] = parse_hunks(
                    git(args.repo, "diff", "--no-color", "--no-ext-diff", "-U0",
                        args.base, head, "--", path)
                )
            merged = merge_hunks(hunks_in_span(diff_cache[key], *span))
            if not merged:
                skipped["no hunks in span"].append(f"{tag} span {span[0]}-{span[1]}")
                continue
            if verdict == "real":
                label, basis = "real", "function-verdict"
            elif verdict == "steering":
                label, basis = "steering", "function-verdict"
            elif verdict == "mixed":
                label, basis = "real", "mixed-function"
            else:
                raise SystemExit(f"unknown verdict {verdict!r} for {tag}")
            emitted.append(tag)
            for k, h in enumerate(merged, start=1):
                base_id = f"pr{pr}-{sanitize(name)}-h{k}"
                row_id, n = base_id, 1
                while row_id in seen_ids:
                    n += 1
                    row_id = f"{base_id}-{n}"
                seen_ids.add(row_id)
                rows.append(
                    {
                        "id": row_id,
                        "file": path,
                        "function": name,
                        "removed": "\n".join(h["removed"]),
                        "added": "\n".join(h["added"]),
                        "label": label,
                        "pr": pr,
                        "source": "audit",
                        "label_basis": basis,
                        "head": head,
                    }
                )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8", newline="\n") as fh:
        for row in rows:
            fh.write(json.dumps(row, sort_keys=True) + "\n")

    by_label: dict[str, int] = {}
    for row in rows:
        by_label[row["label"]] = by_label.get(row["label"], 0) + 1
    print(f"wrote {len(rows)} rows to {args.out}")
    for label in sorted(by_label):
        print(f"  rows labelled {label}: {by_label[label]}")
    print(f"functions emitted: {len(emitted)}")
    total_skipped = sum(len(v) for v in skipped.values())
    print(f"functions skipped: {total_skipped}")
    for reason, names in skipped.items():
        print(f"  {reason}: {len(names)}")
        for item in names:
            print(f"    - {item}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
