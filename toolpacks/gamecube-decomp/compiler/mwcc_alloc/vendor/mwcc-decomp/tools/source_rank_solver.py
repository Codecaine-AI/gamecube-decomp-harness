#!/usr/bin/env python3
"""Search source-realizable virtual-register birth-rank changes.

The model captures a deliberately narrow family of source edits:

* one configured object band is permuted as declaration order changes;
* removing a graph-isolated, PCode-unused object slot lowers the remaining
  object band and every compiler-temporary rank above it;
* compiler temporaries retain their relative creation order.

V32 is fixed automatically, and callers can pin additional parameter, shadow,
inline, aggregate, or otherwise non-permutable object webs.

An exact search proves reachability or unreachability inside that model.  When
the object permutation space exceeds the configured bound, deterministic
sampling can still produce a valid witness, but failure is reported only as
``not_found`` rather than ``unreachable``.

An ``unreachable`` verdict is bounded by the swept structural family: it proves
no declaration-order permutation of the CURRENT reconstruction reaches the
target, not that no C source does.  Source restructuring changes the capture
itself — web birth order, strata membership, even which webs exist.  The melee
mplib accessor twins (upstream PR #3066, 2026-08-13) falsified such a verdict:
the solver was right that the loop-hot probe web had to be born just after the
base-materialization web, and wrong that no construct realizes it (a one-field
carrier whose member is written once per iteration from a distinct block-local
temp survives scalarization and re-ranks the probe).  When this tool reports
``unreachable``, treat the result as "restructure the family and re-capture",
using the realization levers it prints.
"""

from __future__ import annotations

import argparse
import itertools
import json
import math
import random
from pathlib import Path

from allocator_snapshot import validate_coloring_snapshot
from coloring_model import replay_simplify, validate_colors


FORMAT = "mwcc-source-rank-search-v1"
COALESCED_FLAG = 4
MODEL_WARNING = (
    "The model covers one object-order band and removal of isolated object "
    "slots with no captured PCode occurrences. Parameter, shadow, inline, "
    "aggregate, and scalar-expansion strata require additional fixed-object "
    "constraints or future provenance. An unreachable verdict binds only the "
    "current reconstruction's expression structure, not C: restructuring "
    "levers (see realization_levers) change the capture and re-open the search."
)

# Source constructs that move webs the fixed-object classification treats as
# rank-pinned. Each changes the captured graph/strata, so an unreachable
# verdict must be re-established after trying the relevant ones.
# Validated on melee mplib (PR #3066 postmortem; ablated 2026-08-13).
REALIZATION_LEVERS = (
    "one-field carrier struct{T v;} on a LOOP-HOT scalar re-ranks it late "
    "without homing it, IF the member is written once per iteration from a "
    "distinct block-local temp (a twice-reassigned member scalarizes away; "
    "mplib twins: this alone was 100% vs 98.31%)",
    "(void) arr[i = x]; dead indexed use births and places a "
    "global-base-materialization web at a chosen point and makes the def "
    "opaque (mpLib_800581DC x3, mpLib_80058614_Floor)",
    "*(p = &global.field) = v; embedded pointer def creates a reusable alias "
    "web at the store site with the store's rank (Floor extremum pointers)",
    "dead (void) param; use on a branch extends the parameter home's "
    "liveness/rank (each mplib twin backedge; removing it cost 1.24pp)",
    "goto/label blocks with explicit ifs decouple branch polarity and layout "
    "from the loop construct (gives 'bne exit; b loop' shapes)",
    "delete ALL user walkers and index globals directly when target IVs look "
    "compiler-created; MWCC synthesizes IVs with retail ranks "
    "(mpLib_DrawCrosses, fn_801695BC)",
    "int ret = s16_value; copy before return splits the extsh web from the "
    "returned value (mpLineGetNext/Prev)",
    "chained assignment a = (b = x) for const-prop opacity; "
    "declaration-with-initializer to outrank parameter homes",
)


