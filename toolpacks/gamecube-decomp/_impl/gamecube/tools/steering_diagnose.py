"""Turn a steering-gate rejection into a probe for the next worker attempt.

`build_probe(function, groups, mwcc_fn, ...)` takes one function entry from
`steering_check.py decide`, the edit groups touching it (reduce output) and
its `mwcc` row, and returns the probe JSON of the implementation contract
(section 2.4), at most 3 KB serialized:

  {function, unit, match:{base,candidate,real_only},
   steering_edits:[{file,line,shapes,before,after,delta}],
   unresolved:[{file,line,shapes,reason}],
   hypotheses:[{cause,why,how_to_check}],
   evidence:{map_callees,emitted_inlines,unused,header_inlines,sibling_uses,jsystem_hits},
   lessons:[{id,steering,real_cause}],
   rulings:[{id,pr,reviewer,quote,rule}]}

A steering edit is a probe: it shows what codegen the original needs, not
the fix. Hypotheses come from a shape table (plan 2.4); evidence is
prefetched read-only through evidence_search.py; lessons come from the
curated lessons.jsonl store; maintainer review rulings come from
review_rulings.jsonl (next to lessons.jsonl, or ORCH_REVIEW_RULINGS) and are
matched by rule: the lint rule ids and gate checks this probe is about (from
the steering shapes, the function's violations, or `rules=`) against each
ruling's `enforced_by`. Every lookup is optional and guarded.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Optional

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

PROBE_LIMIT = 3072
LIST_LIMIT = 6
TEXT_LIMIT = 160

# shape -> [(cause, why)]
SHAPE_HYPOTHESES: dict[str, list[tuple[str, str]]] = {
    "temp_alias": [
        ("missing inline function", "a single-use temp moves registers the way an inline's parameter or return value does"),
        ("wrong type or signedness", "a temp of another type changes conversions and register classes"),
    ],
    "accessor_swap": [
        ("wrong inline used", "field vs accessor only matters when the original called a different inline"),
        ("header inline body wrong", "the accessor's body in the header may not match the original inline"),
    ],
    "ternary_if": [
        ("original used an inline with that shape", "if vs ?: moves branches the way an inline's return does"),
        ("different operand types", "the two arms may have had different types in the original"),
    ],
    "operand_order": [
        ("original used an inline with that shape", "operand order inside an inline fixes register order"),
        ("different operand types", "a cast or wider type on one side changes evaluation order"),
    ],
    "statement_permutation": [
        ("missing inline function", "an inline call groups statements and fixes their order"),
        ("extra temporary object", "a constructed temporary (Vec, TVec3) reorders loads and stores"),
    ],
    "decl_reorder": [
        ("declaration types", "local declaration types and order set stack slots and registers"),
        ("missing inline function", "inlined bodies add their own locals"),
    ],
    "type_spelling": [
        ("wrong type or signedness", "the spelling swap hides a real type difference elsewhere (member, return or parameter type)"),
    ],
    "float_form": [
        ("constant or expression type differs", "float vs double constants or a missing cast change the instruction"),
    ],
    "compound_assign_split": [
        ("missing inline function", "a split assignment mimics an inline returning a value"),
    ],
    "bool_form": [
        ("return or variable type is bool vs int", "a bool result is materialized differently from an int"),
    ],
    "codegen_directive": [
        ("directive forces codegen", "volatile/register/pragma/asm force a shape the original got from a real construct"),
    ],
    "other": [
        ("change not separable", "the group mixes a real change with a rewrite; keep real fixes in their own statements"),
    ],
    "data_order": [
        ("definition order", "MWCC lays out data in definition order; check the original addresses (symbols.txt)"),
    ],
}
# steering shape -> the lint rule that owns it (review_rulings.jsonl `enforced_by` ids)
SHAPE_RULES: dict[str, str] = {
    "temp_alias": "sms_single_use_temp",
    "accessor_swap": "sms_accessor_evidence",
    "codegen_directive": "sms_codegen_directive",
}
DEFAULT_SHAPE_RULE = "sms_form_rewrite"
# decide violation kind -> rules and gate checks
VIOLATION_RULES: dict[str, list[str]] = {
    "dead_unused_body": ["sms_unused_reconstruction", "steering_gate:unused_check"],
    "out_of_order": ["sms_out_of_order_fill", "steering_gate:out_of_order"],
}
RULINGS_FILE = "review_rulings.jsonl"
STACK_HYPOTHESIS = ("missing inline function", "only the stack frame differs; inlines add stack slots")
EVIDENCE_REVIEW = ("inline with provenance", "the callee is a weak inline the original emitted in this unit; needs review")


def _class_of(name: str) -> Optional[str]:
    q = name.split("(")[0]
    parts = q.split("::")
    return parts[-2] if len(parts) >= 2 else None


def _clip(text: Any, limit: int = TEXT_LIMIT) -> Any:
    if not isinstance(text, str):
        return text
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= limit else text[: limit - 3] + "..."


def _lines(rows: list[str]) -> str:
    return " / ".join(x.strip() for x in rows if x.strip())


def _how_to_check(cause: str, cls: Optional[str], member: Optional[str], symbol: str) -> str:
    t = f" --type {cls}" if cls else ""
    m = f" --member {member}" if member else ""
    if cause in ("missing inline function", "original used an inline with that shape", "extra temporary object",
                 "compound_assign_split"):
        return f"real_code_evidence map-unit --unit <unit>; real_code_evidence inlines{t}"
    if cause in ("wrong inline used", "header inline body wrong", "inline with provenance"):
        return f"real_code_evidence inlines{t}{m}; real_code_evidence usage --inline {member or '<inline>'}"
    if cause in ("wrong type or signedness", "different operand types", "declaration types",
                 "return or variable type is bool vs int", "constant or expression type differs"):
        return f"real_code_evidence map-calls --symbol {symbol}; type_layout_lookup{t}"
    if cause == "definition order":
        return "compare config/<version>/symbols.txt addresses of the moved definitions"
    return f"real_code_evidence map-calls --symbol {symbol}"


def _member_hint(groups: list[dict]) -> Optional[str]:
    for g in groups:
        for f in g.get("findings") or []:
            if f.get("shape") == "accessor_swap":
                after = f.get("after") or ""
                m = re.search(r"([A-Za-z_]\w*)\s*\(", after)
                if m:
                    return m.group(1)
        for c in g.get("new_calls") or []:
            return c
    return None


def hypotheses(shapes: list[str], *, stack_only: bool, evidence_review: bool, cls: Optional[str],
               member: Optional[str], symbol: str) -> list[dict]:
    out: list[dict] = []
    seen = set()

    def add(cause: str, why: str) -> None:
        if cause in seen:
            return
        seen.add(cause)
        out.append({"cause": cause, "why": why, "how_to_check": _how_to_check(cause, cls, member, symbol)})

    if evidence_review:
        add(*EVIDENCE_REVIEW)
    if stack_only:
        add(*STACK_HYPOTHESIS)
    for shape in shapes:
        for cause, why in SHAPE_HYPOTHESES.get(shape, []):
            add(cause, why)
    if not out:
        add("missing inline function", "the most common real cause of steering-dependent matches")
    return out


def load_lessons(path: Optional[Path]) -> list[dict]:
    if path is None or not Path(path).is_file():
        return []
    out = []
    for line in Path(path).read_text(errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if isinstance(row, dict):
            out.append(row)
    return out


def pick_lessons(lessons: list[dict], function: str, shapes: list[str], limit: int = 3) -> list[dict]:
    q = function.split("(")[0]
    scored = []
    for row in lessons:
        steering = row.get("steering") or {}
        real = row.get("real_cause") or {}
        score = 0
        if str(row.get("function") or "").split("(")[0] == q:
            score += 10
        score += 2 * len(set(steering.get("shapes") or []) & set(shapes))
        if row.get("outcome") in ("real", "loop_confirmed"):
            score += 1
        if score <= 1:
            continue
        scored.append((-score, str(row.get("id")), {
            "id": row.get("id"),
            "steering": _clip(steering.get("summary") or ""),
            "real_cause": _clip(real.get("summary") or ""),
        }))
    return [x[2] for x in sorted(scored)[:limit]]


def rulings_path_for(lessons_path: Optional[Path]) -> Optional[Path]:
    """ORCH_REVIEW_RULINGS, else review_rulings.jsonl next to the lessons file."""
    env = os.environ.get("ORCH_REVIEW_RULINGS")
    if env:
        return Path(env)
    return Path(lessons_path).parent / RULINGS_FILE if lessons_path is not None else None


def probe_rules(shapes: list[str], function: dict, has_steering: bool, extra: Optional[list[str]] = None) -> list[str]:
    """The lint rule ids and gate checks a probe is about, in a stable order."""
    out: list[str] = []

    def add(rule: str) -> None:
        if rule and rule not in out:
            out.append(rule)
    for shape in shapes:
        if shape in ("cosmetic", "data_order"):
            continue
        add(SHAPE_RULES.get(shape, DEFAULT_SHAPE_RULE))
    if has_steering:
        add("steering_gate")
    for violation in function.get("violations") or []:
        kind = violation.get("kind") if isinstance(violation, dict) else violation
        for rule in VIOLATION_RULES.get(str(kind), []):
            add(rule)
    for rule in extra or []:
        add(rule)
    return out


def pick_rulings(rulings: list[dict], rules: list[str], limit: int = 2) -> list[dict]:
    """Rulings whose `enforced_by` names one of `rules`, most overlap first."""
    wanted = set(rules)
    scored = []
    for index, row in enumerate(rulings):
        enforced = row.get("enforced_by") or []
        overlap = len(wanted & set(enforced)) if isinstance(enforced, list) else 0
        if not overlap:
            continue
        scored.append((-overlap, index, {
            "id": row.get("id"),
            "pr": row.get("pr"),
            "reviewer": row.get("reviewer"),
            "quote": _clip(row.get("quote") or ""),
            "rule": _clip(row.get("rule") or ""),
        }))
    return [x[2] for x in sorted(scored, key=lambda t: (t[0], t[1]))[:limit]]


def prefetch_evidence(repo: Optional[Path], symbol: str, unit: str, cls: Optional[str], member: Optional[str],
                      version: Optional[str] = None) -> dict:
    out: dict[str, list] = {"map_callees": [], "emitted_inlines": [], "unused": [], "header_inlines": [],
                            "sibling_uses": [], "jsystem_hits": []}
    if repo is None:
        return out
    try:
        import evidence_search
    except Exception:
        return out
    try:
        info = evidence_search.map_calls(repo, symbol, version)
        out["map_callees"] = [c.get("name") for c in info.get("callees") or []][:LIST_LIMIT]
    except Exception:
        pass
    try:
        info = evidence_search.map_unit(repo, unit, version)
        fns = info.get("functions") or []
        out["emitted_inlines"] = [f.get("name") for f in fns if f.get("kind") == "weak"][:LIST_LIMIT]
        out["unused"] = [f.get("name") for f in fns if f.get("unused")][:LIST_LIMIT]
    except Exception:
        pass
    if cls:
        try:
            rows = evidence_search.inlines(repo, cls, member)
            out["header_inlines"] = [f"{r.get('name')} ({r.get('file')}:{r.get('line')})" for r in rows][:LIST_LIMIT]
        except Exception:
            pass
    if member:
        try:
            rows = evidence_search.usage(repo, member)
            out["sibling_uses"] = [f"{r.get('function')} ({r.get('match_percent')})" for r in rows][:LIST_LIMIT]
        except Exception:
            pass
        try:
            hits = evidence_search.jsystem(member, limit=LIST_LIMIT)
            out["jsystem_hits"] = [f"{h.get('game')}:{h.get('file')}:{h.get('line')}" for h in hits.get("hits") or []][:LIST_LIMIT]
        except Exception:
            pass
    return out


def build_probe(function: dict, groups: list[dict], mwcc_fn: Optional[dict] = None, *,
                evidence_repo: Optional[Path] = None, lessons_path: Optional[Path] = None,
                version: Optional[str] = None, prefetch: bool = True, limit: int = PROBE_LIMIT,
                rulings_path: Optional[Path] = None, rules: Optional[list[str]] = None) -> dict:
    name = function.get("demangled") or function.get("name") or ""
    symbol = function.get("name") or name
    deltas = {}
    for row in (mwcc_fn or {}).get("attribution") or []:
        deltas[row.get("group")] = row.get("delta")
    steering_rows, unresolved_rows = [], []
    steering_seeds: list[tuple[float, list[str]]] = []
    unresolved_seeds: list[str] = []
    evidence_review = False
    for g in groups:
        status = g.get("status")
        g_shapes = [s for s in (g.get("shapes") or []) if s != "cosmetic"]
        if status == "removable" and not g.get("cosmetic"):
            delta = deltas.get(g.get("id"))
            weight = abs(delta) if isinstance(delta, (int, float)) else 0.0
            steering_seeds.append((-weight, [s for s in g_shapes if s != "other"]))
            steering_rows.append({
                "file": g.get("file"),
                "line": g.get("line"),
                "shapes": g_shapes or ["same behaviour"],
                "before": _clip(_lines(g.get("base_lines") or [])),
                "after": _clip(_lines(g.get("cand_lines") or [])),
                "delta": deltas.get(g.get("id")),
            })
        elif status == "unresolved":
            unresolved_seeds += g_shapes
            evidence_review |= (g.get("evidence") or {}).get("kind") == "evidence_review"
            unresolved_rows.append({
                "file": g.get("file"),
                "line": g.get("line"),
                "shapes": g_shapes + list(g.get("real_shapes") or []),
                "reason": _clip(g.get("reason") or ""),
            })
    steering_rows.sort(key=lambda r: -(abs(r["delta"]) if isinstance(r.get("delta"), (int, float)) else 0))
    shapes = [x for _, seeds in sorted(steering_seeds, key=lambda t: t[0]) for x in seeds] + unresolved_seeds
    seen: list[str] = []
    for s in shapes:
        if s not in seen:
            seen.append(s)
    cls = _class_of(name)
    member = _member_hint(groups)
    probe = {
        "function": name,
        "symbol": symbol,
        "unit": function.get("unit"),
        "decision": function.get("decision"),
        "match": function.get("match") or {},
        "steering_edits": steering_rows,
        "unresolved": unresolved_rows,
        "hypotheses": hypotheses(seen, stack_only=bool(function.get("stack_only_perturbation")),
                                 evidence_review=evidence_review, cls=cls, member=member, symbol=symbol),
        "evidence": prefetch_evidence(evidence_repo, symbol, function.get("unit") or "", cls, member, version)
        if prefetch else {},
        "lessons": pick_lessons(load_lessons(lessons_path), name, seen),
        "rulings": pick_rulings(load_lessons(rulings_path if rulings_path is not None else rulings_path_for(lessons_path)),
                                probe_rules(seen, function, bool(steering_rows), rules)),
    }
    return fit(probe, limit)


def _size(obj: Any) -> int:
    return len(json.dumps(obj, separators=(",", ":")))


def fit(probe: dict, limit: int = PROBE_LIMIT) -> dict:
    """Shrink the probe until it serializes to at most `limit` bytes."""
    steps = [
        lambda p: _cap_lists(p, 4),
        lambda p: _cap_evidence(p, 3),
        lambda p: p.update(lessons=p["lessons"][:1]),
        lambda p: p.update(rulings=p["rulings"][:1]),
        lambda p: _cap_lists(p, 2),
        lambda p: _cap_text(p, 80),
        lambda p: _cap_evidence(p, 1),
        lambda p: p.update(lessons=[]),
        lambda p: p.update(rulings=[]),
        lambda p: p.update(evidence={}),
        lambda p: _cap_lists(p, 1),
        lambda p: p.update(hypotheses=p["hypotheses"][:1]),
    ]
    for step in steps:
        if _size(probe) <= limit:
            break
        step(probe)
    if _size(probe) > limit:
        probe = {k: probe.get(k) for k in ("function", "unit", "decision", "match")}
        probe["truncated"] = True
    return probe


def _cap_lists(p: dict, n: int) -> None:
    for key in ("steering_edits", "unresolved", "hypotheses"):
        if len(p.get(key) or []) > n:
            p[key] = p[key][:n]


def _cap_evidence(p: dict, n: int) -> None:
    ev = p.get("evidence") or {}
    for k, v in list(ev.items()):
        ev[k] = (v or [])[:n]


def _cap_text(p: dict, n: int) -> None:
    for key in ("steering_edits", "unresolved", "hypotheses"):
        for row in p.get(key) or []:
            for k, v in list(row.items()):
                if isinstance(v, str):
                    row[k] = _clip(v, n)
