#!/usr/bin/env python3
"""Validate, explain, and compare GC/1.2.5 stack-frame traces."""

import argparse
import json
import struct
from collections import Counter, defaultdict
from pathlib import Path

from allocator_snapshot import SUPPORTED_TARGETS


TRACE_FORMAT = "mwcc-stack-frame-trace-v1"


class StackFrameTraceError(ValueError):
    pass


def validate_trace(trace: dict) -> None:
    if trace.get("format") != TRACE_FORMAT:
        raise StackFrameTraceError("unsupported stack-frame trace format")
    target_sha256 = trace.get("target_sha256")
    if SUPPORTED_TARGETS.get(target_sha256) != trace.get("compiler"):
        raise StackFrameTraceError(
            "trace does not identify a verified compiler target"
        )
    allocations = trace.get("object_allocations")
    if not isinstance(allocations, list):
        raise StackFrameTraceError("object_allocations must be a list")
    sequences = [event.get("sequence") for event in allocations]
    if sequences != list(range(len(allocations))):
        raise StackFrameTraceError(
            "object allocation sequences must be contiguous and ordered"
        )
    for event in allocations:
        if event.get("allocator_address") != "0x004ac4a0":
            raise StackFrameTraceError("unknown object-slot allocator")
        alignment = event.get("alignment")
        size = event.get("size")
        slot = event.get("slot")
        cursor_before = event.get("cursor_before")
        cursor_after = event.get("cursor_after")
        if not all(
            isinstance(value, int)
            for value in (alignment, size, slot, cursor_before, cursor_after)
        ):
            raise StackFrameTraceError("allocation geometry must be integral")
        if alignment <= 0 or alignment & (alignment - 1):
            raise StackFrameTraceError("allocation alignment must be a power of two")
        if slot < cursor_before or slot % alignment:
            raise StackFrameTraceError(
                "object slot does not satisfy captured alignment"
            )
        if cursor_after != slot + size:
            raise StackFrameTraceError("object slot does not end at the next cursor")

    finalization = trace.get("frame_finalization")
    if finalization is not None:
        checkpoints = finalization.get("checkpoints")
        if not isinstance(checkpoints, list) or not checkpoints:
            raise StackFrameTraceError(
                "frame_finalization checkpoints must be a nonempty list"
            )
        for checkpoint in checkpoints:
            if not isinstance(checkpoint.get("state"), dict):
                raise StackFrameTraceError("frame checkpoint state must be a mapping")


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def validate_provenance(trace: dict, provenance: dict) -> None:
    if provenance.get("format") != "mwcc-allocator-provenance-v1":
        raise StackFrameTraceError("unsupported allocator provenance format")
    if provenance.get("target_sha256") != trace.get("target_sha256"):
        raise StackFrameTraceError("trace and provenance target different compilers")
    for field in ("capture_index", "function_pointer"):
        left = trace.get(field)
        right = provenance.get(field)
        if left is not None and right is not None and left != right:
            raise StackFrameTraceError(
                f"trace and provenance {field} values differ"
            )


def provenance_object_uses(provenance: dict | None) -> dict[str, list[dict]]:
    if provenance is None:
        return {}
    instructions = {
        instruction["id"]: instruction
        for instruction in provenance.get("instructions", [])
    }
    result = defaultdict(list)
    for operand in provenance.get("operands", []):
        if operand.get("kind") != 5:
            continue
        object_address = operand.get("object")
        instruction = instructions.get(operand.get("instruction"), {})
        result[object_address].append(
            {
                "instruction": operand.get("instruction"),
                "mnemonic": instruction.get("mnemonic"),
                "opcode": instruction.get("opcode"),
                "operand_index": operand.get("index"),
                "flags": operand.get("flags"),
            }
        )
    for uses in result.values():
        uses.sort(
            key=lambda use: (
                use["instruction"] or "",
                use["operand_index"],
            )
        )
    return dict(result)


