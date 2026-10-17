"""Turn a steering-gate rejection into a probe for the next worker attempt.

`build_probe(function, groups, mwcc_fn, ...)` takes one function entry from
`steering_check.py decide`, the edit groups touching it (reduce output) and
its `mwcc` row, and returns the probe JSON of the implementation contract
(section 2.4), at most 3 KB serialized:

  {function, unit, match:{base,candidate,real_only},
   steering_edits:[{file,line,shapes,before,after,delta}],
   unresolved:[{file,line,shapes,reason}],
   hypotheses:[{cause,why,how_to_check}],
   evidence:{map_callees,emitted_inlines,unused,header_inlines,sibling_uses,sibling_hypotheses,jsystem_hits},
   lessons:[{id,steering,real_cause}],
   rulings:[{id,pr,reviewer,quote,rule}]}

With the steering-explain job's measured `compiler_delta` (plan 3.4.2;
`apply_compiler_delta`, or `build_probe(compiler_delta=)`), the probe leads
with it: `compiler_delta` (summary lines, then compact changes), then
`candidate_constructs` (per change kind, the construct kinds that produce it,
from SMS's measured MWCC facts in CONSTRUCT_KINDS; `construct_kinds` holds
each fact once), and `hypotheses` stays as the shape-table fallback
(`hypotheses_basis`). An unavailable delta is kept as
`{unavailable: reason}`, never as an empty one. `fit` drops detail first and
the measured summary lines last.

A steering edit is a probe: it shows what codegen the original needs, not
the fix. Hypotheses come from a shape table (plan 2.4); evidence is
prefetched read-only through evidence_search.py; lessons come from the
curated lessons.jsonl store; maintainer review rulings come from
review_rulings.jsonl (next to lessons.jsonl, or ORCH_REVIEW_RULINGS) and are
matched by rule: the lint rule ids and gate checks this probe is about (from
the steering shapes, the function's violations, or `rules=`) against each
ruling's `enforced_by`. Every lookup is optional and guarded.

Siblings (`evidence_search.usage`) keep their certification:
`sibling_uses` holds only matched ones (100% and certified, or ungated on a
game whose gate is confirmed off), and `sibling_hypotheses` the rest
(unverified, or unknown when certification data is missing or malformed);
each row is
`{function, match_percent, certification, revision}`, so no size cap can turn
an unverified sibling into evidence.
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

# Measured compiler delta (plan 3.4.2): a `compiler_delta` change kind -> the construct kinds that
# produce that kind of change in GC/1.2.5. Candidates only: a kind says what sort of source
# difference to look for, never which one; each fact is SMS's measured codegen fact
# (sms_compiler standard, doldecomp/sms@4641b450 docs/AGENT_MATCHING_TIPS.md#<anchor>).
TIPS = "doldecomp/sms@4641b450 docs/AGENT_MATCHING_TIPS.md#"
_WEB_SPLIT = ("web split", "a variable that gets a new value starts a new web, numbered as a high compiler object",
              "the-first-web-and-later-webs", "Coloring.c")
_CSE_BIRTH = ("CSE birth", "IRO_CommonSubs creates the CSE value at the second occurrence of its expression",
              "when-cse-temps-are-born", "IroCSE.c")
_INLINE_PASS = ("inline pass", "pass 0 expands written calls with no limit; passes 1-3 take callees of at most 10/7/3 "
                "statements, and a call in an expanded call's argument is one pass deeper", "the-inline-pass-ladder",
                "CInline.c")
_DEGREE_LIMIT = ("degree limit", "a node of degree 29 or more is coloured first (`this` in r31, not r28); one vreg more "
                 "or less in the original moves it", "the-degree-limit-this-in-r31-instead-of-r28", "Coloring.c")
_COALESCED = ("coalesced neighbour", "a value that goes straight into an argument register is coalesced, never "
              "pushed, and adds one to every neighbour's degree", "coalesced-nodes-raise-every-neighbours-degree",
              "InterferenceGraph.c")
_BOUND_ARGS = ("bound-argument order", "an inline binds each argument it cannot repeat safely, last parameter first",
               "bound-arguments-run-last-parameter-first", "CInline.c")
_INLINE_OBJECTS = ("inline vs named local", "every compiler @NNN object outranks every named local, and inside an "
                   "inline expansion the order flips", "inside-an-inline-expansion-the-order-flips", "Coloring.c")
_FRAME_OWNER = ("frame slot owner", "the slot's owner is the local, temporary or inline local the original had "
                "there", "", "StackFrameEABI.c")
CONSTRUCT_KINDS: dict[str, list[tuple[str, str, str, str]]] = {
    "node_added": [_WEB_SPLIT, _CSE_BIRTH, _INLINE_PASS],
    "node_removed": [_WEB_SPLIT, _CSE_BIRTH, _INLINE_PASS],
    "degree": [_DEGREE_LIMIT, _COALESCED],
    "coalesce": [_COALESCED, _BOUND_ARGS],
    "color_order": [_DEGREE_LIMIT, _INLINE_OBJECTS, _BOUND_ARGS],
    "register": [_DEGREE_LIMIT, _BOUND_ARGS, _INLINE_OBJECTS],
    "spill": [_DEGREE_LIMIT],
    "inline_verdict": [_INLINE_PASS],
    "cse_temp": [_CSE_BIRTH],
    "frame_slot": [_FRAME_OWNER, _INLINE_PASS],
}
CANDIDATE_LABEL = ("candidate construct kinds for the measured changes, not evidence of the original; facts: "
                   f"{TIPS.rstrip('#')}<see>; check: real_code_evidence compiler --query <kind> --path <mwcc>")
FALLBACK_LABEL = "shape table (fallback: guesses from the edit shapes, not measured)"
DELTA_CHANGE_KEYS = ("kind", "summary", "match")


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
                            "sibling_uses": [], "sibling_hypotheses": [], "jsystem_hits": []}
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
            out["sibling_uses"] = [_sibling(r) for r in rows if _sibling_matched(r)][:LIST_LIMIT]
            out["sibling_hypotheses"] = [_sibling(r) for r in rows if not _sibling_matched(r)][:LIST_LIMIT]
        except Exception:
            pass
        try:
            hits = evidence_search.jsystem(member, limit=LIST_LIMIT)
            out["jsystem_hits"] = [f"{h.get('game')}:{h.get('file')}:{h.get('line')}" for h in hits.get("hits") or []][:LIST_LIMIT]
        except Exception:
            pass
    return out


EVIDENCE_CERTIFICATIONS = ("certified", "ungated")


def _sibling_matched(row: dict) -> bool:
    """`evidence_search.sibling_matched`: 100% and certified or ungated; a row without certification is unknown."""
    percent = row.get("match_percent")
    return isinstance(percent, (int, float)) and percent >= 100.0 and row.get("certification") in EVIDENCE_CERTIFICATIONS


def _sibling(row: dict) -> dict:
    revision = row.get("revision")
    return {
        "function": _clip(row.get("function")),
        "match_percent": row.get("match_percent"),
        "certification": row.get("certification") or "unknown",
        "revision": revision[:12] if isinstance(revision, str) else None,
    }


def delta_present(delta: Any) -> bool:
    """A measured delta: summary lines and no `unavailable` (an unavailable one is never an empty delta)."""
    return isinstance(delta, dict) and not delta.get("unavailable") and isinstance(delta.get("summary_lines"), list)


def compact_delta(delta: dict) -> dict:
    """The probe's copy of a measured `compiler_delta`: summary lines first, changes without raw ids."""
    out = {"summary_lines": [str(x) for x in delta.get("summary_lines") or []]}
    out["changes"] = [{k: c.get(k) for k in DELTA_CHANGE_KEYS if c.get(k) is not None}
                      for c in delta.get("changes") or [] if isinstance(c, dict)]
    for key in ("change_counts", "changes_truncated", "version", "observation_id", "variant", "label", "a", "b",
                "unavailable_points", "full_report"):
        if delta.get(key) not in (None, [], {}):
            out[key] = delta[key]
    return out