def load(capture: Path, index: str) -> tuple[dict, dict, dict]:
    capture_index = int(index, 0) if isinstance(index, str) else int(index)
    prefix = f"{capture_index:04d}"
    paths = (
        capture / f"coloring-{prefix}-gpr-01-before.json",
        capture / f"coloring-{prefix}-gpr-01-after.json",
        capture / f"pcode-{prefix}-scheduled.json",
    )
    values = []
    for path in paths:
        with path.open(encoding="utf-8") as stream:
            values.append(json.load(stream))
    validate_coloring_snapshot(values[0])
    validate_coloring_snapshot(values[1])
    return tuple(values)


def pcode_occurrences(pcode: dict) -> tuple[dict[int, int], dict[int, str]]:
    counts = {}
    first_definition = {}
    for block in pcode.get("blocks", []):
        for instruction in block.get("instructions", []):
            mnemonic = instruction.get("opcode_descriptor", {}).get(
                "mnemonic", "?"
            )
            for operand in instruction.get("operands", []):
                if operand.get("kind") != 0:
                    continue
                register = operand.get("reg", -1)
                if register < 32:
                    continue
                counts[register] = counts.get(register, 0) + 1
                if operand.get("flags", 0) & 2:
                    first_definition.setdefault(register, mnemonic)
    return counts, first_definition


def classify(before: dict, after: dict, pcode: dict) -> dict[int, dict]:
    after_nodes = {
        node["virtual_register"]: node for node in after["nodes"]
    }
    occurrences, first_definition = pcode_occurrences(pcode)
    result = {}
    for node in sorted(before["nodes"], key=lambda item: item["virtual_register"]):
        register = node["virtual_register"]
        if register < 32:
            continue
        object_address = node.get("object", "0x00000000")
        has_object = object_address not in (
            None,
            0,
            "0x0",
            "0x00000000",
        )
        flags = node.get("flags", 0)
        if flags & COALESCED_FLAG:
            kind = "coalesced"
        elif has_object:
            kind = "object"
        else:
            kind = "temporary"
        count = occurrences.get(register, 0)
        result[register] = {
            "kind": kind,
            "object": object_address,
            "first_definition": first_definition.get(register),
            "occurrence_count": count,
            "color": after_nodes.get(register, {}).get(
                "physical_register", -1
            ),
            "flags": flags,
            "unused_object_slot": (
                kind == "object"
                and count == 0
                and not node.get("neighbors")
            ),
        }
    return result


def score_colors(colors: dict[int, int], targets: dict[int, int]) -> int:
    return sum(
        colors.get(register) == color
        for register, color in targets.items()
    )


def rank_assignment(
    objects: list[int],
    temporaries: list[int],
    permutation: tuple[int, ...] | list[int],
    removed: frozenset[int],
) -> dict[int, int]:
    live_objects = [register for register in objects if register not in removed]
    if set(permutation) != set(live_objects):
        raise ValueError("object permutation does not match retained objects")
    shift = len(removed)
    highest_object_rank = max(objects, default=31) - shift
    ranks = {
        register: highest_object_rank - index
        for index, register in enumerate(permutation)
    }
    ranks.update({register: register - shift for register in temporaries})
    return ranks


def _candidate_permutations(
    values: list[int],
    *,
    exact_limit: int,
    samples: int,
    rng: random.Random,
):
    count = math.factorial(len(values))
    if count <= exact_limit:
        yield from itertools.permutations(values)
        return

    seen = set()
    baseline = tuple(values)
    seen.add(baseline)
    yield baseline
    for _ in range(max(samples - 1, 0)):
        candidate = list(values)
        rng.shuffle(candidate)
        permutation = tuple(candidate)
        if permutation in seen:
            continue
        seen.add(permutation)
        yield permutation


