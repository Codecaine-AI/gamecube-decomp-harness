#!/usr/bin/env python3
"""Find minimal select-order changes that satisfy target register colors.

This is an intentionally constrained inverse query.  It keeps the captured
interference graph fixed and permutes a prefix of the captured color-selection
order.  A hit proves that the target colors are selection-order reachable on
that graph; it does not prove that the compiler's simplify pass can produce
the proposed order from a source edit.
"""

import argparse
import itertools
import json
import math
from pathlib import Path

from allocator_snapshot import validate_coloring_snapshot
from coloring_model import (
    register_class_name,
    replay_selection as replay_color_selection,
    validate_colors,
)
from replay.simplify_replay import replay as replay_simplify


FORMAT = "mwcc-inverse-coloring-v1"


def load_snapshot(path: Path) -> dict:
    with path.open(encoding="utf-8") as stream:
        snapshot = json.load(stream)
    validate_coloring_snapshot(snapshot)
    return snapshot


def replay_selection(snapshot: dict, order: list[int]) -> dict[int, int]:
    """Compatibility wrapper around the shared color-selection model."""
    colors, _ = replay_color_selection(snapshot, order)
    return colors


def inversion_count(order: tuple[int, ...], baseline: list[int]) -> int:
    positions = {register: index for index, register in enumerate(baseline)}
    values = [positions[register] for register in order]
    return sum(
        values[left] > values[right]
        for left in range(len(values))
        for right in range(left + 1, len(values))
    )


def order_score(order: tuple[int, ...], baseline: list[int]) -> tuple:
    positions = {register: index for index, register in enumerate(baseline)}
    moved = sum(register != baseline[index]
                for index, register in enumerate(order))
    displacement = sum(
        abs(index - positions[register]) for index, register in enumerate(order)
    )
    return inversion_count(order, baseline), moved, displacement, order


def inverse_order_search(
    snapshot: dict,
    targets: dict[int, int],
    prefix_size: int | None = None,
    max_permutations: int = 1_000_000,
) -> dict:
    baseline_order = list(snapshot["simplify_order"])
    positions = {register: index for index, register in enumerate(baseline_order)}
    missing = sorted(set(targets) - set(positions))
    if missing:
        raise ValueError(
            "target registers absent from simplify order: "
            + ", ".join(f"v{register}" for register in missing)
        )

    minimum_prefix = max(positions[register] for register in targets) + 1
    if prefix_size is None:
        prefix_size = minimum_prefix
    if prefix_size < minimum_prefix or prefix_size > len(baseline_order):
        raise ValueError(
            f"prefix size must be between {minimum_prefix} and "
            f"{len(baseline_order)}"
        )
    permutation_count = math.factorial(prefix_size)
    if permutation_count > max_permutations:
        raise ValueError(
            f"prefix requires {permutation_count} permutations; "
            f"increase --max-permutations or narrow --prefix-size"
        )

    prefix = baseline_order[:prefix_size]
    tail = baseline_order[prefix_size:]
    baseline_colors = replay_selection(snapshot, baseline_order)
    solution_count = 0
    best_order = None
    best_score = None
    always_before = None

    for permutation in itertools.permutations(prefix):
        colors = replay_selection(snapshot, list(permutation) + tail)
        if not all(colors.get(register) == color
                   for register, color in targets.items()):
            continue
        solution_count += 1
        score = order_score(permutation, prefix)
        if best_score is None or score < best_score:
            best_score = score
            best_order = permutation
        precedence = {
            (left, right)
            for left_index, left in enumerate(permutation)
            for right in permutation[left_index + 1:]
        }
        if always_before is None:
            always_before = precedence
        else:
            always_before &= precedence

    baseline_positions = {
        register: index for index, register in enumerate(prefix)
    }
    required_reversals = []
    for left, right in sorted(always_before or set()):
        if baseline_positions[left] > baseline_positions[right]:
            required_reversals.append({"before": left, "after": right})

    best_colors = None
    if best_order is not None:
        best_colors = replay_selection(snapshot, list(best_order) + tail)

    return {
        "format": FORMAT,
        "register_class": register_class_name(snapshot),
        "prefix_size": prefix_size,
        "permutations_tested": permutation_count,
        "solution_count": solution_count,
        "targets": targets,
        "baseline_order": prefix,
        "baseline_colors": {
            register: baseline_colors.get(register) for register in targets
        },
        "best_order": list(best_order) if best_order is not None else None,
        "best_colors": (
            {register: best_colors.get(register) for register in targets}
            if best_colors is not None else None
        ),
        "best_score": (
            {
                "inversions": best_score[0],
                "moved": best_score[1],
                "displacement": best_score[2],
            }
            if best_score is not None else None
        ),
        "required_reversals": required_reversals,
        "warning": (
            "Order-only reachability does not prove simplify/source "
            "realizability; the interference graph was held fixed."
        ),
    }