def legacy_object_rows(provenance: dict) -> list[dict]:
    """Recover only facts already serialized in an older provenance file."""
    if provenance.get("format") != "mwcc-allocator-provenance-v1":
        raise StackFrameTraceError("unsupported allocator provenance format")
    uses_by_object = provenance_object_uses(provenance)
    objects = {}
    for operand in provenance.get("creation_operands", []):
        obj = operand.get("compiler_object")
        if not isinstance(obj, dict) or not obj.get("address"):
            continue
        header = obj.get("header")
        if not isinstance(header, str):
            continue
        raw = bytes.fromhex(header)
        if len(raw) < 0x2E:
            continue
        address = obj["address"]
        objects[address] = {
            "object_address": address,
            "object_tag_00": obj.get("object_tag_00"),
            "kind_02": obj.get("kind_02"),
            "type": obj.get("type"),
            "serialized_stack_offset_2a": struct.unpack_from(
                "<I", raw, 0x2A
            )[0],
            "pcode_uses": uses_by_object.get(address, []),
        }
    return sorted(
        objects.values(),
        key=lambda row: (
            row["serialized_stack_offset_2a"],
            row["object_address"],
        ),
    )


def format_legacy_provenance(provenance: dict) -> str:
    rows = legacy_object_rows(provenance)
    lines = [
        f"legacy capture {provenance.get('capture_index', '-')}: "
        f"{len(rows)} serialized compiler objects",
        "  raw CompilerObject+0x2a facts only; allocation order, alignment, "
        "frame bands, and final SP-relative slots were not captured",
    ]
    for row in rows:
        obj_type = row.get("type") or {}
        lines.append(
            f"  {row['object_address']}: raw +0x2a="
            f"0x{row['serialized_stack_offset_2a']:x}, "
            f"kind {row['kind_02']}, type size {obj_type.get('size_02', '-')}"
        )
        lines.append(f"    PCode evidence: {format_uses(row['pcode_uses'])}")
    return "\n".join(lines)


def object_type_signature(event: dict) -> tuple:
    obj = event.get("object_after") or event.get("object_before") or {}
    obj_type = obj.get("type") or {}
    return (
        obj.get("object_tag_00"),
        obj.get("kind_02"),
        obj.get("flags_12"),
        obj_type.get("kind_00"),
        obj_type.get("size_02", event.get("size")),
        obj_type.get("subtype_0e"),
        event.get("alignment"),
    )


def use_signature(uses: list[dict]) -> tuple:
    counts = Counter(
        (
            use.get("mnemonic") or "",
            use.get("opcode") if use.get("opcode") is not None else -1,
            use.get("operand_index")
            if use.get("operand_index") is not None
            else -1,
            use.get("flags") if use.get("flags") is not None else -1,
        )
        for use in uses
    )
    return tuple(sorted((key, count) for key, count in counts.items()))


def semantic_signature(event: dict, uses: list[dict]) -> tuple:
    semantic_id = event.get("semantic_id")
    if semantic_id is not None:
        return ("explicit", semantic_id)
    return ("pcode-uses-v1", object_type_signature(event), use_signature(uses))


def local_band_base(trace: dict) -> int | None:
    """Return the finalized SP bias of local-object offsets when captured."""
    finalization = trace.get("frame_finalization") or {}
    checkpoints = finalization.get("checkpoints") or []
    if not checkpoints:
        return None
    state = checkpoints[-1].get("state") or {}
    linkage = state.get("linkage_size_005880cc")
    outgoing = state.get("secondary_cursor_0058712c")
    if not isinstance(linkage, int) or not isinstance(outgoing, int):
        return None
    return linkage + outgoing


def enrich_allocations(
    trace: dict, provenance: dict | None = None
) -> list[dict]:
    validate_trace(trace)
    if provenance is not None:
        validate_provenance(trace, provenance)
    uses_by_object = provenance_object_uses(provenance)
    band_base = local_band_base(trace)
    enriched = []
    for event in trace["object_allocations"]:
        uses = uses_by_object.get(event["object_address"], [])
        enriched.append(
            {
                **event,
                "pcode_uses": uses,
                "semantic_signature": semantic_signature(event, uses),
                "local_band_base": band_base,
                "sp_relative_slot": (
                    event["slot"] + band_base
                    if band_base is not None
                    else None
                ),
            }
        )
    return enriched


