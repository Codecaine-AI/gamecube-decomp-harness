#!/usr/bin/env python3
"""`mwcc-decisions-v1` from a traced function, and `mwcc-decision-diff-v1` between two.

A decisions document is what MWCC decided for one function: vreg identities,
per-class/per-pass coloring (degree, coalescing, pop order, color, register,
spill), inlining verdicts, CSE temps and frame slots.

The diff never matches by raw vreg number: an early new local renumbers every
later vreg. Values match by function, pass and class, then declaration site
(file:line + object, with line numbers mapped across the two sources), then
temp origin. Duplicate keys are paired in order and reported as ambiguous;
webs with no identity are only counted.
"""

from __future__ import annotations

import json
import re
from typing import Any, Callable, Iterable, Optional

from native_trace import CLASS_CODES, FunctionTrace, PassCapture, coloring_captures

DECISIONS_SCHEMA = "mwcc-decisions-v1"
DIFF_SCHEMA = "mwcc-decision-diff-v1"
ALL_POINTS = ("vreg_identity", "interference", "coloring", "coalescing", "inlining", "cse", "frame", "scheduling")
SUMMARY_LIMIT = 40
KIND_ORDER = ("node_added", "node_removed", "spill", "register", "coalesce", "color_order", "degree",
              "inline_verdict", "cse_temp", "frame_slot")
REGISTER_PREFIX = {"gpr": "r", "fpr": "f", "vr": "v"}
TRACE_HEADER = {"v", "fn", "display", "pass", "cls", "ev"}
SLOT_FIELDS = ("offset", "size", "align", "reserved")

# (file, b_line) -> the same line's number in a, or None when the line changed.
LineMap = Callable[[str, int], Optional[int]]
PathNormalizer = Callable[[str], str]


def _identity(record: dict, normalize: PathNormalizer) -> dict:
    keys = ("cls", "vreg", "pass", "kind", "object", "decl_line", "decl_site", "arg_index", "body_line", "origin", "web")
    out = {key: record.get(key) for key in keys}
    for key in ("decl_file", "body_file"):
        out[key] = normalize(record[key]) if record.get(key) else None
    return {key: value for key, value in out.items() if value is not None}


def _site(site: Any, normalize: PathNormalizer) -> Any:
    if not isinstance(site, str) or ":" not in site:
        return site
    path, _, line = site.rpartition(":")
    return f"{normalize(path)}:{line}"