def degree_hypothesis_search(
    snapshot: dict,
    targets: dict[int, int],
    max_extra: int,
    max_combinations: int = 1_000_000,
) -> dict:
    """Search abstract permanent-degree additions on the target webs."""
    registers = sorted(targets)
    combination_count = (max_extra + 1) ** len(registers)
    if combination_count > max_combinations:
        raise ValueError(
            f"degree search requires {combination_count} combinations; "
            "lower --degree-search or increase --max-degree-combinations"
        )

    solution_count = 0
    best = None
    for values in itertools.product(range(max_extra + 1),
                                    repeat=len(registers)):
        if not any(values):
            continue
        additions = {
            register: value
            for register, value in zip(registers, values)
            if value
        }
        order, colors = replay_simplify(snapshot, additions)
        if not all(colors.get(register) == color
                   for register, color in targets.items()):
            continue
        solution_count += 1
        score = (sum(values), sum(value > 0 for value in values), values)
        if best is None or score < best[0]:
            best = (score, additions, order, colors)

    return {
        "max_extra_per_web": max_extra,
        "combinations_tested": combination_count - 1,
        "solution_count": solution_count,
        "best_additions": best[1] if best else None,
        "best_order": best[2] if best else None,
        "best_colors": (
            {register: best[3].get(register) for register in targets}
            if best else None
        ),
        "best_total_additions": best[0][0] if best else None,
        "pressure_overlap_lower_bound": (
            decompose_pressure_additions(best[1]) if best else None
        ),
        "warning": (
            "Synthetic permanent-degree additions do not identify concrete "
            "interference edges or prove that a source edit can create them."
        ),
    }


def decompose_pressure_additions(additions: dict[int, int]) -> dict:
    """Turn degree additions into a minimum anonymous-live-range cover.

    One additional live range can add at most one interference edge to any
    existing web.  The maximum requested addition is therefore a lower bound
    on the number of pressure webs.  The nested cover is a canonical witness;
    pairwise bounds identify overlaps required in every minimum-size cover.
    """
    positive = {register: amount for register, amount in additions.items()
                if amount > 0}
    web_count = max(positive.values(), default=0)
    windows = [
        sorted(
            register for register, amount in positive.items()
            if amount > layer
        )
        for layer in range(web_count)
    ]
    pairwise = []
    registers = sorted(positive)
    for left_index, left in enumerate(registers):
        for right in registers[left_index + 1:]:
            minimum = max(
                0,
                positive[left] + positive[right] - web_count,
            )
            if minimum:
                pairwise.append(
                    {
                        "left": left,
                        "right": right,
                        "minimum_shared_pressure_webs": minimum,
                    }
                )
    return {
        "minimum_pressure_webs": web_count,
        "canonical_overlap_windows": windows,
        "required_pairwise_overlaps": pairwise,
        "warning": (
            "This is an edge-count lower bound. It does not model the new "
            "webs' own simplify lifetime, color, or source origin."
        ),
    }


def validate_replay(snapshot: dict, after: dict) -> dict:
    colors = replay_selection(snapshot, snapshot["simplify_order"])
    return validate_colors(snapshot, after, colors)


def decode_object_name(snapshot: dict | None) -> str | None:
    if not snapshot:
        return None
    encoded = snapshot.get("opaque_value_0a_data")
    if not encoded:
        return None
    try:
        raw = bytes.fromhex(encoded)
    except ValueError:
        return None
    if len(raw) < 10:
        return None
    length = raw[9]
    if length == 0 or 10 + length > len(raw):
        return None
    return raw[10:10 + length].decode("ascii", errors="replace")


def provenance_labels(provenance: dict) -> dict[int, str]:
    labels = {}
    for creation in provenance.get("virtual_register_creations", []):
        for field in ("primary_register", "secondary_register"):
            register = creation.get(field)
            if register is None:
                continue
            name = decode_object_name(
                creation.get("object_after") or creation.get("object_before")
            )
            if name is None:
                name = creation.get("allocator_operation")
            if name is None:
                name = creation.get("allocator_function")
            if name is None:
                name = creation.get("allocation_kind")
            if name:
                labels.setdefault(register, name)
    return labels


def parse_assignment(value: str) -> tuple[int, int]:
    try:
        register_text, color_text = value.split("=", 1)
        register_text = register_text.removeprefix("gpr:").removeprefix("fpr:")
        register_text = register_text.removeprefix("vr:").removeprefix("v")
        color_text = color_text.removeprefix("r").removeprefix("f")
        return int(register_text), int(color_text)
    except (ValueError, AttributeError) as error:
        raise argparse.ArgumentTypeError(
            f"expected VREG=COLOR, got {value!r}"
        ) from error