def search_snapshots(
    before: dict,
    after: dict,
    pcode: dict,
    targets: dict[int, int],
    *,
    max_permutations: int = 1_000_000,
    samples: int = 10_000,
    seed: int = 0,
    fixed_objects: frozenset[int] = frozenset(),
) -> dict:
    information = classify(before, after, pcode)
    objects = sorted(
        register for register, item in information.items()
        if item["kind"] == "object"
    )
    automatically_fixed = {32} & set(objects)
    fixed_objects = frozenset(fixed_objects | automatically_fixed)
    unknown_fixed = fixed_objects - set(objects)
    if unknown_fixed:
        values = ", ".join(f"v{register}" for register in sorted(unknown_fixed))
        raise ValueError(f"fixed registers are not object webs: {values}")
    permutable_objects = [
        register for register in objects if register not in fixed_objects
    ]
    temporaries = sorted(
        register for register, item in information.items()
        if item["kind"] == "temporary"
    )
    removable = sorted(
        register for register, item in information.items()
        if item["unused_object_slot"] and register not in fixed_objects
    )
    missing = sorted(set(targets) - set(information))
    if missing:
        values = ", ".join(f"v{register}" for register in missing)
        raise ValueError(f"target registers absent from snapshot: {values}")

    baseline = replay_simplify(before)
    validation = validate_colors(before, after, baseline["colors"])
    rng = random.Random(seed)
    tested = 0
    best_score = score_colors(baseline["colors"], targets)
    best = {
        "removed_object_slots": [],
        "object_order": permutable_objects,
        "ranks": {},
        "colors": {
            register: baseline["colors"].get(register)
            for register in targets
        },
    }
    exhaustive = True

    for remove_count in range(len(removable) + 1):
        for removed_values in itertools.combinations(removable, remove_count):
            removed = frozenset(removed_values)
            live_objects = [
                register for register in permutable_objects
                if register not in removed
            ]
            permutation_count = math.factorial(len(live_objects))
            exact = permutation_count <= max_permutations
            exhaustive &= exact
            for permutation in _candidate_permutations(
                live_objects,
                exact_limit=max_permutations,
                samples=samples,
                rng=rng,
            ):
                tested += 1
                ranks = rank_assignment(
                    permutable_objects, temporaries, permutation, removed
                )
                replay = replay_simplify(before, ranks=ranks)
                score = score_colors(replay["colors"], targets)
                if score > best_score:
                    best_score = score
                    best = {
                        "removed_object_slots": list(removed_values),
                        "object_order": list(permutation),
                        "ranks": ranks,
                        "colors": {
                            register: replay["colors"].get(register)
                            for register in targets
                        },
                    }
                if score == len(targets):
                    return {
                        "format": FORMAT,
                        "status": "reachable",
                        "conclusion_proven": True,
                        "search_complete": False,
                        "search_exact": exhaustive,
                        "permutations_tested": tested,
                        "targets": targets,
                        "baseline_replay_validation": validation,
                        "classification": information,
                        "object_registers": objects,
                        "fixed_object_registers": sorted(fixed_objects),
                        "permutable_object_registers": permutable_objects,
                        "temporary_registers": temporaries,
                        "removable_object_slots": removable,
                        "best_score": score,
                        "witness": {
                            "removed_object_slots": list(removed_values),
                            "object_order": list(permutation),
                            "ranks": ranks,
                            "colors": {
                                register: replay["colors"].get(register)
                                for register in targets
                            },
                        },
                        "warning": MODEL_WARNING,
                    }

    return {
        "format": FORMAT,
        "status": "unreachable" if exhaustive else "not_found",
        "conclusion_proven": exhaustive,
        "search_complete": exhaustive,
        "search_exact": exhaustive,
        "permutations_tested": tested,
        "targets": targets,
        "baseline_replay_validation": validation,
        "classification": information,
        "object_registers": objects,
        "fixed_object_registers": sorted(fixed_objects),
        "permutable_object_registers": permutable_objects,
        "temporary_registers": temporaries,
        "removable_object_slots": removable,
        "best_score": best_score,
        "witness": best,
        "warning": MODEL_WARNING,
        "realization_levers": list(REALIZATION_LEVERS),
    }


def solve(
    capture: str | Path,
    index: str,
    target: dict[int, int],
    **kwargs,
) -> dict:
    before, after, pcode = load(Path(capture), index)
    return search_snapshots(before, after, pcode, target, **kwargs)