def build_decisions(
    fn: FunctionTrace,
    *,
    unit: str,
    version: str,
    stock: dict,
    available_points: Iterable[str],
    normalize: PathNormalizer = lambda path: path,
) -> tuple[dict, list[PassCapture]]:
    """The decisions document plus the per-pass coloring captures it summarizes."""
    available = [point for point in ALL_POINTS if point in set(available_points)]
    captures = coloring_captures(fn, stock)
    slots = []
    for event in fn.of("frame_slot"):
        slot = {k: v for k, v in event.items() if k not in TRACE_HEADER and v is not None}
        if slot.get("decl_file"):
            slot["decl_file"] = normalize(slot["decl_file"])
        slots.append(slot)
    vregs = [_identity(event, normalize) for event in fn.of("vreg") if "vreg" in event]
    coloring: dict[str, list] = {}
    for capture in captures:
        color_of = {n["virtual_register"]: n["physical_register"] for n in capture.after["nodes"]}
        order = {vreg: index for index, vreg in enumerate(capture.pop_order)}
        stalled = {item["vreg"] for item in capture.stalled}
        nodes = []
        for node in capture.before["nodes"]:
            vreg = node["virtual_register"]
            if vreg < 32:
                continue
            color = color_of.get(vreg, -1) if vreg not in capture.coalesced else None
            entry = {
                "vreg": vreg,
                "degree": len(node["neighbors"]),
                "spill_cost": node["spill_cost"],
                "order": order.get(vreg),
                "color": color,
                "reg": capture.commits.get(vreg)
                or (f"{REGISTER_PREFIX[capture.cls]}{color}" if color is not None and color >= 0 else None),
                "spilled": vreg in capture.spilled,
                "stalled": vreg in stalled,
            }
            if vreg in capture.coalesced:
                entry["coalesced_into"] = capture.coalesced[vreg]
            nodes.append(entry)
        coloring.setdefault(capture.cls, []).append({
            "pass": capture.pass_index,
            "available_colors": capture.before.get("available_colors"),
            "nodes": nodes,
            "pop_order": capture.pop_order,
        })
    doc = {
        "schema": DECISIONS_SCHEMA,
        "function": fn.fn,
        "display": fn.display,
        "unit": unit,
        "version": version,
        "backend": "native",
        "stock_identity": stock,
        "available_points": available,
        "unavailable_points": [point for point in ALL_POINTS if point not in available],
        "vregs": vregs,
        "inlines": [
            {**{k: e.get(k) for k in ("callee", "pass_index", "stmt_count", "verdict", "reason")},
             "site": _site(e.get("site"), normalize), "pass": e.get("pass")}
            for e in fn.of("inline")
        ],
        "cse": [{k: e.get(k) for k in ("temp", "expr", "block", "occurrence", "pass")} for e in fn.of("cse")],
        # Only reserved slots are the frame; discarded ones (`reserved: false`) are kept apart.
        "frame_slots": [slot for slot in slots if slot.get("reserved", True) is not False],
        "discarded_frame_slots": [slot for slot in slots if slot.get("reserved", True) is False],
        "frame": [{k: v for k, v in e.items() if k not in TRACE_HEADER} for e in fn.of("frame")],
        "coloring": coloring,
    }
    return doc, captures


# --------------------------------------------------------------------------
# Identity
# --------------------------------------------------------------------------


class Identities:
    """(class, vreg, pass) -> identity record from one decisions document."""

    def __init__(self, doc: dict) -> None:
        self.by_pass: dict[tuple[str, int], list[tuple[int, dict]]] = {}
        self.by_object: dict[str, dict] = {}
        for record in doc.get("vregs", ()):
            key = (str(record.get("cls")), int(record["vreg"]))
            self.by_pass.setdefault(key, []).append((int(record.get("pass", 0) or 0), record))
            if record.get("object"):
                self.by_object.setdefault(str(record["object"]), record)
        for records in self.by_pass.values():
            records.sort(key=lambda item: item[0])

    def get(self, cls: str, vreg: int, pass_index: int) -> Optional[dict]:
        records = self.by_pass.get((cls, vreg))
        if not records:
            return None
        earlier = [record for p, record in records if p <= pass_index]
        return earlier[-1] if earlier else records[0][1]


TEMP_NAME = re.compile(r"@\d+")


def stable_text(value: Any) -> str:
    """Origin / CSE expression text without compiler temp numbers (@NNN renumber)."""
    text = value if isinstance(value, str) else json.dumps(value, sort_keys=True)
    return TEMP_NAME.sub("@N", text)


def identity_key(record: Optional[dict], vreg: int, map_line: Optional[LineMap]) -> tuple[Optional[tuple], str]:
    """Stable key and match kind for a web; key None means unidentifiable."""
    if vreg < 32:
        return ("phys", vreg), "exact"
    if not record:
        return None, "ambiguous"
    kind = record.get("kind")
    temp = kind in ("temp", "backend_temp") or str(record.get("object", "")).startswith("@")
    origin = record.get("origin")
    if temp and origin:
        return ("origin", stable_text(origin)), "by_origin"
    if kind == "arg":
        # Arguments are declared in the signature: position first, else name in the body's file.
        if record.get("arg_index") is not None:
            return ("arg", int(record["arg_index"])), "by_site"
        if record.get("object"):
            return ("arg", record["object"], record.get("body_file") or record.get("decl_file")), "by_site"
    file, line = record.get("decl_file"), record.get("decl_line")
    if file and line is None and record.get("object") and not temp:
        # A known file without a line: the name within that file is all there is.
        return ("decl", file, record["object"], kind), "by_site"
    if file and line is not None:
        line = int(line)
        if map_line is not None:
            mapped = map_line(file, line)
            # A line that changed between the sources keeps a side-specific key.
            line = mapped if mapped is not None else ("b-only", line)
        name = None if temp else record.get("object")
        return ("site", file, line, name, None if temp else kind), "by_site"
    if origin:
        return ("origin", stable_text(origin)), "by_origin"
    if record.get("object") and not temp:
        return ("object", record["object"], kind), "by_site"
    return None, "ambiguous"