def unique_by_signature(events: list[dict]) -> dict[tuple, dict]:
    grouped = defaultdict(list)
    for event in events:
        grouped[event["semantic_signature"]].append(event)
    return {
        signature: members[0]
        for signature, members in grouped.items()
        if len(members) == 1
    }


def group_by_signature(events: list[dict]) -> dict[tuple, list[dict]]:
    grouped = defaultdict(list)
    for event in events:
        grouped[event["semantic_signature"]].append(event)
    return dict(grouped)


def compare_traces(
    before: dict,
    after: dict,
    before_provenance: dict | None = None,
    after_provenance: dict | None = None,
) -> dict:
    old_events = enrich_allocations(before, before_provenance)
    new_events = enrich_allocations(after, after_provenance)
    old_groups = group_by_signature(old_events)
    new_groups = group_by_signature(new_events)
    old_unique = unique_by_signature(old_events)
    new_unique = unique_by_signature(new_events)
    matches = []
    matched_old = set()
    matched_new = set()
    for signature in old_unique.keys() & new_unique.keys():
        old = old_unique[signature]
        new = new_unique[signature]
        matched_old.add(old["sequence"])
        matched_new.add(new["sequence"])
        matches.append(
            {
                "match_basis": signature[0],
                "before_sequence": old["sequence"],
                "after_sequence": new["sequence"],
                "before_object": old["object_address"],
                "after_object": new["object_address"],
                "before_slot": old["slot"],
                "after_slot": new["slot"],
                "slot_delta": new["slot"] - old["slot"],
                "before_sp_relative_slot": old["sp_relative_slot"],
                "after_sp_relative_slot": new["sp_relative_slot"],
                "sp_relative_slot_delta": (
                    new["sp_relative_slot"] - old["sp_relative_slot"]
                    if old["sp_relative_slot"] is not None
                    and new["sp_relative_slot"] is not None
                    else None
                ),
                "before_size": old["size"],
                "after_size": new["size"],
                "before_alignment": old["alignment"],
                "after_alignment": new["alignment"],
            }
        )
    matches.sort(key=lambda match: match["before_sequence"])
    ambiguous = []
    for signature in old_groups.keys() & new_groups.keys():
        old_members = old_groups[signature]
        new_members = new_groups[signature]
        if len(old_members) == 1 and len(new_members) == 1:
            continue
        ambiguous.append(
            {
                "match_basis": signature[0],
                "before_sequences": [
                    event["sequence"] for event in old_members
                ],
                "after_sequences": [event["sequence"] for event in new_members],
                "before_slots": [event["slot"] for event in old_members],
                "after_slots": [event["slot"] for event in new_members],
                "before_sp_relative_slots": [
                    event["sp_relative_slot"] for event in old_members
                ],
                "after_sp_relative_slots": [
                    event["sp_relative_slot"] for event in new_members
                ],
            }
        )
    ambiguous.sort(key=lambda group: group["before_sequences"])
    return {
        "format": "mwcc-stack-frame-comparison-v1",
        "before_capture_index": before.get("capture_index"),
        "after_capture_index": after.get("capture_index"),
        "matched_objects": matches,
        "ambiguous_groups": ambiguous,
        "unmatched_before": [
            event["sequence"]
            for event in old_events
            if event["sequence"] not in matched_old
        ],
        "unmatched_after": [
            event["sequence"]
            for event in new_events
            if event["sequence"] not in matched_new
        ],
    }


def format_uses(uses: list[dict]) -> str:
    if not uses:
        return "no live kind-5 PCode use in supplied provenance"
    counts = Counter(
        f"{use.get('mnemonic') or 'opcode-' + str(use.get('opcode'))}"
        f"[o{use.get('operand_index')}]"
        for use in uses
    )
    return ", ".join(
        f"{name} x{count}" if count != 1 else name
        for name, count in sorted(counts.items())
    )