def creation_order_reachable(
    capture,
    index,
    target,
    restarts=80,
    iters=2500,
    seed=0,
):
    """Compatibility heuristic for the original relaxed-rank experiment.

    A ``True`` result is a witness.  A ``False`` result is not a proof because
    continuous rank placement is sampled rather than exhaustively enumerated.
    """
    before, _, _ = load(Path(capture), index)
    nodes = {
        item["virtual_register"]: item for item in before["nodes"]
    }
    objects = [
        register for register in before["simplify_order"]
        if nodes[register].get("object", "0x00000000") != "0x00000000"
        and not nodes[register].get("flags", 0) & COALESCED_FLAG
    ]
    temporaries = sorted(
        register for register in before["simplify_order"]
        if nodes[register].get("object", "0x00000000") == "0x00000000"
        and not nodes[register].get("flags", 0) & COALESCED_FLAG
    )
    rng = random.Random(seed)
    best = -1
    for _ in range(restarts):
        ranks = {register: rng.uniform(0, 60) for register in objects}
        temporary_offset = rng.uniform(0, 80)
        temporary_gap = rng.uniform(1, 15)
        for position, register in enumerate(temporaries):
            ranks[register] = temporary_offset + position * temporary_gap
        replay = replay_simplify(before, ranks=ranks)
        current = score_colors(replay["colors"], target)
        for _ in range(iters):
            old_ranks = dict(ranks)
            if objects and rng.random() < 0.5:
                register = rng.choice(objects)
                ranks[register] = rng.uniform(0, 60)
            else:
                temporary_offset = rng.uniform(0, 90)
                temporary_gap = rng.uniform(0.5, 15)
                for position, register in enumerate(temporaries):
                    ranks[register] = (
                        temporary_offset + position * temporary_gap
                    )
            replay = replay_simplify(before, ranks=ranks)
            candidate = score_colors(replay["colors"], target)
            if candidate >= current:
                current = candidate
            else:
                ranks = old_ranks
            if current == len(target):
                return len(target), True
        best = max(best, current)
    return best, False


def parse_targets(value: str) -> dict[int, int]:
    result = {}
    for pair in value.split(","):
        register, color = pair.split(":", 1)
        result[int(register.removeprefix("v"), 0)] = int(
            color.removeprefix("r"), 0
        )
    return result


def print_report(report: dict) -> None:
    validation = report["baseline_replay_validation"]
    print(
        f"baseline replay: {validation['matched']}/"
        f"{validation['checked']} captured assignments"
    )
    print(
        f"objects={len(report['object_registers'])}, "
        f"fixed={len(report['fixed_object_registers'])}, "
        f"temporaries={len(report['temporary_registers'])}, "
        "unused object slots="
        + ",".join(f"v{item}" for item in report["removable_object_slots"])
    )
    print(
        f"status={report['status']}; best={report['best_score']}/"
        f"{len(report['targets'])}; tested={report['permutations_tested']}; "
        f"proven={report['conclusion_proven']}; "
        f"complete={report['search_complete']}"
    )
    if report["status"] in ("unreachable", "not_found"):
        print(
            "NOTE: this verdict binds only the current reconstruction's "
            "structural family (mplib postmortem, PR #3066). Source levers "
            "that re-rank 'fixed' webs and re-open the search:"
        )
        for lever in report.get("realization_levers", REALIZATION_LEVERS):
            print(f"  - {lever}")
    witness = report["witness"]
    if witness:
        print(
            "removed slots: "
            + ", ".join(
                f"v{item}" for item in witness["removed_object_slots"]
            )
        )
        print(
            "object order: "
            + ", ".join(f"v{item}" for item in witness["object_order"])
        )
    print(f"warning: {report['warning']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("capture", type=Path)
    parser.add_argument("index")
    target_group = parser.add_mutually_exclusive_group(required=True)
    target_group.add_argument("--target", type=parse_targets)
    target_group.add_argument("--target-file", type=Path)
    parser.add_argument("--max-permutations", type=int, default=1_000_000)
    parser.add_argument("--samples", type=int, default=10_000)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument(
        "--fixed-object",
        action="append",
        type=lambda value: int(value.removeprefix("v"), 0),
        default=[],
        help="object web whose birth rank must remain fixed (repeatable)",
    )
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    if args.target_file:
        with args.target_file.open(encoding="utf-8") as stream:
            targets = {int(key): value for key, value in json.load(stream).items()}
    else:
        targets = args.target
    report = solve(
        args.capture,
        args.index,
        targets,
        max_permutations=args.max_permutations,
        samples=args.samples,
        seed=args.seed,
        fixed_objects=frozenset(args.fixed_object),
    )
    if args.output:
        args.output.write_text(
            json.dumps(report, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    print_report(report)


if __name__ == "__main__":
    main()