def describe(record: Optional[dict], vreg: int) -> str:
    if vreg < 32:
        return f"precolored {vreg}"
    if not record:
        return f"v{vreg}"
    name = record.get("object")
    if not name or str(name).startswith("@"):
        origin = record.get("origin")
        expr = origin.get("expr") if isinstance(origin, dict) else origin
        name = f"temp `{expr}`" if expr else f"temp {name or ''}".strip()
    else:
        name = f"`{name}`"
    if record.get("kind") == "arg" and record.get("arg_index") is not None:
        site = f" #{record['arg_index']}"
    elif record.get("decl_file"):
        line = record.get("decl_line")
        site = f" {record['decl_file']}" + (f":{line}" if line is not None else "")
    elif record.get("body_file"):
        site = f" in {record['body_file']}"
    else:
        site = ""
    kind = f" ({record['kind']}{site})" if record.get("kind") else (f" ({site.strip()})" if site else "")
    return name + kind


def _pair(side_a: dict[int, Optional[tuple]], side_b: dict[int, Optional[tuple]], kinds: dict[tuple, str]):
    """Match webs by identity key; returns (pairs, added, removed, unidentified counts)."""
    groups_a: dict[tuple, list[int]] = {}
    groups_b: dict[tuple, list[int]] = {}
    unidentified = {"a": [], "b": []}
    for vreg, key in sorted(side_a.items()):
        (groups_a.setdefault(key, []) if key is not None else unidentified["a"]).append(vreg)
    for vreg, key in sorted(side_b.items()):
        (groups_b.setdefault(key, []) if key is not None else unidentified["b"]).append(vreg)
    pairs, added, removed = [], [], []
    for key in sorted(set(groups_a) | set(groups_b), key=repr):
        a, b = groups_a.get(key, []), groups_b.get(key, [])
        ambiguous = len(a) > 1 or len(b) > 1
        for va, vb in zip(a, b):
            match = "ambiguous" if ambiguous else ("exact" if va == vb else kinds[key])
            pairs.append((va, vb, match))
        for vb in b[len(a):]:
            added.append((vb, "ambiguous" if ambiguous else kinds[key]))
        for va in a[len(b):]:
            removed.append((va, "ambiguous" if ambiguous else kinds[key]))
    return pairs, added, removed, unidentified


def _lcs(a: list, b: list) -> set:
    """Elements of a's order that keep their relative position in b."""
    n, m = len(a), len(b)
    table = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            table[i][j] = table[i + 1][j + 1] + 1 if a[i] == b[j] else max(table[i + 1][j], table[i][j + 1])
    keep, i, j = set(), 0, 0
    while i < n and j < m:
        if a[i] == b[j]:
            keep.add(a[i])
            i += 1
            j += 1
        elif table[i + 1][j] >= table[i][j + 1]:
            i += 1
        else:
            j += 1
    return keep


# --------------------------------------------------------------------------
# Diff
# --------------------------------------------------------------------------


def _change(kind: str, summary: str, a: Any, b: Any, match: str) -> dict:
    return {"kind": kind, "summary": summary, "a": a, "b": b, "match": match}