def construct_candidates(delta: Any, limit: int = LIST_LIMIT) -> tuple[list[dict], dict[str, dict]]:
    """Per measured change, in the delta's order, the construct kinds that produce that kind of
    change; and each named kind once, with its fact, its source and a compiler-source query.
    Empty without a measured delta."""
    if not delta_present(delta):
        return [], {}
    rows: list[dict] = []
    kinds: dict[str, dict] = {}
    seen: set[str] = set()
    for change in delta.get("changes") or []:
        kind = change.get("kind") if isinstance(change, dict) else None
        table = CONSTRUCT_KINDS.get(str(kind))
        key = f"{kind}:{change.get('summary') if isinstance(change, dict) else ''}"
        if not table or key in seen:
            continue
        seen.add(key)
        rows.append({"change_kind": kind, "change": _clip(change.get("summary") or kind, 100),
                     "kinds": [name for name, *_ in table]})
        for name, why, anchor, src in table:
            kinds.setdefault(name, {"why": why, **({"see": f"#{anchor}"} if anchor else {}), "mwcc": src})
        if len(rows) >= limit:
            break
    return rows, kinds


def apply_compiler_delta(probe: Optional[dict], delta: dict, *, function: Optional[str] = None,
                         unit: Optional[str] = None, limit: int = PROBE_LIMIT) -> dict:
    """`probe` with the explain job's `compiler_delta`: a measured one leads (its summary lines,
    then candidate construct kinds per change), the shape hypotheses stay as the fallback; an
    unavailable one is recorded as such. Re-fitted to `limit`."""
    out = dict(probe or {})
    out.setdefault("function", function or "")
    out.setdefault("symbol", function or out.get("function"))
    out.setdefault("unit", unit)
    for key in ("compiler_delta", "candidate_basis", "candidate_constructs", "construct_kinds", "hypotheses_basis",
                "truncated"):
        out.pop(key, None)
    hypotheses_list = out.pop("hypotheses", None)
    rest = {k: out.pop(k) for k in list(out) if k not in ("function", "symbol", "unit", "decision", "match")}
    if delta_present(delta):
        out["compiler_delta"] = compact_delta(delta)
        out["candidate_basis"] = CANDIDATE_LABEL
        out["candidate_constructs"], out["construct_kinds"] = construct_candidates(delta)
        if hypotheses_list is not None:
            out["hypotheses"] = hypotheses_list
            out["hypotheses_basis"] = FALLBACK_LABEL
    else:
        out["compiler_delta"] = {"unavailable": str((delta or {}).get("unavailable") or "unavailable")}
        if hypotheses_list is not None:
            out["hypotheses"] = hypotheses_list
    out.update(rest)
    return fit(out, limit)