def format_trace(trace: dict, provenance: dict | None = None) -> str:
    events = enrich_allocations(trace, provenance)
    lines = [
        f"stack-frame capture {trace.get('capture_index', '-')}: "
        f"{len(events)} object slots"
    ]
    for event in events:
        slot = f"local +0x{event['slot']:x}"
        if event["sp_relative_slot"] is not None:
            slot += f" / SP +0x{event['sp_relative_slot']:x}"
        lines.append(
            f"  #{event['sequence']} {event['object_address']}: "
            f"slot {slot}, size {event['size']}, "
            f"align {event['alignment']}, cursor "
            f"0x{event['cursor_before']:x}->0x{event['cursor_after']:x}"
        )
        lines.append(f"    PCode owner evidence: {format_uses(event['pcode_uses'])}")

    finalization = trace.get("frame_finalization")
    if finalization is not None:
        lines.append("frame finalization state changes:")
        previous = None
        for checkpoint in finalization["checkpoints"]:
            state = checkpoint["state"]
            if previous is None:
                changes = state
            else:
                changes = {
                    key: value
                    for key, value in state.items()
                    if previous.get(key) != value
                }
            rendered = ", ".join(
                f"{key}=0x{value:x}" for key, value in changes.items()
            )
            if rendered:
                lines.append(
                    f"  {checkpoint['program_counter']}: {rendered}"
                )
            previous = state
    return "\n".join(lines)


def format_comparison(comparison: dict) -> str:
    lines = [
        f"aligned {len(comparison['matched_objects'])} unique stack objects"
    ]
    for match in comparison["matched_objects"]:
        before_slot = match.get("before_sp_relative_slot")
        after_slot = match.get("after_sp_relative_slot")
        slot_delta = match.get("sp_relative_slot_delta")
        slot_kind = "SP"
        if before_slot is None or after_slot is None or slot_delta is None:
            before_slot = match["before_slot"]
            after_slot = match["after_slot"]
            slot_delta = match["slot_delta"]
            slot_kind = "local"
        lines.append(
            f"  #{match['before_sequence']} -> #{match['after_sequence']} "
            f"({match['match_basis']}): "
            f"{slot_kind} +0x{before_slot:x} -> +0x{after_slot:x} "
            f"(delta {slot_delta:+d})"
        )
    for group in comparison.get("ambiguous_groups", []):
        before_sequences = ",".join(
            f"#{value}" for value in group["before_sequences"]
        )
        after_sequences = ",".join(
            f"#{value}" for value in group["after_sequences"]
        )
        lines.append(
            f"  ambiguous {group['match_basis']} group: "
            f"before [{before_sequences}], after [{after_sequences}]"
        )
    if comparison["unmatched_before"]:
        lines.append(
            "unmatched before: "
            + ", ".join(f"#{value}" for value in comparison["unmatched_before"])
        )
    if comparison["unmatched_after"]:
        lines.append(
            "unmatched after: "
            + ", ".join(f"#{value}" for value in comparison["unmatched_after"])
        )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Explain or compare mwcc-stack-frame-trace-v1 files"
    )
    parser.add_argument("trace", type=Path)
    parser.add_argument("--provenance", type=Path)
    parser.add_argument("--compare", type=Path)
    parser.add_argument("--compare-provenance", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    trace = load_json(args.trace)
    if trace.get("format") == "mwcc-allocator-provenance-v1":
        if args.compare is not None or args.provenance is not None:
            raise StackFrameTraceError(
                "legacy provenance mode does not support trace comparison"
            )
        print(format_legacy_provenance(trace))
        return
    provenance = load_json(args.provenance) if args.provenance else None
    if args.compare is None:
        print(format_trace(trace, provenance))
        return

    after = load_json(args.compare)
    after_provenance = (
        load_json(args.compare_provenance) if args.compare_provenance else None
    )
    comparison = compare_traces(trace, after, provenance, after_provenance)
    if args.output is not None:
        with args.output.open("w", encoding="utf-8") as stream:
            json.dump(comparison, stream, indent=2)
            stream.write("\n")
    print(format_comparison(comparison))


if __name__ == "__main__":
    main()