def _unidentified_changes(where: str, unidentified: dict, nodes_a: dict, nodes_b: dict) -> list[dict]:
    """Webs without identity cannot be paired; compare what they decided as multisets.

    Any difference is reported as ambiguous (which web changed is unknown), never dropped.
    """
    out = []
    va, vb = unidentified["a"], unidentified["b"]
    if len(va) != len(vb):
        kind = "node_added" if len(vb) > len(va) else "node_removed"
        out.append(_change(kind, f"{where}: {len(va)} webs without identity in a, {len(vb)} in b (not matched)",
                           {"vregs": va}, {"vregs": vb}, "ambiguous"))

    def tally(vregs: list[int], nodes: dict, field: str) -> dict:
        counts: dict = {}
        for vreg in vregs:
            value = nodes[vreg].get(field)
            value = "coalesced" if field == "reg" and value is None and "coalesced_into" in nodes[vreg] else value
            counts[str(value)] = counts.get(str(value), 0) + 1
        return dict(sorted(counts.items()))

    def show(counts: dict) -> str:
        return ", ".join(f"{value}x{count}" for value, count in counts.items()) or "none"

    def explained_by_count(ta: dict, tb: dict) -> bool:
        """Only added (or only removed) webs, matching the count change, account for the difference."""
        small, large = (ta, tb) if len(va) < len(vb) else (tb, ta)
        extra = sum(large.values()) - sum(small.values())
        return extra > 0 and all(large.get(k, 0) >= n for k, n in small.items())

    for kind, field in (("register", "reg"), ("spill", "spilled"), ("degree", "degree")):
        ta, tb = tally(va, nodes_a, field), tally(vb, nodes_b, field)
        if ta != tb and not explained_by_count(ta, tb):
            out.append(_change(kind, f"{where}: webs without identity differ in {field} (which web is unknown): "
                               f"a {{{show(ta)}}} -> b {{{show(tb)}}}", ta, tb, "ambiguous"))
    return out


def parent_key(node: dict, keys: dict[int, Optional[tuple]]) -> Optional[tuple]:
    """Identity of the web or physical register a coalesced web merged into (None: unknown)."""
    parent = int(node["coalesced_into"])
    return ("phys", parent) if parent < 32 else keys.get(parent)


