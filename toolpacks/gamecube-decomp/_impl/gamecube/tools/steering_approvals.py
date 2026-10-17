#!/usr/bin/env python3
"""Site-bound evidence-review approvals (objective worker-compiler-loop plan 3.1).

The steering gate certifies a behaviour-identical construct the original
really had (a map-backed weak inline) only through a curated approval. An
approval is bound to one reviewed edit group at one site, never to a callee:

    {"schema": "steering-approval-v2",
     "game": "sms", "unit": "main/MarioUtil/foo", "target": "bar__4TFooFv",
     "base_rev": "<40-hex>", "site_file": "src/MarioUtil/foo.cpp", "site_lines": [12, 12],
     "group_digest": "<sha256>", "callee": "getX", "symbol": "getX__4TFooFv",
     "approved_by": "operator", "provenance": "...", "review_id": "...", "note": "..."}

`target` is the mangled function the group edits, `symbol` the construct it
introduces (the weak function). The gate's lookup (steering_check
`_find_approval`) requires every field: same game, a unit the group compiles
in, the exact target, the claim base revision, the same file, the same line
range and the same group digest. A row without them (the legacy
`{symbol, function}` shape) never certifies; `migrate` converts what it can.

Group digest (normalization): sha256 of the compact, key-sorted JSON

    {"v": 3, "edits": [{"removed": [...], "added": [...], "context": [...]}, ...]}

with the group's edits in file order and their lines normalized by
`normalize_lines`: outside literals, surrounding whitespace is stripped and
every inner run of whitespace collapsed to one space; string, character and
raw-string literals (prefixes and escapes included) are copied byte for byte,
so `"a  b"` and `"a b"` stay different. The lexer state (inside a
backslash-continued string, a raw string or a block comment) is carried from
line to line, and each edit starts in the state of its file at its first line
(`context`), so a literal spanning lines keeps its contents too. Lines empty
outside every literal are dropped.
Tokens, operands and comments are kept, so changed operands (literal contents
included), a different callee or any extra edit in the group give a different
digest.
Moving the group elsewhere changes `site_lines`. The file is bound by
`site_file`, not by the digest.

Site lines: 1-based, inclusive candidate-file line range covered by the
group's added lines (the base-side range of its removed lines when it adds
none).

    steering_approvals.py migrate --approvals F --report CHECK.json [...] [--game G] [--write]

converts legacy rows using gate reports (`check` output, or a `reduce`
report with `--decision`) of the attempt the approval was made for: a legacy
row converts when exactly one evidence-review group in the reports introduces
its symbol in its function with a single unit and target. The rest are listed
for manual handling. `--write` rewrites the file (converted rows replaced,
unconverted legacy rows kept; they are inert).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Iterable, Optional, Sequence

SCHEMA = "steering-approval-v2"
REQUIRED_FIELDS = ("game", "unit", "target", "base_rev", "site_file", "site_lines", "group_digest",
                   "callee", "symbol", "approved_by")
DIGEST_VERSION = 3  # v2: literal contents kept verbatim; v3: literal/comment state carried across lines
# R"delim( ... )delim" with an optional encoding prefix (u8, u, U, L).
_RAW_STRING = re.compile(r'(?:u8|u|U|L)?R"([^()\\\s]{0,16})\(')

# Lexer state carried from one physical line to the next: None (code), ("quote", '"' or "'") after a
# backslash-continued string or character literal, ("raw", ')delim"') inside a raw string,
# ("comment",) inside a block comment.
LexState = Optional[tuple]


def _collapse(text: str) -> str:
    return " ".join(text.split())


def _scan_quote(s: str, i: int, quote: str) -> tuple[int, bool]:
    """End index (exclusive) of a quoted literal body starting at `i` (after the opening quote), and
    whether it continues on the next line (a backslash escapes the line end)."""
    n = len(s)
    j = i
    while j < n and s[j] != quote:
        j += 2 if s[j] == "\\" else 1
    if j > n:  # the last character was a backslash: the newline is escaped
        return n, True
    return min(j + 1, n), False


def normalize_line_state(line: str, state: LexState = None) -> tuple[str, LexState, bool]:
    """One physical line for the digest, given the lexer state at its start: (text, state at its
    end, kept). Outside literals, whitespace runs collapse to one space and surrounding whitespace
    goes; string, character and raw-string literals (prefixes, escapes, continued lines) are copied
    byte for byte. `kept` is False only for a line that is empty outside every literal (dropped)."""
    s = str(line).rstrip("\r\n")
    out: list[str] = []
    i, n, space = 0, len(s), False
    in_literal = False
    if state is not None:
        kind = state[0]
        if kind == "raw":
            j = s.find(state[1])
            if j < 0:
                return s, state, True
            out.append(s[:j + len(state[1])])
            i, in_literal = j + len(state[1]), True
        elif kind == "quote":
            j, more = _scan_quote(s, 0, state[1])
            if more:
                return s, state, True
            out.append(s[:j])
            i, in_literal = j, True
        else:  # block comment
            j = s.find("*/")
            if j < 0:
                return _collapse(s), state, bool(_collapse(s))
            out.append(_collapse(s[:j + 2]))
            i = j + 2
    state = None
    while i < n:
        ch = s[i]
        if ch.isspace():
            space = True
            i += 1
            continue
        if space and out:
            out.append(" ")
        space = False
        if s.startswith("//", i):
            out.append(_collapse(s[i:]))
            break
        if s.startswith("/*", i):
            j = s.find("*/", i + 2)
            if j < 0:
                out.append(_collapse(s[i:]))
                state = ("comment",)
                break
            out.append(_collapse(s[i:j + 2]))
            i = j + 2
            continue
        raw = _RAW_STRING.match(s, i)
        if raw and (i == 0 or not (s[i - 1].isalnum() or s[i - 1] == "_")):
            close = ")" + raw.group(1) + '"'
            j = s.find(close, raw.end())
            in_literal = True
            if j < 0:
                out.append(s[i:])
                state = ("raw", close)
                break
            out.append(s[i:j + len(close)])
            i = j + len(close)
            continue
        if ch in "\"'":
            j, more = _scan_quote(s, i + 1, ch)
            in_literal = True
            out.append(s[i:j])
            if more:
                state = ("quote", ch)
                break
            i = j
            continue
        out.append(ch)
        i += 1
    text = "".join(out)
    return text, state, bool(text) or in_literal


def normalize_line(line: str) -> str:
    """One line on its own (the lexer state at its start is code)."""
    return normalize_line_state(line)[0]


def normalize_lines(lines: Sequence[str], state: LexState = None) -> list[str]:
    """Consecutive physical lines, the lexer state carried from each line to the next (so a
    continued or raw string spanning lines keeps its contents); dropped lines omitted."""
    out = []
    for line in lines:
        text, state, kept = normalize_line_state(line, state)
        if kept:
            out.append(text)
    return out


def lex_state_before(text: Optional[str], index: int) -> LexState:
    """The lexer state at the start of 0-based line `index` of `text` (None without the text)."""
    if text is None:
        return None
    state: LexState = None
    for line in text.splitlines()[:max(index, 0)]:
        state = normalize_line_state(line, state)[1]
    return state


def digest_edits(edits: Iterable[tuple]) -> str:
    """The group digest of `(removed, added)` line lists in file order, each optionally followed by
    the lexer states at the start of its removed and added lines (`lex_state_before`)."""
    rows = []
    for edit in edits:
        removed, added = edit[0], edit[1]
        removed_state = edit[2] if len(edit) > 2 else None
        added_state = edit[3] if len(edit) > 3 else None
        rows.append({"removed": normalize_lines(removed, removed_state),
                     "added": normalize_lines(added, added_state),
                     # an edit that starts inside a literal or comment differs from one that does not
                     "context": [list(removed_state or ()), list(added_state or ())]})
    body = json.dumps({"v": DIGEST_VERSION, "edits": rows}, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(body.encode()).hexdigest()


def group_digest(group, base_text: Optional[str] = None, cand_text: Optional[str] = None) -> str:
    """Digest of a steering_edits.Group. With the base and candidate texts, each edit starts in the
    lexer state of the file at its first line, so an edit inside a multi-line literal keeps it."""
    return digest_edits((e.removed, e.added, lex_state_before(base_text, e.base_start), lex_state_before(cand_text, e.cand_start))
                        for e in group.edits)


def site_lines(group) -> list[int]:
    """[first, last] candidate lines the group adds (base lines when it only removes)."""
    added = [(e.cand_line, e.cand_line + len(e.added) - 1) for e in group.edits if e.added]
    spans = added or [(e.base_line, e.base_line + max(len(e.removed), 1) - 1) for e in group.edits]
    return [min(a for a, _ in spans), max(b for _, b in spans)]


def group_patch(group) -> str:
    """A unified-diff view of the group (one hunk per edit) for human review."""
    out = [f"--- a/{group.file}", f"+++ b/{group.file}"]
    for e in group.edits:
        out.append(f"@@ -{e.base_line},{len(e.removed)} +{e.cand_line},{len(e.added)} @@")
        out += ["-" + x.rstrip("\r\n") for x in e.removed]
        out += ["+" + x.rstrip("\r\n") for x in e.added]
    return "\n".join(out) + "\n"


def site_bound(row: dict) -> bool:
    """Every field the lookup needs is present and well formed (a legacy row is not)."""
    if not isinstance(row, dict):
        return False
    for key in REQUIRED_FIELDS:
        if key == "site_lines":
            continue
        if not isinstance(row.get(key), str) or not row[key].strip():
            return False
    lines = row.get("site_lines")
    return (isinstance(lines, list) and len(lines) == 2 and all(isinstance(n, int) and n > 0 for n in lines)
            and lines[0] <= lines[1])


def game_id(approvals_path: Optional[Path] = None, env: Optional[dict] = None) -> Optional[str]:
    """The gate's game: ORCH_GAME_ID, then ORCH_GAME_DIR's game.json `id` (or its
    directory name), then `games/<id>/` in the approvals path. None = unknown
    (no approval certifies)."""
    env = os.environ if env is None else env
    explicit = (env.get("ORCH_GAME_ID") or "").strip()
    if explicit:
        return explicit
    game_dir = (env.get("ORCH_GAME_DIR") or "").strip()
    if game_dir:
        try:
            data = json.loads((Path(game_dir) / "game.json").read_text())
            if isinstance(data, dict) and isinstance(data.get("id"), str) and data["id"].strip():
                return data["id"].strip()
        except (OSError, ValueError):
            pass
        return Path(game_dir).name or None
    if approvals_path is not None:
        parts = Path(approvals_path).parts
        for i in range(len(parts) - 2):
            if parts[i] == "games" and parts[i + 2] == "knowledge":
                return parts[i + 1]
    return None


# --------------------------------------------------------------------------
# Legacy migration
# --------------------------------------------------------------------------


def _reports(paths: Sequence[str], decision_paths: Sequence[str]) -> list[tuple[dict, dict]]:
    """(reduce, decision) pairs from `check` reports or reduce reports (+ --decision, by position)."""
    out = []
    for i, path in enumerate(paths):
        doc = json.loads(Path(path).read_text())
        if isinstance(doc.get("reduce"), dict):
            out.append((doc["reduce"], doc.get("decision") or {}))
            continue
        dec = json.loads(Path(decision_paths[i]).read_text()) if i < len(decision_paths) else {}
        out.append((doc, dec))
    return out


def _review_candidates(reduce: dict, decision: dict, game: Optional[str]) -> list[dict]:
    """One candidate per evidence-review group with its site binding."""
    out = []
    for g in reduce.get("groups") or []:
        ev = g.get("evidence") or {}
        if ev.get("kind") not in ("evidence_review", "approved", "approved_mixed"):
            continue
        targets = sorted({(f.get("unit"), f.get("name")) for f in decision.get("functions") or []
                          if g.get("id") in (f.get("groups") or [])})
        out.append({"group": g, "evidence": ev, "targets": targets,
                    "game": game or reduce.get("game"), "base_rev": reduce.get("base_rev")})
    return out


def convert(row: dict, candidates: list[dict]) -> tuple[Optional[dict], Optional[str]]:
    """The site-bound row for a legacy one, or (None, why it needs manual handling)."""
    import steering_check as sc

    if site_bound(row):
        return dict(row), None
    sym, fn = str(row.get("symbol") or ""), str(row.get("function") or "")
    if not sym or not fn:
        return None, "legacy row without symbol and function"
    hits = []
    for c in candidates:
        g, ev = c["group"], c["evidence"]
        exact = {str(ev.get("symbol") or ""), sc.normalize_name(sc._mwcc_qualified(str(ev.get("symbol") or "")))}
        if sym not in exact and sc.normalize_name(sym) not in exact:
            continue
        if not any(sc._names_match(fn, f) for f in g.get("functions") or []):
            continue
        hits.append(c)
    if not hits:
        return None, "no evidence-review group in the reports introduces this symbol in this function"
    if len(hits) > 1:
        return None, f"{len(hits)} matching groups in the reports: ambiguous site"
    c = hits[0]
    g, ev = c["group"], c["evidence"]
    site = ev.get("site") or {}
    units = g.get("units") or []
    missing = [k for k, v in (("game", c["game"]), ("base_rev", c["base_rev"]), ("site_lines", g.get("site_lines")),
                              ("group_digest", g.get("group_digest"))) if not v]
    if missing:
        return None, "report lacks " + ", ".join(missing) + " (re-run the gate with this version)"
    if len(units) != 1:
        return None, f"group compiles in {len(units)} units"
    if len(c["targets"]) != 1:
        return None, f"group touches {len(c['targets'])} target functions in the decision"
    unit, target = c["targets"][0]
    if unit != units[0]:
        return None, "decision target unit differs from the group unit"
    new = {
        "schema": SCHEMA, "game": c["game"], "unit": unit, "target": target, "base_rev": c["base_rev"],
        "site_file": g.get("file"), "site_lines": list(g["site_lines"]), "group_digest": g["group_digest"],
        "callee": ev.get("callee") or site.get("callee"), "symbol": ev.get("symbol"),
        "approved_by": row.get("approved_by") or "legacy", "provenance": row.get("provenance") or "",
        "migrated_from": {k: v for k, v in row.items() if k in ("symbol", "function", "provenance", "approved_by")},
    }
    return (new, None) if site_bound(new) else (None, "converted row is incomplete")


def migrate(approvals: list[dict], reports: list[tuple[dict, dict]], game: Optional[str] = None) -> dict:
    candidates = [c for red, dec in reports for c in _review_candidates(red, dec, game)]
    rows, converted, manual, current = [], [], [], 0
    for i, row in enumerate(approvals):
        if site_bound(row):
            rows.append(row)
            current += 1
            continue
        new, why = convert(row, candidates)
        if new is None:
            rows.append(row)  # inert: legacy rows never certify
            manual.append({"index": i, "row": row, "reason": why})
        else:
            rows.append(new)
            converted.append({"index": i, "row": new})
    return {"rows": rows, "converted": converted, "manual": manual, "already_site_bound": current}


def _read_jsonl(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("migrate", help="convert legacy approvals to site-bound rows")
    p.add_argument("--approvals", required=True)
    p.add_argument("--report", action="append", default=[], help="check report, or reduce report (pair with --decision)")
    p.add_argument("--decision", action="append", default=[])
    p.add_argument("--game")
    p.add_argument("--write", action="store_true")
    p = sub.add_parser("digest", help="digest of a reduce report's groups")
    p.add_argument("--reduce", required=True)
    args = ap.parse_args(argv)
    if args.cmd == "digest":
        red = json.loads(Path(args.reduce).read_text())
        print(json.dumps({g["id"]: {"file": g.get("file"), "site_lines": g.get("site_lines"),
                                    "group_digest": g.get("group_digest")} for g in red.get("groups") or []}, indent=2))
        return 0
    path = Path(args.approvals)
    result = migrate(_read_jsonl(path), _reports(args.report, args.decision), game=args.game)
    if args.write:
        path.write_text("".join(json.dumps(r, sort_keys=True) + "\n" for r in result["rows"]))
    print(json.dumps({k: v for k, v in result.items() if k != "rows"}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
