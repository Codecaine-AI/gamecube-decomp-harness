#!/usr/bin/env python3
"""Deterministic replay helpers for MWCC coloring snapshots.

The model is intentionally capture-oriented.  It replays the recovered
Coloring_SimplifyGraph and Coloring_SelectColors decisions over the graph in a
``mwcc-coloring-snapshot-v1`` file, while allowing controlled rank, degree, and
edge hypotheses.  Callers remain responsible for distinguishing an exact
capture replay from a source-realizability hypothesis.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping


FIRST_VIRTUAL_REGISTER = 32
COALESCED_FLAG = 4
REGISTER_CLASS_NAMES = {0: "gpr", 1: "fpr", 9: "vr"}
INITIAL_COLORS = {
    "gpr": (0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12),
    "fpr": tuple(range(14)),
    "vr": tuple(range(20)),
}
FIRST_SAVED_COLOR = {"gpr": 14, "fpr": 14, "vr": 20}


def register_class_name(snapshot: Mapping) -> str:
    value = snapshot["register_class"]
    if isinstance(value, str):
        if value not in INITIAL_COLORS:
            raise ValueError(f"unsupported register class {value!r}")
        return value
    try:
        return REGISTER_CLASS_NAMES[value]
    except KeyError as error:
        raise ValueError(f"unsupported register class {value!r}") from error


def node_map(snapshot: Mapping) -> dict[int, dict]:
    return {
        node["virtual_register"]: {
            **node,
            "neighbors": set(node.get("neighbors", ())),
        }
        for node in snapshot["nodes"]
    }


def canonical_register(nodes: Mapping[int, Mapping], register: int) -> int:
    """Resolve a captured coalescing-parent chain to its canonical root."""
    seen = set()
    while register >= FIRST_VIRTUAL_REGISTER and register not in seen:
        seen.add(register)
        node = nodes.get(register)
        if node is None or not node.get("flags", 0) & COALESCED_FLAG:
            break
        parent = node.get("physical_register", -1)
        if parent < 0:
            break
        register = parent
    return register


def add_edges(nodes: dict[int, dict], edges: Iterable[tuple[int, int]]) -> None:
    for left, right in edges:
        if left == right:
            raise ValueError(f"self-interference edge for v{left}")
        if left not in nodes or right not in nodes:
            raise ValueError(f"edge v{left}-v{right} names an unknown node")
        nodes[left]["neighbors"].add(right)
        nodes[right]["neighbors"].add(left)


def add_synthetic_nodes(
    nodes: dict[int, dict], synthetic_nodes: Iterable[Mapping]
) -> list[int]:
    active = []
    for raw in synthetic_nodes:
        register = raw["virtual_register"]
        if register in nodes:
            raise ValueError(f"duplicate synthetic register v{register}")
        neighbors = set(raw.get("neighbors", ()))
        unknown = neighbors - set(nodes)
        if unknown:
            values = ", ".join(f"v{item}" for item in sorted(unknown))
            raise ValueError(f"synthetic v{register} has unknown neighbors: {values}")
        node = {
            "virtual_register": register,
            "physical_register": raw.get("physical_register", -1),
            "spill_cost": raw.get("spill_cost", 0),
            "flags": raw.get("flags", 0),
            "neighbors": neighbors,
        }
        nodes[register] = node
        for neighbor in neighbors:
            nodes[neighbor]["neighbors"].add(register)
        if raw.get("active", True) and not node["flags"] & COALESCED_FLAG:
            active.append(register)
    return active


def replay_selection(
    snapshot: Mapping,
    order: Iterable[int],
    *,
    nodes: Mapping[int, Mapping] | None = None,
) -> tuple[dict[int, int], list[dict]]:
    """Replay Coloring_SelectColors for one pop/select order."""
    if nodes is None:
        nodes = node_map(snapshot)
    colors = {}
    for register, node in nodes.items():
        physical = node.get("physical_register", -1)
        if register < FIRST_VIRTUAL_REGISTER:
            colors[register] = physical if physical >= 0 else register

    register_class = register_class_name(snapshot)
    color_mask = set(INITIAL_COLORS[register_class])
    next_claim = 31
    first_saved = FIRST_SAVED_COLOR[register_class]
    decisions = []
    for register in order:
        blocked = set()
        for neighbor in nodes[register]["neighbors"]:
            root = canonical_register(nodes, neighbor)
            if root in colors and colors[root] >= 0:
                blocked.add(colors[root] % 32)
        available = sorted(color_mask - blocked)
        claimed = None
        if not available:
            while next_claim in color_mask and next_claim >= first_saved:
                next_claim -= 1
            if next_claim >= first_saved:
                claimed = next_claim
                color_mask.add(next_claim)
                available = sorted(color_mask - blocked)
        color = available[0] if available else -1
        colors[register] = color
        decisions.append(
            {
                "register": register,
                "blocked_colors": sorted(blocked),
                "available_colors": available,
                "claimed_color": claimed,
                "selected_color": color,
            }
        )
    return colors, decisions


def _rank_key(register: int, ranks: Mapping[int, float]) -> tuple[float, int]:
    return ranks.get(register, register), register


def replay_simplify(
    snapshot: Mapping,
    *,
    available_colors: int = 29,
    extra_permanent_degree: Mapping[int, int] | None = None,
    ranks: Mapping[int, float] | None = None,
    added_edges: Iterable[tuple[int, int]] = (),
    synthetic_nodes: Iterable[Mapping] = (),
) -> dict:
    """Replay simplify and selection with explicit graph hypotheses.

    ``extra_permanent_degree`` changes only degree and is therefore abstract.
    ``added_edges`` and ``synthetic_nodes`` mutate a concrete graph copy and
    affect both endpoints, simplify dynamics, and color blocking.
    """
    if available_colors <= 0 or available_colors > 32:
        raise ValueError("available_colors must be between 1 and 32")
    extra_permanent_degree = dict(extra_permanent_degree or {})
    ranks = dict(ranks or {})
    nodes = node_map(snapshot)
    active = list(snapshot["simplify_order"])
    active.extend(add_synthetic_nodes(nodes, synthetic_nodes))
    add_edges(nodes, added_edges)
    active_set = set(active)

    unknown_degree = set(extra_permanent_degree) - active_set
    if unknown_degree:
        values = ", ".join(f"v{item}" for item in sorted(unknown_degree))
        raise ValueError(f"degree additions name inactive registers: {values}")

    degree = {
        register: (
            len(nodes[register]["neighbors"])
            + extra_permanent_degree.get(register, 0)
        )
        for register in active
    }
    active_neighbors = {
        register: nodes[register]["neighbors"] & active_set
        for register in active
    }
    removed = set()
    removal_order = []
    spill_choices = []
    last_remaining = []

    def remove(register: int) -> None:
        removed.add(register)
        removal_order.append(register)
        for neighbor in active_neighbors[register]:
            if neighbor not in removed:
                degree[neighbor] -= 1

    while len(removed) != len(active):
        changed = True
        while changed:
            changed = False
            last_remaining = []
            for register in sorted(active_set - removed,
                                   key=lambda item: _rank_key(item, ranks)):
                if degree[register] < available_colors:
                    remove(register)
                    changed = True
                else:
                    # The target prepends each survivor while scanning upward.
                    last_remaining.insert(0, register)

        if not last_remaining:
            continue

        def spill_score(register: int) -> float:
            if degree[register] == 0:
                return float("inf")
            return nodes[register].get("spill_cost", 0) / degree[register]

        candidate = min(last_remaining, key=spill_score)
        spill_choices.append(
            {
                "register": candidate,
                "degree": degree[candidate],
                "spill_cost": nodes[candidate].get("spill_cost", 0),
                "score": spill_score(candidate),
            }
        )
        remove(candidate)

    select_order = list(reversed(removal_order))
    colors, selection = replay_selection(snapshot, select_order, nodes=nodes)
    return {
        "simplify_order": select_order,
        "removal_order": removal_order,
        "colors": colors,
        "spill_choices": spill_choices,
        "selection": selection,
        "nodes": nodes,
    }


def validate_colors(
    snapshot: Mapping, after: Mapping, colors: Mapping[int, int]
) -> dict:
    del snapshot
    checked = 0
    mismatches = []
    for node in after["nodes"]:
        register = node["virtual_register"]
        expected = node.get("physical_register", -1)
        if register not in colors or expected < 0:
            continue
        checked += 1
        if colors[register] != expected:
            mismatches.append(
                {
                    "register": register,
                    "replayed": colors[register],
                    "captured": expected,
                }
            )
    return {
        "checked": checked,
        "matched": checked - len(mismatches),
        "mismatches": mismatches,
    }