def _pass_changes(cls: str, pass_index: int, pa: dict, pb: dict, ida: Identities, idb: Identities,
                  map_line: Optional[LineMap]) -> list[dict]:
    nodes_a = {n["vreg"]: n for n in pa["nodes"]}
    nodes_b = {n["vreg"]: n for n in pb["nodes"]}
    kinds: dict[tuple, str] = {}
    keys_a: dict[int, Optional[tuple]] = {}
    keys_b: dict[int, Optional[tuple]] = {}
    for vreg in nodes_a:
        key, kind = identity_key(ida.get(cls, vreg, pass_index), vreg, None)
        keys_a[vreg] = key
        if key is not None:
            kinds[key] = kind
    for vreg in nodes_b:
        key, kind = identity_key(idb.get(cls, vreg, pass_index), vreg, map_line)
        keys_b[vreg] = key
        if key is not None:
            kinds.setdefault(key, kind)
    pairs, added, removed, unidentified = _pair(keys_a, keys_b, kinds)
    where = f"{cls} pass {pass_index}"
    changes: list[dict] = []

    def raw(node: dict, record: Optional[dict]) -> dict:
        return {"vreg": node["vreg"], "degree": node["degree"], "reg": node.get("reg"), "order": node.get("order"),
                "spilled": node.get("spilled"), "identity": record}

    for vreg, match in added:
        node, record = nodes_b[vreg], idb.get(cls, vreg, pass_index)
        fate = "spilled" if node.get("spilled") else (f"coalesced into v{node['coalesced_into']}" if "coalesced_into" in node else node.get("reg") or "uncolored")
        changes.append(_change("node_added", f"{where}: +1 node {describe(record, vreg)}, v{vreg} in b: degree {node['degree']}, {fate}",
                               None, raw(node, record), match))
    for vreg, match in removed:
        node, record = nodes_a[vreg], ida.get(cls, vreg, pass_index)
        changes.append(_change("node_removed", f"{where}: -1 node {describe(record, vreg)}, v{vreg} in a: degree {node['degree']}, {node.get('reg') or 'uncolored'}",
                               raw(node, record), None, match))
    if unidentified["a"] or unidentified["b"]:
        changes.extend(_unidentified_changes(where, unidentified, nodes_a, nodes_b))

    key_of_a = {va: keys_a.get(va) for va, _vb, _m in pairs}
    order_a = [key_of_a[v] for v in pa["pop_order"] if v in key_of_a]
    pair_by_b = {vb: (va, m) for va, vb, m in pairs}
    order_b = [key_of_a[pair_by_b[v][0]] for v in pb["pop_order"] if v in pair_by_b]
    in_order = _lcs(order_a, order_b)
    for va, vb, match in pairs:
        node_a, node_b = nodes_a[va], nodes_b[vb]
        record = idb.get(cls, vb, pass_index) or ida.get(cls, va, pass_index)
        name = describe(record, vb)
        ids = f"(v{va} -> v{vb})"
        if node_a.get("spilled") != node_b.get("spilled"):
            changes.append(_change("spill", f"{where}: {name} spilled in {'b' if node_b.get('spilled') else 'a'} only {ids}",
                                   raw(node_a, record), raw(node_b, record), match))
        elif node_a.get("reg") != node_b.get("reg") and not any(
                n.get("reg") is None and "coalesced_into" in n for n in (node_a, node_b)):
            # Coalesced webs included: their committed register is their parent's.
            changes.append(_change("register", f"{where}: {name} {node_a.get('reg')} -> {node_b.get('reg')} {ids}",
                                   raw(node_a, record), raw(node_b, record), match))
        coalesced_a, coalesced_b = "coalesced_into" in node_a, "coalesced_into" in node_b
        parent_a = parent_key(node_a, keys_a) if coalesced_a else None
        parent_b = parent_key(node_b, keys_b) if coalesced_b else None
        unresolved = coalesced_a and coalesced_b and (parent_a is None or parent_b is None)
        if coalesced_a != coalesced_b or parent_a != parent_b or (unresolved and node_a.get("reg") != node_b.get("reg")):
            def into(node: dict, ids_: Identities) -> str:
                if "coalesced_into" not in node:
                    return "not coalesced"
                return "coalesced into " + describe(ids_.get(cls, node["coalesced_into"], pass_index), node["coalesced_into"])
            changes.append(_change("coalesce", f"{where}: {name} {into(node_a, ida)} -> {into(node_b, idb)} {ids}",
                                   node_a.get("coalesced_into"), node_b.get("coalesced_into"),
                                   "ambiguous" if unresolved else match))
        if key_of_a[va] not in in_order and node_a.get("order") is not None and node_b.get("order") is not None:
            changes.append(_change("color_order", f"{where}: {name} pop position {node_a['order']} -> {node_b['order']} (moved relative to the other webs) {ids}",
                                   node_a.get("order"), node_b.get("order"), match))
        if node_a["degree"] != node_b["degree"]:
            changes.append(_change("degree", f"{where}: {name} degree {node_a['degree']} -> {node_b['degree']} {ids}",
                                   node_a["degree"], node_b["degree"], match))
    return changes


def _inline_key(entry: dict, map_line: Optional[LineMap]) -> tuple:
    site = entry.get("site")
    if map_line is not None and isinstance(site, str) and ":" in site:
        path, _, line = site.rpartition(":")
        if line.isdigit():
            mapped = map_line(path, int(line))
            site = f"{path}:{mapped}" if mapped is not None else f"{path}:b-only{line}"
    return entry.get("callee"), site, entry.get("pass_index")


def _owner_key(owner: Any, ids: Identities, map_line: Optional[LineMap]) -> tuple:
    """A frame slot owner's identity; compiler temps without one are anonymous."""
    if isinstance(owner, str) and owner.startswith("@"):
        record = ids.by_object.get(owner)
        key = identity_key(record, int(record["vreg"]), map_line)[0] if record else None
        return key or ("anonymous", owner)
    return ("object", owner)