def build_probe(function: dict, groups: list[dict], mwcc_fn: Optional[dict] = None, *,
                evidence_repo: Optional[Path] = None, lessons_path: Optional[Path] = None,
                version: Optional[str] = None, prefetch: bool = True, limit: int = PROBE_LIMIT,
                rulings_path: Optional[Path] = None, rules: Optional[list[str]] = None,
                compiler_delta: Optional[dict] = None) -> dict:
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
    if compiler_delta is not None:  # the explain job's measurement: measured changes lead
        return apply_compiler_delta(probe, compiler_delta, limit=limit)
    return fit(probe, limit)


def _size(obj: Any) -> int:
    return len(json.dumps(obj, separators=(",", ":")))


def fit(probe: dict, limit: int = PROBE_LIMIT) -> dict:
    """Shrink the probe until it serializes to at most `limit` bytes. Detail goes first; a measured
    `compiler_delta`'s summary lines go last (the candidate kinds and the shape fallback before them)."""
    measured = delta_present(probe.get("compiler_delta"))
    steps = [
        lambda p: _cap_delta(p, DELTA_CHANGE_KEYS[:2]),
        lambda p: _cap_lists(p, 4),
        lambda p: _cap_evidence(p, 3),
        lambda p: p.update(lessons=p["lessons"][:1]) if "lessons" in p else None,
        lambda p: p.update(rulings=p["rulings"][:1]) if "rulings" in p else None,
        lambda p: _cap_lists(p, 2),
        lambda p: _cap_text(p, 80),
        lambda p: _cap_evidence(p, 1),
        lambda p: p.update(lessons=[]) if "lessons" in p else None,
        lambda p: p.update(rulings=[]) if "rulings" in p else None,
        lambda p: p.update(evidence={}) if "evidence" in p else None,
        lambda p: _cap_constructs(p, 4, 2),
        lambda p: _cap_lists(p, 1),
        lambda p: p.update(hypotheses=p["hypotheses"][:1]) if "hypotheses" in p else None,
        lambda p: _cap_delta(p, DELTA_CHANGE_KEYS[:1]),
        _drop_delta_changes,  # `change_counts` keeps the tally; every summary line outranks them
        lambda p: _cap_constructs(p, 2, 1),
    ]
    if measured:  # the measured candidates outrank the shape fallback
        steps += [lambda p: p.update(hypotheses=[]), lambda p: _cap_constructs(p, 1, 1)]
    for step in steps:
        if _size(probe) <= limit:
            break
        step(probe)
    if _size(probe) > limit:
        small = {k: probe.get(k) for k in ("function", "symbol", "unit", "decision", "match")}
        delta = probe.get("compiler_delta")
        if isinstance(delta, dict):
            small["compiler_delta"] = {k: v for k, v in delta.items() if k in (
                "summary_lines", "changes", "change_counts", "changes_omitted", "version", "observation_id", "unavailable")}
        small["truncated"] = True
        probe = small
        delta = probe.get("compiler_delta")
        if isinstance(delta, dict) and _size(probe) > limit and delta.pop("changes", None) is not None:
            delta["changes_omitted"] = True  # change details go before any measured summary line
        lines = (delta or {}).get("summary_lines") if isinstance(delta, dict) else None
        while isinstance(lines, list) and lines and _size(probe) > limit:
            lines.pop()
            delta["summary_lines_truncated"] = True
    return probe


