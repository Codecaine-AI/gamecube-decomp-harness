#!/usr/bin/env python3
"""Read the traced compiler's `mwcc-trace-v1` stream and rebuild coloring snapshots.

The traced MWCC writes one JSON object per line (`MWCC_TRACE_OUT`). Every line
carries `fn` (mangled), `pass`, `cls` (gpr|fpr|vr|-) and `ev`. This module
groups the stream per function and turns each class/pass of allocator events
into the same `mwcc-coloring-snapshot-v1` before/after pair the qemu capture
writes, so `api/compare.py` and the replay model consume either backend.

Unknown fields and unknown events are ignored, as the contract allows.
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Optional

API_DIR = Path(__file__).resolve().parent
MODEL_DIR = API_DIR.parent / "vendor" / "mwcc-decomp" / "tools"
for _path in (MODEL_DIR, API_DIR.parent / "sandbox"):
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))

from coloring_model import (  # noqa: E402
    FIRST_PASS_AVAILABLE,
    pass_parameters,
    replay_simplify,
)

TRACE_SCHEMA = "mwcc-trace-v1"
CLASS_CODES = {"gpr": 0, "fpr": 1, "vr": 9}
# Coloring_AllocateRegisters allocates VRs, then GPRs, then FPRs.
CLASS_ORDER = {"vr": 0, "gpr": 1, "fpr": 2}
FIRST_VIRTUAL_REGISTER = 32
DEFAULT_TRACE_CAP = 64 * 1024 * 1024
# Pass-level events that may carry the simplify K and register counts.
PASS_EVENTS = {"pass", "simplify", "allocate"}


class TraceError(ValueError):
    """The trace stream is unreadable or does not follow mwcc-trace-v1."""


class NotTraced(LookupError):
    """No record names this function. The tracer writes nothing for a function
    without decisions (empty, asm, __sinit), so the caller checks the object."""


@dataclass
class FunctionTrace:
    """All events for one function, in stream order."""

    fn: str
    name: Optional[str] = None
    display: Optional[str] = None
    events: list[dict] = field(default_factory=list)

    def of(self, *kinds: str) -> list[dict]:
        return [event for event in self.events if event.get("ev") in kinds]

    def allocation_passes(self) -> list[tuple[str, int]]:
        """(class, pass) with interference or coloring events, in stream order."""
        seen: dict[tuple[str, int], None] = {}
        for event in self.events:
            if event.get("ev") in ("node", "push", "color", "commit", "coalesce", "spill") and event.get("cls") in CLASS_CODES:
                seen.setdefault((event["cls"], int(event.get("pass", 0))), None)
        return list(seen)


@dataclass
class Trace:
    functions: dict[str, FunctionTrace]
    lines: int
    skipped: int
    # `overflow` records: the tracer hit a buffer limit and dropped facts.
    overflows: list[dict] = field(default_factory=list)

    def overflow_reason(self) -> Optional[str]:
        """`trace overflow (<what>)` when any record says facts were dropped, else None.

        A capture with dropped facts is unavailable: a partial trace would
        show missing decisions as "no change"."""
        if not self.overflows:
            return None
        what = []
        for event in self.overflows:
            detail = next((str(event[k]) for k in ("what", "buffer", "kind", "table", "reason") if event.get(k)), None)
            if detail is None:
                detail = ", ".join(f"{k}={v}" for k, v in event.items() if k not in ("v", "ev", "pass", "cls")) or "unspecified"
            what.append(detail)
        return f"trace overflow ({'; '.join(dict.fromkeys(what))})"

    def select(self, name: str) -> FunctionTrace:
        """The single function `name` identifies: mangled, plain or display name.

        A traced function has exactly one `function` record. Several mean
        distinct functions share one `fn`; none, with other records present,
        means its records are split across names. Either way the decisions
        cannot be attributed to one function, so it is refused.
        """
        fn = self._find(name)
        records = len(fn.of("function"))
        if records != 1:
            raise TraceError(
                f"trace records for {fn.fn!r} carry {records} function records: the tracer's `fn` "
                "does not identify one function (expected its mangled name on every record)")
        return fn

    def _find(self, name: str) -> FunctionTrace:
        if name in self.functions:
            return self.functions[name]
        hits = [
            fn for fn in self.functions.values()
            if name in (fn.name, fn.display)
            or (fn.display and fn.display.split("(", 1)[0] == name)
            or fn.fn.startswith(name + "__")
        ]
        if len(hits) == 1:
            return hits[0]
        if not hits:
            raise NotTraced(f"function {name!r} has no trace records; traced: {sorted(self.functions)[:20]}")
        raise LookupError(f"function {name!r} is ambiguous in the trace: {sorted(fn.fn for fn in hits)}")


def object_has_function(functions: list[str], name: str) -> bool:
    """Does a compiled object define `name` (mangled, or the plain name of a mangled symbol)?"""
    return any(symbol == name or symbol.startswith(name + "__") for symbol in functions)


def parse_lines(lines: Iterable[str]) -> Trace:
    functions: dict[str, FunctionTrace] = {}
    overflows: list[dict] = []
    count = skipped = 0
    for raw in lines:
        raw = raw.strip()
        if not raw:
            continue
        count += 1
        try:
            event = json.loads(raw)
        except json.JSONDecodeError:
            skipped += 1
            continue
        if not isinstance(event, dict) or "ev" not in event:
            skipped += 1
            continue
        if event.get("v") != 1:
            raise TraceError(f"unsupported trace version {event.get('v')!r} (expected 1)")
        if event["ev"] == "overflow":
            overflows.append(event)
            if "fn" not in event:
                continue
        if "fn" not in event:
            skipped += 1
            continue
        fn = functions.setdefault(str(event["fn"]), FunctionTrace(str(event["fn"])))
        if event["ev"] == "function":
            fn.name = event.get("name") or fn.name
            fn.display = event.get("display") or fn.display
        fn.events.append(event)
    # A torn last line (killed compile) is tolerated; widespread garbage is not.
    if count and skipped > max(1, count // 100):
        raise TraceError(f"{skipped} of {count} trace lines are not mwcc-trace-v1 records")
    return Trace(functions, count, skipped, overflows)


def load_trace(path: Path, max_bytes: int = DEFAULT_TRACE_CAP) -> Trace:
    size = path.stat().st_size
    if size > max_bytes:
        raise TraceError(f"trace {path} is {size} bytes, over the {max_bytes} byte cap")
    with path.open(encoding="utf-8", errors="replace") as stream:
        return parse_lines(stream)


# --------------------------------------------------------------------------
# Coloring snapshots
# --------------------------------------------------------------------------


def _latest(events: Iterable[dict], key: str = "vreg") -> dict[int, dict]:
    out: dict[int, dict] = {}
    for event in events:
        if key in event:
            out[int(event[key])] = event
    return out


def _root(parents: dict[int, int], vreg: int) -> int:
    seen = set()
    while vreg in parents and vreg not in seen:
        seen.add(vreg)
        vreg = parents[vreg]
    return vreg


@dataclass
class PassCapture:
    cls: str
    pass_index: int
    before: dict
    after: dict
    pop_order: list[int]
    stalled: list[dict]
    spilled: list[int]
    coalesced: dict[int, int]
    commits: dict[int, str]
    synthesized: list[int]
    # 1-based allocation attempt within the class, as the qemu capture numbers them.
    attempt: int = 1


def pass_capture(fn: FunctionTrace, cls: str, pass_index: int, identity: dict) -> PassCapture:
    """One class/pass of allocator events as a before/after snapshot pair.

    Before mirrors the qemu reader at Coloring_SelectColors entry: active webs
    carry flag 2 and color -1, coalesced webs flag 4 with their root as
    `physical_register`, precolored nodes their own number. After adds the
    pop colors and flag 1 on webs that could not be colored (spilled).
    """
    in_pass = [e for e in fn.events if e.get("cls") == cls and int(e.get("pass", 0)) == pass_index]
    nodes_ev = _latest(e for e in in_pass if e["ev"] == "node")
    parents: dict[int, int] = {}
    for event in in_pass:
        if event["ev"] == "coalesce" and "a" in event and "b" in event:
            child, parent = int(event["a"]), int(event["b"])
            if child < parent:  # MWCC merges the higher register into the lower one
                child, parent = parent, child
            parents[child] = parent
    for vreg, event in nodes_ev.items():
        parent = event.get("coalesced_into", event.get("parent"))
        if event.get("coalesced") and parent is not None:
            parents[vreg] = int(parent)
    pushes = [e for e in in_pass if e["ev"] == "push"]
    colors = [e for e in in_pass if e["ev"] == "color"]
    spills = sorted({int(e["vreg"]) for e in in_pass if e["ev"] == "spill"})
    commits = {int(e["vreg"]): str(e.get("reg")) for e in in_pass if e["ev"] == "commit" and "vreg" in e}

    if colors and all("order" in e for e in colors):
        pop_order = [int(e["vreg"]) for e in sorted(colors, key=lambda e: int(e["order"]))]
    else:
        pop_order = [int(e["vreg"]) for e in reversed(pushes)]
    # Spilled webs are popped but get no color event; keep push order for them.
    if pushes:
        pushed = [int(e["vreg"]) for e in reversed(pushes)]
        if set(pushed) - set(pop_order):
            pop_order = pushed

    coalesced = {vreg: _root(parents, vreg) for vreg in parents}
    synthesized: list[int] = []
    nodes: dict[int, dict] = {}
    for vreg, event in sorted(nodes_ev.items()):
        nodes[vreg] = {
            "virtual_register": vreg,
            "object": (identity.get((cls, vreg)) or {}).get("object") or event.get("object") or "-",
            "spill_cost": int(event.get("spill_cost", 0) or 0),
            "degree": int(event.get("degree", len(event.get("neighbors", ())))),
            "neighbors": [int(n) for n in event.get("neighbors", ())],
            "physical_register": -1,
            "flags": 0,
        }
    for vreg in list(nodes) + list(coalesced):
        for neighbor in [*nodes.get(vreg, {}).get("neighbors", ()), coalesced.get(vreg, vreg), vreg]:
            if neighbor not in nodes:
                synthesized.append(neighbor)
                nodes[neighbor] = {
                    "virtual_register": neighbor, "object": "-", "spill_cost": 0, "degree": 0,
                    "neighbors": [], "physical_register": -1, "flags": 0,
                }
    # Spill costs exist only once Coloring_SimplifyGraph jams (SpillCode_ComputeSpillCosts);
    # the tracer reports them as `node_cost` (or as a later `node` record).
    for event in in_pass:
        if event["ev"] == "node_cost" and int(event.get("vreg", -1)) in nodes and event.get("spill_cost") is not None:
            nodes[int(event["vreg"])]["spill_cost"] = int(event["spill_cost"])
    for vreg, node in nodes.items():
        if vreg in coalesced:
            node["flags"] |= 4
            node["physical_register"] = coalesced[vreg]
            nodes[coalesced[vreg]]["flags"] |= 8
        elif vreg < FIRST_VIRTUAL_REGISTER:
            node["physical_register"] = vreg
    # The graph is symmetric; a node with a recorded neighbor list wins.
    for vreg, node in nodes.items():
        for neighbor in node["neighbors"]:
            other = nodes[neighbor]
            if neighbor in synthesized and vreg not in other["neighbors"]:
                other["neighbors"].append(vreg)
    for vreg in pop_order:
        if vreg in nodes:
            nodes[vreg]["flags"] |= 2

    register_count = max(nodes) + 1 if nodes else 0
    before = {
        "format": "mwcc-coloring-snapshot-v1",
        "register_class": CLASS_CODES[cls],
        "register_count": register_count,
        "simplify_order": [v for v in pop_order if v in nodes],
        "nodes": [nodes[v] for v in sorted(nodes)],
        "phase": "before",
    }
    after_nodes = json.loads(json.dumps(before["nodes"]))
    color_of = {int(e["vreg"]): int(e["color"]) for e in colors if "color" in e}
    for node in after_nodes:
        vreg = node["virtual_register"]
        if vreg in color_of and color_of[vreg] >= 0:
            node["physical_register"] = color_of[vreg]
        elif vreg in spills or (vreg in color_of and color_of[vreg] < 0):
            node["flags"] |= 1
    after = {**before, "simplify_order": [], "nodes": after_nodes, "phase": "after"}
    stalled = [
        {"vreg": int(e["vreg"]), "sweep": e.get("sweep"), "cost_ratio": e.get("cost_ratio")}
        for e in pushes if e.get("stalled")
    ]
    return PassCapture(cls, pass_index, before, after, before["simplify_order"], stalled,
                       spills, coalesced, commits, sorted(set(synthesized)))


def pass_settings(fn: FunctionTrace, cls: str, pass_index: int) -> dict:
    """Explicit K / register counts from a pass-level event, when the tracer emits one."""
    for event in fn.events:
        if event.get("ev") in PASS_EVENTS and event.get("cls") == cls and int(event.get("pass", 0)) == pass_index:
            out = {}
            if "available" in event:
                out["available_colors"] = int(event["available"])
            if "coloring_register_count" in event:
                out["coloring_register_count"] = int(event["coloring_register_count"])
            if "register_count" in event:
                out["register_count"] = int(event["register_count"])
            return out
    return {}


def identity_table(fn: FunctionTrace) -> dict[tuple[str, int], dict]:
    """(class, vreg) -> its latest `vreg` identity record."""
    table: dict[tuple[str, int], dict] = {}
    for event in fn.of("vreg"):
        if "vreg" in event:
            table[(str(event.get("cls")), int(event["vreg"]))] = event
    return table


def coloring_captures(fn: FunctionTrace, stock: dict) -> list[PassCapture]:
    """Every class/pass rebuilt, with replay parameters and stock identity stamped."""
    identity = identity_table(fn)
    captures = []
    first_before: dict[str, dict] = {}
    previous_after: dict[str, dict] = {}
    attempts: dict[str, int] = {}
    for cls, pass_index in sorted(fn.allocation_passes(), key=lambda item: (CLASS_ORDER[item[0]], item[1])):
        capture = pass_capture(fn, cls, pass_index, identity)
        capture.attempt = attempts[cls] = attempts.get(cls, 0) + 1
        explicit = pass_settings(fn, cls, pass_index)
        if "register_count" in explicit:
            capture.before["register_count"] = capture.after["register_count"] = explicit["register_count"]
        first = first_before.setdefault(cls, capture.before)
        params = pass_parameters(first, previous_after.get(cls), FIRST_PASS_AVAILABLE[cls])
        params.update({k: v for k, v in explicit.items() if k != "register_count"})
        for snapshot in (capture.before, capture.after):
            snapshot.update(params)
            snapshot.update({
                "attempt": capture.attempt,
                "trace_pass": pass_index,
                "compiler": stock["label"],
                "target_sha256": stock["sha256"],
                "program_counter": "native",
                "capture_index": 1,
                "capture_backend": "native",
                "function_identity": {"name": fn.fn, "display": fn.display},
            })
        previous_after[cls] = capture.after
        captures.append(capture)
    return captures


def replay_check(capture: PassCapture) -> dict:
    """Does the coloring model reproduce this pass's pop order and colors?"""
    order = capture.before["simplify_order"]
    if len(set(order)) != len(order):
        return {"cls": capture.cls, "pass": capture.pass_index, "ok": False,
                "error": "a web is pushed more than once; the trace mixes functions or passes"}
    try:
        replay = replay_simplify(capture.before)
    except (ValueError, KeyError) as error:
        return {"cls": capture.cls, "pass": capture.pass_index, "ok": False, "error": str(error)}
    outcomes = popped_outcomes(capture, replay["colors"])
    order_ok = replay["simplify_order"] == capture.before["simplify_order"]
    first = next((i for i, (a, b) in enumerate(zip(replay["simplify_order"], capture.before["simplify_order"])) if a != b), None)
    return {
        "cls": capture.cls,
        "pass": capture.pass_index,
        "ok": order_ok and not outcomes["mismatches"],
        "simplify_order_matches": order_ok,
        "first_order_divergence": first,
        "colors_matched": outcomes["matched"],
        "colors_checked": outcomes["checked"],
        "spills_checked": outcomes["spills"],
        "color_mismatches": outcomes["mismatches"][:8],
        "available_colors": capture.before.get("available_colors"),
    }


def popped_outcomes(capture: PassCapture, replayed: dict) -> dict:
    """Every popped web's outcome, captured vs replayed: its color, or -1 when spilled.

    validate_colors skips captured negatives, so a web the compiler spilled but
    the model colors would pass; here every popped web counts.
    """
    after = {n["virtual_register"]: n for n in capture.after["nodes"]}
    mismatches, matched, spills = [], 0, 0
    for vreg in capture.before["simplify_order"]:
        node = after.get(vreg, {})
        captured = -1 if node.get("flags", 0) & 1 else node.get("physical_register", -1)
        spills += captured < 0
        got = replayed.get(vreg, -1)
        got = -1 if got is None or got < 0 else got
        if got == captured:
            matched += 1
        else:
            mismatches.append({"register": vreg, "replayed": got, "captured": captured})
    return {"checked": len(capture.before["simplify_order"]), "matched": matched, "spills": spills,
            "mismatches": mismatches}


def snapshot_name(cls: str, attempt: int, phase: str) -> str:
    return f"coloring-0001-{cls}-{attempt:02d}-{phase}.json"


def as_dict(capture: PassCapture) -> dict[str, Any]:
    return {"cls": capture.cls, "pass": capture.pass_index, "nodes": len(capture.before["nodes"])}