def parse_label(value: str) -> tuple[int, str]:
    try:
        register_text, label = value.split("=", 1)
        register_text = register_text.removeprefix("gpr:").removeprefix("v")
        if not label:
            raise ValueError
        return int(register_text), label
    except ValueError as error:
        raise argparse.ArgumentTypeError(
            f"expected VREG=LABEL, got {value!r}"
        ) from error


def register_text(register: int, labels: dict[int, str]) -> str:
    label = labels.get(register)
    return f"v{register} ({label})" if label else f"v{register}"


def print_report(report: dict, labels: dict[int, str]) -> None:
    validation = report.get("baseline_replay_validation")
    if validation:
        print(
            f"baseline color replay: {validation['matched']}/"
            f"{validation['checked']} captured assignments"
        )
    print(
        f"searched {report['permutations_tested']} permutations of the first "
        f"{report['prefix_size']} select-order webs"
    )
    for register, target in report["targets"].items():
        baseline = report["baseline_colors"][register]
        print(
            f"  {register_text(register, labels)}: "
            f"r{baseline} -> target r{target}"
        )
    print(f"order-only solutions: {report['solution_count']}")
    if report["best_order"] is None:
        print("no fixed-graph order solution in the searched prefix")
    else:
        print(
            "best select order: "
            + ", ".join(register_text(item, labels)
                        for item in report["best_order"])
        )
        score = report["best_score"]
        print(
            f"distance: {score['inversions']} inversions, "
            f"{score['moved']} moved webs, "
            f"{score['displacement']} total slots"
        )
        if report["required_reversals"]:
            print("required precedence reversals common to every solution:")
            for item in report["required_reversals"]:
                print(
                    f"  {register_text(item['before'], labels)} before "
                    f"{register_text(item['after'], labels)}"
                )
    print(f"warning: {report['warning']}")
    degree = report.get("degree_hypothesis")
    if degree:
        print(
            f"degree hypotheses: {degree['solution_count']} solutions in "
            f"{degree['combinations_tested']} combinations"
        )
        if degree["best_additions"]:
            print("smallest permanent-degree additions:")
            for register, amount in degree["best_additions"].items():
                print(f"  {register_text(register, labels)}: +{amount}")
            head = degree["best_order"][:report["prefix_size"]]
            print(
                "resulting select order: "
                + ", ".join(register_text(item, labels) for item in head)
            )
            overlap = degree["pressure_overlap_lower_bound"]
            print(
                "pressure-web lower bound: "
                f"{overlap['minimum_pressure_webs']} live ranges"
            )
            for index, window in enumerate(
                overlap["canonical_overlap_windows"], start=1
            ):
                values = ", ".join(
                    register_text(item, labels) for item in window
                )
                print(f"  pressure web {index}: overlaps {values}")
            if overlap["required_pairwise_overlaps"]:
                print("unavoidable shared pressure windows:")
                for item in overlap["required_pairwise_overlaps"]:
                    print(
                        f"  {register_text(item['left'], labels)} with "
                        f"{register_text(item['right'], labels)}: at least "
                        f"{item['minimum_shared_pressure_webs']}"
                    )
            print(f"warning: {overlap['warning']}")
        print(f"warning: {degree['warning']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument(
        "--target", action="append", required=True, type=parse_assignment,
        metavar="VREG=COLOR",
    )
    parser.add_argument("--prefix-size", type=int)
    parser.add_argument("--max-permutations", type=int, default=1_000_000)
    parser.add_argument("--after", type=Path)
    parser.add_argument(
        "--degree-search", type=int, metavar="MAX_EXTRA",
        help="search synthetic permanent-degree additions on target webs",
    )
    parser.add_argument(
        "--max-degree-combinations", type=int, default=1_000_000,
    )
    parser.add_argument("--provenance", type=Path)
    parser.add_argument("--label", action="append", type=parse_label, default=[])
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    snapshot = load_snapshot(args.snapshot)
    targets = dict(args.target)
    report = inverse_order_search(
        snapshot, targets, args.prefix_size, args.max_permutations
    )
    if args.after:
        after = load_snapshot(args.after)
        report["baseline_replay_validation"] = validate_replay(snapshot, after)
    if args.degree_search is not None:
        report["degree_hypothesis"] = degree_hypothesis_search(
            snapshot, targets, args.degree_search,
            args.max_degree_combinations,
        )
    labels = {}
    if args.provenance:
        with args.provenance.open(encoding="utf-8") as stream:
            provenance = json.load(stream)
        labels.update(provenance_labels(provenance))
    labels.update(dict(args.label))
    report["labels"] = {register: labels[register]
                        for register in targets if register in labels}

    if args.output:
        args.output.write_text(
            json.dumps(report, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    print_report(report, labels)


if __name__ == "__main__":
    main()