def _slot_key(slot: dict, ids: Identities, map_line: Optional[LineMap]) -> tuple:
    """A slot's owner identity: its declaration site or web when traced, else the owner name."""
    owner = slot.get("owner")
    key = _owner_key(owner, ids, map_line)
    if key[0] != "object":
        return key
    if slot.get("decl_file") and slot.get("decl_line") is not None:
        line = int(slot["decl_line"])
        if map_line is not None:
            mapped = map_line(slot["decl_file"], line)
            line = mapped if mapped is not None else ("b-only", line)
        return ("slot", owner, slot["decl_file"], line)
    if slot.get("web") is not None:
        return ("slot", owner, "web", slot["web"])
    return key


def _frame_changes(a: dict, b: dict, ida: Identities, idb: Identities, map_line: Optional[LineMap]) -> list[dict]:
    """Frame layout, reserved slots (matched by owner identity) and reservation changes.

    Discarded slots are not frame slots: they matter only when a slot's
    reservation flips. Owners sharing a name with no declaration site (two
    scoped `x`) are paired in offset order and reported as ambiguous.
    """
    out = []
    frame_a, frame_b = (a.get("frame") or [{}])[0], (b.get("frame") or [{}])[0]
    layout = [f for f in ("size", "local_size", "local_base", "locals_cleared") if frame_a.get(f) != frame_b.get(f)]
    if layout and (a.get("frame") or b.get("frame")):
        out.append(_change("frame_slot", "frame layout: " + ", ".join(f"{f} {frame_a.get(f)} -> {frame_b.get(f)}" for f in layout),
                           a.get("frame"), b.get("frame"), "exact"))

    def groups(doc: dict, ids: Identities, mapper: Optional[LineMap]) -> tuple[dict, list]:
        named: dict[tuple, list] = {}
        anonymous = []
        for slot in [*doc.get("frame_slots", ()), *({**s, "reserved": False} for s in doc.get("discarded_frame_slots", ()))]:
            key = _slot_key(slot, ids, mapper)
            if key[0] == "anonymous":
                if slot.get("reserved", True) is not False:
                    anonymous.append(slot)
            else:
                named.setdefault(key, []).append(slot)
        for slots in named.values():
            slots.sort(key=lambda s: (s.get("offset") is None, s.get("offset") or 0))
        return named, sorted(anonymous, key=lambda s: (s.get("offset") is None, s.get("offset") or 0))

    def reserved(slot: Optional[dict]) -> bool:
        return slot is not None and slot.get("reserved", True) is not False

    named_a, anon_a = groups(a, ida, None)
    named_b, anon_b = groups(b, idb, map_line)
    for key in sorted(set(named_a) | set(named_b), key=repr):
        la, lb = named_a.get(key, []), named_b.get(key, [])
        ambiguous = len(la) > 1 or len(lb) > 1
        match_default = "by_origin" if key[0] == "origin" else "by_site"
        for index in range(max(len(la), len(lb))):
            sa = la[index] if index < len(la) else None
            sb = lb[index] if index < len(lb) else None
            if not reserved(sa) and not reserved(sb):
                continue  # discarded (or absent) on both sides: not in either frame
            owner = (sb or sa).get("owner")
            label = f"frame slot {owner}" + (f" (#{index + 1} of that name)" if ambiguous else "")
            if sa and sb:
                diffs = [f for f in SLOT_FIELDS if sa.get(f, True if f == "reserved" else None) != sb.get(f, True if f == "reserved" else None)]
                if not diffs:
                    continue
                what = ", ".join(
                    ("reserved -> discarded" if reserved(sa) else "discarded -> reserved") if f == "reserved"
                    else f"{f} {sa.get(f)} -> {sb.get(f)}" for f in diffs)
            else:
                present = sb or sa
                what = f"only in {'b' if sb else 'a'} (offset {present.get('offset')}, size {present.get('size')})"
            out.append(_change("frame_slot", f"{label}: {what}", sa, sb, "ambiguous" if ambiguous else match_default))
    layout_a = [(s.get("offset"), s.get("size")) for s in anon_a]
    layout_b = [(s.get("offset"), s.get("size")) for s in anon_b]
    if layout_a != layout_b:
        def show(layout: list) -> str:
            return ", ".join(f"{offset}:{size}" for offset, size in layout[:12]) + (" ..." if len(layout) > 12 else "")
        out.append(_change("frame_slot", f"compiler-temp frame slots: {len(layout_a)} in a [{show(layout_a)}], "
                           f"{len(layout_b)} in b [{show(layout_b)}] (offset:size)", anon_a, anon_b, "ambiguous"))
    return out