def _cap_delta(p: dict, keys: tuple) -> None:
    delta = p.get("compiler_delta")
    if isinstance(delta, dict) and isinstance(delta.get("changes"), list):
        delta["changes"] = [{k: c.get(k) for k in keys if c.get(k) is not None} for c in delta["changes"] if isinstance(c, dict)]
        for change in delta["changes"]:
            if isinstance(change.get("summary"), str):
                change["summary"] = _clip(change["summary"], 80)


def _drop_delta_changes(p: dict) -> None:
    delta = p.get("compiler_delta")
    if isinstance(delta, dict) and delta.pop("changes", None) is not None:
        delta["changes_omitted"] = True


def _cap_constructs(p: dict, n: int, kinds: int) -> None:
    """At most `n` changes with `kinds` construct kinds each; facts kept only for the kinds still named."""
    rows = p.get("candidate_constructs")
    if isinstance(rows, list):
        p["candidate_constructs"] = rows[:n]
        for row in p["candidate_constructs"]:
            row["kinds"] = (row.get("kinds") or [])[:kinds]
        named = {k for row in p["candidate_constructs"] for k in row["kinds"]}
        if isinstance(p.get("construct_kinds"), dict):
            p["construct_kinds"] = {k: v for k, v in p["construct_kinds"].items() if k in named}


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