def _unidentified_total(doc: dict) -> int:
    ids = Identities(doc)
    return sum(1 for cls, passes in doc.get("coloring", {}).items() for p in passes for n in p["nodes"]
               if identity_key(ids.get(cls, n["vreg"], p["pass"]), n["vreg"], None)[0] is None)


def decision_diff(a: dict, b: dict, *, map_line: Optional[LineMap] = None) -> dict:
    """`mwcc-decision-diff-v1` changes and summary lines between two decisions documents."""
    if a.get("function") != b.get("function"):
        raise ValueError(f"decisions are for different functions: {a.get('function')} vs {b.get('function')}")
    ida, idb = Identities(a), Identities(b)
    changes: list[dict] = []
    for cls in sorted(set(a.get("coloring", {})) | set(b.get("coloring", {})), key=lambda c: CLASS_CODES.get(c, 99)):
        passes_a = {p["pass"]: p for p in a.get("coloring", {}).get(cls, [])}
        passes_b = {p["pass"]: p for p in b.get("coloring", {}).get(cls, [])}
        for pass_index in sorted(set(passes_a) | set(passes_b)):
            pa, pb = passes_a.get(pass_index), passes_b.get(pass_index)
            if pa is None or pb is None:
                side = "b" if pa is None else "a"
                changes.append(_change("spill", f"{cls}: allocation pass {pass_index} only in {side} (a spill forced another pass)",
                                       pass_index if pa else None, pass_index if pb else None, "exact"))
                continue
            changes.extend(_pass_changes(cls, pass_index, pa, pb, ida, idb, map_line))

    def inline_groups(doc: dict, mapper: Optional[LineMap]) -> dict[tuple, list[dict]]:
        groups: dict[tuple, list[dict]] = {}
        for entry in doc.get("inlines", ()):
            groups.setdefault(_inline_key(entry, mapper), []).append(entry)
        return groups

    def verdicts(entries: list[dict]) -> list[str]:
        return sorted(str(e.get("verdict")) for e in entries)

    inl_a, inl_b = inline_groups(a, None), inline_groups(b, map_line)
    # Sites on edited lines cannot be matched by line; regroup what is left by
    # callee and pass, so a call that only moved is not reported twice.
    loose_a: dict[tuple, list[dict]] = {}
    loose_b: dict[tuple, list[dict]] = {}
    for key in sorted(set(inl_a) | set(inl_b), key=repr):
        ea, eb = inl_a.get(key, []), inl_b.get(key, [])
        if ea and eb:
            if verdicts(ea) != verdicts(eb):
                callee, _site, pass_index = key
                reasons = sorted({str(e.get("reason")) for e in eb if e.get("reason")} - {str(e.get("reason")) for e in ea if e.get("reason")})
                changes.append(_change("inline_verdict", f"inline {callee} at {eb[0].get('site')} (pass {pass_index}): "
                                       f"{', '.join(verdicts(ea))} -> {', '.join(verdicts(eb))}"
                                       + (f" ({', '.join(reasons)})" if reasons else ""), ea, eb,
                                       "ambiguous" if max(len(ea), len(eb)) > 1 else "by_site"))
            continue
        callee, _site, pass_index = key
        (loose_a if ea else loose_b).setdefault((callee, pass_index), []).extend(ea or eb)
    for callee, pass_index in sorted(set(loose_a) | set(loose_b), key=repr):
        ea, eb = loose_a.get((callee, pass_index), []), loose_b.get((callee, pass_index), [])
        if verdicts(ea) == verdicts(eb):
            continue

        def where(entries: list[dict]) -> str:
            sites = sorted({str(e.get("site")) for e in entries})
            return ", ".join(sites[:4]) + (" ..." if len(sites) > 4 else "")

        va = ", ".join(verdicts(ea)) or "absent"
        vb = ", ".join(verdicts(eb)) or "absent"
        reasons = sorted({str(e.get("reason")) for e in eb if e.get("reason")} - {str(e.get("reason")) for e in ea if e.get("reason")})
        changes.append(_change("inline_verdict", f"inline {callee} (pass {pass_index}) on edited lines: {va} in a"
                               + (f" at {where(ea)}" if ea else "") + f" -> {vb} in b" + (f" at {where(eb)}" if eb else "")
                               + (f" ({', '.join(reasons)})" if reasons else ""), ea or None, eb or None,
                               "by_site" if len(ea) <= 1 and len(eb) <= 1 else "ambiguous"))

    def cse_counts(doc: dict) -> dict[str, tuple[int, int]]:
        """expr -> (distinct temps, replaced uses). Each `cse` record is one use of a temp."""
        temps: dict[str, set] = {}
        uses: dict[str, int] = {}
        for index, entry in enumerate(doc.get("cse", ())):
            expr = stable_text(str(entry.get("expr")))
            temps.setdefault(expr, set()).add(entry.get("temp") if entry.get("temp") is not None else f"#{index}")
            uses[expr] = uses.get(expr, 0) + 1
        return {expr: (len(temps[expr]), uses[expr]) for expr in temps}

    ca, cb = cse_counts(a), cse_counts(b)
    for expr in sorted(set(ca) | set(cb)):
        (ta, ua), (tb, ub) = ca.get(expr, (0, 0)), cb.get(expr, (0, 0))
        if ta != tb:
            changes.append({**_change("cse_temp", f"CSE `{expr}`: {ta} temp(s) in a, {tb} in b ({ua} -> {ub} uses)",
                                      {"temps": ta, "uses": ua}, {"temps": tb, "uses": ub}, "by_origin"), "aspect": "temps"})
        elif ua != ub:
            changes.append({**_change("cse_temp", f"CSE `{expr}`: same {ta} temp(s), replaced uses {ua} -> {ub}",
                                      {"temps": ta, "uses": ua}, {"temps": tb, "uses": ub}, "by_origin"), "aspect": "uses"})

    changes.extend(_frame_changes(a, b, ida, idb, map_line))

    rank = {kind: index for index, kind in enumerate(KIND_ORDER)}
    changes.sort(key=lambda change: rank.get(change["kind"], len(rank)))
    points_a, points_b = set(a.get("available_points", ())), set(b.get("available_points", ()))
    available = [p for p in ALL_POINTS if p in points_a & points_b]
    counts: dict[str, int] = {}
    for change in changes:
        counts[change["kind"]] = counts.get(change["kind"], 0) + 1
    lines = [change["summary"] for change in changes[:SUMMARY_LIMIT]]
    if len(changes) > SUMMARY_LIMIT:
        lines.append(f"... {len(changes) - SUMMARY_LIMIT} more changes in the full diff")
    if not changes:
        unidentified = _unidentified_total(a) + _unidentified_total(b)
        lines.append("No traced decision differs between a and b." if not unidentified else
                     f"No identified decision differs; {unidentified} webs without identity match only as "
                     "multisets of register, spill and degree.")
    return {
        "schema": DIFF_SCHEMA,
        "function": a.get("function"),
        "unit": a.get("unit"),
        "version": a.get("version"),
        "available_points": available,
        "unavailable_points": [p for p in ALL_POINTS if p not in available],
        "change_counts": counts,
        # Every change: callers truncate only what they show a worker.
        "changes": changes,
        "summary_lines": lines,
    }
